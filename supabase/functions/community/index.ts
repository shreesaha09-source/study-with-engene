import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Use POST for this request.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return respond({ error: 'Community backend setup is incomplete.' }, 503);

  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return respond({ error: 'Please sign in to use the Community Board.' }, 401);
  const authClient = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return respond({ error: 'Your sign-in session could not be checked. Please sign in again.' }, 401);
  const user = authData.user;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const creatorEmail = (Deno.env.get('COMMUNITY_CREATOR_EMAIL') || '').trim().toLowerCase();
  const configuredCreator = Boolean(creatorEmail && user.email?.toLowerCase() === creatorEmail);
  const { data: creatorAdmin, error: creatorAdminError } = configuredCreator
    ? { data: null, error: null }
    : await admin.from('creator_admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (creatorAdminError) {
    console.error('Creator authorization lookup failed', creatorAdminError);
    return respond({ error: 'Creator access could not be checked.' }, 503);
  }
  const isCreator = configuredCreator || Boolean(creatorAdmin);
  const moderationKey = Deno.env.get('OPENAI_API_KEY');

  async function screenCommunityUpload(imageUrl: string, title: string, caption: string) {
    if (!moderationKey) throw new Error('Community safety screening is not configured.');
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${moderationKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: `${title}\n${caption}` },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Safety screening failed (${response.status}).`);
    const result = payload?.results?.[0];
    if (!result || typeof result.flagged !== 'boolean') throw new Error('Safety screening returned no decision.');
    const categories = Object.entries(result.categories || {}).filter(([, flagged]) => flagged === true).map(([name]) => name);
    return { safe: result.flagged !== true, categories };
  }

  async function publishPending(row: Record<string, unknown>, labels: Record<string, unknown> = {}) {
    const path = String(row.storage_path || '');
    if (!path) throw new Error('The artwork storage location is missing.');
    const { data: file, error: downloadError } = await admin.storage.from('community-art-pending').download(path);
    if (downloadError || !file) throw downloadError || new Error('Could not read the uploaded artwork.');
    const contentType = path.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const { error: copyError } = await admin.storage.from('community-art-approved').upload(path, file, { contentType, upsert: true });
    if (copyError) throw copyError;
    const { error: updateError } = await admin.from('community_art').update({
      moderation_status: 'approved', public_path: path, moderation_labels: labels, moderated_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (updateError) {
      await admin.storage.from('community-art-approved').remove([path]);
      throw updateError;
    }
    await admin.storage.from('community-art-pending').remove([path]);
  }

  try {
    const body = await request.json();
    const action = clean(body?.action, 40);

    if (action === 'upload-url') {
      const title = clean(body?.title, 90);
      const caption = clean(body?.caption, 500);
      const creatorName = clean(body?.creatorName, 40);
      const licenseAccepted = body?.licenseAccepted === true;
      const mime = clean(body?.mime, 40);
      const extension = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : '';
      if (!title || !creatorName || !extension) return respond({ error: 'Add a title, artist credit, and choose a PNG or JPEG image.' }, 400);
      if (!licenseAccepted) return respond({ error: 'Confirm the Community Art Terms before uploading.' }, 400);
      if (!moderationKey) return respond({ error: 'Image safety screening is temporarily unavailable, so uploads are paused. Please try again later.' }, 503);
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await admin.from('community_art').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', hourAgo);
      if ((count || 0) >= 5) return respond({ error: 'You have reached the upload limit for this hour. Please try again later.' }, 429);
      const id = crypto.randomUUID();
      const storagePath = `${user.id}/${id}.${extension}`;
      const { data: signed, error: signedError } = await admin.storage.from('community-art-pending').createSignedUploadUrl(storagePath);
      if (signedError || !signed) throw signedError || new Error('Could not prepare the image upload.');
      const { error: rowError } = await admin.from('community_art').insert({ id, user_id: user.id, title, caption, creator_name: creatorName, license_accepted_at: new Date().toISOString(), storage_path: storagePath, moderation_status: 'pending' });
      if (rowError) {
        await admin.storage.from('community-art-pending').remove([storagePath]);
        throw rowError;
      }
      return respond({ id, path: storagePath, token: signed.token });
    }

    if (action === 'moderate-upload') {
      const id = clean(body?.id, 50);
      const { data: row, error } = await admin.from('community_art').select('*').eq('id', id).eq('user_id', user.id).single();
      if (error || !row || row.moderation_status !== 'pending') return respond({ error: 'That upload could not be found.' }, 404);
      const { data: image, error: imageError } = await admin.storage.from('community-art-pending').download(row.storage_path);
      if (imageError || !image) throw imageError || new Error('Could not read the uploaded image.');
      const bytes = new Uint8Array(await image.slice(0, 8).arrayBuffer());
      const png = row.storage_path.endsWith('.png') && bytes.length === 8 && [137,80,78,71,13,10,26,10].every((byte, index) => bytes[index] === byte);
      const jpeg = row.storage_path.endsWith('.jpg') && bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (!png && !jpeg) {
        await admin.storage.from('community-art-pending').remove([row.storage_path]);
        await admin.from('community_art').update({ moderation_status: 'rejected', moderation_labels: { reason: 'invalid-image-format' }, moderated_at: new Date().toISOString() }).eq('id', id);
        return respond({ status: 'rejected', message: 'That file was not a valid PNG or JPEG image.' });
      }
      const { data: signedImage, error: signedImageError } = await admin.storage.from('community-art-pending').createSignedUrl(row.storage_path, 600);
      if (signedImageError || !signedImage?.signedUrl) throw signedImageError || new Error('Could not prepare the private safety check.');
      let safety;
      try { safety = await screenCommunityUpload(signedImage.signedUrl, row.title, row.caption || ''); }
      catch (safetyError) {
        await admin.storage.from('community-art-pending').remove([row.storage_path]);
        await admin.from('community_art').update({ moderation_status: 'rejected', moderation_labels: { method: 'safety-check-unavailable' }, moderated_at: new Date().toISOString() }).eq('id', id);
        console.error('Community image safety check unavailable', safetyError);
        return respond({ status: 'rejected', message: 'I couldn’t safely check this image, so it was not shared. Please try again later.' }, 503);
      }
      if (!safety.safe) {
        await admin.storage.from('community-art-pending').remove([row.storage_path]);
        await admin.from('community_art').update({ moderation_status: 'rejected', moderation_labels: { method: 'omni-moderation-latest', blocked_categories: safety.categories }, moderated_at: new Date().toISOString() }).eq('id', id);
        return respond({ status: 'rejected', message: 'This image did not pass the safety check and was not shared.' });
      }
      await admin.from('community_art').update({ moderation_status: 'review', moderation_labels: { method: 'omni-moderation-latest', safety_check: 'passed' } }).eq('id', id);
      return respond({ status: 'review', message: 'Safety check passed. Your image stays private until the creator approves it.' });
    }

    if (action === 'report-art') {
      const id = clean(body?.id, 50);
      const reason = clean(body?.reason, 30);
      if (!['inappropriate', 'copyright', 'spam', 'other'].includes(reason)) return respond({ error: 'Choose a valid report reason.' }, 400);
      const { data: row, error: rowError } = await admin.from('community_art').select('*').eq('id', id).eq('moderation_status', 'approved').maybeSingle();
      if (rowError || !row) return respond({ error: 'That artwork is no longer available.' }, 404);
      const { error: reportError } = await admin.from('community_art_reports').insert({ art_id: id, user_id: user.id, reason });
      if (reportError) return respond({ error: reportError.code === '23505' ? 'You have already reported this artwork.' : 'The report could not be saved.' }, reportError.code === '23505' ? 409 : 500);
      if (row.public_path) {
        const { data: image, error: downloadError } = await admin.storage.from('community-art-approved').download(row.public_path);
        if (downloadError || !image) throw downloadError || new Error('Could not hide the reported artwork.');
        const contentType = row.storage_path.endsWith('.png') ? 'image/png' : 'image/jpeg';
        const { error: privateCopyError } = await admin.storage.from('community-art-pending').upload(row.storage_path, image, { contentType, upsert: true });
        if (privateCopyError) throw privateCopyError;
        const { error: hideError } = await admin.from('community_art').update({ moderation_status: 'review', public_path: null, moderation_labels: { ...(row.moderation_labels || {}), reported_for_review: true }, moderated_at: new Date().toISOString() }).eq('id', id);
        if (hideError) throw hideError;
        await admin.storage.from('community-art-approved').remove([row.public_path]);
      }
      return respond({ status: 'review', message: 'Thanks. The artwork was hidden while it is checked.' });
    }

    if (action.startsWith('creator-')) {
      if (!isCreator) return respond({ error: 'Only the site creator can do that.' }, 403);
      if (action === 'creator-image-upload-url') {
        const mime = clean(body?.mime, 40);
        const extension = mime === 'image/png' ? 'png'
          : mime === 'image/jpeg' ? 'jpg'
          : mime === 'image/webp' ? 'webp'
          : mime === 'image/gif' ? 'gif'
          : mime === 'image/avif' ? 'avif'
          : '';
        if (!extension) return respond({ error: 'Choose a PNG, JPEG, WebP, GIF, or AVIF image.' }, 400);
        const path = `creator/${crypto.randomUUID()}.${extension}`;
        const { data: signed, error: signedError } = await admin.storage.from('community-announcements').createSignedUploadUrl(path);
        if (signedError || !signed) throw signedError || new Error('Could not prepare the image upload.');
        return respond({ path, token: signed.token });
      }
      if (action === 'creator-image-discard') {
        const path = clean(body?.path, 120);
        if (!/^creator\/[a-f0-9-]+\.(png|jpg|webp|gif|avif)$/i.test(path)) return respond({ error: 'That upload could not be found.' }, 400);
        const { error } = await admin.storage.from('community-announcements').remove([path]);
        if (error) throw error;
        return respond({ removed: true });
      }
      if (action === 'creator-analytics') {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: rows, error } = await admin.from('site_analytics_events')
          .select('session_id,event_type,page,source,occurred_at,duration_seconds')
          .gte('occurred_at', since).order('occurred_at', { ascending: true }).limit(20000);
        if (error) throw error;
        const sessions = new Map<string, { views: number; duration: number; source: string; pages: Set<string> }>();
        const days = new Map<string, { views: number; sessions: Set<string> }>();
        const sources = new Map<string, Set<string>>();
        const pages = new Map<string, number>();
        for (const row of rows || []) {
          const sessionId = String(row.session_id);
          const session = sessions.get(sessionId) || { views: 0, duration: 0, source: 'direct', pages: new Set<string>() };
          if (row.event_type === 'page_view') {
            session.views += 1;
            session.pages.add(row.page);
            if (session.views === 1) session.source = row.source || 'direct';
            pages.set(row.page, (pages.get(row.page) || 0) + 1);
            const day = String(row.occurred_at).slice(0, 10);
            const point = days.get(day) || { views: 0, sessions: new Set<string>() };
            point.views += 1;
            point.sessions.add(sessionId);
            days.set(day, point);
          } else if (row.event_type === 'page_end') session.duration += Number(row.duration_seconds) || 0;
          sessions.set(sessionId, session);
        }
        for (const [sessionId, session] of sessions) {
          const bucket = sources.get(session.source) || new Set<string>();
          bucket.add(sessionId);
          sources.set(session.source, bucket);
        }
        const sessionList = [...sessions.values()];
        const engaged = sessionList.filter((session) => session.views > 1 || session.duration >= 10).length;
        const views = sessionList.reduce((sum, session) => sum + session.views, 0);
        const duration = sessionList.reduce((sum, session) => sum + session.duration, 0);
        const series = Array.from({ length: 30 }, (_, index) => {
          const date = new Date(Date.now() - (29 - index) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const point = days.get(date);
          return { date, views: point?.views || 0, visitors: point?.sessions.size || 0 };
        });
        return respond({
          period_days: 30,
          visitors: sessionList.length,
          page_views: views,
          engagement_rate: sessionList.length ? Math.round((engaged / sessionList.length) * 100) : 0,
          bounce_rate: sessionList.length ? Math.round(((sessionList.length - engaged) / sessionList.length) * 100) : 0,
          average_session_seconds: sessionList.length ? Math.round(duration / sessionList.length) : 0,
          series,
          sources: [...sources.entries()].map(([source, ids]) => ({ source, visitors: ids.size })).sort((a, b) => b.visitors - a.visitors).slice(0, 10),
          pages: [...pages.entries()].map(([page, count]) => ({ page, views: count })).sort((a, b) => b.views - a.views).slice(0, 10),
        });
      }
      if (action === 'creator-post') {
        const title = clean(body?.title, 120);
        const text = clean(body?.body, 3000);
        const imagePath = clean(body?.imagePath, 120);
        if (!title || !text) return respond({ error: 'Add a title and message first.' }, 400);
        if (imagePath && !/^creator\/[a-f0-9-]+\.(png|jpg|webp|gif|avif)$/i.test(imagePath)) return respond({ error: 'That update image could not be found.' }, 400);
        if (imagePath) {
          const { data: image, error: imageError } = await admin.storage.from('community-announcements').download(imagePath);
          if (imageError || !image) return respond({ error: 'The update image could not be read. Please choose it again.' }, 400);
          const contentType = imagePath.endsWith('.png') ? 'image/png'
            : imagePath.endsWith('.jpg') ? 'image/jpeg'
            : imagePath.endsWith('.webp') ? 'image/webp'
            : imagePath.endsWith('.gif') ? 'image/gif'
            : 'image/avif';
          const { error: updateError } = await admin.from('community_announcements').insert({ title, body: text, image_path: imagePath, author_id: user.id }).select().single();
          if (updateError) {
            await admin.storage.from('community-announcements').remove([imagePath]);
            throw updateError;
          }
          return respond({ published: true, image_path: imagePath, content_type: contentType });
        }
        const { data, error } = await admin.from('community_announcements').insert({ title, body: text, author_id: user.id }).select().single();
        if (error) throw error;
        return respond({ announcement: data });
      }
      if (action === 'creator-list') {
        const [{ data: review, error: reviewError }, { data: reports, error: reportError }] = await Promise.all([
          admin.from('community_art').select('*').eq('moderation_status', 'review').order('created_at', { ascending: true }).limit(50),
          admin.from('community_art_reports').select('id,art_id,user_id,reason,created_at').order('created_at', { ascending: false }).limit(100),
        ]);
        if (reviewError) throw reviewError;
        if (reportError) throw reportError;
        const reportIds = [...new Set((reports || []).map((report) => report.art_id))];
        const { data: reported, error: reportedError } = reportIds.length
          ? await admin.from('community_art').select('*').in('id', reportIds)
          : { data: [], error: null };
        if (reportedError) throw reportedError;
        const queueById = new Map();
        [...(review || []), ...(reported || [])].forEach((row) => queueById.set(row.id, { ...row, queue_type: 'review' }));
        const queue = [...queueById.values()];
        const withUrls = await Promise.all(queue.map(async (row) => {
          const bucket = row.public_path ? 'community-art-approved' : 'community-art-pending';
          const { data: signed } = await admin.storage.from(bucket).createSignedUrl(row.public_path || row.storage_path, 600);
          return { ...row, image_url: signed?.signedUrl || '' };
        }));
        return respond({ review: withUrls, reports: reports || [] });
      }
      if (action === 'creator-moderate') {
        const id = clean(body?.id, 50);
        const decision = clean(body?.decision, 20);
        if (!['approved', 'rejected'].includes(decision)) return respond({ error: 'Choose approve or reject.' }, 400);
        const { data: row, error } = await admin.from('community_art').select('*').eq('id', id).single();
        if (error || !row) return respond({ error: 'That artwork could not be found.' }, 404);
        if (decision === 'approved') {
          if (row.moderation_status !== 'approved' && row.moderation_labels?.safety_check !== 'passed') return respond({ error: 'This artwork has not passed the automatic safety check.' }, 409);
          if (row.moderation_status !== 'approved') await publishPending(row, row.moderation_labels || {});
        }
        else {
          await admin.from('community_art').update({ moderation_status: 'rejected', moderated_at: new Date().toISOString() }).eq('id', id);
          if (row.storage_path) await admin.storage.from('community-art-pending').remove([row.storage_path]);
          if (row.public_path) await admin.storage.from('community-art-approved').remove([row.public_path]);
        }
        return respond({ status: decision });
      }
    }

    return respond({ error: 'Unknown Community Board action.' }, 400);
  } catch (error) {
    console.error('Community function error', error);
    return respond({ error: 'Something went wrong. Please try again.' }, 500);
  }
});



