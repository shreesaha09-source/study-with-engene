/* ENGENEverse Time Architect: saved planning sessions built around existing tasks. */
(function () {
  'use strict';

  const KEY = 'esc_time_architect_v1';
  const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MEMBER_IMAGES = {
    Jungwon:'member-jungwon.png', Heeseung:'member-heeseung.png', Jay:'member-jay.png',
    Jake:'member-jake.png', Sunghoon:'member-sunghoon.png', Sunoo:'member-sunoo.png',
    'Ni-ki':'member-niki.png', 'ENHYPEN (Group)':'member-group.png'
  };
  const DEFAULTS = {
    version: 1,
    availability: {
      days: DAY_NAMES.map((_, day) => ({enabled:true,start:day===0||day===6?'10:00':'16:00',end:day===0||day===6?'20:00':'21:00'})),
      busy: [], breakMinutes: 10, maxPerDay: 180, horizon: 14
    },
    sessions: []
  };
  let state = normalizeState(loadState());
  let weekAnchor = monday(new Date());
  let selectedDate = dateKey(new Date());
  let originalShowView = null;
  let originalRenderCalendar = null;
  let originalRenderAll = null;
  let wired = false;
  let expandedDays = new Set();
  let saveStatus = 'saved';

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function loadState() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null') || clone(DEFAULTS); }
    catch (error) {
      try { const raw=localStorage.getItem(KEY); if(raw)localStorage.setItem(KEY+'_corrupt_backup',raw); } catch (_) {}
      return clone(DEFAULTS);
    }
  }
  function cleanText(value, max) { return String(value == null ? '' : value).replace(/[<>]/g,'').trim().slice(0,max); }
  function validDateKey(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value||'')) && !Number.isNaN(parseDate(value).getTime()); }
  function parseDate(value) {
    const [y,m,d]=String(value||'').split('-').map(Number);
    const out=new Date(y||2000,(m||1)-1,d||1,12,0,0,0);
    return out;
  }
  function dateKey(date) { return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'); }
  function monday(date) { const out=new Date(date.getFullYear(),date.getMonth(),date.getDate(),12); out.setDate(out.getDate()-((out.getDay()+6)%7)); return out; }
  function addDays(date, days) { const out=new Date(date.getFullYear(),date.getMonth(),date.getDate(),12); out.setDate(out.getDate()+days); return out; }
  function today() { const n=new Date(); return new Date(n.getFullYear(),n.getMonth(),n.getDate(),12); }
  function validTime(value, fallback) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||'')) ? String(value) : fallback; }
  function minutes(time) { const [h,m]=String(time||'00:00').split(':').map(Number); return h*60+m; }
  function timeString(value) { const h=Math.floor(value/60),m=value%60; return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'); }
  function normalizeState(raw) {
    raw=raw&&typeof raw==='object'?raw:{};
    const a=raw.availability&&typeof raw.availability==='object'?raw.availability:{};
    const days=DAY_NAMES.map((_,i)=>{
      const item=Array.isArray(a.days)?a.days[i]:null;
      const fallback=DEFAULTS.availability.days[i];
      const start=validTime(item?.start,fallback.start),end=validTime(item?.end,fallback.end);
      return {enabled:item?.enabled!==false,start,end:minutes(end)>minutes(start)?end:fallback.end};
    });
    const busy=Array.isArray(a.busy)?a.busy.filter(x=>x&&Array.isArray(x.days)&&x.days.some(d=>Number.isInteger(Number(d))&&Number(d)>=0&&Number(d)<=6)).slice(0,30).map(x=>({id:cleanText(x.id,70)||makeId(),name:cleanText(x.name,50)||'Personal commitment',start:validTime(x.start,'08:00'),end:validTime(x.end,'09:00'),days:x.days.map(Number).filter(d=>d>=0&&d<=6)})).filter(x=>minutes(x.end)>minutes(x.start)):[];
    const sessions=Array.isArray(raw.sessions)?raw.sessions.slice(0,1500).map(x=>{
      const duration=Math.max(15,Math.min(240,Math.round((Number(x?.duration)||30)/5)*5));
      const start=validTime(x?.start,'16:00');
      const title=cleanText(x?.title,160);
      if(!x||!validDateKey(x.date)||!title||minutes(start)+duration>1440)return null;
      const no=Number(x.taskNo);
      return {id:cleanText(x.id,70)||makeId(),taskNo:Number.isInteger(no)&&no>0?no:null,title,subject:cleanText(x.subject,80)||'Study',date:x.date,start,duration,note:cleanText(x.note,240),done:Boolean(x.done),completedAt:x.done?cleanText(x.completedAt,40)||null:null,source:x.source==='auto'?'auto':'manual',created:cleanText(x.created,40)||new Date().toISOString()};
    }).filter(Boolean):[];
    return {version:1,availability:{days,busy,breakMinutes:Math.max(0,Math.min(30,Number(a.breakMinutes)||0)),maxPerDay:Math.max(60,Math.min(480,Number(a.maxPerDay)||180)),horizon:14},sessions};
  }
  function makeId() { return 'ta-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9); }
  function saveState(message) {
    state=normalizeState(state);
    saveStatus='saving';
    const status=document.getElementById('taSaveStatus');
    if(status){status.textContent='Saving…';status.dataset.state='saving';}
    const saved=typeof safeLocalSet==='function'?safeLocalSet(KEY,JSON.stringify(state)):(function(){try{localStorage.setItem(KEY,JSON.stringify(state));return true;}catch(_){return false;}})();
    saveStatus=saved?'saved':'error';
    render(); decorateCalendar();
    window.dispatchEvent(new Event('engene-time-architect-updated'));
    if(message&&saved&&typeof toast==='function')toast(message);
    return saved;
  }
  function esc(value) { return typeof window.esc==='function'?window.esc(value):String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
  function tasksNow() { return Array.isArray(window.tasks)?window.tasks:(typeof tasks!=='undefined'?tasks:[]); }
  function taskFor(session) { return session.taskNo?tasksNow().find(t=>Number(t.no)===Number(session.taskNo))||null:null; }
  function displayTitle(session) { const task=taskFor(session); return task?task.name:session.title; }
  function displaySubject(session) { const task=taskFor(session); return task?task.subject:session.subject; }
  function recordedTaskSeconds(taskNo) {
    try { const saved=JSON.parse(localStorage.getItem('esc_mini_desk_task_progress_v1')||'{}');return Math.max(0,Number(saved?.[String(taskNo)])||0); }
    catch (_) { return 0; }
  }
  function taskProgress(taskNo) {
    const task=tasksNow().find(t=>Number(t.no)===Number(taskNo));if(!task)return null;
    const linked=state.sessions.filter(s=>Number(s.taskNo)===Number(taskNo));
    const completedSessionMinutes=linked.filter(s=>s.done).reduce((n,s)=>n+s.duration,0);
    const plannedSessionMinutes=linked.filter(s=>!s.done).reduce((n,s)=>n+s.duration,0);
    const recordedStudySeconds=recordedTaskSeconds(taskNo),estimatedMinutes=Math.max(0,Number(task.duration)||0);
    const completedEffortMinutes=Math.min(estimatedMinutes,Math.max(completedSessionMinutes,recordedStudySeconds/60));
    const remainingEffortMinutes=task.status==='Completed'?0:Math.max(0,estimatedMinutes-completedEffortMinutes);
    return {taskNo:Number(task.no),estimatedMinutes,completedSessionMinutes,plannedSessionMinutes,recordedStudySeconds,completedEffortMinutes,remainingEffortMinutes,unscheduledEffortMinutes:Math.max(0,remainingEffortMinutes-plannedSessionMinutes),percent:estimatedMinutes?Math.min(100,Math.round(completedEffortMinutes/estimatedMinutes*100)):0,status:task.status};
  }
  function deadlineDate(task) {
    const value=String(task?.deadline||'');
    const m=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(!m)return null;
    const out=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]),12);
    return Number.isNaN(out.getTime())?null:out;
  }
  function dueSort(task) { const d=deadlineDate(task); return d?d.getTime():Number.MAX_SAFE_INTEGER; }
  function fmtDate(value, options) { return parseDate(value).toLocaleDateString(undefined,options||{weekday:'long',month:'short',day:'numeric'}); }
  function endMinute(session) { return minutes(session.start)+session.duration; }
  function fmtRange(session) { return timeString(minutes(session.start))+'–'+timeString(endMinute(session)); }
  function weekTitle(start) {
    const end=addDays(start,6), opts={month:'short',day:'numeric'};
    return start.toLocaleDateString(undefined,opts)+' – '+end.toLocaleDateString(undefined,{...opts,year:'numeric'});
  }
  function durationLabel(value) { const hours=Math.floor(value/60),mins=value%60;return hours?(mins?hours+'h '+mins+'m':hours+'h'):mins+'m'; }
  function dateSessions(date) { return state.sessions.filter(s=>s.date===date).sort((a,b)=>a.start.localeCompare(b.start)); }
  function nextUpcomingSession() {
    const now=new Date(),todayValue=dateKey(now),clock=now.getHours()*60+now.getMinutes();
    const session=state.sessions.filter(s=>!s.done&&(s.date>todayValue||(s.date===todayValue&&endMinute(s)>=clock))).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start))[0];
    if(!session)return null;const task=taskFor(session);return {...clone(session),title:displayTitle(session),subject:displaySubject(session),taskName:task?.name||'',taskStatus:task?.status||''};
  }
  function modal(html) { if(typeof window.openModal==='function')window.openModal(html); }
  function closeModal() { if(typeof window.closeModal==='function')window.closeModal(); }
  function taskOptions(selected) {
    const list=tasksNow().filter(t=>t.status!=='Completed'||Number(t.no)===Number(selected));
    return '<option value="">Custom session (no task link)</option>'+list.map(t=>'<option value="'+Number(t.no)+'" '+(Number(selected)===Number(t.no)?'selected':'')+'>'+esc(t.name)+' · '+esc(t.subject)+(t.status==='Completed'?' · completed':'')+'</option>').join('');
  }
  function sessionForm(session, date) {
    const old=session||{}, task=taskFor(old), sessionDate=old.date||date||selectedDate;
    const title=old.title||(task?task.name:''), subject=old.subject||(task?task.subject:'');
    const isEdit=Boolean(session);
    modal('<div class="ta-modal-form"><h2>'+(isEdit?'Edit study session':'Add to your timetable')+'</h2><p class="small">Choose an existing task or add a one-off study block. Saving a session will not change the task’s completion status.</p><label>Link to a task (optional)<select id="taTaskSelect">'+taskOptions(old.taskNo)+'</select></label><div class="ta-form-grid"><label class="ta-wide">Session name<input id="taTitle" maxlength="160" value="'+esc(title)+'" placeholder="e.g. Revise quadratic equations"></label><label>Subject<input id="taSubject" maxlength="80" value="'+esc(subject)+'" placeholder="e.g. Mathematics"></label><label>Date<input id="taDate" type="date" value="'+esc(sessionDate)+'" min="'+dateKey(today())+'"></label><label>Start time<input id="taStart" type="time" value="'+esc(old.start||'16:00')+'"></label><label>Duration (minutes)<input id="taDuration" type="number" min="15" max="240" step="5" value="'+(old.duration||45)+'"></label><label class="ta-wide">Note (optional)<input id="taNote" maxlength="240" value="'+esc(old.note||'')+'" placeholder="A small goal for this session"></label></div><p id="taFormError" class="ta-msg" role="status" aria-live="polite"></p><div class="ta-modal-actions"><button type="button" class="ghost" onclick="closeModal()">Cancel</button><button type="button" onclick="taSaveSession(\''+esc(old.id||'')+'\')">Save session</button></div></div>');
    const selector=document.getElementById('taTaskSelect');
    selector?.addEventListener('change',function(){const picked=tasksNow().find(t=>Number(t.no)===Number(this.value));if(picked){document.getElementById('taTitle').value=picked.name;document.getElementById('taSubject').value=picked.subject;document.getElementById('taDuration').value=Math.max(15,Math.min(240,Number(picked.duration)||45));}});
  }
  function showFormError(text) { const node=document.getElementById('taFormError'); if(node)node.textContent=text; }
  window.taSaveSession=function(id) {
    const taskNo=Number(document.getElementById('taTaskSelect')?.value)||null;
    const title=cleanText(document.getElementById('taTitle')?.value,160);
    const subject=cleanText(document.getElementById('taSubject')?.value,80)||'Study';
    const date=document.getElementById('taDate')?.value;
    const start=validTime(document.getElementById('taStart')?.value,'');
    const duration=Number(document.getElementById('taDuration')?.value);
    const note=cleanText(document.getElementById('taNote')?.value,240);
    if(!title)return showFormError('Add a short name for this study session.');
    if(!validDateKey(date)||!start)return showFormError('Choose a valid date and start time.');
    if(!Number.isFinite(duration)||duration<15||duration>240||duration%5!==0)return showFormError('Choose a duration from 15 to 240 minutes, in 5-minute steps.');
    if(minutes(start)+duration>1440)return showFormError('This session would continue past midnight. Choose an earlier start or shorter duration.');
    const existing=id?state.sessions.find(s=>s.id===id):null;
    const linkedTask=taskNo?tasksNow().find(t=>Number(t.no)===Number(taskNo)):null;
    if(linkedTask?.status==='Completed'&&(!existing||Number(existing.taskNo)!==Number(taskNo)))return showFormError('Completed tasks cannot be added to new timetable sessions.');
    const candidate={id:existing?.id||makeId(),taskNo,title,subject,date,start,duration,note,done:existing?.done||false,source:'manual',created:existing?.created||new Date().toISOString()};
    const conflict=checkConflict(candidate,candidate.id);
    if(conflict)return showFormError(conflict);
    if(existing)state.sessions=state.sessions.map(s=>s.id===id?candidate:s);else state.sessions.push(candidate);
    closeModal();selectedDate=date;weekAnchor=monday(parseDate(date));saveState(existing?'Session updated.':'Session saved to your timetable.');
    if(currentView!=='timeArchitect')window.showTimeArchitect(date);
  };
  function recurringConflict(session) {
    const day=parseDate(session.date).getDay(),start=minutes(session.start),end=endMinute(session);
    const window=state.availability.days[day];
    if(!window?.enabled)return 'You marked '+DAY_NAMES[day]+' as unavailable. Change availability or choose another day.';
    if(start<minutes(window.start)||end>minutes(window.end))return 'This is outside your '+DAY_SHORT[day]+' study hours ('+window.start+'–'+window.end+'). Adjust availability or choose another time.';
    const block=state.availability.busy.find(b=>b.days.includes(day)&&start<minutes(b.end)&&end>minutes(b.start));
    if(block)return 'This overlaps your '+block.name+' commitment ('+block.start+'–'+block.end+'). Choose a different time.';
    return '';
  }
  function checkConflict(session, ignoreId) {
    const within=recurringConflict(session); if(within)return within;
    const otherLoad=state.sessions.filter(s=>s.id!==ignoreId&&s.date===session.date).reduce((total,s)=>total+s.duration,0);
    if(otherLoad+session.duration>state.availability.maxPerDay)return 'This would pass your daily study limit of '+state.availability.maxPerDay+' minutes. Choose another day or adjust the limit.';
    const start=minutes(session.start),end=endMinute(session),gap=state.availability.breakMinutes;
    const overlap=state.sessions.find(s=>s.id!==ignoreId&&s.date===session.date&&start<endMinute(s)+gap&&end>minutes(s.start)-gap);
    if(overlap)return 'This overlaps the '+displayTitle(overlap)+' session ('+fmtRange(overlap)+'). Leave a short break or choose another time.';
    return '';
  }
  function editSession(id) { const session=state.sessions.find(s=>s.id===id); if(session)sessionForm(session); }
  function deleteSession(id) {
    const session=state.sessions.find(s=>s.id===id); if(!session)return;
    if(!confirm('Remove this timetable session? The original task will stay in Task Manager.'))return;
    state.sessions=state.sessions.filter(s=>s.id!==id);saveState('Session removed. The task is still in Task Manager.');
  }
  function toggleDone(id) {
    const session=state.sessions.find(s=>s.id===id); if(!session)return;
    session.done=!session.done;session.completedAt=session.done?new Date().toISOString():null;
    saveState(session.done?'Session marked complete. Its task status was not changed.':'Session moved back to unfinished.');
  }function addBlockForm() {
    modal('<div class="ta-modal-form"><h2>Add a weekly commitment</h2><p class="small">School, tuition, sleep, or another commitment can block time from automatic planning.</p><label>Commitment name<input id="taBlockName" maxlength="50" placeholder="e.g. Tuition"></label><div class="ta-form-grid"><label>Starts<input id="taBlockStart" type="time" value="07:00"></label><label>Ends<input id="taBlockEnd" type="time" value="15:00"></label></div><div><b class="small">Repeats on</b><div class="ta-days">'+DAY_SHORT.map((d,i)=>'<label class="ta-day-check"><input type="checkbox" value="'+i+'" '+([1,2,3,4,5].includes(i)?'checked':'')+'>'+d+'</label>').join('')+'</div></div><p id="taBlockError" class="ta-msg" role="status"></p><div class="ta-modal-actions"><button class="ghost" onclick="closeModal()">Cancel</button><button onclick="taSaveBlock()">Save commitment</button></div></div>');
  }
  window.taSaveBlock=function() {
    const name=cleanText(document.getElementById('taBlockName')?.value,50)||'Personal commitment';
    const start=validTime(document.getElementById('taBlockStart')?.value,'');
    const end=validTime(document.getElementById('taBlockEnd')?.value,'');
    const days=[...document.querySelectorAll('#modalContent .ta-days input:checked')].map(x=>Number(x.value));
    const err=document.getElementById('taBlockError');
    if(!start||!end||minutes(end)<=minutes(start)){if(err)err.textContent='Choose a valid start and end time.';return;}
    if(!days.length){if(err)err.textContent='Choose at least one day.';return;}
    state.availability.busy.push({id:makeId(),name,start,end,days});closeModal();saveState('Weekly commitment saved.');
  };
  function removeBlock(id) { state.availability.busy=state.availability.busy.filter(x=>x.id!==id);saveState('Commitment removed.'); }
  function availabilityForm() {
    const days=state.availability.days;
    const dayRows=days.map((d,i)=>'<div class="ta-hour-row '+(d.enabled?'':'is-unavailable')+'"><input id="taDayOn'+i+'" type="checkbox" '+(d.enabled?'checked':'')+' onchange="taToggleDayAvailability('+i+',this.checked)" aria-label="Available on '+DAY_NAMES[i]+'"><label for="taDayOn'+i+'">'+DAY_NAMES[i]+'</label><label class="ta-time-field ta-time-start"><span>Start</span><input id="taDayStart'+i+'" type="time" value="'+d.start+'" '+(d.enabled?'':'disabled')+' aria-label="'+DAY_NAMES[i]+' study starts"></label><label class="ta-time-field ta-time-end"><span>End</span><input id="taDayEnd'+i+'" type="time" value="'+d.end+'" '+(d.enabled?'':'disabled')+' aria-label="'+DAY_NAMES[i]+' study ends"></label></div>').join('');
    const targets=DAY_SHORT.map((name,i)=>'<label class="ta-copy-target"><input type="checkbox" value="'+i+'">'+name+'</label>').join('');
    const commitments=state.availability.busy.length?state.availability.busy.map(b=>'<div class="ta-busy-row"><span><b>'+esc(b.name)+'</b> · '+esc(b.start)+'–'+esc(b.end)+' · '+b.days.map(i=>DAY_SHORT[i]).join(', ')+'</span><button type="button" class="small danger" onclick="taRemoveBlock(\''+esc(b.id)+'\')" aria-label="Remove '+esc(b.name)+'">Remove</button></div>').join(''):'<p class="small">No recurring commitments added yet.</p>';
    modal('<div class="ta-modal-form ta-availability-modal"><header class="ta-availability-heading"><h2>Set your study availability</h2><p class="small">Choose the times you are usually free to study. Uncheck a day to mark it unavailable.</p></header><section class="ta-availability-section"><h3>Daily availability</h3><p>Set a start and end time for each day.</p><div class="ta-hour-head"><span></span><span>Day</span><span>Start</span><span>End</span></div><div class="ta-hours-grid">'+dayRows+'</div><details class="ta-copy-details"><summary>Copy hours to other days</summary><div class="ta-copy-tools"><label class="ta-copy-source">Copy from<select id="taCopySource">'+DAY_NAMES.map((name,i)=>'<option value="'+i+'">'+name+'</option>').join('')+'</select></label><div class="ta-copy-targets" id="taCopyTargets" aria-label="Choose days to update">'+targets+'</div><button type="button" class="secondary" onclick="taCopyAvailability()">Apply to selected days</button></div></details></section><section class="ta-availability-section"><h3>Daily study limits</h3><p>Use these to keep the automatic timetable manageable.</p><div class="ta-limits-grid"><label>Break between sessions (minutes)<input id="taBreakMinutes" type="number" min="0" max="30" step="5" value="'+state.availability.breakMinutes+'"></label><label>Study limit per day (minutes)<input id="taDailyLimit" type="number" min="60" max="480" step="30" value="'+state.availability.maxPerDay+'"></label></div></section><details class="ta-commitments-details"><summary>Weekly commitments · '+state.availability.busy.length+'</summary><div class="ta-commitments-body"><p class="small">School, tuition or other regular commitments block automatic study sessions.</p><div class="ta-inline-actions"><span></span><button type="button" class="small secondary" onclick="taAddBlock()">＋ Add commitment</button></div><div class="ta-busy-list">'+commitments+'</div></div></details><p id="taAvailabilityError" class="ta-msg" role="status" aria-live="polite"></p><div class="ta-modal-actions"><button type="button" class="ghost" onclick="closeModal()">Cancel</button><button type="button" onclick="taSaveAvailability()">Save availability</button></div></div>');
  }
  window.taToggleDayAvailability=function(index,enabled){const start=document.getElementById('taDayStart'+index),end=document.getElementById('taDayEnd'+index),row=start?.closest('.ta-hour-row');if(start)start.disabled=!enabled;if(end)end.disabled=!enabled;row?.classList.toggle('is-unavailable',!enabled);};
  window.taCopyAvailability=function(){
    const source=Number(document.getElementById('taCopySource')?.value),targets=[...document.querySelectorAll('#taCopyTargets input:checked')].map(x=>Number(x.value)).filter(x=>x!==source);
    const err=document.getElementById('taAvailabilityError');
    if(!targets.length){if(err)err.textContent='Choose one or more different days to update.';return;}
    targets.forEach(i=>{const sourceEnabled=document.getElementById('taDayOn'+source)?.checked,enabled=document.getElementById('taDayOn'+i);if(enabled){enabled.checked=sourceEnabled;window.taToggleDayAvailability(i,sourceEnabled);}const fromStart=document.getElementById('taDayStart'+source)?.value,fromEnd=document.getElementById('taDayEnd'+source)?.value;if(fromStart)document.getElementById('taDayStart'+i).value=fromStart;if(fromEnd)document.getElementById('taDayEnd'+i).value=fromEnd;});
    if(err)err.textContent='Availability copied to '+targets.map(i=>DAY_SHORT[i]).join(', ')+'. Save to keep the changes.';
  };
  window.taAddBlock=addBlockForm;
  window.taRemoveBlock=function(id){removeBlock(id);availabilityForm();};
  window.taSaveAvailability=function() {
    const next=state.availability.days.map((old,i)=>({enabled:Boolean(document.getElementById('taDayOn'+i)?.checked),start:validTime(document.getElementById('taDayStart'+i)?.value,old.start),end:validTime(document.getElementById('taDayEnd'+i)?.value,old.end)}));
    if(next.some(d=>d.enabled&&minutes(d.end)<=minutes(d.start))){const e=document.getElementById('taAvailabilityError');if(e)e.textContent='For each available day, the end must be later than the start.';return;}
    state.availability.days=next;
    state.availability.breakMinutes=Math.max(0,Math.min(30,Number(document.getElementById('taBreakMinutes')?.value)||0));
    state.availability.maxPerDay=Math.max(60,Math.min(480,Number(document.getElementById('taDailyLimit')?.value)||180));
    closeModal();saveState('Availability saved. Your existing sessions were kept.');
  };

  function dayLoad(date,sessions=state.sessions) { return sessions.filter(s=>s.date===date).reduce((n,s)=>n+s.duration,0); }
  function scheduleSignature() { return JSON.stringify({sessions:state.sessions,availability:state.availability,tasks:tasksNow()}); }
  function intervalFree(date,start,duration,sessions=state.sessions) {
    const day=parseDate(date).getDay(),end=start+duration,window=state.availability.days[day];
    if(!window?.enabled||start<minutes(window.start)||end>minutes(window.end))return false;
    if(dayLoad(date,sessions)+duration>state.availability.maxPerDay)return false;
    if(state.availability.busy.some(b=>b.days.includes(day)&&start<minutes(b.end)&&end>minutes(b.start)))return false;
    const gap=state.availability.breakMinutes;
    return !sessions.some(s=>s.date===date&&start<endMinute(s)+gap&&end>minutes(s.start)-gap);
  }
  function availableSlot(date,duration,sessions=state.sessions,earliest=0) {
    const day=parseDate(date).getDay(),window=state.availability.days[day];if(!window?.enabled)return null;
    const startAt=Math.ceil(Math.max(minutes(window.start),earliest)/5)*5,endAt=minutes(window.end);
    for(let start=startAt;start+duration<=endAt;start+=5)if(intervalFree(date,start,duration,sessions))return start;
    return null;
  }
  function largestSlot(date,wanted,left,sessions,earliest=0) {
    for(let duration=Math.floor(Math.min(wanted,left)/5)*5;duration>=15;duration-=5){const start=availableSlot(date,duration,sessions,earliest);if(start!==null)return{start,duration};}
    return null;
  }
  let pendingProposal=null;
  function previewProposal(proposal) {
    pendingProposal=proposal;
    const heading=proposal.kind==='reschedule'?'Review rescheduling':'Review your timetable';
    const intro=proposal.kind==='reschedule'?'Review each unfinished automatic session before applying. Manual sessions and completed sessions stay as they are.':'Review the proposed study sessions before adding them. Existing sessions stay as they are.';
    const rows=proposal.changes.map(change=>proposal.kind==='reschedule'?'<li><b>'+esc(change.title)+'</b><span>'+esc(fmtDate(change.from.date))+' · '+esc(change.from.start)+' → '+esc(fmtDate(change.to.date))+' · '+esc(change.to.start)+' ('+change.to.duration+' min)</span></li>':'<li><b>'+esc(change.title)+'</b><span>'+esc(fmtDate(change.date))+' · '+esc(change.start)+' ('+change.duration+' min)</span></li>').join('');
    const held=proposal.unchanged.map(item=>'<li class="ta-preview-held"><b>'+esc(item.title)+'</b><span>'+esc(item.reason)+'</span></li>').join('');
    const removed=(proposal.removed||[]).map(item=>'<li class="ta-preview-held"><b>'+esc(item.title)+'</b><span>'+esc(item.reason)+' · '+item.duration+' min removed from this proposal</span></li>').join('');
    const notPlaced=proposal.unplaced.length?'<p class="ta-preview-note">Could not find a suitable slot for: '+proposal.unplaced.map(esc).join(', ')+'. '+(proposal.kind==='reschedule'?'These existing sessions will remain unchanged.':'Some of this task time will remain unscheduled.')+'</p>':'';
    const changeCount=proposal.changes.length+(proposal.removed||[]).length;
    modal('<div class="ta-modal-form ta-preview"><h2>'+heading+'</h2><p class="small">'+intro+'</p><div class="ta-preview-summary"><b>'+changeCount+'</b><span>'+ (proposal.kind==='reschedule'?'session'+(changeCount===1?'':'s')+' to update':'session'+(changeCount===1?'':'s')+' to add')+'</span></div>'+(rows||held||removed?'<ul class="ta-preview-list">'+rows+held+removed+'</ul>':'<p class="ta-empty">No sessions need to change.</p>')+notPlaced+'<p id="taPreviewError" class="ta-msg" role="status" aria-live="polite"></p><div class="ta-modal-actions"><button type="button" class="ghost" onclick="taCancelProposal()">Cancel</button><button type="button" onclick="taApplyProposal()" '+(changeCount?'':'disabled')+'>Apply changes</button></div></div>');
  }
  window.taCancelProposal=function(){pendingProposal=null;closeModal();};
  window.taApplyProposal=function(){
    if(!pendingProposal)return;
    if(scheduleSignature()!==pendingProposal.baseSignature){const error=document.getElementById('taPreviewError');if(error)error.textContent='Your timetable or tasks changed in another tab. Close this preview and review an updated plan.';pendingProposal=null;return;}
    const proposal=pendingProposal;pendingProposal=null;state.sessions=proposal.sessions;closeModal();
    if(proposal.date){selectedDate=proposal.date;weekAnchor=monday(parseDate(proposal.date));}
    const removedCount=(proposal.removed||[]).length;
    const message=proposal.kind==='reschedule'?'Rescheduling applied · '+proposal.changes.length+' session'+(proposal.changes.length===1?'':'s')+' moved'+(removedCount?' · '+removedCount+' no longer needed':'')+'.':'Timetable updated · '+proposal.changes.length+' session'+(proposal.changes.length===1?'':'s')+' added.';
    saveState(message);
    if(proposal.unplaced.length&&typeof toast==='function')setTimeout(()=>toast(proposal.unplaced.length+' session'+(proposal.unplaced.length===1?' could':'s could')+' not fit and remain unchanged.'),250);
  };
  function planNewSessions() {
    const now=today(),todayValue=dateKey(now),sessions=clone(state.sessions),changes=[],unplaced=[];
    const pending=tasksNow().filter(t=>t&&t.status!=='Completed').slice().sort((a,b)=>{
      const due=dueSort(a)-dueSort(b);if(due)return due;
      const rank={High:0,Medium:1,Low:2};return (rank[a.priority]??1)-(rank[b.priority]??1)||(Number(a.order)||0)-(Number(b.order)||0);
    });
    for(const task of pending){
      const progress=taskProgress(task.no);
      const reserved=sessions.filter(s=>s.taskNo===Number(task.no)&&!s.done).reduce((n,s)=>n+s.duration,0);
      let left=Math.max(0,(progress?.remainingEffortMinutes??(Number(task.duration)||30))-reserved);
      if(left<=0)continue;
      const due=deadlineDate(task),last=due&&due>=now?dateKey(due):dateKey(addDays(now,state.availability.horizon-1));
      const nextAvailableToday=now.getHours()*60+now.getMinutes()+5;
      while(left>=15){
        let placed=null;
        for(let offset=0;offset<state.availability.horizon;offset++){
          const date=dateKey(addDays(now,offset));if(date>last)break;
          const earliest=date===todayValue?nextAvailableToday:0;
          const slot=largestSlot(date,60,left,sessions,earliest);
          if(slot){placed={date,...slot};break;}
        }
        if(!placed){unplaced.push(task.name);break;}
        const item={id:makeId(),taskNo:Number(task.no),title:task.name,subject:task.subject,date:placed.date,start:timeString(placed.start),duration:placed.duration,note:'',done:false,source:'auto',created:new Date().toISOString()};
        sessions.push(item);changes.push(item);left-=placed.duration;
      }
      if(left>0&&!unplaced.includes(task.name))unplaced.push(task.name);
    }
    if(!changes.length&&!unplaced.length){if(typeof toast==='function')toast(pending.length?'All pending task time is already on your timetable.':'Add a pending task in Task Manager before generating a timetable.');return;}
    previewProposal({kind:'generate',baseSignature:scheduleSignature(),sessions,changes,unplaced,unchanged:[],date:todayValue});
  }
  function planReschedule() {
    const now=today(),todayValue=dateKey(now),rank={High:0,Medium:1,Low:2},movable=state.sessions.filter(s=>s.source==='auto'&&!s.done&&(!s.taskNo||tasksNow().find(t=>Number(t.no)===Number(s.taskNo))?.status!=='Completed')).sort((a,b)=>{
      const taskA=a.taskNo?tasksNow().find(t=>Number(t.no)===Number(a.taskNo)):null,taskB=b.taskNo?tasksNow().find(t=>Number(t.no)===Number(b.taskNo)):null,due=dueSort(taskA)-dueSort(taskB);if(due)return due;
      const priority=(rank[taskA?.priority]??1)-(rank[taskB?.priority]??1);return priority||a.date.localeCompare(b.date)||a.start.localeCompare(b.start);
    });
    if(!movable.length){if(typeof toast==='function')toast('There are no unfinished automatic sessions to reschedule.');return;}
    const movingIds=new Set(movable.map(s=>s.id)),sessions=state.sessions.filter(s=>!movingIds.has(s.id)),changes=[],unchanged=[],unplaced=[],removed=[];
    for(const original of movable){
      const task=original.taskNo?tasksNow().find(t=>Number(t.no)===Number(original.taskNo)):null;
      const alreadyPlanned=task?sessions.filter(s=>Number(s.taskNo)===Number(task.no)&&!s.done).reduce((n,s)=>n+s.duration,0):0;
      const effortRoom=task?Math.max(0,(taskProgress(task.no)?.remainingEffortMinutes||0)-alreadyPlanned):original.duration;
      const duration=task?Math.min(original.duration,Math.floor(effortRoom/5)*5):original.duration;
      if(duration<15){removed.push({title:displayTitle(original),duration:original.duration,reason:'Other kept or proposed sessions already cover the remaining task effort.'});continue;}
      const due=task?deadlineDate(task):null,horizonEnd=dateKey(addDays(now,state.availability.horizon-1)),dueEnd=due&&due>=now?dateKey(due):horizonEnd,last=dueEnd<horizonEnd?dueEnd:horizonEnd;
      const firstDate=original.date>=todayValue?original.date:todayValue;
      let placed=null;
      if(firstDate<=last){
        let earliest=0;
        if(firstDate===original.date)earliest=minutes(original.start)+duration+state.availability.breakMinutes;
        if(firstDate===todayValue&&firstDate===original.date){const clock=new Date();earliest=Math.max(earliest,clock.getHours()*60+clock.getMinutes()+5);}
        const sameDay=availableSlot(firstDate,duration,sessions,earliest);
        if(sameDay!==null)placed={date:firstDate,start:sameDay};
      }
      if(!placed){
        for(let offset=0;offset<state.availability.horizon;offset++){
          const date=dateKey(addDays(parseDate(firstDate),offset));if(date<=firstDate||date>last)continue;
          const start=availableSlot(date,duration,sessions);if(start!==null){placed={date,start};break;}
        }
      }
      if(placed){
        const moved={...original,date:placed.date,start:timeString(placed.start),duration};sessions.push(moved);
        if(moved.date!==original.date||moved.start!==original.start||moved.duration!==original.duration)changes.push({id:original.id,title:displayTitle(original),from:{date:original.date,start:original.start,duration:original.duration},to:{date:moved.date,start:moved.start,duration:moved.duration}});
      }else{
        sessions.push(original);unchanged.push({title:displayTitle(original),reason:'No free slot was found before the planning limit; this session will stay at its current time.'});unplaced.push(displayTitle(original));
      }
    }
    if(!changes.length&&unchanged.length){previewProposal({kind:'reschedule',baseSignature:scheduleSignature(),sessions,changes,unchanged,unplaced,date:todayValue});return;}
    previewProposal({kind:'reschedule',baseSignature:scheduleSignature(),sessions,changes,unchanged,unplaced,date:todayValue});
  }
  function generateTimetable() { planNewSessions(); }
  function rescheduleUnfinished() { planReschedule(); }

  function sessionCard(session, expanded) {
    const title=displayTitle(session),subject=displaySubject(session),linked=Boolean(taskFor(session));
    const overdue=!session.done&&session.date<dateKey(today());
    const completionLabel=session.done?'Undo complete':'Mark complete';
    const subjectLabel=subject+(session.taskNo?(linked?' · linked task':' · original task removed'):' · personal block');
    return '<article class="ta-session '+(session.done?'is-done':'')+(overdue?' is-overdue':'')+'" data-session-id="'+esc(session.id)+'"><div class="ta-session-meta"><span class="ta-session-time">'+fmtRange(session)+'</span><span class="ta-session-duration">'+session.duration+' min</span></div><div class="ta-session-title">'+esc(title)+'</div><div class="ta-session-subline"><span class="ta-session-subject">'+esc(subjectLabel)+'</span><span class="ta-session-state '+(session.done?'is-complete':'')+'">'+(session.done?'✓ Completed':'Planned')+'</span></div>'+(expanded&&session.note?'<div class="ta-session-note">'+esc(session.note)+'</div>':'')+'<div class="ta-session-actions"><button type="button" data-ta-action="done" data-id="'+esc(session.id)+'" class="ta-complete-action '+(session.done?'is-undo':'')+'" aria-label="'+completionLabel+': '+esc(title)+'">'+(session.done?'↶ Undo':'✓ Done')+'</button><details class="ta-session-menu"><summary aria-label="More actions for '+esc(title)+'" title="More actions">•••</summary><div class="ta-session-menu-items">'+(!session.done?'<button type="button" data-ta-action="focus" data-id="'+esc(session.id)+'">Start focus timer</button>':'')+'<button type="button" data-ta-action="edit" data-id="'+esc(session.id)+'">Edit session</button><button type="button" data-ta-action="delete" data-id="'+esc(session.id)+'" class="is-danger">Remove session</button></div></details></div></article>';
  }
  function dayCapacityLabel(date, items) {
    const day=parseDate(date).getDay(),hours=state.availability.days[day],scheduled=items.reduce((n,s)=>n+s.duration,0);
    if(!hours?.enabled)return 'No study hours set';
    const remaining=Math.max(0,state.availability.maxPerDay-scheduled);
    return 'Study hours '+hours.start+'–'+hours.end+' · '+durationLabel(scheduled)+' scheduled · '+durationLabel(remaining)+' of daily limit left';
  }
  function dayTaskProgressMarkup(items) {
    const ids=[...new Set(items.map(s=>Number(s.taskNo)).filter(Number.isFinite))];
    const rows=ids.map(no=>{const task=tasksNow().find(t=>Number(t.no)===no),progress=taskProgress(no);if(!task||!progress)return '';return '<div class="ta-task-progress"><b>'+esc(task.name)+'</b><span>'+progress.remainingEffortMinutes+' min effort left · '+progress.plannedSessionMinutes+' min scheduled · '+progress.percent+'% complete</span></div>';}).filter(Boolean).join('');
    return rows?'<div class="ta-day-task-progress"><span class="ta-progress-caption">Linked task progress</span>'+rows+'</div>':'';
  }
  function dayCard(date) {
    const key=dateKey(date),items=dateSessions(key),todayFlag=key===dateKey(today()),selected=key===selectedDate,expanded=expandedDays.has(key),limit=3;
    const visible=expanded?items:items.slice(0,limit),more=items.length-limit;
    const dayLabel=date.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
    const sessions=visible.map(s=>sessionCard(s,expanded)).join('');
    const empty=items.length?'':'<div class="ta-empty-day">No sessions planned yet. Your day is open.</div>';
    const moreButton=items.length>limit?'<button type="button" class="ta-more-sessions" data-ta-action="toggle-day" data-date="'+key+'" aria-expanded="'+expanded+'">'+(expanded?'Show fewer sessions':'+'+more+' more session'+(more===1?'':'s'))+'</button>':'';
    const dayButton='<button type="button" class="ta-day-title" data-ta-action="toggle-day" data-date="'+key+'" aria-expanded="'+expanded+'" aria-label="'+(expanded?'Collapse':'Expand')+' '+dayLabel+' schedule, '+items.length+' session'+(items.length===1?'':'s')+'"><span class="ta-day-name">'+DAY_SHORT[date.getDay()]+'</span><span class="ta-day-date">'+date.toLocaleDateString(undefined,{month:'short',day:'numeric'})+'</span></button>';
    return '<section class="ta-day '+(todayFlag?'is-today ':'')+(selected?'is-selected ':'')+(expanded?'is-expanded':'')+'" data-day="'+key+'"><header class="ta-day-head">'+dayButton+'<span class="ta-day-count">'+items.length+' session'+(items.length===1?'':'s')+'</span><button type="button" class="ta-day-add" data-ta-action="add" data-date="'+key+'" aria-label="Add a session on '+dayLabel+'">+</button></header><div class="ta-day-capacity">'+esc(dayCapacityLabel(key,items))+'</div><div class="ta-day-sessions">'+sessions+empty+moreButton+'</div>'+(expanded?dayTaskProgressMarkup(items):'')+'</section>';
  }
  function render() {
    const root=document.getElementById('timeArchitect'); if(!root)return;
    const week=[];for(let i=0;i<7;i++)week.push(addDays(weekAnchor,i));
    const visibleSessions=state.sessions.filter(s=>s.date>=dateKey(week[0])&&s.date<=dateKey(week[6]));
    const minutesThisWeek=visibleSessions.filter(s=>!s.done).reduce((n,s)=>n+s.duration,0);
    const doneCount=visibleSessions.filter(s=>s.done).length;
    const sessionCount=visibleSessions.filter(s=>!s.done).length;
    const summary='<div class="ta-summary" aria-label="Weekly timetable summary"><div><strong>'+sessionCount+'</strong><span>planned sessions</span></div><div><strong>'+durationLabel(minutesThisWeek)+'</strong><span>remaining study time</span></div><div><strong>'+doneCount+'</strong><span>completed sessions</span></div></div>';
    const cards=week.map(dayCard).join('');
    const pending=tasksNow().filter(t=>t.status!=='Completed');
    const statusLabel=saveStatus==='error'?'Could not save':'Saved on this device ✓';
    const nav='<div class="ta-week-toolbar"><div class="ta-week-nav"><button type="button" class="ta-nav-button" data-ta-action="week" data-delta="-1" aria-label="Previous week">‹<span>Previous</span></button><button type="button" class="ta-nav-button ta-today-button" data-ta-action="today">Today</button><strong class="ta-week-title">'+esc(weekTitle(weekAnchor))+'</strong><button type="button" class="ta-nav-button" data-ta-action="week" data-delta="1" aria-label="Next week"><span>Next</span>›</button></div><details class="ta-export-menu"><summary>Export timetable <span aria-hidden="true">⌄</span></summary><div class="ta-export-options"><button type="button" data-ta-action="export-pdf">Download PDF</button><button type="button" data-ta-action="export-png">Download PNG</button><button type="button" data-ta-action="export-ics">Export calendar (.ics)</button><button type="button" data-ta-action="print">Print timetable</button><p>PDF and PNG include every session in this week.</p></div></details></div>';
    root.innerHTML='<div class="topbar"><div><div class="water-kicker">MAKE A HOME FOR YOUR STUDY ✦</div><h2>🗓️ Time Architect</h2></div><div class="ta-heading-tools"><span id="taSaveStatus" class="ta-save-status" data-state="'+saveStatus+'" role="status" aria-live="polite">'+esc(statusLabel)+'</span><button type="button" class="small ghost" onclick="showView(\'home\')">← Main Menu</button></div></div><p class="ta-intro">Your tasks show what needs doing. Your timetable helps decide when you will work on them. Sessions are saved automatically on this device.</p><div class="ta-actions"><button type="button" onclick="taAddSession()">＋ Add a session</button><button type="button" class="secondary" onclick="taGenerate()">✦ Build my timetable</button><button type="button" class="ghost" onclick="taReschedule()">Reschedule unfinished</button><button type="button" class="ghost" onclick="taAvailability()">⚙ My availability</button></div><div id="taNotice" class="ta-msg" role="status" aria-live="polite"></div>'+nav+summary+'<div class="ta-week-grid">'+cards+'</div>'+(visibleSessions.length?'':'<p class="ta-week-empty-note">Your week is open. Add a study session or build a timetable from your pending tasks.</p>')+'<p class="ta-calendar-note">Automatic planning respects your saved study hours, weekly commitments, breaks, daily limit, task priority and deadlines. Manually arranged and completed sessions stay in your timetable.</p>'+(pending.length?'':'<p class="small">No pending tasks right now. You can still add a personal study session.</p>');
  }
  function exportSnapshot() {
    const days=[];for(let i=0;i<7;i++){const date=addDays(weekAnchor,i),key=dateKey(date);days.push({date:key,label:date.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}),shortLabel:date.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}),sessions:dateSessions(key).map(clone)});}
    const all=days.flatMap(day=>day.sessions),planned=all.filter(s=>!s.done),completed=all.filter(s=>s.done);
    return {days,all,week:weekTitle(weekAnchor),start:dateKey(weekAnchor),end:dateKey(addDays(weekAnchor,6)),plannedCount:planned.length,plannedMinutes:planned.reduce((n,s)=>n+s.duration,0),completedCount:completed.length,totalCount:all.length,breakMinutes:state.availability.breakMinutes,member:(typeof settings!=='undefined'&&settings.member)||'Jungwon'};
  }
  function loadExportMemberImage(member) {
    return new Promise(resolve=>{try{const image=document.createElement('img');image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=MEMBER_IMAGES[member]||MEMBER_IMAGES.Jungwon;if(image.complete&&image.naturalWidth)resolve(image);}catch(_){resolve(null);}});
  }
  function roundedCard(ctx,x,y,w,h,r,fill,stroke) {
    ctx.beginPath();if(typeof ctx.roundRect==='function')ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h);
    ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
  }
  function fittedText(ctx,value,maxWidth) {
    let text=String(value||'');if(ctx.measureText(text).width<=maxWidth)return text;
    while(text.length>3&&ctx.measureText(text+'…').width>maxWidth)text=text.slice(0,-1);
    return text+'…';
  }
  function wrappedText(ctx,value,maxWidth) {
    const words=String(value||'').split(/\s+/).filter(Boolean),lines=[];let line='';
    words.forEach(word=>{const next=line?line+' '+word:word;if(ctx.measureText(next).width<=maxWidth){line=next;return;}if(line)lines.push(line);line='';for(const char of word){if(ctx.measureText(line+char).width>maxWidth&&line){lines.push(line);line=char;}else line+=char;}});
    if(line)lines.push(line);return lines.length?lines:[''];
  }
  function canvasHeader(ctx,data,image,firstPage) {
    ctx.fillStyle='#fff9f7';ctx.fillRect(0,0,1800,2600);
    ctx.fillStyle='#74243e';ctx.fillRect(0,0,1800,16);
    ctx.fillStyle='#74243e';ctx.font='700 24px Arial, sans-serif';ctx.fillText('ENGENEVERSE',88,72);
    ctx.fillStyle='#7d6871';ctx.font='600 15px Arial, sans-serif';ctx.fillText(firstPage?'WEEKLY STUDY TIMETABLE':'WEEKLY STUDY TIMETABLE · CONTINUED',88,104);
    ctx.fillStyle='#3f3037';ctx.font=firstPage?'700 38px Georgia, serif':'700 28px Georgia, serif';ctx.fillText(data.week,88,firstPage?158:152);
    ctx.fillStyle='#7d6871';ctx.font='15px Arial, sans-serif';ctx.fillText('Sessions, subjects and completion status · Break preference: '+data.breakMinutes+' min',88,firstPage?190:183);
    if(image)try{ctx.save();ctx.beginPath();ctx.arc(1690,80,42,0,Math.PI*2);ctx.clip();ctx.drawImage(image,1648,38,84,84);ctx.restore();}catch(_){}
    if(firstPage){
      const metrics=[[''+data.plannedCount,'planned'],[durationLabel(data.plannedMinutes),'study time left'],[''+data.completedCount,'completed']];
      metrics.forEach((item,index)=>{const x=88+index*535;roundedCard(ctx,x,220,505,100,18,'#fff','#eadde1');ctx.fillStyle='#74243e';ctx.font='700 27px Arial, sans-serif';ctx.fillText(item[0],x+22,263);ctx.fillStyle='#806e76';ctx.font='14px Arial, sans-serif';ctx.fillText(item[1],x+22,294);});
      return 360;
    }
    return 230;
  }
  function canvasDayHeader(ctx,day,y,continuing) {
    const x=88,w=1624;roundedCard(ctx,x,y,w,64,14,'#f3e4e9','#eadde1');
    ctx.fillStyle='#5a1e35';ctx.font='700 21px Arial, sans-serif';ctx.fillText(day.label+(continuing?' · continued':''),x+20,y+29);
    const count=day.sessions.length,mins=day.sessions.reduce((n,s)=>n+s.duration,0);
    ctx.textAlign='right';ctx.fillStyle='#806e76';ctx.font='600 14px Arial, sans-serif';ctx.fillText(count+' session'+(count===1?'':'s')+' · '+durationLabel(mins),x+w-20,y+38);ctx.textAlign='left';
    return y+76;
  }
  function canvasSessionRow(ctx,session,y) {
    const x=100,w=1600,h=118,title=displayTitle(session),subject=displaySubject(session);
    roundedCard(ctx,x,y,w,h,12,session.done?'#f7f4f4':'#fff','#eadde1');
    ctx.fillStyle=session.done?'#8a7b80':'#74243e';ctx.fillRect(x,y,5,h);
    ctx.fillStyle='#5a1e35';ctx.font='700 17px Arial, sans-serif';ctx.fillText(fmtRange(session),x+22,y+31);
    ctx.fillStyle='#8a7881';ctx.font='13px Arial, sans-serif';ctx.fillText(session.duration+' min',x+22,y+55);
    ctx.fillStyle='#44363f';ctx.font='700 18px Arial, sans-serif';wrappedText(ctx,title,770).slice(0,3).forEach((line,index)=>ctx.fillText(line,x+220,y+25+index*22));
    ctx.fillStyle='#806e76';ctx.font='14px Arial, sans-serif';ctx.fillText(fittedText(ctx,subject,720),x+220,y+101);
    ctx.textAlign='right';ctx.fillStyle=session.done?'#6d826c':'#74243e';ctx.font='700 13px Arial, sans-serif';ctx.fillText(session.done?'✓ COMPLETED':'PLANNED',x+w-18,y+62);ctx.textAlign='left';
    return y+h+9;
  }
  function canvasDayEmpty(ctx,y) {
    roundedCard(ctx,100,y,1600,62,12,'#fff','#eadde1');ctx.fillStyle='#8a7881';ctx.font='italic 15px Arial, sans-serif';ctx.fillText('No sessions planned',122,y+38);return y+72;
  }
  function createPosterCanvas(data,image) {
    const sessionRows=data.days.reduce((n,day)=>n+Math.max(1,day.sessions.length),0);
    const height=390+data.days.length*90+sessionRows*145;
    if(height>32000)throw new Error('This week is too large for one PNG image. Choose PDF to export every session across pages.');
    const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas export is not available in this browser.');
    ctx.fillStyle='#fff9f7';ctx.fillRect(0,0,canvas.width,canvas.height);
    let y=canvasHeader(ctx,data,image,true);
    data.days.forEach(day=>{y=canvasDayHeader(ctx,day,y,false);if(!day.sessions.length)y=canvasDayEmpty(ctx,y);else day.sessions.forEach(session=>{y=canvasSessionRow(ctx,session,y);});y+=13;});
    ctx.fillStyle='#8a7881';ctx.font='12px Arial, sans-serif';ctx.fillText('ENGENEVERSE · Saved on this device · '+new Date().toLocaleDateString(),88,height-28);
    return canvas;
  }
  function createPdfCanvases(data,image) {
    const ratio=1240/1800,pageHeight=1754/ratio,bottom=pageHeight-88,pages=[];let canvas,ctx,y,currentIndex=-1;
    function newPage() {
      canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754;ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas export is not available in this browser.');
      ctx.scale(ratio,ratio);currentIndex++;pages.push(canvas);y=canvasHeader(ctx,data,image,currentIndex===0);
    }
    newPage();
    data.days.forEach(day=>{
      const firstRow=day.sessions.length?128:72;
      if(y+64+firstRow>bottom)newPage();
      y=canvasDayHeader(ctx,day,y,false);
      if(!day.sessions.length){y=canvasDayEmpty(ctx,y);y+=12;return;}
      day.sessions.forEach(session=>{
        if(y+128>bottom){newPage();y=canvasDayHeader(ctx,day,y,true);}
        y=canvasSessionRow(ctx,session,y);
      });
      y+=12;
    });
    pages.forEach((page,index)=>{const pageCtx=page.getContext('2d');pageCtx.save();pageCtx.fillStyle='#8a7881';pageCtx.font='12px Arial, sans-serif';pageCtx.textAlign='right';pageCtx.fillText('ENGENEVERSE · '+(index+1)+' / '+pages.length,1712,pageHeight-34);pageCtx.restore();});
    return pages;
  }
  function downloadBlob(blob,filename) {
    const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=filename;link.style.display='none';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function weekFilename(extension,data) { data=data||exportSnapshot();return 'engeneverse-timetable-'+data.start+'-'+data.end+'.'+extension; }
  function exportPng() {
    Promise.resolve().then(async()=>{const data=exportSnapshot(),image=await loadExportMemberImage(data.member),canvas=createPosterCanvas(data,image);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('The PNG could not be created.');downloadBlob(blob,weekFilename('png',data));if(typeof toast==='function')toast('Weekly timetable PNG downloaded.');}).catch(error=>{console.warn('Timetable PNG export failed.',error);if(typeof toast==='function')toast(error.message||'The PNG could not be downloaded.');});
  }
  async function canvasJpegBytes(canvas) {
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.94));
    if(blob)return new Uint8Array(await blob.arrayBuffer());
    const encoded=canvas.toDataURL('image/jpeg',0.94).split(',')[1];return Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));
  }
  async function buildPdfBlob(pages) {
    const encoder=new TextEncoder(),chunks=[],offsets=[0];let length=0;
    function append(bytes){chunks.push(bytes);length+=bytes.length;}
    function writeObject(id,parts){offsets[id]=length;append(encoder.encode(id+' 0 obj\n'));parts.forEach(part=>append(typeof part==='string'?encoder.encode(part):part));append(encoder.encode('\nendobj\n'));}
    const refs=pages.map((_,index)=>{const page=3+index*3;return page+' 0 R';});
    append(encoder.encode('%PDF-1.4\n%ENGENEVERSE\n'));
    writeObject(1,['<< /Type /Catalog /Pages 2 0 R >>']);
    writeObject(2,['<< /Type /Pages /Kids [ '+refs.join(' ')+' ] /Count '+pages.length+' >>']);
    for(let i=0;i<pages.length;i++){
      const pageId=3+i*3,imageId=pageId+1,contentId=pageId+2,image=await canvasJpegBytes(pages[i]);
      const content=encoder.encode('q\n595.28 0 0 841.89 0 0 cm\n/Im'+i+' Do\nQ\n');
      writeObject(pageId,['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im'+i+' '+imageId+' 0 R >> >> /Contents '+contentId+' 0 R >>']);
      writeObject(imageId,['<< /Type /XObject /Subtype /Image /Width '+pages[i].width+' /Height '+pages[i].height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+image.length+' >>\nstream\n',image,'\nendstream']);
      writeObject(contentId,['<< /Length '+content.length+' >>\nstream\n',content,'endstream']);
    }
    const xref=length;let xrefText='xref\n0 '+offsets.length+'\n0000000000 65535 f \n';
    for(let i=1;i<offsets.length;i++)xrefText+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
    append(encoder.encode(xrefText+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF'));
    const output=new Uint8Array(length);let offset=0;chunks.forEach(chunk=>{output.set(chunk,offset);offset+=chunk.length;});
    return new Blob([output],{type:'application/pdf'});
  }
  function exportPdf() {
    Promise.resolve().then(async()=>{const data=exportSnapshot(),image=await loadExportMemberImage(data.member),pages=createPdfCanvases(data,image),blob=await buildPdfBlob(pages);downloadBlob(blob,weekFilename('pdf',data));if(typeof toast==='function')toast('Weekly timetable PDF downloaded.');}).catch(error=>{console.warn('Timetable PDF export failed.',error);if(typeof toast==='function')toast(error.message||'The PDF could not be downloaded.');});
  }
  function icalEscape(value) { return String(value||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;'); }
  function foldIcalLine(line) {
    const encoder=new TextEncoder();let output='',part='',bytes=0;
    for(const char of String(line)){const size=encoder.encode(char).length;if(bytes+size>73){output+=part+'\r\n ';part=char;bytes=1+size;}else{part+=char;bytes+=size;}}
    return output+part;
  }
  function exportIcs() {
    const data=exportSnapshot(),stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'),lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ENGENEVERSE//Time Architect//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:ENGENEVERSE Study Timetable'];
    data.all.forEach(session=>{const start=session.date.replace(/-/g,'')+'T'+session.start.replace(':','')+'00',endMinuteValue=endMinute(session),endDate=endMinuteValue>=1440?dateKey(addDays(parseDate(session.date),1)).replace(/-/g,''):session.date.replace(/-/g,''),end=(endMinuteValue>=1440?'00:00':timeString(endMinuteValue));lines.push('BEGIN:VEVENT','UID:'+icalEscape(session.id)+'@engeneverse.local','DTSTAMP:'+stamp,'DTSTART:'+start,'DTEND:'+endDate+'T'+end.replace(':','')+'00','SUMMARY:'+icalEscape(displayTitle(session)),'CATEGORIES:'+icalEscape(displaySubject(session)),'DESCRIPTION:'+icalEscape(displaySubject(session)+' · '+session.duration+' minutes'+(session.done?' · completed':'')),'X-ENGENEVERSE-COMPLETED:'+(session.done?'TRUE':'FALSE'),'END:VEVENT');});
    lines.push('END:VCALENDAR');const body=lines.map(foldIcalLine).join('\r\n')+'\r\n';downloadBlob(new Blob([body],{type:'text/calendar;charset=utf-8'}),weekFilename('ics',data));if(typeof toast==='function')toast('Calendar file downloaded.');
  }
  function printTimetable() {
    const data=exportSnapshot(),image=MEMBER_IMAGES[data.member]||MEMBER_IMAGES.Jungwon;
    const days=data.days.map(day=>'<section class="ta-print-day"><header><h2>'+esc(day.label)+'</h2><span>'+day.sessions.length+' session'+(day.sessions.length===1?'':'s')+'</span></header>'+(day.sessions.length?day.sessions.map(session=>'<article class="ta-print-session"><div><b>'+esc(fmtRange(session))+'</b><span>'+session.duration+' min</span></div><section><strong>'+esc(displayTitle(session))+'</strong><span>'+esc(displaySubject(session))+'</span></section><em class="'+(session.done?'done':'')+'">'+(session.done?'Completed':'Planned')+'</em></article>').join(''):'<p class="ta-print-empty">No sessions planned</p>')+'</section>').join('');
    const sheet=document.createElement('main');sheet.id='taPrintSheet';sheet.innerHTML='<header class="ta-print-header"><div><div class="ta-print-brand">ENGENEVERSE</div><p>WEEKLY STUDY TIMETABLE</p><h1>'+esc(data.week)+'</h1><span>Break preference: '+data.breakMinutes+' min</span></div><img src="'+esc(image)+'" alt="Selected ENHYPEN character bookmark"></header><div class="ta-print-summary"><span><b>'+data.plannedCount+'</b> planned</span><span><b>'+durationLabel(data.plannedMinutes)+'</b> study time left</span><span><b>'+data.completedCount+'</b> completed</span></div><div class="ta-print-days">'+days+'</div><footer>ENGENEVERSE · Saved on this device</footer>';
    const oldTitle=document.title,wasPrinting=document.body.classList.contains('ta-printing');
    function cleanup(){sheet.remove();document.body.classList.toggle('ta-printing',wasPrinting);document.title=oldTitle;window.removeEventListener('afterprint',cleanup);}
    document.body.appendChild(sheet);document.body.classList.add('ta-printing');document.title='ENGENEVERSE timetable '+data.start;
    window.addEventListener('afterprint',cleanup,{once:true});window.print();setTimeout(cleanup,30000);
  }
  window.taExportPDF=exportPdf;window.taExportPNG=exportPng;window.taExportICS=exportIcs;window.taPrintTimetable=printTimetable;
  window.taAddSession=function(date){sessionForm(null,date||selectedDate);};
  window.taAddTaskSession=function(taskNo,date){const task=tasksNow().find(item=>Number(item.no)===Number(taskNo));if(!task)return;if(task.status==='Completed'){if(typeof toast==='function')toast('Completed tasks cannot be added to the timetable.');return;}sessionForm(null,date||selectedDate);const selector=document.getElementById('taTaskSelect');if(selector){selector.value=String(task.no);selector.dispatchEvent(new Event('change',{bubbles:true}));}};
  window.taGetSessionsForDate=function(date){return clone(dateSessions(date));};
  window.taGetAllSessions=function(){return clone(state.sessions);};
  window.taCompleteSession=function(id){const session=state.sessions.find(item=>item.id===id);if(!session)return false;if(!session.done){session.done=true;session.completedAt=new Date().toISOString();saveState("Session marked complete from the focus summary.");}return true;};
  window.taGetTaskProgress=function(taskNo){return taskProgress(taskNo);};
  window.taGetNextSession=function(){return nextUpcomingSession();};
  window.taShowTaskSchedule=function(taskNo){const task=tasksNow().find(item=>Number(item.no)===Number(taskNo));if(!task)return;const linked=state.sessions.filter(s=>Number(s.taskNo)===Number(task.no)).sort((a,b)=>Number(a.done)-Number(b.done)||a.date.localeCompare(b.date)||a.start.localeCompare(b.start))[0];window.showTimeArchitect(linked?.date||dateKey(today()));if(!linked&&typeof toast==='function')toast('This task has no timetable session yet.');};
  window.taRefreshState=function(){state=normalizeState(loadState());render();decorateCalendar();};
  window.taEditSession=editSession;
  window.taGenerate=function(){generateTimetable();};
  window.taReschedule=rescheduleUnfinished;
  window.taAvailability=availabilityForm;
  window.taStartSessionFocus=function(id){
    const session=state.sessions.find(item=>item.id===id);if(!session)return;
    const snapshot=typeof window.getStudyTimerSnapshot==='function'?window.getStudyTimerSnapshot():null;
    if(snapshot&&(snapshot.running||snapshot.paused)){window.showView?.('timer');if(typeof toast==='function')toast('Finish or stop the active focus timer before starting this session.');return;}
    if(typeof window.prepareStudyTimer!=='function'){if(typeof toast==='function')toast('Open Focus Timer to begin this session.');return;}
    const task=taskFor(session)||{no:null,name:displayTitle(session),subject:displaySubject(session)};
    window.prepareStudyTimer(task,session.duration*60,{sessionId:session.id});
  };  window.taMoveWeek=function(delta){weekAnchor=addDays(weekAnchor,7*Number(delta));selectedDate=dateKey(weekAnchor);render();};
  window.taGoToday=function(){weekAnchor=monday(today());selectedDate=dateKey(today());render();};
  window.showTimeArchitect=function(date){if(validDateKey(date)){selectedDate=date;weekAnchor=monday(parseDate(date));}if(typeof window.showView==='function')window.showView('timeArchitect');else render();};
  window.taRemoveSession=deleteSession;

  function onRootClick(event) {
    const button=event.target.closest('[data-ta-action]'); if(!button)return;
    const action=button.dataset.taAction,id=button.dataset.id;
    if(action==='add'){selectedDate=button.dataset.date||selectedDate;sessionForm(null,selectedDate);}
    if(action==='done')toggleDone(id);
    if(action==='focus')window.taStartSessionFocus?.(id);
    if(action==='edit')editSession(id);
    if(action==='delete')deleteSession(id);
    if(action==='toggle-day'){const date=button.dataset.date;if(date){selectedDate=date;if(expandedDays.has(date))expandedDays.delete(date);else expandedDays.add(date);render();}}
    if(action==='week')window.taMoveWeek(Number(button.dataset.delta)||0);
    if(action==='today')window.taGoToday();
    if(action==='export-pdf'){button.closest('details')?.removeAttribute('open');exportPdf();}
    if(action==='export-png'){button.closest('details')?.removeAttribute('open');exportPng();}
    if(action==='export-ics'){button.closest('details')?.removeAttribute('open');exportIcs();}
    if(action==='print'){button.closest('details')?.removeAttribute('open');printTimetable();}
  }
  function createView() {
    if(document.getElementById('timeArchitect'))return;
    const view=document.createElement('section');view.id='timeArchitect';view.className='view card hidden time-architect-view';view.setAttribute('aria-label','Time Architect weekly timetable');
    const calendar=document.getElementById('calendar');
    if(calendar)calendar.parentNode.insertBefore(view,calendar);else document.querySelector('.shell')?.appendChild(view);
    view.addEventListener('click',onRootClick);
    const menu=document.querySelector('#home .menu');
    if(menu&&!menu.querySelector('[data-open-time-architect]')){const button=document.createElement('button');button.type='button';button.dataset.openTimeArchitect='true';button.textContent='🗓️ Time Architect';button.addEventListener('click',()=>window.showTimeArchitect());menu.insertBefore(button,menu.children[2]||null);}
    render();
  }
  function installViewHook() {
    if(typeof window.showView!=='function'||window.showView.__timeArchitectWrapped)return;
    originalShowView=window.showView;
    const wrapped=function(id){const result=originalShowView.apply(this,arguments);if(id==='timeArchitect')render();return result;};
    wrapped.__timeArchitectWrapped=true;window.showView=wrapped;
  }
  function installRenderHooks() {
    if(typeof window.renderCalendar==='function'&&!window.renderCalendar.__timeArchitectWrapped){originalRenderCalendar=window.renderCalendar;const wrapped=function(){const result=originalRenderCalendar.apply(this,arguments);decorateCalendar();return result;};wrapped.__timeArchitectWrapped=true;window.renderCalendar=wrapped;}
    if(typeof window.renderAll==='function'&&!window.renderAll.__timeArchitectWrapped){originalRenderAll=window.renderAll;const wrapped=function(){const result=originalRenderAll.apply(this,arguments);if(typeof currentView!=='undefined'&&currentView==='timeArchitect')render();if(typeof currentView!=='undefined'&&currentView==='calendar')decorateCalendar();return result;};wrapped.__timeArchitectWrapped=true;window.renderAll=wrapped;}
  }
  function decorateCalendar() {
    const grid=document.getElementById('calendarGrid'),title=document.getElementById('monthTitle');
    if(!grid||!title||typeof calendarDate==='undefined')return;
    const y=calendarDate.getFullYear(),m=calendarDate.getMonth();
    grid.querySelectorAll('.calday').forEach(cell=>{
      const number=Number(cell.querySelector('.date')?.textContent); if(!number)return;
      const date=dateKey(new Date(y,m,number,12)),items=dateSessions(date);
      cell.classList.toggle('has-ta-session',items.length>0);
      cell.querySelector('.ta-bookmark')?.remove();
      if(!items.length)return;
      const member=(typeof settings!=='undefined'&&settings.member)||'Jungwon';
      const image=MEMBER_IMAGES[member]||MEMBER_IMAGES.Jungwon;
      const button=document.createElement('button');button.type='button';button.className='ta-bookmark';button.title=items.length+' planned study session'+(items.length===1?'':'s')+' · open Time Architect';button.setAttribute('aria-label','Open '+items.length+' planned session'+(items.length===1?'':'s')+' on '+fmtDate(date));button.innerHTML='<img src="'+esc(image)+'" alt=""><span>'+items.length+'</span>';
      button.addEventListener('click',function(event){event.stopPropagation();window.showTimeArchitect(date);});cell.appendChild(button);
    });
  }
  function installCalendarControl() {
    const calendar=document.getElementById('calendar');
    if(!calendar||calendar.querySelector('[data-ta-calendar-link]'))return;
    const topbar=calendar.querySelector('.topbar');if(!topbar)return;
    const button=document.createElement('button');button.type='button';button.dataset.taCalendarLink='true';button.className='small secondary';button.textContent='🗓️ Open timetable';button.addEventListener('click',()=>window.showTimeArchitect());
    topbar.insertBefore(button,topbar.lastElementChild||null);
    const note=document.createElement('p');note.className='ta-calendar-note';note.textContent='Deadlines remain shown as calendar events. The small companion bookmark marks a date with a saved study session.';calendar.insertBefore(note,calendar.querySelector('.actionrow'));
  }

  function boot() {
    if(wired)return;wired=true;
    createView();installViewHook();installRenderHooks();installCalendarControl();decorateCalendar();
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)state=normalizeState(loadState());});
    window.addEventListener('engene-data-imported',()=>{state=normalizeState(loadState());render();decorateCalendar();});
    window.addEventListener('storage',event=>{if(event.key===KEY){state=normalizeState(loadState());render();decorateCalendar();}});
    if(typeof window.renderAll==='function')window.renderAll();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
