/* Focused additions for the mini desk and workspace sticker picker. */
(() => {
  'use strict';

  const TASK_PROGRESS_KEY = 'esc_mini_desk_task_progress_v1';
  const SESSION_COUNT_KEY = 'esc_mini_desk_session_count_v1';
  const DAILY_SESSION_GOAL = 5;

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
    const savedStickerMembers = new Map((savedWorkspace.widgets || []).filter(widget => widget?.type === 'sticker').map(widget => [String(widget.id), widget.stickerMember]));
    const result = previousLoadWorkspace.apply(this, args);
    workspaceModel.widgets.forEach(widget => {
      if (widget.type === 'sticker') {
        const savedMember = savedStickerMembers.get(String(widget.id));
        widget.stickerMember = members.includes(savedMember) ? savedMember : settings.member;
      }
    });
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
    const selected = widget.stickerImage
      ? 'member:' + (members.includes(widget.stickerMember) ? widget.stickerMember : settings.member)
      : 'text:' + Math.max(0, STUDY_STICKER_QUOTES.indexOf(widget.stickerText || STUDY_STICKER_QUOTES[0]));
    const stickerChoices = '<div class="workspace-widget-content"><div class="sticker-card">' + (widget.stickerImage
      ? '<img class="sticker-member" src="' + esc(memberImages[widget.stickerMember] || memberImages[settings.member]) + '" alt="' + esc(memberDisplay(widget.stickerMember)) + ' character sticker">'
      : '<span class="sticker-emoji">' + esc(widget.sticker || '✦') + '</span><span class="sticker-quote">' + esc(widget.stickerText || STUDY_STICKER_QUOTES[0]) + '</span>') + '</div><select class="sticker-choice" data-sticker-choice aria-label="Choose a study sticker"><optgroup label="Text stickers">' + STUDY_STICKER_QUOTES.map((quote, index) => '<option value="text:' + index + '" ' + (selected === 'text:' + index ? 'selected' : '') + '>' + esc(quote) + '</option>').join('') + '</optgroup><optgroup label="Character cutouts">' + members.map(member => '<option value="member:' + esc(member) + '" ' + (selected === 'member:' + member ? 'selected' : '') + '>' + esc(memberDisplay(member)) + '</option>').join('') + '</optgroup></select></div>';
    const stickerMarkup = markup.replace(/<div class="workspace-widget-content"><div class="sticker-card">[\s\S]*?<\/select><\/div>/, stickerChoices);
    return widget.stickerImage
      ? stickerMarkup.replace('class="workspace-widget ', 'class="workspace-widget member-cutout-mode ')
      : stickerMarkup;
  };

  document.addEventListener('change', event => {
    const picker = event.target.closest('[data-sticker-choice]');
    if (!picker) return;
    const widgetElement = picker.closest('[data-widget-id]');
    const widget = workspaceModel.widgets.find(item => item.id === widgetElement?.dataset.widgetId);
    if (!widget) return;
    const [kind, value] = picker.value.split(':');
    if (kind === 'member' && members.includes(value)) {
      widget.stickerImage = true;
      widget.stickerMember = value;
      widget.stickerText = '';
    } else if (kind === 'text') {
      widget.stickerImage = false;
      widget.stickerText = STUDY_STICKER_QUOTES[Number(value)] || STUDY_STICKER_QUOTES[0];
    } else return;
    saveWorkspace();
    renderWorkspace();
  });

  const stickerStyles = document.createElement('style');
  stickerStyles.textContent = '.sticker-widget .sticker-member{width:auto;height:94px;max-width:150px;object-fit:contain;background:transparent;filter:drop-shadow(0 5px 7px #35243830)}.sticker-widget .sticker-card{min-height:96px;justify-content:center}.sticker-widget .sticker-choice{max-width:100%;font-size:10px}.sticker-widget.member-cutout-mode{background:transparent!important;border-color:transparent!important;box-shadow:none!important;backdrop-filter:none!important;overflow:visible;border-radius:0}.sticker-widget.member-cutout-mode .workspace-widget-content{background:transparent!important;padding:0!important;overflow:visible}.sticker-widget.member-cutout-mode .sticker-card{min-height:0;background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}.sticker-widget.member-cutout-mode .sticker-member{height:140px;max-width:180px;filter:drop-shadow(0 7px 8px #35243828)}.sticker-widget.member-cutout-mode .workspace-widget-head{opacity:0}.sticker-widget.member-cutout-mode:hover .workspace-widget-head,.sticker-widget.member-cutout-mode:focus-within .workspace-widget-head{opacity:1}.sticker-widget.member-cutout-mode .widget-resize-grip{background:transparent}.mini-desk-timer:not(.is-break){background:linear-gradient(145deg,#a95e52,#ce8067)}.mini-desk-timer.is-break{background:linear-gradient(145deg,#49675e,#6e9685)}.mini-desk-timer-row #miniDeskToggle{background:linear-gradient(135deg,#b96052,#d77f65);color:#fff}.mini-desk-timer.is-break #miniDeskToggle{background:linear-gradient(135deg,#608d79,#83ad94);color:#fff}.mini-desk-timer-row #miniDeskSoundToggle{flex:0 0 38px;background:#ffffff20;border:1px solid #ffffff55;color:#fff}.mini-desk-session-tally{padding:6px 16px;border-bottom:1px solid #6e4f5c16;color:#7c6678;font-size:10px;font-weight:700;text-align:center}.mini-desk-task{display:grid;gap:6px;padding:8px 9px}.mini-desk-task-line{display:flex;align-items:center;gap:8px;min-width:0}.mini-desk-task-name{flex:1;min-width:0;overflow:hidden;color:#514453;font-weight:800;text-overflow:ellipsis;white-space:nowrap}.mini-desk-task-start{flex:0 0 27px;width:27px;height:27px;padding:0;border:1px solid #e8d9e5;border-radius:9px;background:#f7eef5;color:#76506c;box-shadow:none}.mini-desk-task-progress{height:4px;overflow:hidden;border-radius:99px;background:#eee8ef}.mini-desk-task-progress span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#b67aa4,#8565b6)}.mini-desk-note-meta{display:flex;justify-content:space-between;gap:8px;margin:5px 2px;color:#938594;font-size:9px}.mini-desk-note-saved{color:#628372;font-weight:700}.mini-desk-links button{display:inline-flex;align-items:center;justify-content:center;gap:5px}.mini-desk-links svg{width:14px;height:14px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}';
  document.head.appendChild(stickerStyles);

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

