/* Focused additions for the mini desk and workspace sticker picker. */
(() => {
  'use strict';

  const TASK_PROGRESS_KEY = 'esc_mini_desk_task_progress_v1';
  const SESSION_COUNT_KEY = 'esc_mini_desk_session_count_v1';
  const DAILY_SESSION_GOAL = 5;
  const STICKER_ASSET_DB = 'studyverse_custom_sticker_assets_v1';
  const CUSTOM_STICKERS_KEY = 'studyverse_custom_stickers_v1';
  let stickerAssetDbPromise = null;
  const stickerAssetUrls = new Map();

  function customStickerLibrary() {
    const stickers = loadJSON(CUSTOM_STICKERS_KEY, []);
    return Array.isArray(stickers) ? stickers.filter(sticker => sticker && typeof sticker.id === 'string' && ['text', 'image'].includes(sticker.type)) : [];
  }

  function addCustomSticker(sticker) {
    const stickers = customStickerLibrary();
    stickers.push(sticker);
    if (!safeLocalSet(CUSTOM_STICKERS_KEY, JSON.stringify(stickers))) throw new Error('The custom sticker could not be saved. Free some browser storage and try again.');
  }

  function openStickerAssetDb() {
    if (!window.indexedDB) return Promise.reject(new Error('Image storage is unavailable in this browser.'));
    if (!stickerAssetDbPromise) stickerAssetDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(STICKER_ASSET_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('assets')) request.result.createObjectStore('assets');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open image storage.'));
      request.onblocked = () => reject(new Error('Image storage is busy. Close other Studyverse tabs and try again.'));
    });
    return stickerAssetDbPromise;
  }

  function saveStickerAsset(id, blob) {
    return openStickerAssetDb().then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction('assets', 'readwrite');
      transaction.objectStore('assets').put(blob, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not save this image.'));
      transaction.onabort = () => reject(transaction.error || new Error('Could not save this image.'));
    }));
  }

  function getStickerAsset(id) {
    return openStickerAssetDb().then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction('assets', 'readonly');
      const request = transaction.objectStore('assets').get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Could not load this sticker image.'));
    }));
  }

  function hydrateStickerAssetImages() {
    document.querySelectorAll('.sticker-member[data-sticker-asset]').forEach(image => {
      const id = image.dataset.stickerAsset;
      if (!id) return;
      const cachedUrl = stickerAssetUrls.get(id);
      if (cachedUrl) { if (image.getAttribute('src') !== cachedUrl) image.src = cachedUrl; return; }
      getStickerAsset(id).then(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        stickerAssetUrls.set(id, url);
        if (image.isConnected && image.dataset.stickerAsset === id) image.src = url;
      }).catch(error => console.warn('Could not load custom sticker image.', error));
    });
  }

  function taskProgressMap() {
    const saved = loadJSON(TASK_PROGRESS_KEY, {});
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  }

  function taskProgressSeconds(taskNo) {
    return Math.max(0, Number(taskProgressMap()[String(taskNo)]) || 0);
  }

  function creditTaskProgress(taskNo, seconds) {
    if (!taskNo || seconds <= 0) return;
    const progress = taskProgressMap();
    const key = String(taskNo);
    progress[key] = (Number(progress[key]) || 0) + seconds;
    safeLocalSet(TASK_PROGRESS_KEY, JSON.stringify(progress));
  }

  function sessionCountToday() {
    const saved = loadJSON(SESSION_COUNT_KEY, {});
    return saved?.date === todayKey() ? Math.max(0, Number(saved.count) || 0) : 0;
  }

  function recordCompletedSessions(count = 1) {
    const amount = Math.max(0, Math.floor(Number(count) || 0));
    if (!amount) return;
    safeLocalSet(SESSION_COUNT_KEY, JSON.stringify({ date: todayKey(), count: sessionCountToday() + amount }));
    window.updateStudyPictureInPicture?.();
    window.updateInAppMiniDesk?.(currentView);
  }

  function taskStartButton(task) {
    const title = esc(task.name);
    return '<button class="pip-task-start" type="button" data-pip-task="' + Number(task.no) + '" aria-label="Start study session for ' + title + '" title="Start this study session">▶</button>';
  }

  function taskRow(task) {
    const durationSeconds = Math.max(60, Number(task.duration || settings.defaultDuration || 25) * 60);
    const studied = task.status === 'Completed' ? durationSeconds : taskProgressSeconds(task.no);
    const percent = task.status === 'Completed' ? 100 : Math.max(0, Math.min(99, Math.round(studied / durationSeconds * 100)));
    return '<article class="pip-task"><div class="pip-task-line"><span class="pip-task-name" title="' + esc(task.name) + '">' + esc(task.name) + '</span><small>' + Number(task.duration || settings.defaultDuration || 25) + 'm</small>' + taskStartButton(task) + '</div><div class="pip-task-progress" role="progressbar" aria-label="' + esc(task.name) + ' progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '"><span style="width:' + percent + '%"></span></div></article>';
  }

  function startMiniDeskTask(taskNo) {
    const task = tasks.find(item => Number(item.no) === Number(taskNo) && item.status !== 'Completed');
    if (!task) return;
    const snapshot = getStudyTimerSnapshot();
    if (snapshot.running || snapshot.paused) {
      if (!window.confirm('Start this task and stop the current timer?')) return;
      if (snapshot.source === 'legacy') stopTimer();
      else resetWorkspaceTimer();
    }
    if (workspaceModel.timer.endAt) resetWorkspaceTimer();
    const total = Math.max(60, Math.round(Number(task.duration || settings.defaultDuration || 25) * 60));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total % 3600 / 60);
    const seconds = total % 60;
    document.getElementById('th').value = hours || '';
    document.getElementById('tm').value = minutes || '';
    document.getElementById('ts').value = seconds || '';
    timerSetupMode = 'focus';
    startTimer(task, false);
    window.updateStudyPictureInPicture?.();
  }

  function toggleMiniDeskSound() {
    settings.sound = !settings.sound;
    saveSetting('sound', settings.sound);
    const checkbox = document.getElementById('soundToggle');
    if (checkbox) checkbox.checked = settings.sound;
    window.updateStudyPictureInPicture?.();
    window.updateInAppMiniDesk?.(currentView);
  }

  window.startMiniDeskTask = startMiniDeskTask;
  window.toggleMiniDeskSound = toggleMiniDeskSound;

  const previousAccountTimerStudyTime = window.accountTimerStudyTime;
  window.accountTimerStudyTime = function (now) {
    const before = Number(stats.studySeconds) || 0;
    previousAccountTimerStudyTime.call(this, now);
    creditTaskProgress(sessionTask?.no, (Number(stats.studySeconds) || 0) - before);
  };

  const previousAccountWorkspaceTimer = window.accountWorkspaceTimer;
  window.accountWorkspaceTimer = function (now) {
    const startingMode = workspaceModel.timer.mode;
    const transitions = previousAccountWorkspaceTimer.call(this, now);
    const focusSessions = startingMode === 'focus' ? Math.ceil(transitions / 2) : Math.floor(transitions / 2);
    if (transitions > 0) beep();
    recordCompletedSessions(focusSessions);
    return transitions;
  };

  const previousTimerTick = window.timerTick;
  window.timerTick = function (...args) {
    const wasRunning = Boolean(timerId);
    const previousMode = timerMode;
    const wasFocus = timerMode === 'focus';
    const pomodoroEnabled = timerPomodoro;
    previousTimerTick.apply(this, args);
    if (previousMode !== timerMode && pomodoroEnabled) beep();
    if (wasFocus && timerMode === 'break') recordCompletedSessions();
    else if (wasRunning && !timerId && !pomodoroEnabled) recordCompletedSessions();
  };

  const previousLoadWorkspace = window.loadWorkspace;
  window.loadWorkspace = function (...args) {
    const savedWorkspace = loadJSON(WORKSPACE_KEY, {});
    const savedStickerWidgets = new Map((savedWorkspace.widgets || []).filter(widget => widget?.type === 'sticker').map(widget => [String(widget.id), widget]));
    const result = previousLoadWorkspace.apply(this, args);
    const customStickers = customStickerLibrary();
    let stickerLibraryChanged = false;
    let workspaceStickerChanged = false;
    workspaceModel.widgets.forEach(widget => {
      if (widget.type === 'sticker') {
        const savedSticker = savedStickerWidgets.get(String(widget.id)) || {};
        widget.stickerMember = members.includes(savedSticker.stickerMember) ? savedSticker.stickerMember : settings.member;
        widget.stickerCustomText = String(savedSticker.stickerCustomText || '').slice(0, 120);
        widget.stickerCustomImage = typeof savedSticker.stickerCustomImage === 'string' && /^data:image\/(?:png|jpeg);base64,/.test(savedSticker.stickerCustomImage) ? savedSticker.stickerCustomImage : '';
        widget.stickerCustomImageId = typeof savedSticker.stickerCustomImageId === 'string' ? savedSticker.stickerCustomImageId : '';
        widget.stickerCustomActive = ['text', 'image'].includes(savedSticker.stickerCustomActive) ? savedSticker.stickerCustomActive : '';
        widget.stickerCustomStickerId = typeof savedSticker.stickerCustomStickerId === 'string' ? savedSticker.stickerCustomStickerId : '';
        if (widget.stickerCustomActive === 'text' && widget.stickerCustomText) {
          let savedTextSticker = customStickers.find(sticker => sticker.id === widget.stickerCustomStickerId && sticker.type === 'text') || customStickers.find(sticker => sticker.type === 'text' && sticker.text === widget.stickerCustomText);
          if (!savedTextSticker) {
            savedTextSticker = { id: widget.stickerCustomStickerId || (window.crypto?.randomUUID?.() || ('sticker-' + Date.now() + '-' + Math.random().toString(36).slice(2))), type: 'text', name: widget.stickerCustomText.slice(0, 40), text: widget.stickerCustomText, createdAt: Date.now() };
            customStickers.push(savedTextSticker);
            stickerLibraryChanged = true;
          }
          if (widget.stickerCustomStickerId !== savedTextSticker.id) { widget.stickerCustomStickerId = savedTextSticker.id; workspaceStickerChanged = true; }
        } else if (widget.stickerCustomActive === 'image' && widget.stickerCustomImageId) {
          let savedImageSticker = customStickers.find(sticker => sticker.id === widget.stickerCustomStickerId && sticker.type === 'image') || customStickers.find(sticker => sticker.type === 'image' && sticker.assetId === widget.stickerCustomImageId);
          if (!savedImageSticker) {
            savedImageSticker = { id: widget.stickerCustomStickerId || widget.stickerCustomImageId, type: 'image', name: 'Picture sticker ' + (customStickers.filter(sticker => sticker.type === 'image').length + 1), assetId: widget.stickerCustomImageId, createdAt: Date.now() };
            customStickers.push(savedImageSticker);
            stickerLibraryChanged = true;
          }
          if (widget.stickerCustomStickerId !== savedImageSticker.id) { widget.stickerCustomStickerId = savedImageSticker.id; workspaceStickerChanged = true; }
        }
      }
    });
    if (stickerLibraryChanged) safeLocalSet(CUSTOM_STICKERS_KEY, JSON.stringify(customStickers));
    if (workspaceStickerChanged) saveWorkspace();
    return result;
  };

  const previousMakeWorkspaceWidget = window.makeWorkspaceWidget;
  window.makeWorkspaceWidget = function (type, ...args) {
    const widget = previousMakeWorkspaceWidget.call(this, type, ...args);
    if (type === 'sticker') widget.stickerMember = settings.member;
    return widget;
  };

  const previousWorkspaceWidgetMarkup = window.workspaceWidgetMarkup;
  window.workspaceWidgetMarkup = function (widget) {
    const markup = previousWorkspaceWidgetMarkup.call(this, widget);
    if (widget.type !== 'sticker') return markup;
    const customImage = typeof widget.stickerCustomImage === 'string' && /^data:image\/(?:png|jpeg);base64,/.test(widget.stickerCustomImage) ? widget.stickerCustomImage : '';
    const customImageId = typeof widget.stickerCustomImageId === 'string' ? widget.stickerCustomImageId : '';
    const customText = String(widget.stickerCustomText || '').trim();
    const customStickers = customStickerLibrary();
    const selectedCustomSticker = customStickers.find(sticker => sticker.id === widget.stickerCustomStickerId);
    const hasCustomImage = Boolean(customImage || customImageId);
    const visibleCustomImage = widget.stickerCustomActive === 'image' ? customImage : '';
    const visibleCustomImageId = widget.stickerCustomActive === 'image' ? customImageId : '';
    const selected = selectedCustomSticker ? 'saved:' + selectedCustomSticker.id : (widget.stickerCustomActive === 'image' && hasCustomImage ? 'custom:image' : (widget.stickerCustomActive === 'text' && customText ? 'custom:text' : (widget.stickerImage
      ? 'member:' + (members.includes(widget.stickerMember) ? widget.stickerMember : settings.member)
      : 'text:' + Math.max(0, STUDY_STICKER_QUOTES.indexOf(widget.stickerText || STUDY_STICKER_QUOTES[0])))));
    const stickerBody = widget.stickerImage
      ? '<img class="sticker-member"' + (visibleCustomImageId ? ' data-sticker-asset="' + esc(visibleCustomImageId) + '"' : '') + ' src="' + esc(visibleCustomImage || (visibleCustomImageId ? '' : memberImages[widget.stickerMember] || memberImages[settings.member])) + '" alt="' + esc(hasCustomImage && widget.stickerCustomActive === 'image' ? 'Your custom sticker' : memberDisplay(widget.stickerMember) + ' character sticker') + '">'
      : '<span class="sticker-emoji">' + esc(widget.sticker || '✦') + '</span><span class="sticker-quote">' + esc(widget.stickerCustomActive === 'text' ? customText : (widget.stickerText || STUDY_STICKER_QUOTES[0])) + '</span>';
    const customOptions = (customText ? '<option value="custom:text" ' + (selected === 'custom:text' ? 'selected' : '') + '>My text sticker</option>' : '') + (hasCustomImage ? '<option value="custom:image" ' + (selected === 'custom:image' ? 'selected' : '') + '>My image sticker</option>' : '');
    const savedOptions = customStickers.map(sticker => '<option value="saved:' + esc(sticker.id) + '" ' + (selected === 'saved:' + sticker.id ? 'selected' : '') + '>' + esc(sticker.name || (sticker.type === 'text' ? sticker.text : 'Picture sticker')) + '</option>').join('');
    const stickerChoices = '<div class="workspace-widget-content"><div class="sticker-card" data-sticker-body role="button" tabindex="0" aria-label="Click to choose a different sticker">' + stickerBody + '</div><select class="sticker-choice" data-sticker-choice aria-label="Choose a study sticker"><optgroup label="Text stickers">' + STUDY_STICKER_QUOTES.map((quote, index) => '<option value="text:' + index + '" ' + (selected === 'text:' + index ? 'selected' : '') + '>' + esc(quote) + '</option>').join('') + '</optgroup><optgroup label="Character cutouts">' + members.map(member => '<option value="member:' + esc(member) + '" ' + (selected === 'member:' + member ? 'selected' : '') + '>' + esc(memberDisplay(member)) + '</option>').join('') + '</optgroup>' + (savedOptions || customText || customImage ? '<optgroup label="Custom stickers">' + savedOptions + (customOptions ? customOptions : '') + '</optgroup>' : '') + '<optgroup label="Create"><option value="create:new">Create a sticker…</option></optgroup></select></div>';
    const stickerMarkup = markup.replace(/<div class="workspace-widget-content"><div class="sticker-card">[\s\S]*?<\/select><\/div>/, stickerChoices);
    return widget.stickerImage
      ? stickerMarkup.replace('class="workspace-widget ', 'class="workspace-widget member-cutout-mode ')
      : stickerMarkup;
  };

  const previousRenderWorkspace = window.renderWorkspace;
  window.renderWorkspace = function (...args) {
    const result = previousRenderWorkspace.apply(this, args);
    hydrateStickerAssetImages();
    return result;
  };

  document.addEventListener('change', event => {
    const picker = event.target.closest('[data-sticker-choice]');
    if (!picker) return;
    const widgetElement = picker.closest('[data-widget-id]');
    const widget = workspaceModel.widgets.find(item => item.id === widgetElement?.dataset.widgetId);
    if (!widget) return;
    const [kind, value] = picker.value.split(':');
    if (kind === 'create') {
      picker.value = widget.stickerCustomActive === 'image' && (widget.stickerCustomImage || widget.stickerCustomImageId) ? 'custom:image' : (widget.stickerCustomActive === 'text' && widget.stickerCustomText ? 'custom:text' : (widget.stickerImage ? 'member:' + (members.includes(widget.stickerMember) ? widget.stickerMember : settings.member) : 'text:' + Math.max(0, STUDY_STICKER_QUOTES.indexOf(widget.stickerText || STUDY_STICKER_QUOTES[0]))));
      openStickerCreator(widget.id);
      return;
    }
    if (kind === 'saved') {
      const sticker = customStickerLibrary().find(item => item.id === value);
      if (!sticker) return;
      widget.stickerCustomStickerId = sticker.id;
      widget.stickerCustomActive = sticker.type;
      if (sticker.type === 'text') {
        widget.stickerImage = false;
        widget.stickerText = '';
        widget.stickerCustomText = sticker.text;
      } else {
        widget.stickerImage = true;
        widget.stickerCustomImage = '';
        widget.stickerCustomImageId = sticker.assetId;
      }
    } else if (kind === 'custom' && value === 'text' && widget.stickerCustomText) {
      widget.stickerCustomStickerId = '';
      widget.stickerImage = false;
      widget.stickerText = '';
      widget.stickerCustomActive = 'text';
    } else if (kind === 'custom' && value === 'image' && (widget.stickerCustomImage || widget.stickerCustomImageId)) {
      widget.stickerCustomStickerId = '';
      widget.stickerImage = true;
      widget.stickerCustomActive = 'image';
    } else if (kind === 'member' && members.includes(value)) {
      widget.stickerCustomStickerId = '';
      widget.stickerImage = true;
      widget.stickerMember = value;
      widget.stickerCustomActive = '';
      widget.stickerText = '';
    } else if (kind === 'text') {
      widget.stickerCustomStickerId = '';
      widget.stickerImage = false;
      widget.stickerText = STUDY_STICKER_QUOTES[Number(value)] || STUDY_STICKER_QUOTES[0];
      widget.stickerCustomActive = '';
    } else return;
    saveWorkspace();
    renderWorkspace();
  });

  function openStickerCreator(widgetId) {
    let dialog = document.getElementById('customStickerDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'customStickerDialog';
      dialog.className = 'custom-sticker-dialog';
      dialog.innerHTML = '<form class="custom-sticker-form"><header><div><small>YOUR DESK, YOUR STYLE</small><h3>Create a sticker</h3></div><button type="button" class="custom-sticker-close" data-sticker-close aria-label="Close">×</button></header><label class="custom-sticker-kind">Sticker type<select data-custom-sticker-kind><option value="text">Custom text</option><option value="image">Upload an image</option></select></label><label class="custom-sticker-field">Sticker name <span>(optional)</span><input data-custom-sticker-name maxlength="40" placeholder="Give it a name"></label><label class="custom-sticker-field" data-custom-text-panel>Sticker text<input data-custom-sticker-text maxlength="120" placeholder="Write a tiny reminder or phrase"></label><section class="custom-sticker-field" data-custom-image-panel hidden><label>Choose an image<input data-custom-sticker-file type="file" accept="image/*"></label><small>No file-size limit. Browser storage and memory still apply.</small><div class="custom-sticker-editor" data-custom-sticker-editor hidden><canvas data-sticker-canvas></canvas><p data-sticker-editor-status>Pick a background color to remove, or erase it by hand.</p><div class="custom-sticker-tools"><button type="button" data-pick-background>Pick &amp; remove color</button><button type="button" data-erase-mode>Erase</button><button type="button" data-restore-mode>Restore</button></div><label class="custom-sticker-range">Color tolerance <input data-background-tolerance type="range" min="12" max="120" value="48"></label><label class="custom-sticker-range">Brush size <input data-eraser-size type="range" min="4" max="60" value="24"></label><small>Color removal works best on plain backgrounds. Erase and restore refine the edges.</small></div></section><p class="custom-sticker-error" data-custom-sticker-error role="status"></p><footer><button type="button" class="custom-sticker-cancel" data-sticker-close>Cancel</button><button type="submit" class="custom-sticker-save">Add sticker</button></footer></form>';
      document.body.appendChild(dialog);
      const editor = dialog.__stickerEditor = { original: null, sample: null, mode: 'preview', painting: false };
      const kindPicker = dialog.querySelector('[data-custom-sticker-kind]');
      kindPicker.addEventListener('change', () => {
        dialog.querySelector('[data-custom-text-panel]').hidden = kindPicker.value !== 'text';
        dialog.querySelector('[data-custom-image-panel]').hidden = kindPicker.value !== 'image';
        dialog.querySelector('[data-custom-sticker-error]').textContent = '';
      });
      const canvas = dialog.querySelector('[data-sticker-canvas]');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const status = dialog.querySelector('[data-sticker-editor-status]');
      const tolerance = dialog.querySelector('[data-background-tolerance]');
      const fileInput = dialog.querySelector('[data-custom-sticker-file]');
      const fileToCanvas = file => {
        if (!file || (file.type && !file.type.startsWith('image/'))) { dialog.querySelector('[data-custom-sticker-error]').textContent = 'Choose an image file.'; return; }
        const imageUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onerror = () => { URL.revokeObjectURL(imageUrl); dialog.querySelector('[data-custom-sticker-error]').textContent = 'This image format is not supported by your browser. Try saving it as JPG or PNG, then upload it again.'; };
        image.onload = () => {
          URL.revokeObjectURL(imageUrl);
          const scale = Math.min(1, 480 / Math.max(image.naturalWidth, image.naturalHeight));
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          editor.original = context.getImageData(0, 0, canvas.width, canvas.height);
          editor.sample = null;
          editor.mode = 'preview';
          dialog.querySelector('[data-custom-sticker-editor]').hidden = false;
          dialog.querySelector('[data-custom-sticker-error]').textContent = '';
          status.textContent = 'Pick a background color to remove, or erase it by hand.';
        };
        image.src = imageUrl;
      };
      fileInput.addEventListener('change', () => fileToCanvas(fileInput.files?.[0]));
      dialog.querySelector('[data-pick-background]').addEventListener('click', () => {
        if (!editor.original) return;
        editor.mode = 'sample';
        status.textContent = 'Click the background color in the image to remove matching connected pixels.';
      });
      dialog.querySelector('[data-erase-mode]').addEventListener('click', () => { editor.mode = 'erase'; status.textContent = 'Drag over the image to erase. Use Restore to paint pixels back.'; });
      dialog.querySelector('[data-restore-mode]').addEventListener('click', () => { editor.mode = 'restore'; status.textContent = 'Drag over the image to restore the original pixels.'; });
      const removeSampledBackground = () => {
        if (!editor.original || !editor.sample) return;
        const width = canvas.width, height = canvas.height, total = width * height;
        const source = editor.original.data;
        const output = new ImageData(new Uint8ClampedArray(source), width, height);
        const pixels = output.data, seen = new Uint8Array(total), queue = new Int32Array(total);
        const threshold = Number(tolerance.value) ** 2 * 3, sample = editor.sample;
        let read = 0, write = 0;
        const enqueue = index => {
          if (index < 0 || index >= total || seen[index]) return;
          seen[index] = 1;
          const offset = index * 4, dr = source[offset] - sample[0], dg = source[offset + 1] - sample[1], db = source[offset + 2] - sample[2];
          if (dr * dr + dg * dg + db * db <= threshold) queue[write++] = index;
        };
        for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
        for (let y = 1; y < height - 1; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
        while (read < write) {
          const index = queue[read++];
          pixels[index * 4 + 3] = 0;
          const x = index % width, y = Math.floor(index / width);
          if (x > 0) enqueue(index - 1); if (x + 1 < width) enqueue(index + 1);
          if (y > 0) enqueue(index - width); if (y + 1 < height) enqueue(index + width);
        }
        context.putImageData(output, 0, 0);
        editor.mode = 'preview';
        status.textContent = 'Background removed. Use Erase or Restore to refine the cutout.';
      };
      tolerance.addEventListener('input', () => { if (editor.sample) removeSampledBackground(); });
      const paintAt = event => {
        if (!editor.original || !['erase', 'restore'].includes(editor.mode)) return;
        const rect = canvas.getBoundingClientRect();
        const x = Math.round((event.clientX - rect.left) * canvas.width / rect.width);
        const y = Math.round((event.clientY - rect.top) * canvas.height / rect.height);
        const radius = Math.max(2, Number(dialog.querySelector('[data-eraser-size]').value));
        const current = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = current.data, original = editor.original.data;
        for (let py = Math.max(0, y - radius); py <= Math.min(canvas.height - 1, y + radius); py++) {
          for (let px = Math.max(0, x - radius); px <= Math.min(canvas.width - 1, x + radius); px++) {
            const dx = px - x, dy = py - y;
            if (dx * dx + dy * dy > radius * radius) continue;
            const offset = (py * canvas.width + px) * 4;
            if (editor.mode === 'erase') data[offset + 3] = 0;
            else { data[offset] = original[offset]; data[offset + 1] = original[offset + 1]; data[offset + 2] = original[offset + 2]; data[offset + 3] = original[offset + 3]; }
          }
        }
        context.putImageData(current, 0, 0);
      };
      canvas.addEventListener('pointerdown', event => {
        if (editor.mode === 'sample') {
          const rect = canvas.getBoundingClientRect(), x = Math.max(0, Math.min(canvas.width - 1, Math.floor((event.clientX - rect.left) * canvas.width / rect.width))), y = Math.max(0, Math.min(canvas.height - 1, Math.floor((event.clientY - rect.top) * canvas.height / rect.height)));
          const pixel = context.getImageData(x, y, 1, 1).data;
          editor.sample = [pixel[0], pixel[1], pixel[2]];
          removeSampledBackground();
          return;
        }
        if (!['erase', 'restore'].includes(editor.mode)) return;
        editor.painting = true;
        canvas.setPointerCapture(event.pointerId);
        paintAt(event);
        event.preventDefault();
      });
      canvas.addEventListener('pointermove', event => { if (editor.painting) paintAt(event); });
      canvas.addEventListener('pointerup', () => { editor.painting = false; });
      canvas.addEventListener('pointercancel', () => { editor.painting = false; });
      dialog.querySelectorAll('[data-sticker-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
      dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
      dialog.addEventListener('close', () => {
        dialog.querySelector('form').reset();
        dialog.querySelector('.custom-sticker-save').disabled = false;
        dialog.querySelector('[data-custom-text-panel]').hidden = false;
        dialog.querySelector('[data-custom-image-panel]').hidden = true;
        dialog.querySelector('[data-custom-sticker-editor]').hidden = true;
        editor.original = null; editor.sample = null; editor.mode = 'preview'; editor.painting = false;
      });
      dialog.querySelector('form').addEventListener('submit', event => {
        event.preventDefault();
        const target = workspaceModel.widgets.find(item => item.id === dialog.dataset.widgetId && item.type === 'sticker');
        if (!target) { dialog.close(); return; }
        const error = dialog.querySelector('[data-custom-sticker-error]');
        const customName = dialog.querySelector('[data-custom-sticker-name]').value.trim();
        if (kindPicker.value === 'text') {
          const text = dialog.querySelector('[data-custom-sticker-text]').value.trim();
          if (!text) { error.textContent = 'Type some sticker text first.'; return; }
          const sticker = { id: window.crypto?.randomUUID?.() || ('sticker-' + Date.now() + '-' + Math.random().toString(36).slice(2)), type: 'text', name: customName || text.slice(0, 40), text: text.slice(0, 120), createdAt: Date.now() };
          try { addCustomSticker(sticker); } catch (storageError) { error.textContent = storageError.message; return; }
          target.stickerImage = false;
          target.stickerText = '';
          target.stickerCustomText = sticker.text;
          target.stickerCustomStickerId = sticker.id;
          target.stickerCustomActive = 'text';
          saveWorkspace();
          renderWorkspace();
          dialog.close();
          return;
        }
        if (!editor.original) { error.textContent = 'Choose an image before adding this sticker.'; return; }
        const saveButton = dialog.querySelector('.custom-sticker-save');
        saveButton.disabled = true;
        error.textContent = 'Saving your sticker…';
        canvas.toBlob(blob => {
          if (!blob) {
            saveButton.disabled = false;
            error.textContent = 'The edited image could not be prepared. Try choosing it again.';
            return;
          }
          const assetId = window.crypto?.randomUUID?.() || ('sticker-' + Date.now() + '-' + Math.random().toString(36).slice(2));
          saveStickerAsset(assetId, blob).then(() => {
            const sticker = { id: assetId, type: 'image', name: customName || ('Picture sticker ' + (customStickerLibrary().filter(item => item.type === 'image').length + 1)), assetId, createdAt: Date.now() };
            addCustomSticker(sticker);
            target.stickerImage = true;
            target.stickerCustomImage = '';
            target.stickerCustomImageId = assetId;
            target.stickerCustomStickerId = sticker.id;
            target.stickerCustomActive = 'image';
            saveWorkspace();
            renderWorkspace();
            dialog.close();
          }).catch(storageError => {
            error.textContent = storageError?.name === 'QuotaExceededError' ? 'Your browser is out of storage space. Free some browser storage and try again.' : (storageError?.message || 'The image could not be saved in this browser.');
            saveButton.disabled = false;
          });
        }, 'image/png');
      });
    }
    dialog.dataset.widgetId = String(widgetId);
    dialog.showModal();
  }

  function toggleStickerPicker(sticker) {
    if (!sticker) return;
    const wasOpen = sticker.classList.contains('sticker-picker-open');
    document.querySelectorAll('.sticker-widget.sticker-picker-open').forEach(openSticker => openSticker.classList.remove('sticker-picker-open'));
    if (!wasOpen) sticker.classList.add('sticker-picker-open');
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-sticker-choice]')) return;
    const body = event.target.closest('[data-sticker-body]');
    if (body) {
      toggleStickerPicker(body.closest('.sticker-widget'));
      return;
    }
    if (!event.target.closest('.sticker-widget')) {
      document.querySelectorAll('.sticker-widget.sticker-picker-open').forEach(sticker => sticker.classList.remove('sticker-picker-open'));
    }
  });

  document.addEventListener('keydown', event => {
    if (event.target.matches('[data-sticker-body]') && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      toggleStickerPicker(event.target.closest('.sticker-widget'));
    } else if (event.key === 'Escape') {
      document.querySelectorAll('.sticker-widget.sticker-picker-open').forEach(sticker => sticker.classList.remove('sticker-picker-open'));
    }
  });

  const stickerStyles = document.createElement('style');
  stickerStyles.textContent = '.sticker-widget .sticker-member{width:auto;height:94px;max-width:150px;object-fit:contain;background:transparent;filter:drop-shadow(0 5px 7px #35243830)}.sticker-widget .sticker-card{min-height:96px;justify-content:center;cursor:pointer}.sticker-widget .sticker-card:focus-visible{outline:2px solid #a36c91;outline-offset:4px;border-radius:8px}.sticker-widget .sticker-choice{display:none;position:absolute;left:50%;bottom:8px;transform:translateX(-50%);z-index:9;width:min(90%,220px);max-width:90%;font-size:10px;box-shadow:0 5px 18px #2d203344}.sticker-widget.sticker-picker-open .sticker-choice{display:block}.sticker-widget.member-cutout-mode{min-width:100px!important;min-height:100px!important;background:transparent!important;border-color:transparent!important;box-shadow:none!important;backdrop-filter:none!important;overflow:visible;border-radius:0}.sticker-widget.member-cutout-mode .workspace-widget-content{height:calc(100% - 32px)!important;display:flex;align-items:center;justify-content:center;background:transparent!important;padding:0!important;overflow:visible}.sticker-widget.member-cutout-mode .sticker-card{width:100%;height:100%;min-height:0;background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}.sticker-widget.member-cutout-mode .sticker-member{width:100%;height:100%;max-width:none;object-fit:contain;filter:drop-shadow(0 7px 8px #35243828)}.sticker-widget.member-cutout-mode .workspace-widget-head{opacity:0}.sticker-widget.member-cutout-mode:hover .workspace-widget-head,.sticker-widget.member-cutout-mode:focus-within .workspace-widget-head{opacity:1}.sticker-widget.member-cutout-mode .widget-resize-grip{background:#ffffffb8;border-color:#ffffffd9;opacity:0}.sticker-widget.member-cutout-mode:hover .widget-resize-grip,.sticker-widget.member-cutout-mode:focus-within .widget-resize-grip{opacity:.85}.mini-desk-timer:not(.is-break){background:linear-gradient(145deg,#a95e52,#ce8067)}.mini-desk-timer.is-break{background:linear-gradient(145deg,#49675e,#6e9685)}.mini-desk-timer-row #miniDeskToggle{background:linear-gradient(135deg,#b96052,#d77f65);color:#fff}.mini-desk-timer.is-break #miniDeskToggle{background:linear-gradient(135deg,#608d79,#83ad94);color:#fff}.mini-desk-timer-row #miniDeskSoundToggle{flex:0 0 38px;background:#ffffff20;border:1px solid #ffffff55;color:#fff}.mini-desk-session-tally{padding:6px 16px;border-bottom:1px solid #6e4f5c16;color:#7c6678;font-size:10px;font-weight:700;text-align:center}.mini-desk-task{display:grid;gap:6px;padding:8px 9px}.mini-desk-task-line{display:flex;align-items:center;gap:8px;min-width:0}.mini-desk-task-name{flex:1;min-width:0;overflow:hidden;color:#514453;font-weight:800;text-overflow:ellipsis;white-space:nowrap}.mini-desk-task-start{flex:0 0 27px;width:27px;height:27px;padding:0;border:1px solid #e8d9e5;border-radius:9px;background:#f7eef5;color:#76506c;box-shadow:none}.mini-desk-task-progress{height:4px;overflow:hidden;border-radius:99px;background:#eee8ef}.mini-desk-task-progress span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#b67aa4,#8565b6)}.mini-desk-note-meta{display:flex;justify-content:space-between;gap:8px;margin:5px 2px;color:#938594;font-size:9px}.mini-desk-note-saved{color:#628372;font-weight:700}.mini-desk-links button{display:inline-flex;align-items:center;justify-content:center;gap:5px}.mini-desk-links svg{width:14px;height:14px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}';
  document.head.appendChild(stickerStyles);

  const customStickerStyles = document.createElement('style');
  customStickerStyles.textContent = '.custom-sticker-dialog{width:min(440px,calc(100vw - 28px));max-height:min(88vh,760px);padding:0;border:1px solid #eadbe5;border-radius:20px;background:#fffafc;color:#443443;box-shadow:0 22px 70px #21142555}.custom-sticker-dialog::backdrop{background:#21142575;backdrop-filter:blur(4px)}.custom-sticker-form{display:grid;gap:14px;padding:18px}.custom-sticker-form header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid #efe4eb}.custom-sticker-form header small{color:#98758b;font-size:9px;letter-spacing:.15em;font-weight:900}.custom-sticker-form h3{margin:4px 0 0;color:#63384f;font:700 23px Georgia,serif}.custom-sticker-close{width:32px;height:32px;padding:0;border-radius:10px;background:#f5eaf0;color:#68465a;font-size:20px}.custom-sticker-form label{display:grid;gap:6px;color:#765a6c;font-size:11px;font-weight:800}.custom-sticker-form input:not([type=file]):not([type=range]),.custom-sticker-form select{width:100%;padding:10px 11px;border:1px solid #e6d4df;border-radius:10px;background:#fff;color:#443443}.custom-sticker-form input[type=file]{width:100%;padding:9px;border:1px dashed #d9c2d1;border-radius:10px;background:#fff;font-size:11px}.custom-sticker-form [data-custom-image-panel]>label>small,.custom-sticker-editor>small{color:#967f8f;font-size:10px;font-weight:400;line-height:1.5}.custom-sticker-editor{display:grid;gap:9px;margin-top:10px}.custom-sticker-editor canvas{display:block;max-width:100%;max-height:300px;width:auto;height:auto;margin:auto;border:1px solid #e5d8e5;border-radius:10px;background-color:#fff;background-image:linear-gradient(45deg,#e9e3ec 25%,transparent 25%),linear-gradient(-45deg,#e9e3ec 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e9e3ec 75%),linear-gradient(-45deg,transparent 75%,#e9e3ec 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}.custom-sticker-editor p{min-height:16px;margin:0;color:#816d7e;font-size:10px;line-height:1.4}.custom-sticker-tools{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.custom-sticker-tools button{padding:8px 5px;border-radius:9px;background:#f2e7ee;color:#674a5d;font-size:10px}.custom-sticker-tools button:first-child{grid-column:1/-1;background:#773852;color:#fff}.custom-sticker-range{display:grid!important;grid-template-columns:110px 1fr;align-items:center;gap:10px!important}.custom-sticker-range input{width:100%}.custom-sticker-error{min-height:15px;margin:0;color:#a33c52;font-size:11px}.custom-sticker-form footer{display:flex;justify-content:flex-end;gap:8px;padding-top:10px;border-top:1px solid #efe4eb}.custom-sticker-form footer button{padding:9px 13px;border-radius:10px}.custom-sticker-cancel{background:#f2e7ee;color:#68465a}.custom-sticker-save{background:#773852;color:#fff}';
  document.head.appendChild(customStickerStyles);

  const previousMiniDeskMarkup = window.miniDeskMarkup;
  window.miniDeskMarkup = function () {
    let markup = previousMiniDeskMarkup.call(this);
    markup = markup.replace('</button></div><div class="mini-desk-content">', '</button></div><div class="mini-desk-session-tally" id="miniDeskSessionTally">Sessions completed today: 0/' + DAILY_SESSION_GOAL + '</div><div class="mini-desk-content">');
    markup = markup.replace('<button id="miniDeskToggle" onclick="toggleMiniDeskTimer()">Start focus</button><button onclick="resetMiniDeskTimer()" title="Reset timer" aria-label="Reset timer">↺</button>', '<button id="miniDeskToggle" onclick="toggleMiniDeskTimer()">Start focus</button><button id="miniDeskReset" onclick="resetMiniDeskTimer()" title="Reset timer" aria-label="Reset timer">↺</button><button id="miniDeskSoundToggle" onclick="toggleMiniDeskSound()" aria-pressed="true" aria-label="Mute timer sounds" title="Mute timer sounds">🔔</button>');
    markup = markup.replace('</textarea><div class="mini-desk-links">', '</textarea><div class="mini-desk-note-meta"><span id="miniDeskNoteSaved" class="mini-desk-note-saved" aria-live="polite">✓ Saved</span><span id="miniDeskNoteCount">0 / 12000</span></div><div class="mini-desk-links">');
    markup = markup.replace('📋 Task Manager', '<svg aria-hidden="true" viewBox="0 0 18 18"><rect x="4" y="3.5" width="10" height="12" rx="1.5"></rect><path d="M7 3.5V2.7h4v.8M6.5 7h5M6.5 9.5h5M6.5 12h3"></path></svg>Task Manager');
    markup = markup.replace('✧ Study plan', '<svg aria-hidden="true" viewBox="0 0 18 18"><rect x="2.5" y="3.5" width="13" height="12" rx="1.5"></rect><path d="M5.5 2.5v2M12.5 2.5v2M2.5 7h13M5.5 9.5h2M10.5 9.5h2M5.5 12h2"></path></svg>Study plan');
    return markup;
  };

  window.miniDeskTaskMarkup = function () {
    const pending = tasks.filter(task => task.status !== 'Completed').slice(0, 3);
    if (!pending.length) return '<div class="mini-desk-empty">A clear list is a lovely feeling ✨</div>';
    return pending.map(task => {
      const duration = Math.max(60, Number(task.duration || settings.defaultDuration || 25) * 60);
      const studied = task.status === 'Completed' ? duration : taskProgressSeconds(task.no);
      const percent = task.status === 'Completed' ? 100 : Math.max(0, Math.min(99, Math.round(studied / duration * 100)));
      return '<article class="mini-desk-task"><div class="mini-desk-task-line"><span class="mini-desk-task-name" title="' + esc(task.name) + '">' + esc(task.name) + '</span><small>' + Number(task.duration || settings.defaultDuration || 25) + 'm</small><button class="mini-desk-task-start" type="button" onclick="startMiniDeskTask(' + Number(task.no) + ')" aria-label="Start study session for ' + esc(task.name) + '" title="Start this study session">▶</button></div><div class="mini-desk-task-progress" role="progressbar" aria-label="' + esc(task.name) + ' progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '"><span style="width:' + percent + '%"></span></div></article>';
    }).join('');
  };

  const previousUpdateInAppMiniDesk = window.updateInAppMiniDesk;
  window.updateInAppMiniDesk = function (view) {
    previousUpdateInAppMiniDesk.call(this, view);
    const dock = document.getElementById('miniDeskDock');
    if (!dock?.dataset.ready) return;
    const tally = dock.querySelector('#miniDeskSessionTally');
    if (tally) tally.textContent = 'Sessions completed today: ' + Math.min(DAILY_SESSION_GOAL, sessionCountToday()) + '/' + DAILY_SESSION_GOAL;
    const sound = dock.querySelector('#miniDeskSoundToggle');
    if (sound) {
      sound.textContent = settings.sound ? '🔔' : '🔕';
      sound.setAttribute('aria-pressed', String(Boolean(settings.sound)));
      sound.setAttribute('aria-label', settings.sound ? 'Mute timer sounds' : 'Unmute timer sounds');
      sound.title = settings.sound ? 'Mute timer sounds' : 'Unmute timer sounds';
    }
    const note = dock.querySelector('#miniDeskNote');
    const count = dock.querySelector('#miniDeskNoteCount');
    if (note && count) count.textContent = note.value.length + ' / 12000';
  };

  document.addEventListener('input', event => {
    if (event.target.id !== 'miniDeskNote') return;
    const count = document.getElementById('miniDeskNoteCount');
    if (count) count.textContent = event.target.value.length + ' / 12000';
  });

  document.addEventListener('DOMContentLoaded', () => {
    const dock = document.getElementById('miniDeskDock');
    if (dock) dock.dataset.ready = '';
    window.renderWorkspace?.();
    window.updateInAppMiniDesk?.(currentView);
  });

  const previousPipMarkup = window.studyPipMarkup;
  window.studyPipMarkup = function () {
    let markup = previousPipMarkup.call(this);
    const styles = '.pip-session-tally{padding:7px 14px;border-bottom:1px solid #eee6ed;background:#fff9;color:#7c6678;font-size:10px;font-weight:700;text-align:center}.pip-timer{background:linear-gradient(145deg,#a95e52,#ce8067)}.pip-timer.break{background:linear-gradient(145deg,#49675e,#6e9685)}.pip-controls #pipToggle{background:linear-gradient(135deg,#b96052,#d77f65);color:#fff;box-shadow:0 4px 12px #70352f30}.pip-controls #pipToggle.is-break{background:linear-gradient(135deg,#608d79,#83ad94);color:#fff}.pip-controls #pipReset,.pip-controls #pipSoundToggle{flex:0 0 40px;background:#ffffff20;border:1px solid #ffffff55;color:#fff}.pip-controls #pipSoundToggle{font-size:16px}.pip-task{display:grid;gap:7px;padding:8px 9px}.pip-task-line{display:flex;align-items:center;gap:8px;min-width:0}.pip-task-name{flex:1;min-width:0;overflow:hidden;color:#514453;font-weight:800;text-overflow:ellipsis;white-space:nowrap}.pip-task small{color:#948594;font-size:10px;font-weight:700}.pip-task-start{flex:0 0 27px;width:27px;height:27px;padding:0;border:1px solid #e8d9e5;border-radius:9px;background:#f7eef5;color:#76506c;box-shadow:none;font-size:11px}.pip-task-start:hover{background:#ead9e7}.pip-task-progress{height:4px;overflow:hidden;border-radius:99px;background:#eee8ef}.pip-task-progress span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#b67aa4,#8565b6);transition:width .25s ease}.pip-note-meta{display:flex;justify-content:space-between;gap:8px;margin:5px 2px 0;color:#938594;font-size:9px}.pip-note-saved{color:#628372;font-weight:700}.pip-links button{display:inline-flex;align-items:center;justify-content:center;gap:5px}.pip-links svg{width:14px;height:14px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.pip-controls button:focus-visible,.pip-task-start:focus-visible,.pip-links button:focus-visible{outline:3px solid #d4a4c1;outline-offset:2px}';
    markup = markup.replace('</style>', styles + '</style>');
    markup = markup.replace('</header><div class="pip-inner">', '</header><div class="pip-session-tally" id="pipSessionTally">Sessions completed today: 0/' + DAILY_SESSION_GOAL + '</div><div class="pip-inner">');
    markup = markup.replace('<button id="pipToggle" data-pip-action="toggle">Start focus</button><button data-pip-action="reset" title="Reset">↺</button>', '<button id="pipToggle" data-pip-action="toggle">Start focus</button><button id="pipReset" data-pip-action="reset" title="Reset" aria-label="Reset timer">↺</button><button id="pipSoundToggle" data-pip-action="sound" aria-pressed="true" aria-label="Mute timer sounds" title="Mute timer sounds">🔔</button>');
    markup = markup.replace('</textarea><div class="pip-links">', '</textarea><div class="pip-note-meta"><span id="pipNoteSaved" class="pip-note-saved" aria-live="polite">✓ Saved</span><span id="pipNoteCount">0 / 12000</span></div><div class="pip-links">');
    markup = markup.replace('📋 Open Task Manager', '<svg aria-hidden="true" viewBox="0 0 18 18"><rect x="4" y="3.5" width="10" height="12" rx="1.5"></rect><path d="M7 3.5V2.7h4v.8M6.5 7h5M6.5 9.5h5M6.5 12h3"></path></svg>Open Task Manager');
    markup = markup.replace('✧ Open Study plan', '<svg aria-hidden="true" viewBox="0 0 18 18"><rect x="2.5" y="3.5" width="13" height="12" rx="1.5"></rect><path d="M5.5 2.5v2M12.5 2.5v2M2.5 7h13M5.5 9.5h2M10.5 9.5h2M5.5 12h2"></path></svg>Open Study plan');
    return markup;
  };

  window.updateStudyPictureInPicture = function () {
    const win = studyPipWindow;
    if (!win || win.closed) return;
    const snapshot = getStudyTimerSnapshot();
    const doc = win.document;
    const timer = doc.getElementById('pipTimer');
    const mode = doc.getElementById('pipMode');
    const clock = doc.getElementById('pipClock');
    const toggle = doc.getElementById('pipToggle');
    const progress = doc.getElementById('pipProgress');
    const tasksElement = doc.getElementById('pipTasks');
    const note = doc.getElementById('pipNote');
    const sound = doc.getElementById('pipSoundToggle');
    const tally = doc.getElementById('pipSessionTally');
    if (timer) timer.classList.toggle('break', snapshot.mode === 'break');
    if (mode) mode.textContent = snapshot.mode === 'break' ? 'REST & RESET' : 'FOCUS';
    if (clock) clock.textContent = formatWorkspaceTime(snapshot.remaining);
    if (toggle) {
      toggle.textContent = snapshot.running ? 'Pause ' + snapshot.mode : (snapshot.paused ? 'Resume focus' : 'Start ' + snapshot.mode);
      toggle.classList.toggle('is-break', snapshot.mode === 'break');
    }
    if (progress) progress.style.width = Math.max(0, Math.min(100, (snapshot.total - snapshot.remaining) / Math.max(1, snapshot.total) * 100)) + '%';
    if (sound) {
      sound.textContent = settings.sound ? '🔔' : '🔕';
      sound.setAttribute('aria-pressed', String(Boolean(settings.sound)));
      sound.setAttribute('aria-label', settings.sound ? 'Mute timer sounds' : 'Unmute timer sounds');
      sound.title = settings.sound ? 'Mute timer sounds' : 'Unmute timer sounds';
    }
    if (tally) tally.textContent = 'Sessions completed today: ' + Math.min(DAILY_SESSION_GOAL, sessionCountToday()) + '/' + DAILY_SESSION_GOAL;
    if (tasksElement) {
      const pending = tasks.filter(task => task.status !== 'Completed').slice(0, 3);
      const taskMarkup = pending.map(taskRow).join('') || '<div class="pip-empty">A clear list is a lovely feeling ✨</div>';
      if (tasksElement.innerHTML !== taskMarkup) tasksElement.innerHTML = taskMarkup;
    }
    if (note && doc.activeElement !== note && note.value !== readStudyNote()) note.value = readStudyNote();
    const noteCount = doc.getElementById('pipNoteCount');
    if (noteCount && note) noteCount.textContent = note.value.length + ' / 12000';
  };

  window.openStudyPictureInPicture = async function () {
    const api = window.documentPictureInPicture;
    if (!api?.requestWindow) {
      toggleMiniDesk(true);
      toast('Your mini desk is ready in the corner of this page.');
      return;
    }
    try {
      const win = await api.requestWindow({ width: 355, height: 590 });
      studyPipWindow = win;
      win.document.open();
      win.document.write(window.studyPipMarkup());
      win.document.close();
      win.document.addEventListener('click', event => {
        const target = event.target.closest('[data-pip-action], [data-pip-task], [data-pip-page]');
        if (!target) return;
        const action = target.dataset.pipAction;
        if (action === 'toggle') toggleMiniDeskTimer();
        if (action === 'reset') resetMiniDeskTimer();
        if (action === 'sound') toggleMiniDeskSound();
        if (target.dataset.pipTask) startMiniDeskTask(Number(target.dataset.pipTask));
        const page = target.dataset.pipPage;
        if (page) showView(page);
      });
      win.document.getElementById('pipNote')?.addEventListener('input', event => {
        saveStudyNotes(event.target.value);
        const counter = win.document.getElementById('pipNoteCount');
        if (counter) counter.textContent = event.target.value.length + ' / 12000';
      });
      win.addEventListener('pagehide', () => {
        if (studyPipWindow === win) {
          studyPipWindow = null;
          clearInterval(studyPipInterval);
          studyPipInterval = null;
        }
      });
      clearInterval(studyPipInterval);
      studyPipInterval = setInterval(window.updateStudyPictureInPicture, 500);
      window.updateStudyPictureInPicture();
    } catch (error) {
      toggleMiniDesk(true);
      toast('The pop-out was blocked, so your mini desk is open on this page instead.');
    }
  };
})();

