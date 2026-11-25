/* Firebase Authentication + Firestore sync for ENGENEverse. */
(function () {
  'use strict';

  const CONFIG = window.STUDYVERSE_FIREBASE_CONFIG || {};
  const PLACEHOLDER = ['apiKey', 'authDomain', 'projectId', 'appId'].some(function (key) {
    return !CONFIG[key] || String(CONFIG[key]).indexOf('PASTE_') >= 0;
  });
  const STATUS_ID = 'cloudSyncStatus';
  const META_PREFIX = 'engene_firebase_sync_meta_v1:';
  const PART_BYTES = 600000;
  const BG_DB = 'engene_student_companion_bg';
  const BG_STORE = 'backgrounds';
  const BG_KEY = 'current';
  const STICKER_DB = 'studyverse_custom_sticker_assets_v1';
  const STICKER_STORE = 'assets';
  const state = {
    auth: null, db: null, user: null, busy: false, applying: false,
    timer: 0, bridgePromise: Promise.resolve(), ready: false
  };

  window.STUDYVERSE_FIREBASE_INTEGRATION = true;

  function showStatus(message, bad) {
    const node = document.getElementById(STATUS_ID);
    if (!node) return;
    node.textContent = message;
    node.dataset.error = String(Boolean(bad));
  }

  function toast(message) {
    if (typeof window.toast === 'function') window.toast(message);
    else console.warn(message);
  }

  function localMetaKey(uid) { return META_PREFIX + uid; }
  function readMeta(uid) {
    try { return JSON.parse(localStorage.getItem(localMetaKey(uid)) || 'null'); }
    catch (_) { return null; }
  }
  function writeMeta(uid, value) {
    try { localStorage.setItem(localMetaKey(uid), JSON.stringify(value)); }
    catch (_) {}
  }

  function utf8ToBase64(bytes) {
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + step, bytes.length)));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }

  async function blobRecord(blob) {
    if (!blob) return null;
    return { type: blob.type || 'application/octet-stream', base64: utf8ToBase64(new Uint8Array(await blob.arrayBuffer())) };
  }

  function recordBlob(record) {
    if (!record || typeof record.base64 !== 'string') return null;
    return new Blob([base64ToBytes(record.base64)], { type: record.type || 'application/octet-stream' });
  }

  function bytesToBase64(bytes) {
    return utf8ToBase64(bytes);
  }

  async function readLocalStickerAssets() {
    if (!window.indexedDB) return {};
    const db = await new Promise(function (resolve, reject) {
      const request = indexedDB.open(STICKER_DB, 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(STICKER_STORE)) request.result.createObjectStore(STICKER_STORE);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('Could not open saved sticker storage.')); };
    });
    try {
      const assets = await new Promise(function (resolve, reject) {
        const tx = db.transaction(STICKER_STORE, 'readonly');
        const store = tx.objectStore(STICKER_STORE);
        const keysRequest = store.getAllKeys();
        const valuesRequest = store.getAll();
        tx.oncomplete = function () {
          resolve({ keys: keysRequest.result || [], values: valuesRequest.result || [] });
        };
        tx.onerror = function () { reject(tx.error || new Error('Could not read saved picture stickers.')); };
      });
      const out = {};
      for (let i = 0; i < assets.keys.length; i++) {
        const id = String(assets.keys[i]);
        const value = assets.values[i];
        if (value instanceof Blob) out[id] = await blobRecord(value);
      }
      return Object.fromEntries(Object.entries(out).sort(function (a, b) { return a[0].localeCompare(b[0]); }));
    } finally { db.close(); }
  }

  async function writeLocalStickerAssets(assets) {
    if (!window.indexedDB) return;
    const db = await new Promise(function (resolve, reject) {
      const request = indexedDB.open(STICKER_DB, 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(STICKER_STORE)) request.result.createObjectStore(STICKER_STORE);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('Could not open saved sticker storage.')); };
    });
    try {
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(STICKER_STORE, 'readwrite');
        const store = tx.objectStore(STICKER_STORE);
        store.clear();
        Object.entries(assets || {}).forEach(function (entry) {
          const blob = recordBlob(entry[1]);
          if (blob) store.put(blob, entry[0]);
        });
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error || new Error('Could not restore picture stickers.')); };
        tx.onabort = function () { reject(tx.error || new Error('Could not restore picture stickers.')); };
      });
    } finally { db.close(); }
  }

  async function readLocalData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf('esc_') === 0 && !key.endsWith('_corrupt_backup')) {
        data[key] = localStorage.getItem(key);
      }
    }
    const sortedData = Object.fromEntries(Object.entries(data).sort(function (a, b) { return a[0].localeCompare(b[0]); }));
    let background = null;
    try {
      if (typeof window.getBackgroundBlob === 'function') background = await blobRecord(await window.getBackgroundBlob());
    } catch (error) { console.warn('Could not read the saved background for cloud sync.', error); }
    return {
      data: sortedData,
      background: background,
      stickerAssets: await readLocalStickerAssets()
    };
  }

  function stable(value) { return JSON.stringify(value); }

  async function hash(value) {
    const input = typeof value === 'string' ? value : stable(value);
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
      return Array.from(new Uint8Array(digest), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
    return String(h >>> 0);
  }

  function parse(value) {
    try { return JSON.parse(value); } catch (_) { return value; }
  }
  function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }

  function mergeValue(remote, local, key) {
    if (local === undefined) return remote;
    if (remote === undefined) return local;
    if (Array.isArray(remote) && Array.isArray(local)) {
      if (key === 'esc_tasks_v2') {
        const merged = new Map();
        remote.concat(local).forEach(function (item) {
          const identity = item && item.created
            ? String(item.created) + '|' + item.name + '|' + item.subject
            : String(item && item.name) + '|' + String(item && item.subject) + '|' + String(item && item.deadline);
          const previous = merged.get(identity);
          merged.set(identity, previous ? Object.assign({}, previous, item) : Object.assign({}, item));
        });
        const items = Array.from(merged.values()).sort(function (a, b) {
          const ao = Number(a.order), bo = Number(b.order);
          if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
          return Number(a.no || 0) - Number(b.no || 0);
        });
        const used = new Set();
        items.forEach(function (item, index) {
          item.order = index;
          let no = Number(item.no) || index + 1;
          if (used.has(no)) no = Math.max(0, ...used) + 1;
          used.add(no);
          item.no = no;
        });
        return items;
      }
      const merged = new Map();
      remote.concat(local).forEach(function (item) {
        const id = item && typeof item === 'object' ? (item.id || item.no || JSON.stringify(item)) : String(item);
        const previous = merged.get(String(id));
        merged.set(String(id), previous && isObject(previous) && isObject(item) ? Object.assign({}, previous, item) : item);
      });
      return Array.from(merged.values());
    }
    if (isObject(remote) && isObject(local)) {
      const result = Object.assign({}, remote);
      Object.keys(local).forEach(function (field) { result[field] = mergeValue(remote[field], local[field], field); });
      return result;
    }
    return local;
  }

  function mergePayload(remote, local) {
    const data = Object.assign({}, remote.data || {});
    Object.keys(local.data || {}).forEach(function (key) {
      data[key] = JSON.stringify(mergeValue(parse(data[key]), parse(local.data[key]), key));
    });
    const stickerAssets = Object.assign({}, remote.stickerAssets || {}, local.stickerAssets || {});
    return {
      data: Object.fromEntries(Object.entries(data).sort(function (a, b) { return a[0].localeCompare(b[0]); })),
      background: local.background || remote.background || null,
      stickerAssets: Object.fromEntries(Object.entries(stickerAssets).sort(function (a, b) { return a[0].localeCompare(b[0]); }))
    };
  }

  function payloadHasContent(payload) {
    return Boolean(
      Object.keys(payload && payload.data || {}).length ||
      payload && payload.background ||
      Object.keys(payload && payload.stickerAssets || {}).length
    );
  }

  async function replaceLocalPayload(payload) {
    state.applying = true;
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.indexOf('esc_') === 0 && !key.endsWith('_corrupt_backup')) localStorage.removeItem(key);
      }
      Object.entries(payload && payload.data || {}).forEach(function (entry) {
        if (entry[0].indexOf('esc_') === 0 && typeof entry[1] === 'string') localStorage.setItem(entry[0], entry[1]);
      });
      if (typeof window.putBackgroundBlob === 'function') {
        const background = recordBlob(payload && payload.background);
        if (background) await window.putBackgroundBlob(background);
        else if (typeof window.removeBackgroundBlob === 'function') await window.removeBackgroundBlob();
      }
      await writeLocalStickerAssets(payload && payload.stickerAssets || {});
    } finally { state.applying = false; }
  }

  function currentUserRef() {
    if (!state.user) throw new Error('Sign in with Google to sync your saved data.');
    return state.db.collection('users').doc(state.user.uid);
  }

  async function writeSnapshot(payload, payloadHash, previousSnapshotId) {
    const uid = state.user.uid;
    const bytes = new TextEncoder().encode(stable(payload));
    const snapshotId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    const snapshotRef = currentUserRef().collection('snapshots').doc(snapshotId);
    let chunkCount = 0;
    for (let offset = 0; offset < bytes.length; offset += PART_BYTES) {
      const chunk = bytes.subarray(offset, Math.min(offset + PART_BYTES, bytes.length));
      const partRef = snapshotRef.collection('parts').doc(String(chunkCount).padStart(6, '0'));
      await partRef.set({ payload: bytesToBase64(chunk) });
      chunkCount++;
    }
    if (!chunkCount) {
      await snapshotRef.collection('parts').doc('000000').set({ payload: '' });
      chunkCount = 1;
    }
    const updatedAt = Date.now();
    const rootRef = currentUserRef();
    await rootRef.set({
      schemaVersion: 1,
      snapshotId: snapshotId,
      chunkCount: chunkCount,
      payloadHash: payloadHash,
      updatedAt: updatedAt
    });
    if (previousSnapshotId && previousSnapshotId !== snapshotId) {
      await removeSnapshot(uid, previousSnapshotId);
    }
    return { snapshotId: snapshotId, chunkCount: chunkCount, payloadHash: payloadHash, updatedAt: updatedAt };
  }

  async function removeSnapshot(uid, snapshotId) {
    try {
      const parts = await firebase.firestore().collection('users').doc(uid)
        .collection('snapshots').doc(snapshotId).collection('parts').get();
      let batch = firebase.firestore().batch();
      let count = 0;
      for (const part of parts.docs) {
        batch.delete(part.ref);
        count++;
        if (count === 450) {
          await batch.commit();
          batch = firebase.firestore().batch();
          count = 0;
        }
      }
      if (count) await batch.commit();
      await firebase.firestore().collection('users').doc(uid).collection('snapshots').doc(snapshotId).delete();
    } catch (error) { console.warn('Old cloud snapshot cleanup did not complete.', error); }
  }

  async function readSnapshot(meta) {
    if (!meta || !meta.snapshotId || !Number.isInteger(Number(meta.chunkCount))) return null;
    const snapshotRef = currentUserRef().collection('snapshots').doc(meta.snapshotId);
    const parts = await snapshotRef.collection('parts').get();
    const docs = parts.docs.slice().sort(function (a, b) { return a.id.localeCompare(b.id); });
    if (docs.length !== Number(meta.chunkCount)) throw new Error('Your saved cloud snapshot is incomplete. Try again while online.');
    const decoded = docs.map(function (doc) { return base64ToBytes(doc.data().payload || ''); });
    const size = decoded.reduce(function (sum, chunk) { return sum + chunk.length; }, 0);
    const bytes = new Uint8Array(size);
    let offset = 0;
    decoded.forEach(function (chunk) { bytes.set(chunk, offset); offset += chunk.length; });
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return payload && typeof payload === 'object' ? payload : null;
  }

  async function readLegacySupabaseSnapshot() {
    const supabase = window.ENGENE_SUPABASE_CLIENT || null;
    if (!supabase) return null;
    try {
      const authResult = await supabase.auth.getUser();
      const user = authResult && authResult.data && authResult.data.user;
      if (!user) return null;
      const response = await supabase.from('user_app_data')
        .select('data,background_path')
        .eq('user_id', user.id)
        .maybeSingle();
      if (response.error || !response.data) return null;
      let background = null;
      if (response.data.background_path) {
        const downloaded = await supabase.storage.from('engene-user-backgrounds').download(response.data.background_path);
        if (!downloaded.error && downloaded.data) background = await blobRecord(downloaded.data);
      }
      return {
        data: response.data.data || {},
        background: background,
        stickerAssets: {}
      };
    } catch (error) {
      console.warn('Could not import an earlier Supabase app snapshot.', error);
      return null;
    }
  }

  function samePayload(a, b) { return stable(a || {}) === stable(b || {}); }

  async function syncNow() {
    if (state.busy || !state.db || !state.user || !navigator.onLine) return;
    state.busy = true;
    showStatus('Syncing your saved data to your Google account…', false);
    try {
      await state.bridgePromise;
      const local = await readLocalData();
      const localHash = await hash(local);
      const meta = readMeta(state.user.uid);
      const rootRef = currentUserRef();
      const remoteDoc = await rootRef.get();
      const remoteMeta = remoteDoc.exists ? remoteDoc.data() : null;
      let remote = null;
      let dataToSave = local;
      let shouldSave = false;
      let shouldRestore = false;

      if (!remoteMeta) {
        const legacy = await readLegacySupabaseSnapshot();
        if (legacy) {
          dataToSave = mergePayload(legacy, local);
          shouldRestore = !samePayload(dataToSave, local);
        }
        const dataHash = await hash(dataToSave);
        const saved = await writeSnapshot(dataToSave, dataHash, null);
        if (shouldRestore) await replaceLocalPayload(dataToSave);
        writeMeta(state.user.uid, { cloudUpdatedAt: saved.updatedAt, localHash: await hash(dataToSave) });
        state.ready = true;
        showStatus(legacy ? 'Your earlier cloud data is now saved with Firebase.' : 'Everything is saved to your Google account.', false);
        if (shouldRestore) setTimeout(function () { location.reload(); }, 250);
        return;
      }

      if (!meta) {
        remote = await readSnapshot(remoteMeta) || { data: {}, background: null, stickerAssets: {} };
        dataToSave = mergePayload(remote, local);
        shouldSave = !samePayload(dataToSave, remote);
        shouldRestore = !samePayload(dataToSave, local);
      } else if (localHash !== meta.localHash && remoteMeta.updatedAt === meta.cloudUpdatedAt) {
        dataToSave = local;
        shouldSave = true;
      } else if (localHash !== meta.localHash && remoteMeta.updatedAt !== meta.cloudUpdatedAt) {
        remote = await readSnapshot(remoteMeta) || { data: {}, background: null, stickerAssets: {} };
        dataToSave = mergePayload(remote, local);
        shouldSave = !samePayload(dataToSave, remote);
        shouldRestore = !samePayload(dataToSave, local);
      } else if (remoteMeta.updatedAt !== meta.cloudUpdatedAt) {
        dataToSave = await readSnapshot(remoteMeta) || { data: {}, background: null, stickerAssets: {} };
        shouldRestore = !samePayload(dataToSave, local);
      } else {
        state.ready = true;
        showStatus('Everything is saved to your Google account.', false);
        return;
      }

      let savedMeta = remoteMeta;
      if (shouldSave) {
        const dataHash = await hash(dataToSave);
        savedMeta = await writeSnapshot(dataToSave, dataHash, remoteMeta.snapshotId);
      }
      if (shouldRestore) {
        await replaceLocalPayload(dataToSave);
        if (typeof window.initBackground === 'function') await window.initBackground();
      }
      writeMeta(state.user.uid, { cloudUpdatedAt: savedMeta.updatedAt, localHash: await hash(dataToSave) });
      state.ready = true;
      if (shouldRestore) {
        showStatus('Your saved data was restored. Refreshing the app…', false);
        setTimeout(function () { location.reload(); }, 250);
      } else showStatus('Everything is saved to your Google account.', false);
    } catch (error) {
      console.error('ENGENEverse Firebase sync failed:', error);
      const code = error && error.code || '';
      const message = error && error.message || '';
      if (/permission-denied|insufficient permissions/i.test(code + ' ' + message)) {
        showStatus('Firebase denied cloud sync. Publish the uid-only Firestore rules from FIREBASE_SETUP.md.', true);
      } else if (/not configured|PASTE_/i.test(message)) {
        showStatus('Add your Firebase web config in firebase-config.js to enable cloud sync.', true);
      } else {
        showStatus('Cloud sync could not finish. Your browser copy is still available on this device.', true);
      }
    } finally { state.busy = false; }
  }

  function scheduleSync(delay) {
    if (state.applying || !state.user) return;
    clearTimeout(state.timer);
    state.timer = setTimeout(syncNow, Number(delay) || 1200);
  }

  function beginBridgeWait() {
    let release;
    state.bridgePromise = new Promise(function (resolve) { release = resolve; });
    return function () { if (release) { release(); release = null; } };
  }

  async function bridgeGoogleSession(userCredential) {
    const supabase = window.ENGENE_SUPABASE_CLIENT || null;
    if (!supabase || !userCredential) return;
    const providerCredential = firebase.auth.GoogleAuthProvider.credentialFromResult(userCredential);
    const idToken = providerCredential && providerCredential.idToken;
    if (idToken) {
      const response = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
      if (response.error) throw response.error;
      return;
    }

    // Firebase's Google popup normally exposes a Google access token, not an ID token.
    // Supabase needs Google's ID token, so complete community auth through its own Google OAuth flow.
    const oauth = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: location.origin + location.pathname,
        queryParams: userCredential.user && userCredential.user.email
          ? { login_hint: userCredential.user.email }
          : {}
      }
    });
    if (oauth.error) throw oauth.error;
  }

  async function signInWithGoogle() {
    if (!state.auth) {
      toast('Firebase is not configured yet. Add your web config in firebase-config.js.');
      return;
    }
    const release = beginBridgeWait();
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await state.auth.signInWithPopup(provider);
      try { await bridgeGoogleSession(result); }
      catch (error) {
        console.warn('Firebase login succeeded; Supabase community login did not.', error);
        toast('You are signed in for Firebase sync. Community features could not sign in: ' + (error.message || 'check Supabase Google provider setup.'));
      }
    } catch (error) {
      const code = error && error.code || '';
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        try { await state.auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider()); }
        catch (redirectError) { toast('Google sign-in could not start: ' + (redirectError.message || 'Unknown error')); }
      } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        toast('Google sign-in could not start: ' + (error.message || 'Unknown error'));
      }
    } finally { release(); }
  }

  async function handleRedirectResult() {
    if (!state.auth) return;
    const release = beginBridgeWait();
    try {
      const result = await state.auth.getRedirectResult();
      if (result && result.user) {
        try { await bridgeGoogleSession(result); }
        catch (error) {
          console.warn('Firebase login succeeded; Supabase community login did not.', error);
          toast('You are signed in for Firebase sync. Community features could not sign in: ' + (error.message || 'check Supabase Google provider setup.'));
        }
      }
    } catch (error) {
      if (error && error.code !== 'auth/no-auth-event') toast('Google sign-in could not finish: ' + (error.message || 'Unknown error'));
    } finally { release(); }
  }

  async function signOut() {
    if (state.auth) await state.auth.signOut();
  }

  function initialize() {
    if (PLACEHOLDER) {
      showStatus('Add your Firebase web config in firebase-config.js to enable Google cloud sync.', true);
      window.studyverseFirebase = { configured: false, signInWithGoogle: signInWithGoogle, signOut: signOut };
      window.dispatchEvent(new CustomEvent('studyverse-firebase-auth-changed', { detail: { user: null, configured: false } }));
      return;
    }
    if (!window.firebase || !Array.isArray(firebase.apps) || typeof firebase.initializeApp !== 'function') {
      showStatus('Firebase SDK did not load. Check the connection and reload.', true);
      return;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(CONFIG);
      state.auth = firebase.auth();
      state.db = firebase.firestore();
    } catch (error) {
      console.error('Firebase initialization failed:', error);
      showStatus('Firebase could not initialize. Check firebase-config.js and reload.', true);
      return;
    }
    state.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function (error) {
      console.warn('Firebase could not enable local sign-in persistence.', error);
    });
    state.auth.useDeviceLanguage();
    window.studyverseFirebase = {
      configured: true,
      auth: state.auth,
      signInWithGoogle: signInWithGoogle,
      signOut: signOut
    };
    state.auth.onAuthStateChanged(function (user) {
      state.user = user || null;
      window.dispatchEvent(new CustomEvent('studyverse-firebase-auth-changed', { detail: { user: state.user, configured: true } }));
      if (state.user) setTimeout(syncNow, 0);
      else {
        state.ready = false;
        showStatus('Sign in with Google to back up your saved Studyverse data.');
      }
    });
    handleRedirectResult();
    window.addEventListener('engene-background-changed', scheduleSync);
    window.addEventListener('online', scheduleSync);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) syncNow(); });
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      const result = originalSet.call(this, key, value);
      if (this === localStorage && String(key).indexOf('esc_') === 0) scheduleSync(String(key) === 'esc_timer_session_v1' ? 60000 : 1200);
      return result;
    };
    const originalRemove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
      const result = originalRemove.call(this, key);
      if (this === localStorage && String(key).indexOf('esc_') === 0) scheduleSync();
      return result;
    };
    setInterval(function () { if (state.user) syncNow(); }, 120000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();