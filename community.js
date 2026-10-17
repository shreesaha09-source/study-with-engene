(() => {
  'use strict';
  const state = { client: null, session: null, creator: false, tab: 'gallery', loading: false, pulseStop: null, pulseInterval: null, updatePulseInitialized: false, galleryRows: [], analyticsPage: '', analyticsEnteredAt: 0, analyticsSessionId: '', analyticsSource: '' };
  const cfg = () => window.ENGENE_STUDY_AI_CONFIG || {};
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const el = (id) => document.getElementById(id);
  const status = (message, error = false) => { const node = el('communityStatus'); if (node) { node.textContent = message; node.dataset.error = String(error); } };
  const updateDismissKey = () => `engene-community-update-dot-dismissed:${state.session?.user?.id || 'guest'}`;
  function stopUpdatePulse() {
    clearTimeout(state.pulseStop); clearInterval(state.pulseInterval);
    state.pulseStop = state.pulseInterval = null;
    el('communityUpdatesTab')?.classList.remove('is-pulsing');
  }
  function syncUpdateDot(hasUnread) {
    const button = el('communityUpdatesTab');
    if (!button) return;
    const dismissed = sessionStorage.getItem(updateDismissKey()) === 'true';
    button.classList.toggle('has-new-update', hasUnread && !dismissed);
    button.setAttribute('aria-label', hasUnread ? 'Updates, new update available' : 'Updates');
    button.title = hasUnread ? 'New update available' : 'Updates from the creator';
    if (!hasUnread || dismissed) { stopUpdatePulse(); if (!hasUnread) state.updatePulseInitialized = false; return; }
    if (state.updatePulseInitialized) return;
    state.updatePulseInitialized = true;
    button.classList.add('is-pulsing', 'is-initial-pulse');
    state.pulseStop = setTimeout(() => {
      button.classList.remove('is-pulsing', 'is-initial-pulse');
      state.pulseInterval = setInterval(() => {
        button.classList.add('is-pulsing');
        state.pulseStop = setTimeout(() => button.classList.remove('is-pulsing'), 2000);
      }, 12000);
    }, 4000);
  }
  function dismissUpdateDot() {
    sessionStorage.setItem(updateDismissKey(), 'true');
    el('communityUpdatesTab')?.classList.remove('has-new-update');
    stopUpdatePulse();
  }
  const client = () => {
    if (state.client) return state.client;
    if (window.ENGENE_SUPABASE_CLIENT) { state.client = window.ENGENE_SUPABASE_CLIENT; return state.client; }
    const c = cfg();
    if (!c.supabaseUrl || !c.supabaseAnonKey || !window.supabase?.createClient) return null;
    state.client = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    window.ENGENE_SUPABASE_CLIENT = state.client;
    return state.client;
  };
  async function currentSession() {
    const db = client();
    if (!db) throw new Error('The Supabase connection is not configured in this page yet.');
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    state.session = data.session;
    if (!state.session?.access_token) throw new Error('Please sign in to your website first, then open the Community Board.');
    return state.session;
  }
  async function callFunction(action, values = {}) {
    const session = await currentSession();
    const c = cfg();
    const response = await fetch(`${String(c.supabaseUrl).replace(/\/$/, '')}/functions/v1/community`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: c.supabaseAnonKey, Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, ...values }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'The Community Board service could not finish that.');
    return result;
  }
  function install() {
    if (el('community')) return;
    if (!document.querySelector('link[rel="stylesheet"][href*="community.css"]')) {
      const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet'; stylesheet.href = 'community.css?v=20261017-ui-safety'; document.head.appendChild(stylesheet);
    }
    const section = document.createElement('section');
    section.id = 'community'; section.className = 'view card community-view hidden';
    section.innerHTML = `
      <div class="topbar"><div><div class="community-kicker">MAKE SOMETHING, SHARE SOMETHING ✦</div><h2>🎨 The Community Board</h2></div><button type="button" onclick="showView('home')">← Main Menu</button></div>
      <div class="community-tabs" role="tablist" aria-label="Community sections">
        <button type="button" role="tab" aria-selected="true" data-community-tab="gallery">🎨 Fan Art</button>
        <button type="button" role="tab" aria-selected="false" id="communityUpdatesTab" class="community-update-button" data-community-tab="updates" aria-label="Updates"><span>📣 Updates</span><span class="community-update-dot" aria-hidden="true"></span></button>
        <button type="button" role="tab" aria-selected="false" id="communityAnalyticsTab" class="hidden" data-community-tab="analytics">📊 Creator analytics</button>
        <button type="button" role="tab" aria-selected="false" id="communityReviewTab" data-community-tab="review" class="hidden">🛡️ Review artwork</button>
      </div>
      <div id="communityGallery" class="community-panel">
        <div class="community-intro"><div><h3>Made by the community, for the community</h3><p>Share fan art and cheer others on. Approved artwork stays blurred until you choose to reveal it.</p></div></div>
        <form id="communityUploadForm" class="community-upload"><label>Artwork title<input id="communityTitle" maxlength="90" required placeholder="Give your art a name"></label><label><span class="community-label-title">Short caption <span>(optional)</span></span><textarea id="communityCaption" maxlength="500" rows="2" placeholder="Tell us a little about it"></textarea></label><label>Artist name or nickname<input id="communityArtistName" maxlength="40" required placeholder="How should we credit you?"></label><label class="community-file-label">Choose a PNG or JPEG image<input id="communityFile" type="file" accept="image/png,image/jpeg" required></label><button type="submit">Share artwork ✨</button><label class="community-terms-consent"><input id="communityTermsAccepted" type="checkbox" required><span>I made this or have permission to share it. I keep ownership and allow ENGENEverse to display and share it with credit. <a href="COMMUNITY_ART_TERMS.md" target="_blank" rel="noopener">Read the terms</a>.</span></label><p class="community-small">An automatic safety screen checks each image and caption, then the creator reviews it. If screening fails or flags content, it is not published. Approved art is blurred until you reveal it.</p></form>
        <div id="communityMine" class="community-mine"></div><div id="communityGalleryGrid" class="community-grid" aria-live="polite"></div>
      </div>
      <div id="communityUpdates" class="community-panel hidden"><div class="community-intro"><div><h3>Updates from the creator</h3><p>One place to see announcements and important news.</p></div></div><div id="communityCreatorPost" class="community-creator hidden"></div><div id="communityAnnouncements" class="community-announcements"></div></div>
      <div id="communityAnalyticsPanel" class="community-panel hidden"></div>
      <div id="communityReviewPanel" class="community-panel hidden"><div id="communityReviewQueue"></div></div>
      <div id="communityStatus" class="community-status" role="status" aria-live="polite"></div>`;
    const shell = document.querySelector('.shell');
    const home = el('home');
    if (shell && home) shell.insertBefore(section, home.nextSibling);
    document.querySelectorAll('[data-community-tab]').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.communityTab)));
    el('communityUploadForm')?.addEventListener('submit', uploadArtwork);
  }
  function setTab(tab) {
    state.tab = ['updates', 'review', 'analytics'].includes(tab) ? tab : 'gallery';
    document.querySelectorAll('[data-community-tab]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.communityTab === state.tab)));
    el('communityGallery')?.classList.toggle('hidden', state.tab !== 'gallery');
    el('communityUpdates')?.classList.toggle('hidden', state.tab !== 'updates');
    el('communityReviewPanel')?.classList.toggle('hidden', state.tab !== 'review');
    el('communityAnalyticsPanel')?.classList.toggle('hidden', state.tab !== 'analytics');
    if (state.tab === 'updates') { dismissUpdateDot(); loadAnnouncements(true).catch((e) => status(e.message, true)); }
    if (state.tab === 'analytics' && state.creator) loadCreatorAnalytics().catch((e) => status(e.message, true));
  }
  async function init() {
    install();
    try {
      await currentSession();
      await Promise.all([loadGallery(), loadAnnouncements(false), checkCreator()]);
    } catch (error) { status(error.message, true); }
  }
  async function loadGallery() {
    const db = client();
    const { data, error } = await db.from('community_art').select('id,user_id,title,caption,creator_name,public_path,moderation_status,vote_count,created_at').eq('moderation_status', 'approved').order('created_at', { ascending: false }).limit(60);
    if (error) throw error;
    state.galleryRows = data || [];
    const ids = (data || []).map((row) => row.id);
    const { data: myVotes, error: voteError } = ids.length ? await db.from('community_art_votes').select('art_id').eq('user_id', state.session.user.id).in('art_id', ids) : { data: [], error: null };
    if (voteError) throw voteError;
    const voted = new Set((myVotes || []).map((row) => row.art_id));
    const grid = el('communityGalleryGrid');
    if (!grid) return;
    grid.innerHTML = data?.length ? data.map((row) => {
      const { data: url } = db.storage.from('community-art-approved').getPublicUrl(row.public_path);
      return `<article class="community-art-card"><div class="community-art-image-wrap"><img loading="lazy" class="is-safety-blurred" src="${escapeHtml(url.publicUrl)}" alt="Approved artwork hidden until you reveal it"><button type="button" class="community-art-reveal" aria-pressed="false" onclick="communityRevealArtwork(this)">Reveal approved artwork</button></div><div class="community-art-copy"><h4>${escapeHtml(row.title)}</h4><small class="community-artist">by ${escapeHtml(row.creator_name || 'Community artist')}</small><p>${escapeHtml(row.caption || '')}</p><div class="community-card-actions"><button type="button" class="community-vote ${voted.has(row.id) ? 'is-voted' : ''}" onclick="communityVote('${row.id}',${voted.has(row.id)})" aria-pressed="${voted.has(row.id)}">${voted.has(row.id) ? '💖' : '🤍'} ${Number(row.vote_count) || 0}</button><button type="button" class="community-share" onclick="communityShare('${row.id}')" aria-label="Share ${escapeHtml(row.title)}">Share ↗</button><button type="button" class="community-report" onclick="communityReport('${row.id}')">Report</button></div></div></article>`;
    }).join('') : '<div class="community-empty">The board is ready for its first piece. Share something you made ✨</div>';
    const mine = (data || []).filter((row) => row.user_id === state.session.user.id);
    const { data: ownSubmissions, error: ownError } = await db.from('community_art').select('id,title,moderation_status,created_at').eq('user_id', state.session.user.id).neq('moderation_status', 'approved').order('created_at', { ascending: false }).limit(10);
    if (ownError) throw ownError;
    el('communityMine').innerHTML = ownSubmissions?.length ? `<details class="community-pending"><summary>My submissions awaiting a check (${ownSubmissions.length})</summary>${ownSubmissions.map((row) => `<p><b>${escapeHtml(row.title)}</b> · ${escapeHtml(row.moderation_status === 'review' ? 'waiting for a person to review' : row.moderation_status)}</p>`).join('')}</details>` : '';
    void mine;
  }
  async function loadAnnouncements(markRead) {
    const db = client();
    const { data: announcements, error } = await db.from('community_announcements').select('id,title,body,image_path,published_at').order('published_at', { ascending: false }).limit(50);
    if (error) throw error;
    const ids = (announcements || []).map((row) => row.id);
    const { data: reads, error: readError } = ids.length ? await db.from('community_announcement_reads').select('announcement_id').eq('user_id', state.session.user.id).in('announcement_id', ids) : { data: [], error: null };
    if (readError) throw readError;
    const readSet = new Set((reads || []).map((row) => row.announcement_id));
    const unread = (announcements || []).filter((row) => !readSet.has(row.id));
    const badge = el('communityUnreadBadge');
    syncUpdateDot(unread.length > 0);
    if (badge) { badge.classList.toggle('hidden', !unread.length); badge.textContent = unread.length ? `${unread.length} new` : ''; }
    if (markRead && unread.length) {
      const { error: insertError } = await db.from('community_announcement_reads').upsert(unread.map((row) => ({ announcement_id: row.id, user_id: state.session.user.id })), { onConflict: 'announcement_id,user_id', ignoreDuplicates: true });
      if (insertError) throw insertError;
      unread.forEach((row) => readSet.add(row.id));
      badge?.classList.add('hidden');
    }
    const list = el('communityAnnouncements');
    if (list) list.innerHTML = announcements?.length ? announcements.map((row) => {
      const imageUrl = row.image_path ? db.storage.from('community-announcements').getPublicUrl(row.image_path).data.publicUrl : '';
      return `<article class="community-announcement"><time>${new Date(row.published_at).toLocaleString()}</time>${!readSet.has(row.id) ? '<span class="community-new-tag">NEW</span>' : ''}<h4>${escapeHtml(row.title)}</h4><p>${escapeHtml(row.body).replace(/\n/g, '<br>')}</p>${imageUrl ? `<img class="community-announcement-image" loading="lazy" src="${escapeHtml(imageUrl)}" alt="Image for ${escapeHtml(row.title)}">` : ''}</article>`;
    }).join('') : '<div class="community-empty">No updates yet. Check back here for creator announcements.</div>';
  }
  async function checkCreator() {
    const result = await callFunction('creator-list').catch(() => null);
    state.creator = Boolean(result);
    const reviewTab = el('communityReviewTab');
    const analyticsTab = el('communityAnalyticsTab');
    if (reviewTab) reviewTab.classList.toggle('hidden', !state.creator);
    if (analyticsTab) analyticsTab.classList.toggle('hidden', !state.creator);
    if (!state.creator) return;
    const form = el('communityCreatorPost');
    form.classList.remove('hidden');
    form.innerHTML = `<h3>Post an update</h3><form id="communityAnnouncementForm"><label>Title<input id="communityAnnouncementTitle" maxlength="120" required></label><label>Message<textarea id="communityAnnouncementBody" rows="4" maxlength="3000" required></textarea></label><label class="community-announcement-upload">Add an image <span>(optional)</span><input id="communityAnnouncementImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif"><span class="community-announcement-hint">You can publish text, an image, or both.</span></label><img id="communityAnnouncementPreview" class="community-announcement-preview hidden" alt="Selected update image preview"><button type="submit">Publish to everyone</button></form>`;
    el('communityAnnouncementForm').addEventListener('submit', publishAnnouncement);
    el('communityAnnouncementImage').addEventListener('change', previewAnnouncementImage);
    const { review = [], reports = [] } = result;
    const reviewQueue = review.filter((row) => row.moderation_status === 'review');
    const reportCount = (id) => reports.filter((report) => report.art_id === id).length;
    if (reviewTab) reviewTab.textContent = `🛡️ Review artwork${reviewQueue.length ? ` (${reviewQueue.length})` : ''}`;
    const queue = el('communityReviewQueue');
    if (queue) queue.innerHTML = `<div class="community-intro"><div><h3>Artwork review</h3><p>Open each picture, then approve it to publish it on Fan Art or remove it from the board.</p></div></div>${reviewQueue.length ? reviewQueue.map((row) => `<article class="community-review-card"><div class="community-review-preview"><img class="is-safety-blurred" src="${escapeHtml(row.image_url)}" alt="Artwork preview blurred until revealed"><button type="button" class="community-reveal-button" onclick="communityRevealPreview(this)">Reveal picture</button><a class="community-review-open" href="${escapeHtml(row.image_url)}" target="_blank" rel="noopener noreferrer">Open full size ↗</a></div><div class="community-review-details"><h4>${escapeHtml(row.title)}</h4><p>by ${escapeHtml(row.creator_name || 'Community artist')}</p>${row.caption ? `<p>${escapeHtml(row.caption)}</p>` : ''}<small>Waiting for approval${reportCount(row.id) ? ` · Reports: ${reportCount(row.id)}` : ''}</small><div class="community-review-actions"><button type="button" onclick="communityModerate('${row.id}','approved')">Approve and publish</button> <button type="button" class="secondary" onclick="communityModerate('${row.id}','rejected')">Remove artwork</button></div></div></article>`).join('') : '<p class="community-empty">There is no artwork waiting for review right now.</p>'}`;
  }
  async function loadCreatorAnalytics() {
    const panel = el('communityAnalyticsPanel');
    if (!panel || !state.creator) return;
    panel.innerHTML = '<div class="community-empty">Loading your site reach…</div>';
    const data = await callFunction('creator-analytics');
    const duration = Number(data.average_session_seconds) || 0;
    const durationLabel = duration >= 60 ? `${Math.floor(duration / 60)}m ${duration % 60}s` : `${duration}s`;
    const maxViews = Math.max(1, ...(data.series || []).map((point) => Number(point.views) || 0));
    const chart = (data.series || []).map((point) => `<div class="creator-analytics-bar" title="${escapeHtml(point.date)}: ${point.visitors} visitors, ${point.views} page views"><span style="height:${Math.max(point.views ? 8 : 2, Math.round((point.views / maxViews) * 100))}%"></span></div>`).join('');
    const sources = (data.sources || []).length ? data.sources.map((item) => `<li><span>${escapeHtml(item.source)}</span><b>${Number(item.visitors) || 0}</b></li>`).join('') : '<li><span>No visits recorded yet</span><b>0</b></li>';
    const pages = (data.pages || []).length ? data.pages.map((item) => `<li><span>${escapeHtml(item.page)}</span><b>${Number(item.views) || 0}</b></li>`).join('') : '<li><span>No page views recorded yet</span><b>0</b></li>';
    panel.innerHTML = `<div class="community-intro"><div><h3>Your site reach</h3><p>Anonymous first-party activity from the last ${Number(data.period_days) || 30} days.</p></div><button type="button" class="ghost" onclick="communityRefreshAnalytics()">Refresh</button></div><div class="creator-analytics-metrics"><article><span>Visitors</span><strong>${Number(data.visitors) || 0}</strong></article><article><span>Page views</span><strong>${Number(data.page_views) || 0}</strong></article><article><span>Engagement rate</span><strong>${Number(data.engagement_rate) || 0}%</strong></article><article><span>Bounce rate</span><strong>${Number(data.bounce_rate) || 0}%</strong></article><article><span>Average session</span><strong>${durationLabel}</strong></article></div><section class="creator-analytics-chart"><h4>Daily page views · last 30 days</h4><div class="creator-analytics-bars">${chart}</div><div class="creator-analytics-axis"><span>${escapeHtml(data.series?.[0]?.date || '')}</span><span>Today</span></div></section><div class="creator-analytics-lists"><section><h4>Traffic sources</h4><ul>${sources}</ul></section><section><h4>Popular pages</h4><ul>${pages}</ul></section></div><p class="community-analytics-note">Engaged sessions include visits lasting 10 seconds or longer, or visits to more than one page. Bounce rate is the remaining share. Referrals store only the source host, not the full referring URL. Analytics begins when this version goes live.</p>`;
  }
  function sendAnalyticsEvent(eventType, page, durationSeconds = 0) {
    const c = cfg();
    if (!c.supabaseUrl || !c.supabaseAnonKey || navigator.doNotTrack === '1') return;
    fetch(`${String(c.supabaseUrl).replace(/\/$/, '')}/functions/v1/site-analytics`, {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: c.supabaseAnonKey, Authorization: `Bearer ${c.supabaseAnonKey}` },
      body: JSON.stringify({ session_id: state.analyticsSessionId, event_type: eventType, page, source: state.analyticsSource, duration_seconds: durationSeconds }),
    }).catch(() => {});
  }
  function trackSitePage(page) {
    if (navigator.doNotTrack === '1') return;
    if (!state.analyticsSessionId) {
      try {
        state.analyticsSessionId = sessionStorage.getItem('engene-site-analytics-session') || crypto.randomUUID();
        sessionStorage.setItem('engene-site-analytics-session', state.analyticsSessionId);
        state.analyticsSource = sessionStorage.getItem('engene-site-analytics-source') || '';
        if (!state.analyticsSource) {
          const referrer = document.referrer ? new URL(document.referrer) : null;
          state.analyticsSource = !referrer || referrer.origin === location.origin ? 'direct' : referrer.hostname.toLowerCase();
          sessionStorage.setItem('engene-site-analytics-source', state.analyticsSource);
        }
      } catch (_) { return; }
    }
    const nextPage = String(page || 'home').replace(/[^a-z0-9_-]/gi, '').slice(0, 80) || 'home';
    if (state.analyticsPage) sendAnalyticsEvent('page_end', state.analyticsPage, Math.floor((Date.now() - state.analyticsEnteredAt) / 1000));
    state.analyticsPage = nextPage;
    state.analyticsEnteredAt = Date.now();
    sendAnalyticsEvent('page_view', nextPage);
  }
  async function uploadArtwork(event) {
    event.preventDefault();
    // currentTarget is only populated while the submit event is being dispatched.
    // This handler awaits several network operations, so retain the form first.
    const form = event.currentTarget;
    const file = el('communityFile').files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) { status('Choose a PNG or JPEG image.', true); return; }
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const png = file.type === 'image/png' && header.length === 8 && [137,80,78,71,13,10,26,10].every((byte, index) => header[index] === byte);
      const jpeg = file.type === 'image/jpeg' && header.length >= 3 && header[0] === 255 && header[1] === 216 && header[2] === 255;
      if (!png && !jpeg) throw new Error('That file does not look like a real PNG or JPEG image.');
      status('Preparing your upload…');
      const { id, path, token } = await callFunction('upload-url', { title: el('communityTitle').value, caption: el('communityCaption').value, creatorName: el('communityArtistName').value, licenseAccepted: el('communityTermsAccepted').checked, mime: file.type });
      status('Uploading and checking your artwork…');
      const { error } = await client().storage.from('community-art-pending').uploadToSignedUrl(path, token, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const result = await callFunction('moderate-upload', { id });
      status(result.message || 'Upload complete.');
      form.reset();
      await loadGallery();
      await checkCreator();
    } catch (error) { status(error.message, true); }
    finally { button.disabled = false; }
  }
  function revealPreview(button) {
    const image = button?.parentElement?.querySelector('img');
    if (!image) return;
    const reveal = image.classList.toggle('is-safety-blurred') === false;
    image.alt = reveal ? 'Artwork preview' : 'Artwork preview hidden until you reveal it';
    button.textContent = reveal ? 'Hide preview' : 'Reveal preview';
    button.setAttribute('aria-pressed', String(reveal));
  }
  function revealArtwork(button) {
    const image = button?.parentElement?.querySelector('img');
    if (!image) return;
    const revealed = image.classList.toggle('is-safety-blurred') === false;
    image.alt = revealed ? 'Approved community artwork' : 'Approved artwork hidden until you reveal it';
    button.textContent = revealed ? 'Hide image' : 'Reveal approved artwork';
    button.setAttribute('aria-pressed', String(revealed));
  }
  async function vote(id, alreadyVoted) {
    try {
      const db = client(); await currentSession();
      const change = alreadyVoted
        ? await db.from('community_art_votes').delete().eq('art_id', id).eq('user_id', state.session.user.id)
        : await db.from('community_art_votes').insert({ art_id: id, user_id: state.session.user.id });
      if (change.error) throw change.error;
      await loadGallery();
    } catch (error) { status(error.message, true); }
  }
  async function report(id) {
    const reason = prompt('Why are you reporting this art? Type inappropriate, copyright, spam, or other.');
    if (!reason) return;
    const normalized = reason.trim().toLowerCase();
    if (!['inappropriate', 'copyright', 'spam', 'other'].includes(normalized)) { status('Please enter inappropriate, copyright, spam, or other.', true); return; }
    try { await currentSession(); const result = await callFunction('report-art', { id, reason: normalized }); status(result.message || 'Thanks. The artwork was sent for review.'); await loadGallery(); }
    catch (error) { status(error.message.includes('community_art_reports') ? 'The database setup is not finished yet.' : error.message, true); }
  }
  async function shareArtwork(id) {
    const row = state.galleryRows.find((item) => item.id === id);
    if (!row) { status('That artwork is no longer available to share.', true); return; }
    const { data } = client().storage.from('community-art-approved').getPublicUrl(row.public_path);
    const artist = row.creator_name || 'Community artist';
    const shareData = { title: row.title, text: `${row.title} by ${artist} · ENGENEverse Community Board`, url: data.publicUrl };
    try {
      if (navigator.share) { await navigator.share(shareData); status('Share sheet opened with the artist credit.'); }
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(data.publicUrl); status('Artwork link copied. Credit: ' + artist + '.'); }
      else { window.prompt('Copy this artwork link. Credit: ' + artist, data.publicUrl); }
    } catch (error) {
      if (error?.name !== 'AbortError') status('Could not share the artwork link. Please try again.', true);
    }
  }
  function previewAnnouncementImage(event) {
    const preview = el('communityAnnouncementPreview');
    const file = event.currentTarget.files?.[0];
    if (!preview) return;
    if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
    if (!file) { preview.removeAttribute('src'); preview.dataset.objectUrl = ''; preview.classList.add('hidden'); return; }
    const objectUrl = URL.createObjectURL(file);
    preview.dataset.objectUrl = objectUrl;
    preview.src = objectUrl;
    preview.classList.remove('hidden');
  }
  async function publishAnnouncement(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const file = el('communityAnnouncementImage').files?.[0];
    const title = el('communityAnnouncementTitle').value;
    const body = el('communityAnnouncementBody').value;
    let uploadedPath = '';
    button.disabled = true;
    try {
      if (file) {
        const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];
        if (!allowed.includes(file.type)) throw new Error('Choose a PNG, JPEG, WebP, GIF, or AVIF image.');
        status('Preparing the image upload…');
        const { path, token } = await callFunction('creator-image-upload-url', { mime: file.type });
        uploadedPath = path;
        const { error } = await client().storage.from('community-announcements').uploadToSignedUrl(path, token, file, { contentType: file.type, upsert: false });
        if (error) throw error;
      }
      await callFunction('creator-post', { title, body, imagePath: uploadedPath || null });
      form.reset();
      previewAnnouncementImage({ currentTarget: el('communityAnnouncementImage') });
      status('Update published for everyone.');
      await loadAnnouncements(false);
    } catch (error) {
      if (uploadedPath) await callFunction('creator-image-discard', { path: uploadedPath }).catch(() => {});
      status(error.message, true);
    } finally { button.disabled = false; }
  }
  async function moderate(id, decision) {
    try { await callFunction('creator-moderate', { id, decision }); status(decision === 'approved' ? 'Artwork approved.' : 'Artwork removed.'); await checkCreator(); await loadGallery(); }
    catch (error) { status(error.message, true); }
  }
  window.communityShare = shareArtwork;
  window.communityVote = vote;
  window.communityReport = report;
  window.communityModerate = moderate;
  window.communityRevealPreview = revealPreview;
  window.communityRevealArtwork = revealArtwork;
  window.communityRefreshAnalytics = () => loadCreatorAnalytics().catch((e) => status(e.message, true));
  window.showCommunity = () => { if (window.showView) window.showView('community'); init().catch((e) => status(e.message, true)); };
  document.addEventListener('DOMContentLoaded', () => {
    install();
    const originalShowView = window.showView;
    if (typeof originalShowView === 'function') {
      window.showView = function (id) {
        originalShowView(id);
        trackSitePage(id);
        if (id === 'community') { init().catch((e) => status(e.message, true)); setTab(state.tab); }
      };
    }
    const activeView = document.querySelector('.view:not(.hidden)')?.id || 'home';
    trackSitePage(activeView);
    window.addEventListener('pagehide', () => {
      if (state.analyticsPage) sendAnalyticsEvent('page_end', state.analyticsPage, Math.floor((Date.now() - state.analyticsEnteredAt) / 1000));
    });
    window.setTimeout(() => init().catch(() => {}), 800);
    window.setInterval(() => { if (state.session && document.visibilityState === 'visible') loadAnnouncements(false).catch(() => {}); }, 60000);
  });
})();

