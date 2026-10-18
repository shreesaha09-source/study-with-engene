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

  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return respond({ error: 'Please sign in to view creator analytics.' }, 401);
  const auth = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: authData, error: authError } = await auth.auth.getUser(token);
  if (authError || !authData.user) return respond({ error: 'Your sign-in session could not be checked. Please sign in again.' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const creatorEmail = (Deno.env.get('COMMUNITY_CREATOR_EMAIL') || '').trim().toLowerCase();
  const configuredCreator = Boolean(creatorEmail && authData.user.email?.toLowerCase() === creatorEmail);
  const { data: creatorAdmin, error: creatorError } = configuredCreator
    ? { data: null, error: null }
    : await admin.from('creator_admins').select('user_id').eq('user_id', authData.user.id).maybeSingle();
  if (creatorError) return respond({ error: 'Creator access could not be checked.' }, 503);
  if (!configuredCreator && !creatorAdmin) return respond({ error: 'Only the site creator can view these analytics.' }, 403);

  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: events, error: eventError }, { data: legacyVisits, error: visitError }, { count: allTimeVisits, error: countError }] = await Promise.all([
      admin.from('site_analytics_events').select('session_id,event_type,page,source,occurred_at,duration_seconds')
        .gte('occurred_at', since).order('occurred_at', { ascending: true }).limit(20000),
      admin.from('site_visits').select('visitor_id,source,visited_at')
        .gte('visited_at', since).order('visited_at', { ascending: true }).limit(20000),
      admin.from('site_visits').select('id', { count: 'exact', head: true }),
    ]);
    if (eventError) throw eventError;
    if (visitError) throw visitError;
    if (countError) throw countError;

    const sessions = new Map<string, { views: number; duration: number; source: string; engaged: boolean }>();
    const eventSources = new Map<string, Set<string>>();
    const pages = new Map<string, number>();
    for (const row of events || []) {
      const sessionId = String(row.session_id);
      const session = sessions.get(sessionId) || { views: 0, duration: 0, source: 'direct', engaged: false };
      if (row.event_type === 'page_view') {
        session.views += 1;
        if (session.views === 1) session.source = row.source || 'direct';
        pages.set(row.page, (pages.get(row.page) || 0) + 1);
      } else if (row.event_type === 'page_end') session.duration += Number(row.duration_seconds) || 0;
      else if (row.event_type === 'engagement') session.engaged = true;
      sessions.set(sessionId, session);
    }

    const legacyVisitorIds = new Set<string>();
    const legacySources = new Map<string, Set<string>>();
    const daily = new Map<string, { visits: number; visitors: Set<string> }>();
    for (const row of legacyVisits || []) {
      const visitorId = String(row.visitor_id || '');
      if (visitorId) legacyVisitorIds.add(visitorId);
      const source = String(row.source || 'direct');
      const sourceVisitors = legacySources.get(source) || new Set<string>();
      if (visitorId) sourceVisitors.add(visitorId);
      legacySources.set(source, sourceVisitors);
      const date = String(row.visited_at).slice(0, 10);
      const day = daily.get(date) || { visits: 0, visitors: new Set<string>() };
      day.visits += 1;
      if (visitorId) day.visitors.add(visitorId);
      daily.set(date, day);
    }

    const eventSessionList = [...sessions.values()];
    const engaged = eventSessionList.filter((session) => session.engaged || session.views > 1 || session.duration >= 10).length;
    const sessionsWithDuration = eventSessionList.filter((session) => session.duration > 0);
    const totalDuration = sessionsWithDuration.reduce((sum, session) => sum + session.duration, 0);
    for (const [sessionId, session] of sessions) {
      const sourceVisitors = eventSources.get(session.source) || new Set<string>();
      sourceVisitors.add(sessionId);
      eventSources.set(session.source, sourceVisitors);
    }

    const series = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(Date.now() - (29 - index) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const day = daily.get(date);
      return { date, views: day?.visits || 0, visitors: day?.visitors.size || 0 };
    });
    const sources = eventSessionList.length
      ? [...eventSources.entries()].map(([source, ids]) => ({ source, visitors: ids.size }))
      : [...legacySources.entries()].map(([source, ids]) => ({ source, visitors: ids.size }));

    return respond({
      period_days: 30,
      all_time_visits: Number(allTimeVisits) || 0,
      visitors: legacyVisitorIds.size || eventSessionList.length,
      recorded_sessions: eventSessionList.length,
      page_views: eventSessionList.reduce((sum, session) => sum + session.views, 0),
      engagement_rate: eventSessionList.length ? Math.round((engaged / eventSessionList.length) * 100) : null,
      bounce_rate: eventSessionList.length ? Math.round(((eventSessionList.length - engaged) / eventSessionList.length) * 100) : null,
      average_session_seconds: sessionsWithDuration.length ? Math.round(totalDuration / sessionsWithDuration.length) : null,
      series,
      chart_title: 'Daily visits · last 30 days',
      sources: sources.sort((a, b) => b.visitors - a.visitors).slice(0, 10),
      pages: [...pages.entries()].map(([page, views]) => ({ page, views })).sort((a, b) => b.views - a.views).slice(0, 10),
    });
  } catch (error) {
    console.error('Creator analytics could not be loaded', error);
    return respond({ error: 'Analytics could not be loaded. Please refresh and try again.' }, 500);
  }
});
