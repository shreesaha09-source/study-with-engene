import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Use POST for this request.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return respond({ error: 'Analytics service is unavailable.' }, 503);
  if (request.headers.get('apikey') !== anonKey) return respond({ error: 'Analytics request could not be verified.' }, 401);

  try {
    const body = await request.json();
    const sessionId = String(body?.session_id || '');
    const eventType = String(body?.event_type || '');
    const page = String(body?.page || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
    const source = String(body?.source || 'direct').replace(/[^a-z0-9._:-]/gi, '').slice(0, 120) || 'direct';
    const durationSeconds = Math.max(0, Math.min(86400, Math.floor(Number(body?.duration_seconds) || 0)));
    if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !['page_view', 'page_end'].includes(eventType) || !page) {
      return respond({ error: 'Analytics event is invalid.' }, 400);
    }
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { error } = await admin.from('site_analytics_events').insert({
      session_id: sessionId,
      event_type: eventType,
      page,
      source,
      duration_seconds: durationSeconds,
    });
    if (error) throw error;
    return respond({ recorded: true });
  } catch (error) {
    console.error('Site analytics event could not be stored', error);
    return respond({ error: 'Analytics event could not be stored.' }, 500);
  }
});

