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
  const configuredAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return respond({ error: 'Analytics service is unavailable.' }, 503);
  // This legacy anon key is public and already shipped to the site. Accept it
  // alongside the function env value in case Supabase's built-in env key is stale.
  const allowedPublicKeys = [configuredAnonKey, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjYm1kc2hweHhybWVkeHhhZXBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMDIwMTQsImV4cCI6MjEwNjc3ODAxNH0.in0D9_4jRziYP9_iyOss8bHalyEl923tuW7BOWKb_fU'].filter(Boolean);
  if (!allowedPublicKeys.includes(request.headers.get('apikey') || '')) return respond({ error: 'Analytics request could not be verified.' }, 401);

  try {
    const body = await request.json();
    const sessionId = String(body?.session_id || '');
    const eventType = String(body?.event_type || '');
    const page = String(body?.page || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
    const source = String(body?.source || 'direct').replace(/[^a-z0-9._:-]/gi, '').slice(0, 120) || 'direct';
    const durationSeconds = Math.max(0, Math.min(86400, Math.floor(Number(body?.duration_seconds) || 0)));
    if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !['page_view', 'page_end', 'engagement'].includes(eventType) || !page) {
      return respond({ error: 'Analytics event is invalid.' }, 400);
    }
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const recentCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin.from('site_analytics_events')
      .select('id', { count: 'exact', head: true }).eq('session_id', sessionId).gte('occurred_at', recentCutoff);
    if (countError) throw countError;
    if ((count || 0) >= 120) return respond({ error: 'This analytics session reached its hourly event limit.' }, 429);
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

