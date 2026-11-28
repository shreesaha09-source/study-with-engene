/* Calendar quick planning, gentle reminders, and a weekly view using existing app data. */
(function(){
  'use strict';
  const REMINDER_KEY='esc_calendar_reminders_v1';
  let reminderPrefs=readPrefs();
  let reminderMessage='';
  let oldCalendar=window.renderCalendar;
  const pad=n=>String(n).padStart(2,'0');
  const keyFor=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  const dateFromKey=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d,12);};
  const todayKey=()=>keyFor(new Date());
  const esc=s=>typeof window.esc==='function'?window.esc(s):String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function readPrefs(){try{return JSON.parse(localStorage.getItem(REMINDER_KEY))||{enabled:false,sent:{}};}catch(_){return{enabled:false,sent:{}};}}
  function savePrefs(){try{localStorage.setItem(REMINDER_KEY,JSON.stringify(reminderPrefs));}catch(_){}}
  function taskList(){return typeof tasks!=='undefined'&&Array.isArray(tasks)?tasks:(Array.isArray(window.tasks)?window.tasks:[]);}
  function sessionList(){return typeof window.taGetAllSessions==='function'?window.taGetAllSessions():[];}
  function deadlineDate(t){const m=String(t.deadline||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?new Date(+m[3],+m[2]-1,+m[1],12):null;}
  function showTask(no){window.closeModal?.();window.showView?.('manager');setTimeout(()=>window.searchTask?.(Number(no)),0);}
  function durationLabel(value){const minutes=Math.max(0,Number(value)||0),hours=Math.floor(minutes/60),rest=minutes%60;return hours?(rest?hours+'h '+rest+'m':hours+'h'):rest+'m';}
  function workloadLabel(minutes){return minutes<60?'Light day':minutes<=150?'Balanced day':'Busy day';}
  function dateModal(date){
    const d=dateFromKey(date),ds=String(d.getDate()).padStart(2,'0')+'/'+pad(d.getMonth()+1)+'/'+d.getFullYear();
    const due=taskList().filter(t=>t.deadline===ds&&t.status!=='Completed'),sessions=(window.taGetSessionsForDate?.(date)||[]).slice().sort((a,b)=>a.start.localeCompare(b.start));
    const unfinished=sessions.filter(s=>!s.done),plannedMinutes=unfinished.reduce((n,s)=>n+(Number(s.duration)||0),0),completeMinutes=sessions.filter(s=>s.done).reduce((n,s)=>n+(Number(s.duration)||0),0);
    const pending=taskList().filter(t=>t.status!=='Completed');
    const sessionRows=sessions.length?sessions.map(s=>{const task=s.taskNo&&taskList().find(t=>Number(t.no)===Number(s.taskNo));return '<div class="ce-row"><span><b>'+esc(s.start)+' · '+esc(s.title)+'</b><small>'+esc(s.subject)+' · '+Number(s.duration||0)+' min'+(s.done?' · completed':' · planned')+' · '+(task?'Task '+task.no:'Personal block')+'</small></span><span class="ce-row-actions">'+(task?'<button class="small ghost" type="button" onclick="calendarOpenTask('+Number(task.no)+')">Open task</button>':'')+(s.done?'':'<button class="small secondary" type="button" onclick="calendarRescheduleSession(\''+esc(s.id)+'\')">Reschedule</button>')+'</span></div>';}).join(''):'<p class="small">No study sessions planned.</p>';
    const dueRows=due.length?due.map(t=>'<button class="ce-task-row" type="button" onclick="calendarOpenTask('+Number(t.no)+')"><span><b>'+esc(t.name)+'</b><small>'+esc(t.subject)+' · '+esc(t.status)+'</small></span><span>View ↗</span></button>').join(''):'<p class="small">No task deadlines on this date.</p>';
    const taskOptions=pending.length?'<label class="ce-select-label">Add an existing task<select id="ceTaskSelect"><option value="">Choose a task…</option>'+pending.map(t=>'<option value="'+Number(t.no)+'">'+esc(t.name)+' · '+esc(t.subject)+'</option>').join('')+'</select></label><button type="button" onclick="calendarAddTask(\''+date+'\')">＋ Add to timetable</button>':'<p class="small">No pending tasks to schedule.</p>';
    window.openModal('<div class="ce-modal"><div class="water-kicker">YOUR DAY AT A GLANCE ✦</div><h2>'+esc(d.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}))+'</h2><div class="ce-day-summary"><span><b>'+durationLabel(plannedMinutes)+'</b><small>planned study</small></span><span><b>'+unfinished.length+'</b><small>unfinished session'+(unfinished.length===1?'':'s')+'</small></span><span class="ce-workload '+(plannedMinutes<60?'light':plannedMinutes<=150?'balanced':'busy')+'"><b>'+workloadLabel(plannedMinutes)+'</b><small>scheduled load</small></span>'+(completeMinutes?'<span><b>'+durationLabel(completeMinutes)+'</b><small>completed sessions</small></span>':'')+'</div><div class="ce-section"><h3>🗓️ Study sessions</h3>'+sessionRows+'</div><div class="ce-section"><h3>📌 Deadlines</h3>'+dueRows+'</div><div class="ce-actions">'+taskOptions+'<button class="secondary" type="button" onclick="calendarNewSession(\''+date+'\')">＋ New standalone session</button><button class="ghost" type="button" onclick="showTimeArchitect(\''+date+'\')">Open this date in Time Architect ↗</button></div></div>');
  }
  window.calendarOpenTask=showTask;
  window.calendarRescheduleSession=function(id){const session=sessionList().find(s=>s.id===id);if(!session)return;window.closeModal?.();window.taEditSession?.(id);};
  window.calendarAddTask=function(date){const no=document.getElementById('ceTaskSelect')?.value;if(!no)return;window.closeModal?.();window.taAddTaskSession?.(no,date);};
  window.calendarNewSession=function(date){window.closeModal?.();window.taAddSession?.(date);};
  window.calendarSelectDate=dateModal;
  window.renderCalendar=function(){
    if(typeof oldCalendar==='function')oldCalendar();
    const grid=document.getElementById('calendarGrid');if(!grid||typeof calendarDate==='undefined')return;
    const y=calendarDate.getFullYear(),m=calendarDate.getMonth(),items=taskList();
    grid.innerHTML=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>'<div class="calhead">'+x+'</div>').join('');
    for(let i=0;i<new Date(y,m,1).getDay();i++)grid.insertAdjacentHTML('beforeend','<div class="calpad" aria-hidden="true"></div>');
    const count=new Date(y,m+1,0).getDate(),today=new Date();
    for(let n=1;n<=count;n++){
      const dt=new Date(y,m,n,12),k=keyFor(dt),deadlineKey=pad(n)+'/'+pad(m+1)+'/'+y,due=items.filter(t=>t.deadline===deadlineKey&&t.status!=='Completed'),sessions=window.taGetSessionsForDate?.(k)||[];
      const isToday=n===today.getDate()&&m===today.getMonth()&&y===today.getFullYear();
      const memberFiles={Jungwon:'member-jungwon.png',Heeseung:'member-heeseung.png',Jay:'member-jay.png',Jake:'member-jake.png',Sunghoon:'member-sunghoon.png',Sunoo:'member-sunoo.png','Ni-ki':'member-niki.png','ENHYPEN (Group)':'member-group.png'};
      const member=typeof settings!=='undefined'&&settings.member?settings.member:'Jungwon',image=memberFiles[member]||memberFiles.Jungwon;
      const deadlineRows=due.slice(0,2).map(t=>'<button type="button" class="event" onclick="event.stopPropagation();calendarOpenTask('+Number(t.no)+')">'+esc(t.name)+'</button>').join('');
      const bookmark=sessions.length?'<button type="button" class="ta-bookmark" title="'+sessions.length+' scheduled session'+(sessions.length===1?'':'s')+' · open timetable" aria-label="Open '+sessions.length+' scheduled session'+(sessions.length===1?'':'s')+' on '+esc(dt.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}))+' in Time Architect" onclick="event.stopPropagation();showTimeArchitect(\''+k+'\')"><img src="'+esc(image)+'" alt=""><span>'+sessions.length+'</span></button>':'';
      const sessionLabel=sessions.length?'<button type="button" class="ce-marker session ce-session-link" data-count="'+sessions.length+'" title="'+sessions.length+' scheduled session'+(sessions.length===1?'':'s')+' · open timetable" aria-label="Open '+sessions.length+' scheduled session'+(sessions.length===1?'':'s')+' on this date" onclick="event.stopPropagation();showTimeArchitect(\''+k+'\')">● '+sessions.length+' session'+(sessions.length===1?'':'s')+'</button>':'';
      const content='<span class="date">'+n+'</span><span class="ce-markers">'+(due.length?'<span class="ce-marker deadline">◆ '+due.length+' deadline'+(due.length===1?'':'s')+'</span>':'')+sessionLabel+'</span>'+deadlineRows+(due.length>2?'<small class="ce-more">+'+(due.length-2)+' more</small>':'')+bookmark;
      grid.insertAdjacentHTML('beforeend','<div class="calday ce-day '+(isToday?'today ':'')+(due.length?'ce-has-deadline ':'')+(sessions.length?'ce-has-session':'')+'" role="button" tabindex="0" data-date="'+k+'" aria-label="'+esc(dt.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}))+', '+due.length+' deadlines, '+sessions.length+' study sessions">'+content+'</div>');
    }
    grid.querySelectorAll('.ce-day').forEach(button=>{button.addEventListener('click',()=>dateModal(button.dataset.date));button.addEventListener('keydown',event=>{if(event.target===button&&(event.key==='Enter'||event.key===' ')){event.preventDefault();dateModal(button.dataset.date);}});});
    const title=document.getElementById('monthTitle');if(title)title.textContent=new Intl.DateTimeFormat('en',{month:'long',year:'numeric'}).format(calendarDate);
    const hint=document.getElementById('ceCalendarHint');if(hint){const totalDeadlines=items.filter(t=>{const d=deadlineDate(t);return t.status!=='Completed'&&d&&d.getFullYear()===y&&d.getMonth()===m;}).length,totalSessions=sessionList().filter(s=>{const d=dateFromKey(s.date);return d.getFullYear()===y&&d.getMonth()===m;}).length;hint.textContent=totalDeadlines||totalSessions?'Select a date to review its deadlines and sessions, schedule a task, or add a study block.':'No deadlines or study sessions are saved for this month yet. Select any date to start planning.';}
  };
  const oldChange=window.changeMonth;
  window.changeMonth=function(delta){if(typeof calendarDate!=='undefined'){calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()+Number(delta),1);window.renderCalendar();}};

  function weekData(){
    const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()-6),end=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
    const tasks=taskList(),sessions=sessionList();
    const done=tasks.filter(t=>t.status==='Completed'&&t.completedAt&&new Date(t.completedAt)>=start&&new Date(t.completedAt)<end);
    const subjectCounts={};done.forEach(t=>subjectCounts[t.subject]=(subjectCounts[t.subject]||0)+1);
    const sessionsWeek=sessions.filter(s=>{const d=dateFromKey(s.date);return d>=start&&d<end;});
    const days=typeof stats!=='undefined'&&stats.days?stats.days:{};
    let seconds=0;for(let i=0;i<7;i++){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i,12);seconds+=Number(days[keyFor(d)]||0);}
    const nowDay=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
    const outstanding=tasks.filter(t=>t.status!=='Completed');
    const approaching=outstanding.filter(t=>{const d=deadlineDate(t);return d&&d>=nowDay&&d<=new Date(nowDay.getTime()+7*86400000);});
    const missed=sessionsWeek.filter(s=>!s.done&&dateFromKey(s.date)<nowDay);
    const completeSessions=sessionsWeek.filter(s=>s.done).length,plannedSessions=sessionsWeek.filter(s=>!s.done),plannedMinutes=plannedSessions.reduce((n,s)=>n+(Number(s.duration)||0),0);
    return{done,subjectCounts,sessionsWeek,seconds,outstanding,approaching,missed,completeSessions,plannedSessions,plannedMinutes};
  }
  function reportMarkup(){
    const w=weekData(),subjects=Object.entries(w.subjectCounts).sort((a,b)=>b[1]-a[1]),max=Math.max(1,...subjects.map(x=>x[1]));
    const approaching=w.approaching.slice(0,4).map(t=>'<button type="button" class="ce-task-row" onclick="calendarOpenTask('+Number(t.no)+')"><span>'+esc(t.name)+'</span><small>'+esc(t.deadline)+'</small></button>').join('')||'<p class="small">No approaching deadlines in the next 7 days.</p>';
    const subjectBars=subjects.length?subjects.map(([name,n])=>'<div class="ce-subject"><span>'+esc(name)+' <b>'+n+'</b></span><span class="ce-bar"><i style="width:'+Math.round(n/max*100)+'%"></i></span></div>').join(''):'<p class="small">Completed tasks by subject will appear here.</p>';
    return '<section class="ce-report"><div class="ce-report-head"><div><div class="water-kicker">A GENTLE WEEKLY CHECK-IN ✦</div><h2>Weekly report</h2><p class="small">A snapshot of the last seven days, using your existing tasks and study records.</p></div><button type="button" class="small ghost" onclick="calendarRenderReport()">Refresh</button></div><div class="ce-report-stats"><article><b>'+w.done.length+'</b><span>tasks completed</span></article><article><b>'+esc(typeof formatTime==='function'?formatTime(w.seconds):Math.floor(w.seconds/60)+'m')+'</b><span>actual recorded study time</span></article><article><b>'+w.completeSessions+'</b><span>sessions completed</span></article><article><b>'+w.plannedSessions.length+'</b><span>sessions planned</span></article><article><b>'+durationLabel(w.plannedMinutes)+'</b><span>planned time remaining</span></article><article><b>'+w.missed.length+'</b><span>unfinished past sessions</span></article></div><div class="ce-report-columns"><div><h3>Tasks completed by subject</h3>'+subjectBars+'</div><div><h3>Still on your list</h3><p class="small">'+w.outstanding.length+' outstanding task'+(w.outstanding.length===1?'':'s')+' · '+w.approaching.length+' deadline'+(w.approaching.length===1?'':'s')+' coming up</p>'+approaching+'</div></div><p class="small ce-kind-note">Planned time is separate from actual timer records. Every week has a different shape; use this as a helpful check-in, not a score.</p></section>';
  }
  window.calendarRenderReport=function(){const node=document.getElementById('ceReportBody');if(node)node.innerHTML=reportMarkup();};
  function reminderItems(){
    const today=new Date(),todayStart=new Date(today.getFullYear(),today.getMonth(),today.getDate(),12),out=[];
    const sessions=sessionList();
    taskList().filter(t=>t.status!=='Completed').forEach(t=>{
      const d=deadlineDate(t);if(!d)return;
      const days=Math.round((d-todayStart)/86400000),progress=window.taGetTaskProgress?.(t.no),future=sessions.some(s=>Number(s.taskNo)===Number(t.no)&&!s.done&&dateFromKey(s.date)<=d);
      let kind='',detail='';
      if(days<0){kind='overdue';detail='Overdue · '+t.deadline;}
      else if(days===0){kind='today';detail='Due today';}
      else if(days<=7){const unplanned=!future,substantial=(progress?.unscheduledEffortMinutes||0)>=30&&days<=3;kind=unplanned||substantial?'unscheduled':'upcoming';detail=unplanned?'Due '+d.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' · no session planned':substantial?'Due soon · '+progress.unscheduledEffortMinutes+'m still unscheduled':'Due '+d.toLocaleDateString(undefined,{month:'short',day:'numeric'});}
      if(kind)out.push({kind,title:t.name,detail,taskNo:t.no});
    });
    const todayKeyValue=keyFor(today);sessions.filter(s=>s.date===todayKeyValue&&!s.done).forEach(s=>out.push({kind:'session',title:s.title,detail:s.start+' · '+Number(s.duration||0)+' min',date:s.date}));
    const nextWeek=keyFor(new Date(today.getFullYear(),today.getMonth(),today.getDate()+7,12));
    sessions.filter(s=>s.date>todayKeyValue&&s.date<=nextWeek&&!s.done).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)).slice(0,3).forEach(s=>out.push({kind:'scheduled',title:s.title,detail:dateFromKey(s.date).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})+' · '+s.start+' · '+Number(s.duration||0)+' min',date:s.date}));
    sessions.filter(s=>s.date<todayKeyValue&&!s.done).slice(0,3).forEach(s=>out.push({kind:'missed',title:s.title,detail:'Unfinished · '+dateFromKey(s.date).toLocaleDateString(undefined,{month:'short',day:'numeric'}),date:s.date}));
    const rank={overdue:0,today:1,missed:2,unscheduled:3,session:4,scheduled:5,upcoming:6};return out.sort((a,b)=>rank[a.kind]-rank[b.kind]).slice(0,8);
  }
  function reminderPanel(){
    const list=reminderItems(),empty=!list.length;
    return '<section class="ce-reminders '+(empty?'is-empty':'has-items')+'"><div class="ce-report-head"><div><div class="water-kicker">A SOFT NUDGE ✦</div><h2>Reminders</h2>'+(empty?'<p class="ce-empty-reminder-copy">Nothing needs a reminder right now.</p>':'<p class="small">Keep ENGENEverse open for in-app reminders. Browser alerts are optional.</p>')+'</div><button type="button" class="ce-alert-toggle '+(reminderPrefs.enabled?'is-on':'')+'" role="switch" aria-checked="'+Boolean(reminderPrefs.enabled)+'" aria-label="Browser alerts '+(reminderPrefs.enabled?'on':'off')+'" onclick="calendarToggleReminders()">'+(reminderPrefs.enabled?'Alerts on':'Alerts off')+'</button></div>'+(empty?'':'<div class="ce-reminder-list">'+list.map(x=>'<button class="ce-reminder '+x.kind+'" type="button" onclick="'+(x.taskNo?'calendarOpenTask('+Number(x.taskNo)+')':'showTimeArchitect(\''+x.date+'\')')+'"><span class="ce-reminder-tag">'+({overdue:'Overdue',today:'Due today',missed:'Unfinished',unscheduled:'Needs a plan',upcoming:'Coming up',session:'Session today',scheduled:'Upcoming session'}[x.kind])+'</span><b>'+esc(x.title)+'</b><small>'+esc(x.detail)+'</small></button>').join('')+'</div>')+(reminderMessage?'<p id="ceReminderStatus" class="ce-reminder-warning" role="status">'+esc(reminderMessage)+'</p>':'')+'</section>';
  }
  window.calendarToggleReminders=async function(){
    if(reminderPrefs.enabled){reminderPrefs.enabled=false;reminderMessage='Browser alerts are off. In-app reminders remain available.';savePrefs();}
    else{
      reminderPrefs.enabled=true;savePrefs();
      if('Notification'in window&&Notification.permission==='default'){
        const permission=await Notification.requestPermission();
        if(permission==='denied')reminderMessage='Browser alerts are blocked. In-app reminders will still appear here.';
        else if(permission==='granted')reminderMessage='Browser alerts are on. Keep the app open for scheduled checks.';
      }else if(!('Notification'in window))reminderMessage='Browser alerts are not available here. In-app reminders will still appear.';
      else if(Notification.permission==='denied')reminderMessage='Browser alerts are blocked. In-app reminders will still appear here.';
      else reminderMessage='Alerts are on. Keep the app open for scheduled checks.';
    }
    injectPanels();
  };
  function notify(title,body,tag,view){
    if(!('Notification'in window)||Notification.permission!=='granted')return;
    if(typeof window.showReminderNotification==='function')window.showReminderNotification(title,body,tag,view);
  }
  function scanReminders(){
    if(!reminderPrefs.enabled)return;
    const now=new Date(),today=todayKey(),sent=reminderPrefs.sent||(reminderPrefs.sent={});
    const mark=(id,title,body,view)=>{if(sent[id])return;sent[id]=Date.now();notify(title,body,'engene-'+id,view);};
    taskList().filter(t=>t.status!=='Completed').forEach(t=>{const d=deadlineDate(t);if(!d)return;const deadlineId=keyFor(d),delta=Math.round((d-new Date(now.getFullYear(),now.getMonth(),now.getDate(),12))/86400000),progress=window.taGetTaskProgress?.(t.no),sessions=sessionList(),scheduled=sessions.some(s=>Number(s.taskNo)===Number(t.no)&&!s.done&&dateFromKey(s.date)<=d);if(delta<0)mark('deadline-'+t.no+'-'+deadlineId,'Task overdue',t.name+' is past its deadline.','calendar');else if(delta===0)mark('deadline-'+t.no+'-'+deadlineId,'Task due today',t.name+' is due today.','calendar');else if(delta===1)mark('deadline-tomorrow-'+t.no+'-'+deadlineId,'Deadline coming up',t.name+' is due tomorrow.','calendar');if(delta>=0&&delta<=7&&(!scheduled||(progress?.unscheduledEffortMinutes||0)>=30&&delta<=3))mark('unscheduled-'+t.no+'-'+deadlineId,'Task needs a timetable',t.name+(!scheduled?' has no session scheduled before its deadline.':' still has '+progress.unscheduledEffortMinutes+' minutes without a session.'),'timeArchitect');});
    sessionList().filter(s=>!s.done&&s.date===today).forEach(s=>{const [h,m]=s.start.split(':').map(Number),at=new Date(now.getFullYear(),now.getMonth(),now.getDate(),h,m),mins=(at-now)/60000;if(mins>=0&&mins<=15)mark('session-'+s.id+'-'+s.date+'-'+s.start,'Study session soon',s.title+' starts at '+s.start+'.','timeArchitect');});
    sessionList().filter(s=>!s.done&&s.date<today).forEach(s=>mark('missed-'+s.id+'-'+s.date,'Unfinished study session',s.title+' is still on your timetable. You can reschedule it when ready.','timeArchitect'));
    savePrefs();
  }
  function todayOverviewMarkup(){
    const today=todayKey(),now=new Date(),all=sessionList(),todaySessions=all.filter(s=>s.date===today).sort((a,b)=>a.start.localeCompare(b.start)),pendingToday=todaySessions.filter(s=>!s.done),plannedMinutes=pendingToday.reduce((n,s)=>n+(Number(s.duration)||0),0),tasks=taskList().filter(t=>t.status!=='Completed');
    const memberFiles={Jungwon:'member-jungwon.png',Heeseung:'member-heeseung.png',Jay:'member-jay.png',Jake:'member-jake.png',Sunghoon:'member-sunghoon.png',Sunoo:'member-sunoo.png','Ni-ki':'member-niki.png','ENHYPEN (Group)':'member-group.png'},member=typeof settings!=='undefined'&&settings.member?settings.member:'Jungwon';
    const rows=todaySessions.slice(0,4).map(s=>'<div class="ce-overview-row"><span><b>'+esc(s.start)+' · '+esc(s.title)+'</b><small>'+esc(s.subject)+' · '+Number(s.duration||0)+' min'+(s.done?' · completed':' · planned')+'</small></span><span class="ce-row-actions">'+(s.taskNo?'<button class="small ghost" type="button" onclick="calendarOpenTask('+Number(s.taskNo)+')">Task</button>':'')+'<button class="small secondary" type="button" onclick="showTimeArchitect(\''+today+'\')">Open</button></span></div>').join('')||'<p class="small">No sessions are planned for today.</p>';
    const deadlines=tasks.filter(t=>{const d=deadlineDate(t);return d&&d>=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12)&&d<=new Date(now.getFullYear(),now.getMonth(),now.getDate()+7,12);}).sort((a,b)=>deadlineDate(a)-deadlineDate(b)).slice(0,3);
    const attention=tasks.map(t=>({task:t,progress:window.taGetTaskProgress?.(t.no),due:deadlineDate(t)})).filter(x=>(x.progress?.unscheduledEffortMinutes||0)>=15&&(x.task.priority==='High'||x.due&&x.due<=new Date(now.getFullYear(),now.getMonth(),now.getDate()+7,12))).sort((a,b)=>(a.due?.getTime()||Number.MAX_SAFE_INTEGER)-(b.due?.getTime()||Number.MAX_SAFE_INTEGER)).slice(0,3);
    const next=window.taGetNextSession?.();
    const deadlineRows=deadlines.map(t=>'<button class="ce-overview-task" type="button" onclick="calendarOpenTask('+Number(t.no)+')"><span>'+esc(t.name)+'</span><small>'+esc(t.deadline)+(t.deadline?' · ':'')+esc(t.subject)+'</small></button>').join('')||'<p class="small">No deadlines in the next seven days.</p>';
    const attentionRows=attention.map(x=>'<button class="ce-overview-task" type="button" onclick="calendarOpenTask('+Number(x.task.no)+')"><span>'+esc(x.task.name)+'</span><small>'+x.progress.unscheduledEffortMinutes+' min not scheduled'+(x.due?' · due '+esc(x.task.deadline):' · high priority')+'</small></button>').join('')||'<p class="small">No urgent unscheduled tasks.</p>';
    const nextMarkup=next?'<div class="ce-next-session"><span><b>Next session</b><small>'+esc(next.date===today?next.start+' · today':dateFromKey(next.date).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})+' · '+next.start)+' · '+esc(next.title)+' · '+Number(next.duration||0)+' min</small></span><button class="small secondary" type="button" onclick="showTimeArchitect(\''+esc(next.date)+'\')">Open</button></div>':'<p class="small">No upcoming sessions are on the timetable.</p>';
    const totalLabel=pendingToday.length?durationLabel(plannedMinutes)+' planned · '+pendingToday.length+' left':todaySessions.length?'All sessions complete today':'No sessions planned today';
    return '<section class="ce-today-overview"><div class="ce-overview-head"><div class="ce-overview-title"><img class="ce-overview-member" src="'+esc(memberFiles[member]||memberFiles.Jungwon)+'" alt=""><span><div class="water-kicker">A CLEAR NEXT STEP ✦</div><h2>Today’s overview</h2></span></div><span class="ce-overview-total">'+totalLabel+'</span></div><div class="ce-overview-grid"><div><h3>Today’s sessions</h3>'+rows+'<div class="ce-overview-link">'+(next?nextMarkup:'')+'</div><button class="small ghost" type="button" onclick="showTimeArchitect(\''+today+'\')">Open today in Time Architect ↗</button></div><div><h3>Upcoming deadlines</h3>'+deadlineRows+'<h3 class="ce-attention-title">Unscheduled work</h3>'+attentionRows+'</div></div></section>';
  }
  function injectPanels(){
    const home=document.getElementById('home');if(!home)return;
    let panel=document.getElementById('ceHomePanels');if(!panel){panel=document.createElement('div');panel.id='ceHomePanels';panel.className='ce-home-panels';home.appendChild(panel);}
    const reportWasOpen=Boolean(panel.querySelector('.ce-report-details')?.open);
    const week=weekData(),summary=week.done.length+' tasks · '+week.completeSessions+' sessions done · '+week.plannedSessions.length+' planned · '+(typeof formatTime==='function'?formatTime(week.seconds):Math.floor(week.seconds/60)+'m')+' recorded';
    panel.innerHTML=todayOverviewMarkup()+reminderPanel()+'<details class="ce-report-details"><summary><span>Weekly report</span><small>'+esc(summary)+'</small></summary><div id="ceReportBody">'+reportMarkup()+'</div></details>';
    if(reportWasOpen)panel.querySelector('.ce-report-details')?.setAttribute('open','');
  }
  function init(){
    injectPanels();
    const cal=document.getElementById('calendar');
    if(cal&&!document.getElementById('ceCalendarTools')){const tools=document.createElement('div');tools.id='ceCalendarTools';tools.className='ce-calendar-tools';tools.innerHTML='<div class="ce-legend"><span><i class="deadline"></i> Task deadline</span><span><i class="session"></i> Planned session</span></div><button class="small ghost" type="button" onclick="calendarGoToday()">Today</button>';cal.insertBefore(tools,document.getElementById('calendarGrid'));const hint=document.createElement('p');hint.id='ceCalendarHint';hint.className='small ce-calendar-hint';cal.appendChild(hint);}
    window.calendarGoToday=function(){calendarDate=new Date();window.renderCalendar?.();};
    window.renderCalendar?.();
    if(typeof window.renderAll==='function'&&!window.renderAll.__calendarPanelsWrapped){const original=window.renderAll;const wrapped=function(){const result=original.apply(this,arguments);injectPanels();scanReminders();if(typeof currentView!=='undefined'&&currentView==='calendar')window.renderCalendar?.();return result;};wrapped.__calendarPanelsWrapped=true;window.renderAll=wrapped;}
    setInterval(scanReminders,60000);scanReminders();
    setInterval(()=>{injectPanels();if(typeof currentView!=='undefined'&&currentView==='manager')window.renderManager?.();if(typeof currentView!=='undefined'&&currentView==='plan')window.renderPlan?.();scanReminders();},60000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){injectPanels();scanReminders();}});
    window.addEventListener('engene-data-imported',()=>{reminderPrefs=readPrefs();injectPanels();window.renderCalendar?.();scanReminders();});
    window.addEventListener('engene-time-architect-updated',()=>{injectPanels();if(typeof currentView!=='undefined'&&currentView==='manager')window.renderManager?.();if(typeof currentView!=='undefined'&&currentView==='plan')window.renderPlan?.();if(typeof currentView!=='undefined'&&currentView==='calendar')window.renderCalendar?.();scanReminders();});
    window.addEventListener('storage',e=>{if(e.key==='esc_tasks_v2'||e.key==='esc_time_architect_v1'){injectPanels();window.renderCalendar?.();scanReminders();}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
