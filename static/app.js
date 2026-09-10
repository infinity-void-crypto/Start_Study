const $ = (s) => document.querySelector(s);
const SUBJECTS = ["math","physics","chemistry"];
let state = null;
let calendarDate = new Date();
let currentThoughtDay = null;
let timer = { subject:null, elapsed:0, running:false, startedAt:null, interval:null };

function esc(s){ return (s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
function showToast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(showToast.t); showToast.t=setTimeout(()=>t.classList.remove("show"),2300); }

async function getState(){
  const r=await fetch("/api/state"); state=await r.json(); renderState(); applySettings(state.settings); await renderCalendar();
}
function renderState(){
  const d = new Date(state.today+"T12:00:00");
  $("#todayLabel").textContent=d.toLocaleDateString(undefined,{month:"short",day:"numeric"}).toUpperCase();
  $("#rankName").textContent=state.level.rank;
  $("#levelNum").textContent=state.level.level;
  $("#streakNum").textContent=state.streak;
  $("#xpCurrent").textContent=state.level.current_xp;
  $("#totalXp").textContent=state.level.total_xp+" total";
  $("#xpFill").style.width=state.level.progress_pct+"%";
  $("#questStatus").textContent=state.today_complete ? "Quest complete. Streak secured." : "Complete all 3 subjects for today's streak.";
  $("#questIcon").textContent=state.today_complete ? "✓" : "◈";
  let total=0;
  SUBJECTS.forEach(s=>{
    const mins=state.subjects[s]||0; total+=mins;
    const pct=Math.min(100,Math.round(mins/60*100));
    $("#"+s+"Min").textContent=mins;
    $("#"+s+"Pct").textContent=pct+"%";
    $("#"+s+"Xp").textContent="+"+xpPreview(mins)+" XP today";
    const card=document.querySelector(`[data-subject="${s}"]`);
    card.classList.toggle("completed",mins>=60);
    const ring=card.querySelector(".progress-ring");
    ring.style.background=`conic-gradient(var(--accent) ${pct*3.6}deg, rgba(255,255,255,.07) 0deg)`;
  });
  $("#totalToday").textContent=total+"m";
}
function xpPreview(mins){ return Math.min(mins,60)+Math.max(0,mins-60)*3; }

function openFocus(subject){
  timer.subject=subject; timer.elapsed=0; timer.running=false; timer.startedAt=null;
  $("#focusSubject").textContent=subject.toUpperCase();
  $("#focusMode").classList.add("open"); $("#focusMode").setAttribute("aria-hidden","false");
  $("#playPause").textContent="▶"; $("#focusStatus").textContent="Paused";
  updateTimer();
  const wall=state?.settings?.wallpaper||"gradient";
  setFocusBackground(wall);
}
function setFocusBackground(wall){
  const el=$("#focusBg");
  const urls={
    lofi:"https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1600&q=80",
    cyber:"https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1600&q=80",
    cozy:"https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=1600&q=80",
  };
  if(wall==="gradient"){el.style.background="radial-gradient(circle at 50% 35%,#292143,#080912 68%)";}
  else {el.style.background=`linear-gradient(rgba(5,6,12,.45),rgba(5,6,12,.80)),url("${urls[wall]||urls.lofi}") center/cover`;}
  if(wall==="custom" && state.settings.custom_url) el.style.background=`linear-gradient(rgba(5,6,12,.38),rgba(5,6,12,.82)),url("${state.settings.custom_url}") center/cover`;
}
function toggleTimer(){
  if(timer.running) pauseTimer();
  else startTimer();
}
function startTimer(){
  timer.running=true; timer.startedAt=timer.startedAt || Date.now();
  $("#playPause").textContent="Ⅱ"; $("#focusStatus").textContent="Focusing…";
  clearInterval(timer.interval);
  timer.interval=setInterval(()=>{timer.elapsed++; updateTimer();},1000);
}
function pauseTimer(){
  timer.running=false; clearInterval(timer.interval);
  $("#playPause").textContent="▶"; $("#focusStatus").textContent="Paused";
}
function updateTimer(){
  const h=Math.floor(timer.elapsed/3600), m=Math.floor(timer.elapsed%3600/60), s=timer.elapsed%60;
  $("#timerH").textContent=String(h).padStart(2,"0");
  $("#timerM").textContent=String(m).padStart(2,"0");
  $("#timerS").textContent=String(s).padStart(2,"0");
  $("#focusXp").textContent=(timer.elapsed>=3600?"+3 XP / min":" +1 XP / min").replace(" ","");
}
function resetTimer(){
  pauseTimer(); timer.elapsed=0; timer.startedAt=null; updateTimer(); $("#focusStatus").textContent="Reset";
}
async function saveTimer(exit=true){
  pauseTimer();
  if(timer.elapsed>=60){
    const subject=timer.subject, seconds=timer.elapsed;
    const r=await fetch("/api/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subject,seconds})});
    const data=await r.json();
    if(data.saved){ showToast(`+${data.xp_earned} XP · ${data.minutes}m ${subject}`); state=data.state; renderState(); await renderCalendar(); }
  } else if(timer.elapsed>0) showToast("Study for at least 1 minute to log a session.");
  timer.elapsed=0; timer.startedAt=null; updateTimer();
  if(exit){$("#focusMode").classList.remove("open");$("#focusMode").setAttribute("aria-hidden","true");}
}
async function renderCalendar(){
  const y=calendarDate.getFullYear(), m=calendarDate.getMonth()+1;
  const r=await fetch(`/api/calendar?year=${y}&month=${m}`); const data=await r.json();
  $("#monthName").textContent=new Date(y,m-1,1).toLocaleDateString(undefined,{month:"short",year:"numeric"});
  const grid=$("#calendarGrid"); grid.innerHTML="";
  for(let i=0;i<data.first_weekday;i++){const x=document.createElement("div");x.className="day empty";grid.appendChild(x);}
  data.days.forEach(day=>{
    const x=document.createElement("button"); x.className="day"+(day.complete?" complete":"");
    if(day.day===state.today)x.classList.add("today"); if(day.has_thought)x.classList.add("has-thought");
    x.textContent=day.number; x.onclick=()=>openThought(day.day);
    x.title=day.complete?"Streak day": "Open thought";
    grid.appendChild(x);
  });
}
function openThought(day){
  currentThoughtDay=day; const d=new Date(day+"T12:00:00");
  $("#thoughtDate").textContent=d.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"});
  $("#thoughtText").value=state.thoughts?.[day]||"";
  $("#thoughtModal").classList.add("open");
}
function closeModal(id){$(id).classList.remove("open");}
async function saveThought(){
  const thought=$("#thoughtText").value;
  await fetch("/api/thought",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({day:currentThoughtDay,thought})});
  state.thoughts[currentThoughtDay]=thought; closeModal("#thoughtModal"); await renderCalendar(); showToast("Thought saved.");
}
function applySettings(settings){
  const wall=settings.wallpaper||"gradient";
  document.body.className="";
  if(wall==="custom") {document.body.classList.add("wall-custom");document.body.style.setProperty("--custom-bg",`url("${settings.custom_url}")`);}
  else document.body.classList.add("wall-"+wall);
  document.querySelectorAll(".wall-option").forEach(x=>x.classList.toggle("selected",x.dataset.wall===wall));
  $("#customUrl").value=settings.custom_url||"";
}
async function saveSettings(){
  const selected=document.querySelector(".wall-option.selected")?.dataset.wall||"gradient";
  const custom=$("#customUrl").value.trim();
  const wallpaper=custom? "custom":selected;
  const r=await fetch("/api/settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({wallpaper,custom_url:custom})});
  state.settings=await r.json(); applySettings(state.settings); closeModal("#settingsModal"); showToast("World updated.");
}

document.querySelectorAll("[data-start]").forEach(b=>b.addEventListener("click",()=>openFocus(b.dataset.start)));
$("#playPause").onclick=toggleTimer; $("#resetTimer").onclick=resetTimer;
$("#saveExit").onclick=()=>saveTimer(true);
$("#exitFocus").onclick=()=>saveTimer(true);
$("#minimizeFocus").onclick=()=>{pauseTimer();$("#focusMode").classList.remove("open");showToast("Timer minimized. Resume from a subject card.");};
$("#prevMonth").onclick=()=>{calendarDate.setMonth(calendarDate.getMonth()-1);renderCalendar()};
$("#nextMonth").onclick=()=>{calendarDate.setMonth(calendarDate.getMonth()+1);renderCalendar()};
$("#closeThought").onclick=()=>closeModal("#thoughtModal");$("#saveThought").onclick=saveThought;
$("#settingsBtn").onclick=()=>$("#settingsModal").classList.add("open");$("#closeSettings").onclick=()=>closeModal("#settingsModal");$("#saveSettings").onclick=saveSettings;
document.querySelectorAll(".wall-option").forEach(b=>b.onclick=()=>{document.querySelectorAll(".wall-option").forEach(x=>x.classList.remove("selected"));b.classList.add("selected")});
$("#calendarNav").onclick=()=>document.querySelector(".calendar-card").scrollIntoView({behavior:"smooth"});
$("#focusNav").onclick=()=>document.querySelector(".subject-card").scrollIntoView({behavior:"smooth"});
window.addEventListener("beforeunload",()=>{if(timer.running) navigator.sendBeacon("/api/session",new Blob([JSON.stringify({subject:timer.subject,seconds:timer.elapsed})],{type:"application/json"}));});
getState();
