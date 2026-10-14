import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const encoder = new TextEncoder();
const MAX_BODY_BYTES = 18_000;
const MAX_MESSAGES = 12;
const MAX_TASKS = 30;
const MAX_REQUESTS_PER_MINUTE = 12;

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'message', 'plan', 'quiz', 'steps', 'sprintMinutes', 'smallerAlternative'],
  properties: {
    mode: { type: 'string', enum: ['tutor', 'plan', 'quiz', 'start'] },
    message: { type: 'string' },
    plan: {
      type: 'object', additionalProperties: false,
      required: ['title', 'summary', 'fits', 'blocks', 'nextAction', 'caveats'],
      properties: {
        title: { type: 'string' }, summary: { type: 'string' }, fits: { type: 'boolean' },
        blocks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'durationMinutes', 'subject', 'taskName', 'action'], properties: {
          kind: { type: 'string', enum: ['study', 'break'] }, durationMinutes: { type: 'integer' }, subject: { type: 'string' }, taskName: { type: 'string' }, action: { type: 'string' }
        } } },
        nextAction: { type: 'string' }, caveats: { type: 'array', items: { type: 'string' } }
      }
    },
    quiz: {
      type: 'object', additionalProperties: false,
      required: ['question', 'choices', 'correctAnswer', 'explanation', 'isCorrect', 'questionIndex', 'totalQuestions', 'finished', 'score', 'revisionTopics', 'nextQuestion'],
      properties: {
        question: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, correctAnswer: { type: 'string' }, explanation: { type: 'string' },
        isCorrect: { type: 'boolean' }, questionIndex: { type: 'integer' }, totalQuestions: { type: 'integer' }, finished: { type: 'boolean' }, score: { type: 'integer' },
        revisionTopics: { type: 'array', items: { type: 'string' } },
        nextQuestion: { type: 'object', additionalProperties: false, required: ['question', 'choices', 'correctAnswer', 'explanation', 'questionIndex'], properties: {
          question: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, correctAnswer: { type: 'string' }, explanation: { type: 'string' }, questionIndex: { type: 'integer' }
        } }
      }
    },
    steps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['action', 'minutes'], properties: { action: { type: 'string' }, minutes: { type: 'integer' } } } },
    sprintMinutes: { type: 'integer' },
    smallerAlternative: { type: 'string' }
  }
};

function json(status: number, body: Record<string, unknown>, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } });
}

function clean(value: unknown, max = 1200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function validateMessages(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Messages must be a list.');
  if (value.length > MAX_MESSAGES) throw new Error('Too much conversation context. Clear the chat and try again.');
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('A conversation message is invalid.');
    const role = (item as Record<string, unknown>).role;
    if (role !== 'user' && role !== 'assistant') throw new Error('A conversation role is invalid.');
    const content = clean((item as Record<string, unknown>).content, 1200);
    if (!content) throw new Error('A conversation message is empty.');
    return { role, content };
  });
}

function normalizeContext(mode: string, raw: unknown) {
  if (!raw || typeof raw !== 'object') throw new Error('Request context is missing.');
  const c = raw as Record<string, unknown>;
  if (mode === 'tutor') return { subject: clean(c.subject, 80), level: clean(c.level, 60), style: clean(c.style, 40), syllabus: clean(c.syllabus, 500) };
  if (mode === 'plan') {
    if (!Array.isArray(c.tasks) || c.tasks.length > MAX_TASKS) throw new Error('Task context is invalid.');
    const tasks = c.tasks.map((rawTask) => {
      if (!rawTask || typeof rawTask !== 'object') throw new Error('A task is invalid.');
      const task = rawTask as Record<string, unknown>;
      if (task.status !== 'Pending') throw new Error('Only pending tasks can be sent to the planner.');
      const name = clean(task.name, 120), subject = clean(task.subject, 70);
      if (!name || !subject) throw new Error('A task name or subject is missing.');
      return { name, subject, priority: ['High', 'Medium', 'Low'].includes(String(task.priority)) ? task.priority : 'Medium', status: 'Pending', deadline: clean(task.deadline, 20), duration: boundedInteger(task.duration, 25, 5, 720) };
    });
    const availableMinutes = boundedInteger(c.availableMinutes, 0, 10, 720);
    if (!availableMinutes) throw new Error('Available time must be from 10 to 720 minutes.');
    return { availableMinutes, energy: ['low', 'steady', 'high'].includes(String(c.energy)) ? c.energy : 'steady', subjects: clean(c.subjects, 400), deadline: clean(c.deadline, 20), planSize: c.planSize === 'small' ? 'small' : 'full', tasks };
  }
  if (mode === 'quiz') {
    const phase = c.phase;
    if (phase !== 'start' && phase !== 'grade') throw new Error('Quiz phase is invalid.');
    const question = c.question && typeof c.question === 'object' ? c.question as Record<string, unknown> : {};
    return { phase, subject: clean(c.subject, 80), topic: clean(c.topic, 1800), difficulty: clean(c.difficulty, 20), total: boundedInteger(c.total, 5, 1, 10), index: boundedInteger(c.index, 1, 1, 10), score: boundedInteger(c.score, 0, 0, 10), missed: Array.isArray(c.missed) ? c.missed.slice(0, 10).map(x => clean(x, 100)) : [], answer: clean(c.answer, 500), question: { prompt: clean(question.prompt, 700), choices: Array.isArray(question.choices) ? question.choices.slice(0, 6).map(x => clean(x, 250)) : [], correctAnswer: clean(question.correctAnswer, 250), explanation: clean(question.explanation, 700), index: boundedInteger(question.index, 1, 1, 10) } };
  }
  if (mode === 'start') return { goal: clean(c.goal, 900), energy: ['low', 'steady', 'overwhelmed'].includes(String(c.energy)) ? c.energy : 'steady', preferredSprintMinutes: boundedInteger(c.preferredSprintMinutes, 10, 5, 30) };
  throw new Error('Mode is invalid.');
}

function systemPrompt(mode: string, phase: string) {
  const shared = 'You are ENGENEverse Study AI, a patient study tutor. Be accurate, clear, practical, and supportive. Never shame a learner or infer ability from one answer. Do not invent references, syllabus rules, or certainty. Ask for missing context if it changes the answer. Return only the requested JSON matching the schema. Populate every required field; for fields unrelated to this mode use empty strings, false, zero, empty arrays, and fully shaped empty nested objects.';
  if (mode === 'tutor') return `${shared} Teach the requested subject and level. Explain why methods work, show steps when requested, and state uncertainty plainly. Keep the answer concise but useful; invite a focused follow-up when helpful.`;
  if (mode === 'plan') return `${shared} Make a realistic schedule within the stated available minutes. Use only the supplied pending tasks; never imply you changed a task. Exclude completed work (none is supplied). Prioritize urgent/high priority work and deadlines, include breaks for longer sessions, and flag workload that cannot fit. If no app tasks exist, use the student's manually supplied goals. A taskName is only an optional reviewable suggestion.`;
  if (mode === 'start') return `${shared} Help the student begin without pressure. Give one clear first action and at most three tiny steps. Fit the sprint to their energy, offer an easier alternative, and avoid guilt or grand motivational claims.`;
  if (phase === 'start') return `${shared} Create one multiple-choice question at a time from the student's topic or notes. Use four distinct options with one defensible answer. Keep the answer key and explanation in the schema. Set finished=false, isCorrect=false, nextQuestion to {question:"",choices:[],correctAnswer:"",explanation:"",questionIndex:0}, and provide a gentle message.`;
  return `${shared} Check the student's selected answer against the current question and answer key. Explain why it is right or what to review. If more questions remain, return exactly one new question in nextQuestion and do not reveal its answer in the explanation. If this was the final question, set finished=true, give a neutral score summary and revisionTopics, and set nextQuestion to {question:"",choices:[],correctAnswer:"",explanation:"",questionIndex:0}. Do not make claims about the learner's ability.`;
}

function buildInput(mode: string, phase: string, context: Record<string, unknown>, messages: Array<{ role: string; content: string }>) {
  if (mode === 'tutor') return [{ role: 'user', content: JSON.stringify({ context, conversation: messages }) }];
  return [{ role: 'user', content: JSON.stringify({ context, phase }) }];
}

function getOutputText(result: Record<string, unknown>): string {
  if (typeof result.output_text === 'string') return result.output_text;
  const output = Array.isArray(result.output) ? result.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    const part = content.find((x) => x && typeof x === 'object' && (x as Record<string, unknown>).type === 'output_text') as Record<string, unknown> | undefined;
    if (typeof part?.text === 'string') return part.text;
  }
  throw new Error('The AI provider returned no structured output.');
}

function validateReply(reply: unknown, mode: string) {
  if (!reply || typeof reply !== 'object') return false;
  const r = reply as Record<string, unknown>;
  if (r.mode !== mode || typeof r.message !== 'string' || !r.plan || !r.quiz || !Array.isArray(r.steps)) return false;
  const plan = r.plan as Record<string, unknown>;
  const quiz = r.quiz as Record<string, unknown>;
  if (!Array.isArray(plan.blocks) || plan.blocks.length > 30 || !Array.isArray(quiz.choices) || quiz.choices.length > 6 || !Array.isArray(quiz.revisionTopics) || !Array.isArray(r.steps) || r.steps.length > 5) return false;
  if (mode === 'plan' && plan.blocks.some((b) => !b || typeof b !== 'object' || !Number.isInteger((b as Record<string, unknown>).durationMinutes) || Number((b as Record<string, unknown>).durationMinutes) < 1)) return false;
  if (mode === 'quiz' && (typeof quiz.question !== 'string' || typeof quiz.finished !== 'boolean' || !Number.isInteger(quiz.questionIndex))) return false;
  if (mode === 'start' && (!Number.isInteger(r.sprintMinutes) || (r.steps as unknown[]).some((s) => !s || typeof s !== 'object' || typeof (s as Record<string, unknown>).action !== 'string'))) return false;
  return true;
}

Deno.serve(async (request: Request) => {
  const configuredOrigins = (Deno.env.get('STUDY_AI_ALLOWED_ORIGINS') || '').split(',').map(x => x.trim()).filter(Boolean);
  const requestOrigin = request.headers.get('Origin') || '';
  const allowedOrigin = configuredOrigins.find(origin => origin === requestOrigin);
  if (!allowedOrigin) return json(403, { error: 'This app origin is not allowed. Configure STUDY_AI_ALLOWED_ORIGINS.' }, 'null');
  const cors = { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_BODY_BYTES) return new Response(JSON.stringify({ error: 'Request is too large.' }), { status: 413, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const rawBody = await request.text();
    if (encoder.encode(rawBody).byteLength > MAX_BODY_BYTES) return new Response(JSON.stringify({ error: 'Request is too large.' }), { status: 413, headers: { ...cors, 'Content-Type': 'application/json' } });
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const mode = body.mode;
    if (!['tutor', 'plan', 'quiz', 'start'].includes(String(mode))) return new Response(JSON.stringify({ error: 'Choose a valid study mode.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    const phase = clean(body.phase, 20) || 'message';
    const context = normalizeContext(String(mode), mode === 'quiz' ? { ...(body.context as Record<string, unknown>), phase } : body.context);
    const messages = mode === 'tutor' ? validateMessages(body.messages) : [];

    const authorization = request.headers.get('Authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) return new Response(JSON.stringify({ error: 'Sign in before using Study AI.' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseAnonKey) return new Response(JSON.stringify({ error: 'Supabase function environment is incomplete.' }), { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } });
    const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return new Response(JSON.stringify({ error: 'Your study session could not be verified.' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { data: allowed, error: quotaError } = await supabase.rpc('consume_study_ai_quota', { p_max_requests: MAX_REQUESTS_PER_MINUTE });
    if (quotaError) { console.error('Study AI quota check failed:', quotaError.message); return new Response(JSON.stringify({ error: 'Study AI rate limit is not configured. Apply the migration and try again.' }), { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } }); }
    if (allowed !== true) return new Response(JSON.stringify({ error: 'Request limit reached. Wait a minute and try again.' }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': '60' } });

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    const model = Deno.env.get('OPENAI_MODEL');
    if (!apiKey || !model) return new Response(JSON.stringify({ error: 'AI provider secrets are not configured on the server.' }), { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);
    let providerResponse: Response;
    try {
      providerResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, store: false, max_output_tokens: 1800, instructions: systemPrompt(String(mode), phase), input: buildInput(String(mode), phase, context, messages), text: { format: { type: 'json_schema', name: 'engene_study_ai_reply', strict: true, schema } } })
      });
    } finally { clearTimeout(timeout); }
    if (!providerResponse.ok) {
      const status = providerResponse.status;
      console.error('AI provider request failed with status:', status);
      const clientStatus = status === 429 ? 429 : status === 401 || status === 403 ? 503 : 502;
      return new Response(JSON.stringify({ error: status === 429 ? 'The AI provider is busy. Try again shortly.' : 'The AI provider could not complete this request.' }), { status: clientStatus, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const providerData = await providerResponse.json() as Record<string, unknown>;
    let reply: unknown;
    try { reply = JSON.parse(getOutputText(providerData)); }
    catch (parseError) {
      console.error('AI provider response was not valid structured JSON.');
      return new Response(JSON.stringify({ error: 'The AI response was malformed. Please try again.' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (!validateReply(reply, String(mode))) {
      console.error('AI provider response failed Study AI validation.');
      return new Response(JSON.stringify({ error: 'The AI response was incomplete. Please try again.' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (mode === 'plan') {
      const plan = (reply as Record<string, unknown>).plan as Record<string, unknown>;
      const minutes = Number((context as Record<string, unknown>).availableMinutes);
      const scheduled = (plan.blocks as Array<Record<string, unknown>>).reduce((sum, block) => sum + Number(block.durationMinutes || 0), 0);
      if (scheduled > minutes) return new Response(JSON.stringify({ error: 'The proposed schedule exceeded the time available. Please regenerate the plan.' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (mode === 'quiz') {
      const quiz = (reply as Record<string, unknown>).quiz as Record<string, unknown>;
      const choices = quiz.choices as string[];
      if (phase === 'start' && (quiz.questionIndex !== 1 || choices.length < 2 || !choices.includes(String(quiz.correctAnswer)))) return new Response(JSON.stringify({ error: 'The quiz question was incomplete. Please try again.' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
      if (phase === 'grade' && quiz.finished !== true) {
        const nextQuestion = quiz.nextQuestion as Record<string, unknown>;
        const nextChoices = nextQuestion.choices as string[];
        if (typeof nextQuestion.question !== 'string' || !nextQuestion.question || nextChoices.length < 2 || !nextChoices.includes(String(nextQuestion.correctAnswer))) return new Response(JSON.stringify({ error: 'The next quiz question was incomplete. Please try again.' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    }
    return new Response(JSON.stringify(reply), { status: 200, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SyntaxError) return new Response(JSON.stringify({ error: 'Request data or AI output was malformed.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (error instanceof DOMException && error.name === 'AbortError') return new Response(JSON.stringify({ error: 'The AI request timed out. Please try again.' }), { status: 504, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (error instanceof Error && /invalid|must be|too much|choose|empty|missing|only pending/i.test(error.message)) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    console.error('Study AI handler error:', error instanceof Error ? error.message : 'Unknown error');
    return new Response(JSON.stringify({ error: 'Study AI could not complete the request.' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
