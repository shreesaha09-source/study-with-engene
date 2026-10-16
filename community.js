(() => {
  'use strict';
  const state = { client: null, session: null, creator: false, tab: 'gallery', loading: false, pulseStop: null, pulseInterval: null, updatePulseInitialized: false };
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
        state.pulseStop = setTimeout(() => button.classList.remove('is-pulsing'), 1900);
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
    if (!document.querySelector('link[href$="community.css"]')) {
      const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet'; stylesheet.href = 'community.css'; document.head.appendChild(stylesheet);
    }
    const section = document.createElement('section');
    section.id = 'community'; section.className = 'view card community-view hidden';
    section.innerHTML = `
      <div class="topbar"><div><div class="community-kicker">MAKE SOMETHING, SHARE SOMETHING ✦</div><h2>🎨 The Community Board</h2></div><button type="button" onclick="showView('home')">← Main Menu</button></div>
      <div class="community-tabs" role="tablist" aria-label="Community sections">
        <button type="button" role="tab" aria-selected="true" data-community-tab="gallery">🎨 Fan Art</button>
        <button type="button" role="tab" aria-selected="false" id="communityUpdatesTab" class="community-update-button" data-community-tab="updates" aria-label="Updates"><span>📣 Updates</span><span class="community-update-dot" aria-hidden="true"></span></button>
      </div>
      <div id="communityGallery" class="community-panel">
        <div class="community-intro"><div><h3>Made by the community, for the community</h3><p>Share a fan art piece, cheer others on, and help keep the board kind.</p></div></div>
        <form id="communityUploadForm" class="community-upload"><label>Artwork title<input id="communityTitle" maxlength="90" required placeholder="Give your art a name"></label><label><span class="community-label-title">Short caption <span>(optional)</span></span><textarea id="communityCaption" maxlength="500" rows="2" placeholder="Tell us a little about it"></textarea></label><label class="community-file-label">Choose a PNG or JPEG image<input id="communityFile" type="file" accept="image/png,image/jpeg" required></label><button type="submit">Share artwork ✨</button><p class="community-small">Sign in to submit. Your image stays private until the creator reviews and approves it. Only approved art appears here; Supabase’s project size limit applies.</p></form>
        <div id="communityMine" class="community-mine"></div><div id="communityGalleryGrid" class="community-grid" aria-live="polite"></div>
      </div>
      <div id="communityUpdates" class="community-panel hidden"><div class="community-intro"><div><h3>Updates from the creator</h3><p>One place to see announcements and important news.</p></div></div><div id="communityCreatorPost" class="community-creator hidden"></div><div id="communityAnnouncements" class="community-announcements"></div></div>
      <div id="communityStatus" class="community-status" role="status" aria-live="polite"></div>`;
    const shell = document.querySelector('.shell');
    const home = el('home');
    if (shell && home) shell.insertBefore(section, home.nextSibling);
    document.querySelectorAll('[data-community-tab]').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.communityTab)));
    el('communityUploadForm')?.addEventListener('submit', uploadArtwork);
  }
  function setTab(tab) {
    state.tab = tab === 'updates' ? 'updates' : 'gallery';
    document.querySelectorAll('[data-community-tab]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.communityTab === state.tab)));
    el('communityGallery')?.classList.toggle('hidden', state.tab !== 'gallery');
    el('communityUpdates')?.classList.toggle('hidden', state.tab !== 'updates');
    if (state.tab === 'updates') { dismissUpdateDot(); loadAnnouncements(true).catch((e) => status(e.message, true)); }
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
    const { data, error } = await db.from('community_art').select('id,user_id,title,caption,public_path,moderation_status,vote_count,created_at').eq('moderation_status', 'approved').order('created_at', { ascending: false }).limit(60);
    if (error) throw error;
    const ids = (data || []).map((row) => row.id);
    const { data: myVotes, error: voteError } = ids.length ? await db.from('community_art_votes').select('art_id').eq('user_id', state.session.user.id).in('art_id', ids) : { data: [], error: null };
    if (voteError) throw voteError;
    const voted = new Set((myVotes || []).map((row) => row.art_id));
    const grid = el('communityGalleryGrid');
    if (!grid) return;
    grid.innerHTML = data?.length ? data.map((row) => {
      const { data: url } = db.storage.from('community-art-approved').getPublicUrl(row.public_path);
      return `<article class="community-art-card"><img loading="lazy" src="${escapeHtml(url.publicUrl)}" alt="${escapeHtml(row.title)}"><div class="community-art-copy"><h4>${escapeHtml(row.title)}</h4><p>${escapeHtml(row.caption || '')}</p><div class="community-card-actions"><button type="button" class="community-vote ${voted.has(row.id) ? 'is-voted' : ''}" onclick="communityVote('${row.id}',${voted.has(row.id)})" aria-pressed="${voted.has(row.id)}">${voted.has(row.id) ? '💖' : '🤍'} ${Number(row.vote_count) || 0}</button><button type="button" class="community-report" onclick="communityReport('${row.id}')">Report</button></div></div></article>`;
    }).join('') : '<div class="community-empty">The board is ready for its first piece. Share something you made ✨</div>';
    const mine = (data || []).filter((row) => row.user_id === state.session.user.id);
    const { data: ownSubmissions, error: ownError } = await db.from('community_art').select('id,title,moderation_status,created_at').eq('user_id', state.session.user.id).neq('moderation_status', 'approved').order('created_at', { ascending: false }).limit(10);
    if (ownError) throw ownError;
    el('communityMine').innerHTML = ownSubmissions?.length ? `<details class="community-pending"><summary>My submissions awaiting a check (${ownSubmissions.length})</summary>${ownSubmissions.map((row) => `<p><b>${escapeHtml(row.title)}</b> · ${escapeHtml(row.moderation_status === 'review' ? 'waiting for a person to review' : row.moderation_status)}</p>`).join('')}</details>` : '';
    void mine;
  }
  async function loadAnnouncements(markRead) {
    const db = client();
    const { data: announcements, error } = await db.from('community_announcements').select('id,title,body,published_at').order('published_at', { ascending: false }).limit(50);
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
    if (list) list.innerHTML = announcements?.length ? announcements.map((row) => `<article class="community-announcement"><time>${new Date(row.published_at).toLocaleString()}</time><h4>${escapeHtml(row.title)}</h4><p>${escapeHtml(row.body).replace(/\n/g, '<br>')}</p>${!readSet.has(row.id) ? '<span class="community-new-tag">NEW</span>' : ''}</article>`).join('') : '<div class="community-empty">No updates yet. Check back here for creator announcements.</div>';
  }
  async function checkCreator() {
    const result = await callFunction('creator-list').catch(() => null);
    state.creator = Boolean(result);
    if (!state.creator) return;
    const form = el('communityCreatorPost');
    form.classList.remove('hidden');
    form.innerHTML = `<h3>Post an update</h3><form id="communityAnnouncementForm"><label>Title<input id="communityAnnouncementTitle" maxlength="120" required></label><label>Message<textarea id="communityAnnouncementBody" rows="4" maxlength="3000" required></textarea></label><button>Publish to everyone</button></form><div id="communityReviewQueue"></div>`;
    el('communityAnnouncementForm').addEventListener('submit', publishAnnouncement);
    const { review = [], reports = [] } = result;
    el('communityReviewQueue').innerHTML = `<h3>Artwork review</h3>${review.length ? review.map((row) => `<article class="community-review-card"><div class="community-review-preview"><img class="is-safety-blurred" src="${escapeHtml(row.image_url)}" alt="Artwork preview hidden until you reveal it"><button type="button" class="community-reveal-button" onclick="communityRevealPreview(this)">Reveal preview</button></div><div><b>${escapeHtml(row.title)}</b><p>${escapeHtml(row.caption || '')}</p><small>Private for creator review · Status: ${escapeHtml(row.moderation_status)} · Reports: ${reports.filter((report) => report.art_id === row.id).length}</small><div><button type="button" onclick="communityModerate('${row.id}','approved')">Approve</button> <button type="button" class="secondary" onclick="communityModerate('${row.id}','rejected')">Remove</button></div></div></article>`).join('') : '<p class="community-small">No artwork is waiting for review.</p>'}`;
  }
  async function uploadArtwork(event) {
    event.preventDefault();
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
      const { id, path, token } = await callFunction('upload-url', { title: el('communityTitle').value, caption: el('communityCaption').value, mime: file.type });
      status('Uploading and checking your artwork…');
      const { error } = await client().storage.from('community-art-pending').uploadToSignedUrl(path, token, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const result = await callFunction('moderate-upload', { id });
      status(result.message || 'Upload complete.');
      event.currentTarget.reset();
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
  async function publishAnnouncement(event) {
    event.preventDefault();
    try { await callFunction('creator-post', { title: el('communityAnnouncementTitle').value, body: el('communityAnnouncementBody').value }); event.currentTarget.reset(); status('Update published for everyone.'); await loadAnnouncements(false); }
    catch (error) { status(error.message, true); }
  }
  async function moderate(id, decision) {
    try { await callFunction('creator-moderate', { id, decision }); status(decision === 'approved' ? 'Artwork approved.' : 'Artwork removed.'); await checkCreator(); await loadGallery(); }
    catch (error) { status(error.message, true); }
  }
  window.communityVote = vote;
  window.communityReport = report;
  window.communityModerate = moderate;
  window.communityRevealPreview = revealPreview;
  window.showCommunity = () => { if (window.showView) window.showView('community'); init().catch((e) => status(e.message, true)); };
  document.addEventListener('DOMContentLoaded', () => {
    install();
    const originalShowView = window.showView;
    if (typeof originalShowView === 'function') {
      window.showView = function (id) {
        originalShowView(id);
        if (id === 'community') { init().catch((e) => status(e.message, true)); setTab(state.tab); }
      };
    }
    window.setTimeout(() => init().catch(() => {}), 800);
    window.setInterval(() => { if (state.session && document.visibilityState === 'visible') loadAnnouncements(false).catch(() => {}); }, 60000);
  });
})();
