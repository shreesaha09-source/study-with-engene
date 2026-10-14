(() => {
  'use strict';

  const modes = ['tutor', 'plan', 'quiz', 'start'];
  const state = { mode: 'tutor', busy: false, supabase: null, session: null, history: [], quiz: null, lastPlan: null };
  const $ = (id) => document.getElementById(id);
  const safe = (value, max = 1200) => String(value || '').trim().slice(0, max);
  const escapeText = (value) => String(value ?? '');

  function setStatus(text, error = false) {
    const el = $('studyAIStatus');
    if (el) { el.textContent = text || ''; el.dataset.error = String(error); }
  }

  function connection(stateName, text) {
    const el = $('studyAIConnection');
    if (!el) return;
    el.dataset.state = stateName;
    const label = el.querySelector('span');
    if (label) label.textContent = text;
  }

  function addMessage(role, text, customRender) {
    const list = $('studyAIMessages');
    if (!list) return null;
    list.querySelector('.study-ai-empty')?.remove();
    const bubble = document.createElement('article');
    bubble.className = 'study-ai-message ' + (role === 'user' ? 'user' : 'assistant');
    if (customRender) customRender(bubble);
    else bubble.textContent = escapeText(text);
    list.appendChild(bubble);
    list.scrollTop = list.scrollHeight;
    return bubble;
  }

  function emptyState() {
    const list = $('studyAIMessages');
    if (!list || list.children.length) return;
    const empty = document.createElement('div');
    empty.className = 'study-ai-empty';
    const title = document.createElement('b');
    title.textContent = 'What would help today?';
    const note = document.createElement('span');
    note.textContent = 'Pick a mode, add a little context, and your study assistant will meet you there.';
    empty.append(title, note);
    list.appendChild(empty);
  }

  function field(label, id, type, options = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'study-ai-field';
    const lab = document.createElement('label');
    lab.htmlFor = id;
    lab.textContent = label;
    let input;
    if (options.items) {
      input = document.createElement('select');
      options.items.forEach(([value, text]) => {
        const option = document.createElement('option'); option.value = value; option.textContent = text; input.appendChild(option);
      });
    } else if (type === 'textarea') {
      input = document.createElement('textarea');
      input.maxLength = options.maxLength || 500;
      input.placeholder = options.placeholder || '';
    } else {
      input = document.createElement('input');
      input.type = type;
      if (options.min != null) input.min = options.min;
      if (options.max != null) input.max = options.max;
      if (options.maxLength) input.maxLength = options.maxLength;
      if (options.value != null) input.value = options.value;
      if (options.placeholder) input.placeholder = options.placeholder;
    }
    input.id = id;
    if (options.required) input.required = true;
    wrap.append(lab, input);
    return wrap;
  }

  function button(text, action, secondary = false) {
    const el = document.createElement('button');
    el.type = 'button'; el.textContent = text;
    el.className = secondary ? 'study-ai-secondary' : 'study-ai-action';
    el.addEventListener('click', action);
    return el;
  }

  function controlHeading(title, desc) {
    const box = $('studyAIControls');
    box.replaceChildren();
    const h = document.createElement('h4'); h.textContent = title;
    const p = document.createElement('p'); p.textContent = desc;
    box.append(h, p);
    return box;
  }

  function renderControls() {
    const controls = $('studyAIControls');
    if (!controls) return;
    if (state.mode === 'tutor') {
      controlHeading('Tutor settings', 'Choose the level and style that fits this question. You can change it any time.');
      controls.append(
        field('Subject', 'studyAILevelSubject', 'text', { maxLength: 80, placeholder: 'e.g. Biology, Algebra' }),
        field('Level or syllabus', 'studyAILevel', 'select', { items: [['middle-school', 'Middle school'], ['high-school', 'High school'], ['class-11-12', 'Class 11–12'], ['competitive', 'Competitive exam prep'], ['college', 'College / university'], ['custom', 'Other / custom syllabus']] }),
        field('Explanation style', 'studyAIStyle', 'select', { items: [['simple', 'Simple explanation'], ['steps', 'Teach step by step'], ['example', 'Worked example'], ['exam', 'Exam-oriented solution']] })
      );
      const syllabus = field('Syllabus or extra context (optional)', 'studyAISyllabus', 'textarea', { maxLength: 500, placeholder: 'Board, exam name, chapter, or what your teacher expects' });
      controls.append(syllabus);
    } else if (state.mode === 'plan') {
      controlHeading('Shape your plan', 'Only pending tasks are included. Existing task data is read when you request a plan; nothing is changed.');
      controls.append(
        field('Available time (minutes)', 'studyAIAvailable', 'number', { min: 10, max: 720, value: 90 }),
        field('Energy today', 'studyAIEnergy', 'select', { items: [['low', 'Low — gentle workload'], ['steady', 'Steady'], ['high', 'High — focused workload']] }),
        field('Subjects or chapters', 'studyAISubjects', 'textarea', { maxLength: 400, placeholder: 'e.g. Chemistry: acids; History: Unit 3' }),
        field('Exam date or deadline (optional)', 'studyAIDeadline', 'date'),
        field('Plan size', 'studyAIPlanSize', 'select', { items: [['full', 'Full plan for this time'], ['small', 'Small first step']] }),
        button('Build my plan ✦', requestPlan)
      );
      const pending = currentPendingTasks();
      const note = document.createElement('p'); note.className = 'study-ai-task-note';
      note.textContent = pending.length ? `${pending.length} pending task${pending.length === 1 ? '' : 's'} available to include.` : 'No pending app tasks found. You can describe goals above and still make a plan.';
      controls.append(note);
    } else if (state.mode === 'quiz') {
      controlHeading('Quiz setup', 'One question at a time. Your score is just a snapshot for choosing what to review.');
      controls.append(
        field('Subject', 'studyAIQuizSubject', 'text', { maxLength: 80, placeholder: 'e.g. Physics' }),
        field('Topic or notes', 'studyAIQuizTopic', 'textarea', { maxLength: 1800, placeholder: 'Add a topic, or paste short notes to quiz from' }),
        field('Difficulty', 'studyAIQuizDifficulty', 'select', { items: [['gentle', 'Gentle practice'], ['standard', 'Standard'], ['challenging', 'Challenging']] }),
        field('Number of questions', 'studyAIQuizCount', 'number', { min: 1, max: 10, value: 5 }),
        button('Start quiz ✦', startQuiz)
      );
      if (state.quiz) controls.append(button('End quiz and see summary', finishQuiz, true));
    } else {
      controlHeading('Make the start smaller', 'A gentle first action is enough. You can adjust or stop the focus sprint any time.');
      controls.append(
        field('What feels hard to start?', 'studyAIStartGoal', 'textarea', { maxLength: 900, placeholder: 'e.g. I need to revise two biology chapters and feel stuck' }),
        field('Energy right now', 'studyAIStartEnergy', 'select', { items: [['low', 'Low — make it very small'], ['steady', 'Steady'], ['overwhelmed', 'Overwhelmed — one action only']] }),
        button('Find my first step ✦', helpStart)
      );
    }
    const cfg = window.ENGENE_STUDY_AI_CONFIG || {};
    if (cfg.supabaseUrl && cfg.supabaseAnonKey && !state.session) controls.append(button('Continue as a guest', guestSignIn, true));
  }

  function currentPendingTasks() {
    const appTasks = typeof tasks !== 'undefined' && Array.isArray(tasks) ? tasks : [];
    return appTasks.filter(task => task && task.status !== 'Completed').slice(0, 30).map(task => ({
      name: safe(task.name, 120), subject: safe(task.subject, 70), priority: ['High', 'Medium', 'Low'].includes(task.priority) ? task.priority : 'Medium',
      status: 'Pending', deadline: safe(task.deadline, 20) || 'No Deadline', duration: Math.min(720, Math.max(5, Number(task.duration) || 25))
    }));
  }

  function getSupabase() {
    if (state.supabase) return state.supabase;
    const cfg = window.ENGENE_STUDY_AI_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase?.createClient) return null;
    state.supabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    return state.supabase;
  }

  async function refreshSession() {
    const client = getSupabase();
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    state.session = data.session || null;
    return state.session;
  }

  async function guestSignIn() {
    const client = getSupabase();
    if (!client) { setStatus('Setup is incomplete. Add the public Supabase URL and anon key to study-ai-config.js.', true); return; }
    try {
      setStatus('Creating a guest study session…');
      const { data, error } = await client.auth.signInAnonymously();
      if (error) throw error;
      state.session = data.session || null;
      connection('ready', 'Guest session ready');
      setStatus('Guest session ready. Your prompts are not saved by this page.');
      renderControls();
    } catch (error) {
      console.error('Study AI guest sign-in failed', error);
      setStatus('Guest access is unavailable. Enable anonymous sign-ins in Supabase and check the project settings.', true);
    }
  }

  async function ensureSession() {
    const session = await refreshSession();
    if (!session?.access_token) {
      const err = new Error('Sign in as a guest before sending a request.'); err.code = 'NO_SESSION'; throw err;
    }
    return session;
  }

  function errorText(error) {
    if (error?.code === 'NO_CONFIG') return 'Study AI is not configured yet. Set up study-ai-config.js, deploy the Edge Function, and add the server secrets.';
    if (error?.code === 'NO_SESSION') return 'Start a guest session first. This creates a Supabase guest account for rate-limited access.';
    if (error?.status === 429) return 'Study AI is at its request limit for now. Wait a little and try again.';
    if (error?.status === 401 || error?.status === 403) return 'Your session could not be verified. Start a new guest session, then try again.';
    if (error?.name === 'AbortError') return 'That request took too long. Check your connection and try again.';
    if (/Failed to fetch|NetworkError|fetch/i.test(error?.message || '')) return 'Could not reach the Study AI service. Check the connection and confirm the Edge Function is deployed.';
    return safe(error?.message, 280) || 'Study AI could not complete that request. Please try again.';
  }

  async function callAI(payload) {
    const client = getSupabase();
    if (!client) { const error = new Error('Supabase configuration is missing.'); error.code = 'NO_CONFIG'; throw error; }
    const session = await ensureSession();
    const timer = new AbortController();
    const timeout = setTimeout(() => timer.abort(), 45000);
    try {
      const cfg = window.ENGENE_STUDY_AI_CONFIG || {};
      const endpoint = `${String(cfg.supabaseUrl).replace(/\/$/, '')}/functions/v1/${encodeURIComponent(cfg.functionName || 'study-ai')}`;
      const response = await fetch(endpoint, { method: 'POST', signal: timer.signal, headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(payload) });
      let data = null;
      try { data = await response.json(); } catch (_) { /* handled as malformed below */ }
      if (!response.ok) { const err = new Error(data?.error || `Study AI request failed (${response.status}).`); err.status = response.status; throw err; }
      if (!data || typeof data !== 'object' || !validateReply(data, payload.mode)) {
        throw new Error('The Study AI service returned an incomplete response. Please try again.');
      }
      state.session = session;
      connection('ready', 'Service responded');
      return data;
    } finally { clearTimeout(timeout); }
  }

  function validateReply(reply, mode) {
    if (reply.mode !== mode || typeof reply.message !== 'string') return false;
    if (mode === 'plan') return reply.plan && typeof reply.plan.title === 'string' && Array.isArray(reply.plan.blocks) && reply.plan.blocks.length <= 30 && reply.plan.blocks.every(x => typeof x.action === 'string' && Number.isInteger(x.durationMinutes) && x.durationMinutes > 0);
      if (mode === 'quiz') return reply.quiz && typeof reply.quiz.question === 'string' && Array.isArray(reply.quiz.choices) && typeof reply.quiz.finished === 'boolean' && (reply.quiz.nextQuestion === null || typeof reply.quiz.nextQuestion === 'object');
    if (mode === 'start') return Array.isArray(reply.steps) && reply.steps.length <= 5 && Number.isInteger(reply.sprintMinutes);
    return true;
  }

  async function runRequest(payload, userText) {
    if (state.busy) return null;
    state.busy = true;
    const send = $('studyAISend'); if (send) send.disabled = true;
    setStatus('Thinking through this with you…');
    if (userText) addMessage('user', userText);
    const wait = addMessage('assistant', '');
    if (wait) { wait.setAttribute('aria-label', 'Study AI is responding'); wait.textContent = 'Thinking…'; }
    try {
      const reply = await callAI(payload);
      wait?.remove();
      if (payload.mode === 'plan') renderPlanReply(reply);
      else if (payload.mode === 'quiz') renderQuizReply(reply, payload.phase);
      else if (payload.mode === 'start') renderStartReply(reply);
      else addMessage('assistant', reply.message);
      setStatus('');
      return reply;
    } catch (error) {
      wait?.remove();
      if (error?.code === 'NO_CONFIG') connection('error', 'Needs setup');
      else if (error?.code === 'NO_SESSION') connection('error', 'Guest session needed');
      else if (!error?.status) connection('error', 'Could not connect');
      const message = errorText(error);
      addMessage('assistant', 'I could not complete that request. ' + message);
      setStatus(message, true);
      console.error('Study AI request failed', error);
      return null;
    } finally {
      state.busy = false;
      if (send) send.disabled = false;
    }
  }

  function tutorContext() {
    return { subject: safe($('studyAILevelSubject')?.value, 80), level: $('studyAILevel')?.value || 'high-school', style: $('studyAIStyle')?.value || 'simple', syllabus: safe($('studyAISyllabus')?.value, 500) };
  }

  async function sendTutor(text) {
    const message = safe(text, 1200); if (!message) return;
    const context = tutorContext();
    state.history.push({ role: 'user', content: message });
    state.history = state.history.slice(-12);
    const reply = await runRequest({ mode: 'tutor', phase: 'message', context, messages: state.history }, message);
    if (reply) state.history.push({ role: 'assistant', content: reply.message });
  }

  async function requestPlan() {
    const minutes = Number($('studyAIAvailable')?.value);
    if (!Number.isInteger(minutes) || minutes < 10 || minutes > 720) return setStatus('Choose available time from 10 to 720 minutes.', true);
    const pending = currentPendingTasks();
    const manualSubjects = safe($('studyAISubjects')?.value, 400);
    if (!pending.length && !manualSubjects) return setStatus('Add a subject or describe what you want to study.', true);
    const context = { availableMinutes: minutes, energy: $('studyAIEnergy')?.value || 'steady', subjects: manualSubjects, deadline: $('studyAIDeadline')?.value || '', planSize: $('studyAIPlanSize')?.value || 'full', tasks: pending };
    state.lastPlan = context;
    await runRequest({ mode: 'plan', phase: 'create', context }, `Build a ${context.planSize} study plan for ${minutes} minutes.`);
  }

  function renderPlanReply(reply) {
    const plan = reply.plan;
    const bubble = addMessage('assistant', '', (node) => {
      const title = document.createElement('h5'); title.textContent = plan.title;
      const summary = document.createElement('p'); summary.textContent = plan.summary || reply.message;
      node.append(title, summary);
      if (plan.fits === false) { const fit = document.createElement('p'); fit.textContent = 'This workload may not fit the time available. Consider choosing fewer tasks.'; node.appendChild(fit); }
      plan.blocks.forEach((block, index) => {
        const row = document.createElement('div'); row.className = 'ai-block';
        const duration = document.createElement('b'); duration.textContent = `${block.durationMinutes} min`;
        const detail = document.createElement('div');
        const name = document.createElement('strong'); name.textContent = block.subject ? `${block.subject}: ` : '';
        detail.append(name, document.createTextNode(block.action));
        row.append(duration, detail); node.appendChild(row);
        const appTasks = typeof tasks !== 'undefined' && Array.isArray(tasks) ? tasks : [];
        const alreadyTasked = appTasks.some(task => String(task.name || '').trim().toLowerCase() === safe(block.taskName, 160).toLowerCase() && String(task.subject || '').trim().toLowerCase() === safe(block.subject, 80).toLowerCase());
        if (block.taskName && block.kind === 'study' && !alreadyTasked) {
          const add = document.createElement('button'); add.type = 'button'; add.className = 'study-ai-secondary'; add.textContent = `Add “${safe(block.taskName, 60)}” as a task`;
          add.addEventListener('click', () => createTaskAfterConfirmation(block.taskName, block.subject || 'Study'));
          node.appendChild(add);
        }
      });
      if (Array.isArray(plan.caveats)) plan.caveats.forEach(text => { const p = document.createElement('p'); p.textContent = text; node.appendChild(p); });
      const next = document.createElement('p'); next.textContent = `Next: ${plan.nextAction || 'Choose the first block and begin.'}`; node.appendChild(next);
    });
    return bubble;
  }

  function createTaskAfterConfirmation(name, subject) {
    const cleanedName = safe(name, 160), cleanedSubject = safe(subject, 80);
    if (!cleanedName || !cleanedSubject || typeof window.addTask !== 'function' || typeof tasks === 'undefined' || !Array.isArray(tasks)) return setStatus('Task creation is not available right now.', true);
    if (!window.confirm(`Add this AI suggestion to your task list?\n\n${cleanedName}\nSubject: ${cleanedSubject}\n\nYour existing tasks will not be changed.`)) return;
    const numbers = tasks.map(task => Number(task.no)).filter(Number.isInteger);
    const nextNumber = Math.max(0, ...numbers) + 1;
    $('no').value = String(nextNumber); $('name').value = cleanedName; $('subject').value = cleanedSubject;
    const preset = $('subjectPreset'); if (preset) preset.value = '';
    window.addTask();
    setStatus('Added through the existing task list.');
  }

  async function startQuiz() {
    const subject = safe($('studyAIQuizSubject')?.value, 80);
    const topic = safe($('studyAIQuizTopic')?.value, 1800);
    const count = Number($('studyAIQuizCount')?.value);
    if (!subject) return setStatus('Enter a subject for this quiz.', true);
    if (!topic) return setStatus('Add a topic or short notes to quiz from.', true);
    if (!Number.isInteger(count) || count < 1 || count > 10) return setStatus('Choose between 1 and 10 questions.', true);
    state.quiz = { subject, topic, difficulty: $('studyAIQuizDifficulty')?.value || 'standard', total: count, index: 1, score: 0, missed: [], question: null, lastReply: null, waitingForNext: false };
    renderControls();
    await runRequest({ mode: 'quiz', phase: 'start', context: { ...state.quiz } }, `Start a ${count}-question ${state.quiz.difficulty} quiz on ${subject}: ${topic}`);
  }

  function renderQuizReply(reply, phase) {
    const quizReply = reply.quiz;
    if (!state.quiz) state.quiz = { subject: '', topic: '', difficulty: 'standard', total: quizReply.totalQuestions || 1, index: 1, score: 0, missed: [], question: null, lastReply: null, waitingForNext: false };
    const quiz = state.quiz;
    quiz.lastReply = quizReply;
    quiz.index = quizReply.questionIndex || quiz.index;
    if (phase === 'grade') {
      if (quizReply.isCorrect) quiz.score += 1;
      else quiz.missed.push(safe(quizReply.revisionTopics?.[0] || quiz.subject, 100));
      const feedback = addMessage('assistant', '', node => {
        const p = document.createElement('p'); p.className = 'study-ai-quiz-feedback';
        p.textContent = `${quizReply.isCorrect ? 'That’s right.' : 'Good practice. The answer is ' + safe(quizReply.correctAnswer, 180) + '.'} ${safe(quizReply.explanation, 700)}`;
        node.appendChild(p);
        if (quizReply.finished) {
          const summary = document.createElement('p'); summary.textContent = `Quiz complete: ${quiz.score} of ${quiz.total} correct. This is a snapshot, not a label. Review: ${(quizReply.revisionTopics || quiz.missed).join(', ') || 'the ideas you want to strengthen'}.`;
          node.appendChild(summary); quiz.finished = true; state.quiz = null; renderControls();
        } else {
          const next = document.createElement('button'); next.type = 'button'; next.className = 'study-ai-secondary'; next.textContent = 'Continue to next question';
          next.addEventListener('click', () => { next.disabled = true; showNextQuizQuestion(quizReply); }); node.appendChild(next);
        }
      });
      return feedback;
    }
    const activeQuestion = phase === 'next' ? quizReply : quizReply;
    quiz.question = { prompt: activeQuestion.question, choices: activeQuestion.choices, correctAnswer: activeQuestion.correctAnswer, explanation: activeQuestion.explanation, index: activeQuestion.questionIndex || 1 };
    const bubble = addMessage('assistant', '', node => {
      const heading = document.createElement('h5'); heading.textContent = `Question ${quizReply.questionIndex || quiz.index} of ${quizReply.totalQuestions || quiz.total}`;
      const q = document.createElement('p'); q.textContent = quizReply.question;
      node.append(heading, q);
      (quizReply.choices || []).forEach((choice, i) => {
        const option = document.createElement('button'); option.type = 'button'; option.className = 'study-ai-quiz-choice';
        const letter = document.createElement('span'); letter.textContent = String.fromCharCode(65 + i) + '.';
        const text = document.createElement('span'); text.textContent = choice;
        option.append(letter, text);
        option.addEventListener('click', () => { node.querySelectorAll('.study-ai-quiz-choice').forEach(button => { button.disabled = true; }); answerQuiz(choice); });
        node.appendChild(option);
      });
    });
    return bubble;
  }

  async function answerQuiz(answer) {
    const quiz = state.quiz; if (!quiz?.question || state.busy) return;
    addMessage('user', answer);
    await runRequest({ mode: 'quiz', phase: 'grade', context: { ...quiz, answer, question: quiz.question } });
  }

  async function showNextQuizQuestion(previous) {
    if (previous.finished || !previous.nextQuestion) return;
    const quiz = state.quiz; if (!quiz) return;
    quiz.index += 1;
    renderQuizReply({ mode: 'quiz', message: '', quiz: previous.nextQuestion }, 'next');
  }

  function finishQuiz() {
    if (!state.quiz) return;
    const text = `Quiz ended after ${state.quiz.index - 1} question${state.quiz.index === 2 ? '' : 's'}. You got ${state.quiz.score} correct. Take a short pause or review one missed concept when you’re ready.`;
    addMessage('assistant', text); state.quiz = null; renderControls(); setStatus('');
  }

  async function helpStart() {
    const goal = safe($('studyAIStartGoal')?.value, 900);
    if (!goal) return setStatus('Describe the task or feeling you want help with.', true);
    const energy = $('studyAIStartEnergy')?.value || 'steady';
    await runRequest({ mode: 'start', phase: 'create', context: { goal, energy, preferredSprintMinutes: energy === 'low' || energy === 'overwhelmed' ? 8 : 15 } }, `Help me start: ${goal}`);
  }

  function renderStartReply(reply) {
    addMessage('assistant', '', node => {
      const heading = document.createElement('h5'); heading.textContent = 'A small way in'; node.appendChild(heading);
      const list = document.createElement('ol');
      reply.steps.forEach(step => { const li = document.createElement('li'); li.textContent = `${safe(step.action, 240)}${step.minutes ? ` · about ${step.minutes} min` : ''}`; list.appendChild(li); });
      node.appendChild(list);
      if (reply.message) { const p = document.createElement('p'); p.textContent = reply.message; node.appendChild(p); }
      const minutes = Math.min(45, Math.max(5, reply.sprintMinutes || 10));
      const start = document.createElement('button'); start.type = 'button'; start.className = 'study-ai-secondary'; start.textContent = `Start a ${minutes}-minute focus sprint`;
      start.addEventListener('click', () => startExistingTimer(minutes)); node.appendChild(start);
      const smallerSprint = document.createElement('button'); smallerSprint.type = 'button'; smallerSprint.className = 'study-ai-secondary'; smallerSprint.textContent = 'Try a smaller 5-minute sprint';
      smallerSprint.addEventListener('click', () => startExistingTimer(5)); node.appendChild(smallerSprint);
      if (reply.smallerAlternative) { const small = document.createElement('p'); small.textContent = `Smaller option: ${reply.smallerAlternative}`; node.appendChild(small); }
    });
  }

  function startExistingTimer(minutes) {
    const timer = $('timer');
    if (!timer || typeof window.startTimer !== 'function') return setStatus('The existing study timer is unavailable.', true);
    if ((typeof timerId !== 'undefined' && timerId) || (typeof timerPaused !== 'undefined' && timerPaused)) {
      if (!window.confirm('A study timer is already running or paused. Open it without changing the current timer?')) return;
      window.showView('timer'); return;
    }
    $('th').value = '0'; $('tm').value = String(Math.min(59, minutes)); $('ts').value = '0';
    window.startTimer(null, true);
  }

  function renderQuickPrompts() {
    const box = $('studyAIQuick'); if (!box) return;
    box.replaceChildren();
    const prompts = state.mode === 'tutor' ? ['Explain this simply', 'Show a worked example', 'Help me check my reasoning'] : state.mode === 'plan' ? ['Include my urgent tasks', 'Keep the first step small'] : state.mode === 'start' ? ['Make this easier to begin', 'Give me a smaller option'] : [];
    prompts.forEach(prompt => { const b = document.createElement('button'); b.type = 'button'; b.textContent = prompt; b.addEventListener('click', () => { const input = $('studyAIInput'); input.value = prompt; input.focus(); }); box.appendChild(b); });
  }

  function switchMode(mode) {
    if (!modes.includes(mode)) return;
    state.mode = mode;
    document.querySelectorAll('[data-ai-mode]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.aiMode === mode)));
    $('studyAIInput').placeholder = mode === 'tutor' ? 'Ask a question about your studies…' : mode === 'plan' ? 'Add a detail for your plan, then use Build my plan…' : mode === 'quiz' ? 'Choose a quiz answer in the conversation…' : 'Describe what is hard to start…';
    const composer = $('studyAIComposer');
    composer.hidden = mode !== 'tutor';
    renderControls(); renderQuickPrompts(); setStatus('');
    if (mode === 'quiz') $('studyAIInput').value = '';
    emptyState();
  }

  function clearConversation() {
    if (!window.confirm('Clear the messages and quiz progress from this page?')) return;
    state.history = []; state.quiz = null; state.lastPlan = null;
    $('studyAIMessages').replaceChildren(); setStatus(''); emptyState(); renderControls();
  }

  async function initializeConnection() {
    const cfg = window.ENGENE_STUDY_AI_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase?.createClient) {
      connection('error', 'Needs setup');
      setStatus('Add your public Supabase project URL and anon key to study-ai-config.js, then deploy the backend.', true);
      const controls = $('studyAIControls');
      const note = document.createElement('p'); note.className = 'study-ai-task-note';
      note.textContent = 'Setup needed: the app does not contain a provider key or a deployed AI endpoint.';
      controls.appendChild(note);
      return;
    }
    try {
      const session = await refreshSession();
      if (session) connection('ready', 'Signed in · verify on first request');
      else {
        connection('error', 'Guest session needed');
        setStatus('Use the guest button to create a rate-limited study session.');
      }
    } catch (error) {
      connection('error', 'Auth unavailable'); setStatus('Could not load your Supabase session. Check project configuration.', true);
    }
  }

  function initStudyAI() {
    const tabs = document.querySelector('.study-ai-tabs');
    tabs?.addEventListener('click', event => { const tab = event.target.closest('[data-ai-mode]'); if (tab) switchMode(tab.dataset.aiMode); });
    $('studyAIComposer')?.addEventListener('submit', event => { event.preventDefault(); const input = $('studyAIInput'); const text = input.value; input.value = ''; sendTutor(text); });
    $('studyAIClear')?.addEventListener('click', clearConversation);
    $('studyAIInput')?.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && state.mode === 'tutor') { event.preventDefault(); $('studyAIComposer').requestSubmit(); } });
    switchMode('tutor'); emptyState(); initializeConnection();
  }

  window.initStudyAI = initStudyAI;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initStudyAI, { once: true });
  else initStudyAI();
})();
