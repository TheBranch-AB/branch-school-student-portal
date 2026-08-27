function updateDateTime(){
  const now=new Date();
  const dateText=new Intl.DateTimeFormat(undefined,{
    weekday:"long",month:"long",day:"numeric"
  }).format(now);
  const timeText=new Intl.DateTimeFormat(undefined,{
    hour:"numeric",minute:"2-digit"
  }).format(now);

  document.getElementById("date").textContent=dateText;
  document.getElementById("clock").textContent=timeText;
}
updateDateTime();
setInterval(updateDateTime,30000);

function prettifyNameFromEmail(email){
  if(!email) return "Student";
  const local=email.split("@")[0].replace(/[._-]+/g," ").trim();
  return local.split(" ").filter(Boolean)
    .map(p=>p.charAt(0).toUpperCase()+p.slice(1))
    .join(" ");
}

// Website version: Google identity will be populated after OAuth is connected.
function setStudentInfo(name="Student", email="Google sign-in not connected yet"){
  document.getElementById("studentName").textContent = name;
  document.getElementById("studentEmail").textContent = email;
  document.getElementById("avatar").textContent = (name || "S").charAt(0).toUpperCase();
  document.getElementById("accountStatus").textContent =
    email && email.endsWith("@branchschool.org") ? "Branch account" : "Not connected";
}
setStudentInfo("Student", "Waiting for Google sign-in...");

function parseCsv(text){
  const rows=[];
  let row=[], field="", quoted=false;

  for(let i=0;i<text.length;i++){
    const ch=text[i];

    if(quoted){
      if(ch === '"' && text[i+1] === '"'){
        field += '"';
        i++;
      } else if(ch === '"'){
        quoted=false;
      } else {
        field += ch;
      }
    } else {
      if(ch === '"'){
        quoted=true;
      } else if(ch === ','){
        row.push(field);
        field="";
      } else if(ch === '\n'){
        row.push(field.replace(/\r$/,""));
        rows.push(row);
        row=[];
        field="";
      } else {
        field += ch;
      }
    }
  }

  if(field.length || row.length){
    row.push(field.replace(/\r$/,""));
    rows.push(row);
  }
  return rows;
}

function parseDateOnly(value, endOfDay=false){
  const v=(value || "").trim();
  if(!v) return null;

  // Supports YYYY-MM-DD or M/D/YYYY.
  let y,m,d;
  if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(v)){
    [y,m,d]=v.split("-").map(Number);
  } else if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)){
    [m,d,y]=v.split("/").map(Number);
  } else {
    return null;
  }

  const date=new Date(y,m-1,d,endOfDay?23:0,endOfDay?59:0,endOfDay?59:0,endOfDay?999:0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function truthy(value){
  return ["true","yes","1","y","on"].includes((value || "").trim().toLowerCase());
}

function audienceMatches(value){
  const target=(window.PORTAL_CONFIG?.studentAudience || "All").trim().toLowerCase();
  const raw=(value || "All").trim().toLowerCase();

  if(raw === "" || raw === "all" || raw === "all students") return true;
  if(target === "all") return false;

  return raw.split(/[;,|]/).map(x=>x.trim()).includes(target);
}

function escapeHtml(value){
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function renderAnnouncements(items){
  const list=document.getElementById("announcementsList");
  if(!items.length){
    list.innerHTML='<div class="announcement-status">No current announcements.</div>';
    return;
  }

  list.innerHTML=items.map(item=>{
    const priority=(item.priority || "normal").trim().toLowerCase();
    const safePriority=["normal","important","urgent"].includes(priority) ? priority : "normal";
    const audience=(item.audience || "All").trim();

    return `
      <article class="announcement priority-${safePriority}">
        <div class="announcement-head">
          <div class="announcement-title">${escapeHtml(item.title)}</div>
          ${safePriority !== "normal" ? `<span class="announcement-priority">${escapeHtml(safePriority)}</span>` : ""}
        </div>
        <div class="announcement-message">${escapeHtml(item.message)}</div>
        <div class="announcement-meta">${escapeHtml(audience)}</div>
      </article>
    `;
  }).join("");
}

async function loadAnnouncements(){
  const list=document.getElementById("announcementsList");
  const cfg=window.PORTAL_CONFIG || {};
  const url=(cfg.announcementsCsvUrl || "").trim();

  if(!url || url.includes("PASTE_PUBLISHED_GOOGLE_SHEET")){
    list.innerHTML='<div class="announcement-status">Announcements are ready. Add the published Google Sheet CSV URL in <b>config.js</b>.</div>';
    return;
  }

  try{
    const response=await fetch(url,{cache:"no-store"});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);

    const text=await response.text();
    const rows=parseCsv(text).filter(r=>r.some(cell=>cell.trim() !== ""));
    if(rows.length < 2){
      renderAnnouncements([]);
      return;
    }

    const headers=rows[0].map(x=>x.trim().toLowerCase());
    const idx=name=>headers.indexOf(name);

    const required=["title","message","start","end","audience","active","priority"];
    const missing=required.filter(h=>idx(h) < 0);
    if(missing.length){
      throw new Error("Missing columns: " + missing.join(", "));
    }

    const now=new Date();
    const items=rows.slice(1).map(r=>({
      title:r[idx("title")] || "",
      message:r[idx("message")] || "",
      start:r[idx("start")] || "",
      end:r[idx("end")] || "",
      audience:r[idx("audience")] || "All",
      active:r[idx("active")] || "",
      priority:r[idx("priority")] || "normal"
    })).filter(item=>{
      if(!truthy(item.active)) return false;
      if(!item.title.trim() || !item.message.trim()) return false;
      if(!audienceMatches(item.audience)) return false;

      const start=parseDateOnly(item.start,false);
      const end=parseDateOnly(item.end,true);

      if(start && now < start) return false;
      if(end && now > end) return false;
      return true;
    });

    const max=Math.max(1,Math.min(Number(cfg.maxAnnouncements)||3,6));
    renderAnnouncements(items.slice(0,max));
  } catch(error){
    console.error("Announcements failed:",error);
    list.innerHTML='<div class="announcement-status error">Announcements are temporarily unavailable.</div>';
  }
}

loadAnnouncements();


function decodeGoogleCredential(token) {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");

  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split("")
      .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );

  return JSON.parse(jsonPayload);
}

function saveSignedInUser(name, email) {
  localStorage.setItem(
    "branchPortalUser",
    JSON.stringify({ name, email })
  );
}

function restoreSignedInUser() {
  const savedUser = localStorage.getItem("branchPortalUser");
  if (!savedUser) return false;

  try {
    const user = JSON.parse(savedUser);
    const allowedDomain =
      (window.PORTAL_CONFIG?.allowedDomain || "branchschool.org").toLowerCase();

    if (!user?.email ||
        !user.email.toLowerCase().endsWith("@" + allowedDomain)) {
      localStorage.removeItem("branchPortalUser");
      return false;
    }

    setStudentInfo(user.name || "Student", user.email);
    document.getElementById("accountStatus").textContent = "Branch account";
    return true;
  } catch (error) {
    console.warn("Could not restore saved student profile:", error);
    localStorage.removeItem("branchPortalUser");
    return false;
  }
}

function handleGoogleSignIn(response) {
  try {
    const user = decodeGoogleCredential(response.credential);
    const email = user.email || "";
    const name = user.name || "Student";
    const allowedDomain =
      (window.PORTAL_CONFIG?.allowedDomain || "branchschool.org").toLowerCase();

    if (!email.toLowerCase().endsWith("@" + allowedDomain)) {
      document.getElementById("accountStatus").textContent =
        "School account required";
      return;
    }

    setStudentInfo(name, email);
    document.getElementById("accountStatus").textContent = "Branch account";
    saveSignedInUser(name, email);
  } catch (error) {
    console.error("Google sign-in failed:", error);
  }
}

function initializeGoogleSignIn() {
  const clientId = window.PORTAL_CONFIG?.googleClientId || "";

  if (!clientId) {
    console.error("Google OAuth Client ID is missing.");
    return;
  }

  if (!window.google?.accounts?.id) {
    setTimeout(initializeGoogleSignIn, 250);
    return;
  }

  google.accounts.id.initialize({
    client_id: clientId,
    callback: handleGoogleSignIn,
    auto_select: true
  });

  if (!restoreSignedInUser()) {
    google.accounts.id.prompt();
  }
}

initializeGoogleSignIn();

let calendarTokenClient = null;
let calendarAccessToken = "";

function initializeCalendarAuth() {
  const clientId = window.PORTAL_CONFIG?.googleClientId || "";

  if (!clientId) return;

  if (!window.google?.accounts?.oauth2) {
    setTimeout(initializeCalendarAuth, 250);
    return;
  }

  calendarTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: "https://www.googleapis.com/auth/calendar.events.readonly",
    callback: async tokenResponse => {
      if (tokenResponse.error) {
        console.error("Calendar authorization failed:", tokenResponse);
        return;
      }

      calendarAccessToken = tokenResponse.access_token || "";
      await loadTodaysCalendar();
    }
  });
}

async function loadTodaysCalendar() {
  if (!calendarAccessToken) return;

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "10"
  });

  const scheduleBtn = document.querySelector(".schedule-btn");

  try {
    if (scheduleBtn) scheduleBtn.textContent = "Loading schedule…";

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      {
        headers: {
          Authorization: `Bearer ${calendarAccessToken}`
        }
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Calendar API HTTP ${response.status}: ${body}`);
    }

    const data = await response.json();
    const events = data.items || [];

    console.log("Today's calendar events:", events);

    if (scheduleBtn) {
      scheduleBtn.textContent =
        events.length === 1
          ? "1 Event Today ›"
          : `${events.length} Events Today ›`;
    }

    const todayCalendarLink =
      document.querySelector('.reminder-line a[href*="calendar.google.com"]');

    if (todayCalendarLink) {
      todayCalendarLink.textContent =
        events.length === 1
          ? "1 event today"
          : `${events.length} events today`;
    }
  } catch (error) {
    console.error("Calendar loading failed:", error);
    if (scheduleBtn) scheduleBtn.textContent = "Calendar unavailable";
  }
}

function requestCalendarAccess(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (!calendarTokenClient) {
    console.error("Calendar OAuth is not ready yet.");
    return;
  }

  calendarTokenClient.requestAccessToken({ prompt: "" });
}

function wireCalendarButton() {
  const scheduleBtn = document.querySelector(".schedule-btn");
  if (!scheduleBtn) return;

  scheduleBtn.removeAttribute("href");
  scheduleBtn.setAttribute("role", "button");
  scheduleBtn.style.cursor = "pointer";
  scheduleBtn.addEventListener("click", requestCalendarAccess);
}

initializeCalendarAuth();
wireCalendarButton();

// --- Daily Quote: deterministic by day of year ---
const DAILY_QUOTES = [{"text": "Do the small things well, especially when no one is watching.", "author": "Branch School • Responsibility"}, {"text": "Respect is shown in how you listen, speak, and respond.", "author": "Branch School • Respect"}, {"text": "A hard problem is an invitation to try a new approach.", "author": "Branch School • Perseverance"}, {"text": "Ask a good question today; curiosity opens doors.", "author": "Branch School • Learning"}, {"text": "Notice who could use encouragement today.", "author": "Branch School • Kindness"}, {"text": "Leadership starts with setting a good example.", "author": "Branch School • Leadership"}, {"text": "Your best does not have to be perfect; it has to be sincere.", "author": "Branch School • Excellence"}, {"text": "Being responsible means being ready before you are reminded.", "author": "Branch School • Responsibility"}, {"text": "Make room for other voices; listening is part of learning.", "author": "Branch School • Respect"}, {"text": "Progress often looks like trying one more time.", "author": "Branch School • Perseverance"}, {"text": "Learning grows when you connect what you know to something new.", "author": "Branch School • Learning"}, {"text": "A small act of kindness can become someone's favorite part of the day.", "author": "Branch School • Kindness"}, {"text": "You do not need a title to make a positive difference.", "author": "Branch School • Leadership"}, {"text": "Excellence grows from good habits repeated consistently.", "author": "Branch School • Excellence"}, {"text": "Your choices today help shape the person you become tomorrow.", "author": "Branch School • Responsibility"}, {"text": "Kind words cost nothing and can change someone's whole day.", "author": "Branch School • Respect"}, {"text": "Mistakes are evidence that you are stretching your skills.", "author": "Branch School • Perseverance"}, {"text": "The best answer sometimes begins with 'I don't know yet.'", "author": "Branch School • Learning"}, {"text": "Include someone who might otherwise be left out.", "author": "Branch School • Kindness"}, {"text": "A leader helps the group become better, not just louder.", "author": "Branch School • Leadership"}, {"text": "Take pride in work that shows your care and effort.", "author": "Branch School • Excellence"}, {"text": "Take ownership of your work, your words, and your choices.", "author": "Branch School • Responsibility"}, {"text": "Treat every person as someone worth hearing.", "author": "Branch School • Respect"}, {"text": "You do not have to master it today; you do have to keep learning.", "author": "Branch School • Perseverance"}, {"text": "Read closely, think carefully, and stay curious.", "author": "Branch School • Learning"}, {"text": "Be the reason someone feels welcome here.", "author": "Branch School • Kindness"}, {"text": "Lead by doing the work you hope others will do.", "author": "Branch School • Leadership"}, {"text": "Do one thing today a little better than yesterday.", "author": "Branch School • Excellence"}, {"text": "A dependable person turns good intentions into action.", "author": "Branch School • Responsibility"}, {"text": "You can disagree and still choose respect.", "author": "Branch School • Respect"}, {"text": "When the first plan fails, change the plan—not the goal.", "author": "Branch School • Perseverance"}, {"text": "Every subject gives you another way to understand the world.", "author": "Branch School • Learning"}, {"text": "Helping another person succeed does not reduce your own success.", "author": "Branch School • Kindness"}, {"text": "Good leaders listen before they decide.", "author": "Branch School • Leadership"}, {"text": "Quality comes from attention to the details that matter.", "author": "Branch School • Excellence"}, {"text": "Finish what you start and give it the care it deserves.", "author": "Branch School • Responsibility"}, {"text": "Good communities grow when people look out for one another.", "author": "Branch School • Respect"}, {"text": "Small improvements add up faster than you think.", "author": "Branch School • Perseverance"}, {"text": "A question asked with courage can help the whole class learn.", "author": "Branch School • Learning"}, {"text": "Kindness is strongest when it becomes a habit.", "author": "Branch School • Kindness"}, {"text": "Confidence and kindness can belong in the same person.", "author": "Branch School • Leadership"}, {"text": "Give your future self something to be proud of.", "author": "Branch School • Excellence"}, {"text": "Preparation is one of the quietest forms of confidence.", "author": "Branch School • Responsibility"}, {"text": "The way you treat others says a lot about your character.", "author": "Branch School • Respect"}, {"text": "Keep going long enough to surprise yourself.", "author": "Branch School • Perseverance"}, {"text": "Knowledge grows when you use it, share it, and question it.", "author": "Branch School • Learning"}, {"text": "Choose words that leave people better than you found them.", "author": "Branch School • Kindness"}, {"text": "Be someone others can count on.", "author": "Branch School • Leadership"}, {"text": "Strong work is built one thoughtful choice at a time.", "author": "Branch School • Excellence"}, {"text": "Responsibility begins with choosing what is right over what is easy.", "author": "Branch School • Responsibility"}, {"text": "Respect includes taking care of the spaces and things we share.", "author": "Branch School • Respect"}, {"text": "Challenge is where stronger skills are built.", "author": "Branch School • Perseverance"}, {"text": "Your brain gets stronger when you give it meaningful work.", "author": "Branch School • Learning"}, {"text": "Look for a chance to help before someone has to ask.", "author": "Branch School • Kindness"}, {"text": "Leadership is using your influence to help others succeed.", "author": "Branch School • Leadership"}, {"text": "Aim for growth, not comparison.", "author": "Branch School • Excellence"}, {"text": "Do the small things well, especially when no one is watching. Put it into practice today.", "author": "Branch School • Responsibility"}, {"text": "Respect is shown in how you listen, speak, and respond. Put it into practice today.", "author": "Branch School • Respect"}, {"text": "A hard problem is an invitation to try a new approach. Put it into practice today.", "author": "Branch School • Perseverance"}, {"text": "Ask a good question today; curiosity opens doors. Put it into practice today.", "author": "Branch School • Learning"}, {"text": "Notice who could use encouragement today. Put it into practice today.", "author": "Branch School • Kindness"}, {"text": "Leadership starts with setting a good example. Put it into practice today.", "author": "Branch School • Leadership"}, {"text": "Your best does not have to be perfect; it has to be sincere. Put it into practice today.", "author": "Branch School • Excellence"}, {"text": "Being responsible means being ready before you are reminded. Put it into practice today.", "author": "Branch School • Responsibility"}, {"text": "Make room for other voices; listening is part of learning. Put it into practice today.", "author": "Branch School • Respect"}, {"text": "Progress often looks like trying one more time. Put it into practice today.", "author": "Branch School • Perseverance"}, {"text": "Learning grows when you connect what you know to something new. Put it into practice today.", "author": "Branch School • Learning"}, {"text": "A small act of kindness can become someone's favorite part of the day. Put it into practice today.", "author": "Branch School • Kindness"}, {"text": "You do not need a title to make a positive difference. Put it into practice today.", "author": "Branch School • Leadership"}, {"text": "Excellence grows from good habits repeated consistently. Put it into practice today.", "author": "Branch School • Excellence"}, {"text": "Your choices today help shape the person you become tomorrow. Put it into practice today.", "author": "Branch School • Responsibility"}, {"text": "Kind words cost nothing and can change someone's whole day. Put it into practice today.", "author": "Branch School • Respect"}, {"text": "Mistakes are evidence that you are stretching your skills. Put it into practice today.", "author": "Branch School • Perseverance"}, {"text": "The best answer sometimes begins with 'I don't know yet.' Put it into practice today.", "author": "Branch School • Learning"}, {"text": "Include someone who might otherwise be left out. Put it into practice today.", "author": "Branch School • Kindness"}, {"text": "A leader helps the group become better, not just louder. Put it into practice today.", "author": "Branch School • Leadership"}, {"text": "Take pride in work that shows your care and effort. Put it into practice today.", "author": "Branch School • Excellence"}, {"text": "Take ownership of your work, your words, and your choices. Put it into practice today.", "author": "Branch School • Responsibility"}, {"text": "Treat every person as someone worth hearing. Put it into practice today.", "author": "Branch School • Respect"}, {"text": "You do not have to master it today; you do have to keep learning. Put it into practice today.", "author": "Branch School • Perseverance"}, {"text": "Read closely, think carefully, and stay curious. Put it into practice today.", "author": "Branch School • Learning"}, {"text": "Be the reason someone feels welcome here. Put it into practice today.", "author": "Branch School • Kindness"}, {"text": "Lead by doing the work you hope others will do. Put it into practice today.", "author": "Branch School • Leadership"}, {"text": "Do one thing today a little better than yesterday. Put it into practice today.", "author": "Branch School • Excellence"}, {"text": "A dependable person turns good intentions into action. Put it into practice today.", "author": "Branch School • Responsibility"}, {"text": "You can disagree and still choose respect. Put it into practice today.", "author": "Branch School • Respect"}, {"text": "When the first plan fails, change the plan—not the goal. Put it into practice today.", "author": "Branch School • Perseverance"}, {"text": "Every subject gives you another way to understand the world. Put it into practice today.", "author": "Branch School • Learning"}, {"text": "Helping another person succeed does not reduce your own success. Put it into practice today.", "author": "Branch School • Kindness"}, {"text": "Good leaders listen before they decide. Put it into practice today.", "author": "Branch School • Leadership"}, {"text": "Quality comes from attention to the details that matter. Put it into practice today.", "author": "Branch School • Excellence"}, {"text": "Finish what you start and give it the care it deserves. Put it into practice today.", "author": "Branch School • Responsibility"}, {"text": "Good communities grow when people look out for one another. Put it into practice today.", "author": "Branch School • Respect"}, {"text": "Small improvements add up faster than you think. Put it into practice today.", "author": "Branch School • Perseverance"}, {"text": "A question asked with courage can help the whole class learn. Put it into practice today.", "author": "Branch School • Learning"}, {"text": "Kindness is strongest when it becomes a habit. Put it into practice today.", "author": "Branch School • Kindness"}, {"text": "Confidence and kindness can belong in the same person. Put it into practice today.", "author": "Branch School • Leadership"}, {"text": "Give your future self something to be proud of. Put it into practice today.", "author": "Branch School • Excellence"}, {"text": "Preparation is one of the quietest forms of confidence. Put it into practice today.", "author": "Branch School • Responsibility"}, {"text": "The way you treat others says a lot about your character. Put it into practice today.", "author": "Branch School • Respect"}, {"text": "Keep going long enough to surprise yourself. Put it into practice today.", "author": "Branch School • Perseverance"}, {"text": "Knowledge grows when you use it, share it, and question it. Put it into practice today.", "author": "Branch School • Learning"}, {"text": "Choose words that leave people better than you found them. Put it into practice today.", "author": "Branch School • Kindness"}, {"text": "Be someone others can count on. Put it into practice today.", "author": "Branch School • Leadership"}, {"text": "Strong work is built one thoughtful choice at a time. Put it into practice today.", "author": "Branch School • Excellence"}, {"text": "Responsibility begins with choosing what is right over what is easy. Put it into practice today.", "author": "Branch School • Responsibility"}, {"text": "Respect includes taking care of the spaces and things we share. Put it into practice today.", "author": "Branch School • Respect"}, {"text": "Challenge is where stronger skills are built. Put it into practice today.", "author": "Branch School • Perseverance"}, {"text": "Your brain gets stronger when you give it meaningful work. Put it into practice today.", "author": "Branch School • Learning"}, {"text": "Look for a chance to help before someone has to ask. Put it into practice today.", "author": "Branch School • Kindness"}, {"text": "Leadership is using your influence to help others succeed. Put it into practice today.", "author": "Branch School • Leadership"}, {"text": "Aim for growth, not comparison. Put it into practice today.", "author": "Branch School • Excellence"}, {"text": "Do the small things well, especially when no one is watching. Look for one chance to show it.", "author": "Branch School • Responsibility"}, {"text": "Respect is shown in how you listen, speak, and respond. Look for one chance to show it.", "author": "Branch School • Respect"}, {"text": "A hard problem is an invitation to try a new approach. Look for one chance to show it.", "author": "Branch School • Perseverance"}, {"text": "Ask a good question today; curiosity opens doors. Look for one chance to show it.", "author": "Branch School • Learning"}, {"text": "Notice who could use encouragement today. Look for one chance to show it.", "author": "Branch School • Kindness"}, {"text": "Leadership starts with setting a good example. Look for one chance to show it.", "author": "Branch School • Leadership"}, {"text": "Your best does not have to be perfect; it has to be sincere. Look for one chance to show it.", "author": "Branch School • Excellence"}, {"text": "Being responsible means being ready before you are reminded. Look for one chance to show it.", "author": "Branch School • Responsibility"}, {"text": "Make room for other voices; listening is part of learning. Look for one chance to show it.", "author": "Branch School • Respect"}, {"text": "Progress often looks like trying one more time. Look for one chance to show it.", "author": "Branch School • Perseverance"}, {"text": "Learning grows when you connect what you know to something new. Look for one chance to show it.", "author": "Branch School • Learning"}, {"text": "A small act of kindness can become someone's favorite part of the day. Look for one chance to show it.", "author": "Branch School • Kindness"}, {"text": "You do not need a title to make a positive difference. Look for one chance to show it.", "author": "Branch School • Leadership"}, {"text": "Excellence grows from good habits repeated consistently. Look for one chance to show it.", "author": "Branch School • Excellence"}, {"text": "Your choices today help shape the person you become tomorrow. Look for one chance to show it.", "author": "Branch School • Responsibility"}, {"text": "Kind words cost nothing and can change someone's whole day. Look for one chance to show it.", "author": "Branch School • Respect"}, {"text": "Mistakes are evidence that you are stretching your skills. Look for one chance to show it.", "author": "Branch School • Perseverance"}, {"text": "The best answer sometimes begins with 'I don't know yet.' Look for one chance to show it.", "author": "Branch School • Learning"}, {"text": "Include someone who might otherwise be left out. Look for one chance to show it.", "author": "Branch School • Kindness"}, {"text": "A leader helps the group become better, not just louder. Look for one chance to show it.", "author": "Branch School • Leadership"}, {"text": "Take pride in work that shows your care and effort. Look for one chance to show it.", "author": "Branch School • Excellence"}, {"text": "Take ownership of your work, your words, and your choices. Look for one chance to show it.", "author": "Branch School • Responsibility"}, {"text": "Treat every person as someone worth hearing. Look for one chance to show it.", "author": "Branch School • Respect"}, {"text": "You do not have to master it today; you do have to keep learning. Look for one chance to show it.", "author": "Branch School • Perseverance"}, {"text": "Read closely, think carefully, and stay curious. Look for one chance to show it.", "author": "Branch School • Learning"}, {"text": "Be the reason someone feels welcome here. Look for one chance to show it.", "author": "Branch School • Kindness"}, {"text": "Lead by doing the work you hope others will do. Look for one chance to show it.", "author": "Branch School • Leadership"}, {"text": "Do one thing today a little better than yesterday. Look for one chance to show it.", "author": "Branch School • Excellence"}, {"text": "A dependable person turns good intentions into action. Look for one chance to show it.", "author": "Branch School • Responsibility"}, {"text": "You can disagree and still choose respect. Look for one chance to show it.", "author": "Branch School • Respect"}, {"text": "When the first plan fails, change the plan—not the goal. Look for one chance to show it.", "author": "Branch School • Perseverance"}, {"text": "Every subject gives you another way to understand the world. Look for one chance to show it.", "author": "Branch School • Learning"}, {"text": "Helping another person succeed does not reduce your own success. Look for one chance to show it.", "author": "Branch School • Kindness"}, {"text": "Good leaders listen before they decide. Look for one chance to show it.", "author": "Branch School • Leadership"}, {"text": "Quality comes from attention to the details that matter. Look for one chance to show it.", "author": "Branch School • Excellence"}, {"text": "Finish what you start and give it the care it deserves. Look for one chance to show it.", "author": "Branch School • Responsibility"}, {"text": "Good communities grow when people look out for one another. Look for one chance to show it.", "author": "Branch School • Respect"}, {"text": "Small improvements add up faster than you think. Look for one chance to show it.", "author": "Branch School • Perseverance"}, {"text": "A question asked with courage can help the whole class learn. Look for one chance to show it.", "author": "Branch School • Learning"}, {"text": "Kindness is strongest when it becomes a habit. Look for one chance to show it.", "author": "Branch School • Kindness"}, {"text": "Confidence and kindness can belong in the same person. Look for one chance to show it.", "author": "Branch School • Leadership"}, {"text": "Give your future self something to be proud of. Look for one chance to show it.", "author": "Branch School • Excellence"}, {"text": "Preparation is one of the quietest forms of confidence. Look for one chance to show it.", "author": "Branch School • Responsibility"}, {"text": "The way you treat others says a lot about your character. Look for one chance to show it.", "author": "Branch School • Respect"}, {"text": "Keep going long enough to surprise yourself. Look for one chance to show it.", "author": "Branch School • Perseverance"}, {"text": "Knowledge grows when you use it, share it, and question it. Look for one chance to show it.", "author": "Branch School • Learning"}, {"text": "Choose words that leave people better than you found them. Look for one chance to show it.", "author": "Branch School • Kindness"}, {"text": "Be someone others can count on. Look for one chance to show it.", "author": "Branch School • Leadership"}, {"text": "Strong work is built one thoughtful choice at a time. Look for one chance to show it.", "author": "Branch School • Excellence"}, {"text": "Responsibility begins with choosing what is right over what is easy. Look for one chance to show it.", "author": "Branch School • Responsibility"}, {"text": "Respect includes taking care of the spaces and things we share. Look for one chance to show it.", "author": "Branch School • Respect"}, {"text": "Challenge is where stronger skills are built. Look for one chance to show it.", "author": "Branch School • Perseverance"}, {"text": "Your brain gets stronger when you give it meaningful work. Look for one chance to show it.", "author": "Branch School • Learning"}, {"text": "Look for a chance to help before someone has to ask. Look for one chance to show it.", "author": "Branch School • Kindness"}, {"text": "Leadership is using your influence to help others succeed. Look for one chance to show it.", "author": "Branch School • Leadership"}, {"text": "Aim for growth, not comparison. Look for one chance to show it.", "author": "Branch School • Excellence"}, {"text": "Do the small things well, especially when no one is watching. Make it part of your day.", "author": "Branch School • Responsibility"}, {"text": "Respect is shown in how you listen, speak, and respond. Make it part of your day.", "author": "Branch School • Respect"}, {"text": "A hard problem is an invitation to try a new approach. Make it part of your day.", "author": "Branch School • Perseverance"}, {"text": "Ask a good question today; curiosity opens doors. Make it part of your day.", "author": "Branch School • Learning"}, {"text": "Notice who could use encouragement today. Make it part of your day.", "author": "Branch School • Kindness"}, {"text": "Leadership starts with setting a good example. Make it part of your day.", "author": "Branch School • Leadership"}, {"text": "Your best does not have to be perfect; it has to be sincere. Make it part of your day.", "author": "Branch School • Excellence"}, {"text": "Being responsible means being ready before you are reminded. Make it part of your day.", "author": "Branch School • Responsibility"}, {"text": "Make room for other voices; listening is part of learning. Make it part of your day.", "author": "Branch School • Respect"}, {"text": "Progress often looks like trying one more time. Make it part of your day.", "author": "Branch School • Perseverance"}, {"text": "Learning grows when you connect what you know to something new. Make it part of your day.", "author": "Branch School • Learning"}, {"text": "A small act of kindness can become someone's favorite part of the day. Make it part of your day.", "author": "Branch School • Kindness"}, {"text": "You do not need a title to make a positive difference. Make it part of your day.", "author": "Branch School • Leadership"}, {"text": "Excellence grows from good habits repeated consistently. Make it part of your day.", "author": "Branch School • Excellence"}, {"text": "Your choices today help shape the person you become tomorrow. Make it part of your day.", "author": "Branch School • Responsibility"}, {"text": "Kind words cost nothing and can change someone's whole day. Make it part of your day.", "author": "Branch School • Respect"}, {"text": "Mistakes are evidence that you are stretching your skills. Make it part of your day.", "author": "Branch School • Perseverance"}, {"text": "The best answer sometimes begins with 'I don't know yet.' Make it part of your day.", "author": "Branch School • Learning"}, {"text": "Include someone who might otherwise be left out. Make it part of your day.", "author": "Branch School • Kindness"}, {"text": "A leader helps the group become better, not just louder. Make it part of your day.", "author": "Branch School • Leadership"}, {"text": "Take pride in work that shows your care and effort. Make it part of your day.", "author": "Branch School • Excellence"}, {"text": "Take ownership of your work, your words, and your choices. Make it part of your day.", "author": "Branch School • Responsibility"}, {"text": "Treat every person as someone worth hearing. Make it part of your day.", "author": "Branch School • Respect"}, {"text": "You do not have to master it today; you do have to keep learning. Make it part of your day.", "author": "Branch School • Perseverance"}, {"text": "Read closely, think carefully, and stay curious. Make it part of your day.", "author": "Branch School • Learning"}, {"text": "Be the reason someone feels welcome here. Make it part of your day.", "author": "Branch School • Kindness"}, {"text": "Lead by doing the work you hope others will do. Make it part of your day.", "author": "Branch School • Leadership"}, {"text": "Do one thing today a little better than yesterday. Make it part of your day.", "author": "Branch School • Excellence"}, {"text": "A dependable person turns good intentions into action. Make it part of your day.", "author": "Branch School • Responsibility"}, {"text": "You can disagree and still choose respect. Make it part of your day.", "author": "Branch School • Respect"}, {"text": "When the first plan fails, change the plan—not the goal. Make it part of your day.", "author": "Branch School • Perseverance"}, {"text": "Every subject gives you another way to understand the world. Make it part of your day.", "author": "Branch School • Learning"}, {"text": "Helping another person succeed does not reduce your own success. Make it part of your day.", "author": "Branch School • Kindness"}, {"text": "Good leaders listen before they decide. Make it part of your day.", "author": "Branch School • Leadership"}, {"text": "Quality comes from attention to the details that matter. Make it part of your day.", "author": "Branch School • Excellence"}, {"text": "Finish what you start and give it the care it deserves. Make it part of your day.", "author": "Branch School • Responsibility"}, {"text": "Good communities grow when people look out for one another. Make it part of your day.", "author": "Branch School • Respect"}, {"text": "Small improvements add up faster than you think. Make it part of your day.", "author": "Branch School • Perseverance"}, {"text": "A question asked with courage can help the whole class learn. Make it part of your day.", "author": "Branch School • Learning"}, {"text": "Kindness is strongest when it becomes a habit. Make it part of your day.", "author": "Branch School • Kindness"}, {"text": "Confidence and kindness can belong in the same person. Make it part of your day.", "author": "Branch School • Leadership"}, {"text": "Give your future self something to be proud of. Make it part of your day.", "author": "Branch School • Excellence"}, {"text": "Preparation is one of the quietest forms of confidence. Make it part of your day.", "author": "Branch School • Responsibility"}, {"text": "The way you treat others says a lot about your character. Make it part of your day.", "author": "Branch School • Respect"}, {"text": "Keep going long enough to surprise yourself. Make it part of your day.", "author": "Branch School • Perseverance"}, {"text": "Knowledge grows when you use it, share it, and question it. Make it part of your day.", "author": "Branch School • Learning"}, {"text": "Choose words that leave people better than you found them. Make it part of your day.", "author": "Branch School • Kindness"}, {"text": "Be someone others can count on. Make it part of your day.", "author": "Branch School • Leadership"}, {"text": "Strong work is built one thoughtful choice at a time. Make it part of your day.", "author": "Branch School • Excellence"}, {"text": "Responsibility begins with choosing what is right over what is easy. Make it part of your day.", "author": "Branch School • Responsibility"}, {"text": "Respect includes taking care of the spaces and things we share. Make it part of your day.", "author": "Branch School • Respect"}, {"text": "Challenge is where stronger skills are built. Make it part of your day.", "author": "Branch School • Perseverance"}, {"text": "Your brain gets stronger when you give it meaningful work. Make it part of your day.", "author": "Branch School • Learning"}, {"text": "Look for a chance to help before someone has to ask. Make it part of your day.", "author": "Branch School • Kindness"}, {"text": "Leadership is using your influence to help others succeed. Make it part of your day.", "author": "Branch School • Leadership"}, {"text": "Aim for growth, not comparison. Make it part of your day.", "author": "Branch School • Excellence"}, {"text": "Do the small things well, especially when no one is watching. Let your actions show it.", "author": "Branch School • Responsibility"}, {"text": "Respect is shown in how you listen, speak, and respond. Let your actions show it.", "author": "Branch School • Respect"}, {"text": "A hard problem is an invitation to try a new approach. Let your actions show it.", "author": "Branch School • Perseverance"}, {"text": "Ask a good question today; curiosity opens doors. Let your actions show it.", "author": "Branch School • Learning"}, {"text": "Notice who could use encouragement today. Let your actions show it.", "author": "Branch School • Kindness"}, {"text": "Leadership starts with setting a good example. Let your actions show it.", "author": "Branch School • Leadership"}, {"text": "Your best does not have to be perfect; it has to be sincere. Let your actions show it.", "author": "Branch School • Excellence"}, {"text": "Being responsible means being ready before you are reminded. Let your actions show it.", "author": "Branch School • Responsibility"}, {"text": "Make room for other voices; listening is part of learning. Let your actions show it.", "author": "Branch School • Respect"}, {"text": "Progress often looks like trying one more time. Let your actions show it.", "author": "Branch School • Perseverance"}, {"text": "Learning grows when you connect what you know to something new. Let your actions show it.", "author": "Branch School • Learning"}, {"text": "A small act of kindness can become someone's favorite part of the day. Let your actions show it.", "author": "Branch School • Kindness"}, {"text": "You do not need a title to make a positive difference. Let your actions show it.", "author": "Branch School • Leadership"}, {"text": "Excellence grows from good habits repeated consistently. Let your actions show it.", "author": "Branch School • Excellence"}, {"text": "Your choices today help shape the person you become tomorrow. Let your actions show it.", "author": "Branch School • Responsibility"}, {"text": "Kind words cost nothing and can change someone's whole day. Let your actions show it.", "author": "Branch School • Respect"}, {"text": "Mistakes are evidence that you are stretching your skills. Let your actions show it.", "author": "Branch School • Perseverance"}, {"text": "The best answer sometimes begins with 'I don't know yet.' Let your actions show it.", "author": "Branch School • Learning"}, {"text": "Include someone who might otherwise be left out. Let your actions show it.", "author": "Branch School • Kindness"}, {"text": "A leader helps the group become better, not just louder. Let your actions show it.", "author": "Branch School • Leadership"}, {"text": "Take pride in work that shows your care and effort. Let your actions show it.", "author": "Branch School • Excellence"}, {"text": "Take ownership of your work, your words, and your choices. Let your actions show it.", "author": "Branch School • Responsibility"}, {"text": "Treat every person as someone worth hearing. Let your actions show it.", "author": "Branch School • Respect"}, {"text": "You do not have to master it today; you do have to keep learning. Let your actions show it.", "author": "Branch School • Perseverance"}, {"text": "Read closely, think carefully, and stay curious. Let your actions show it.", "author": "Branch School • Learning"}, {"text": "Be the reason someone feels welcome here. Let your actions show it.", "author": "Branch School • Kindness"}, {"text": "Lead by doing the work you hope others will do. Let your actions show it.", "author": "Branch School • Leadership"}, {"text": "Do one thing today a little better than yesterday. Let your actions show it.", "author": "Branch School • Excellence"}, {"text": "A dependable person turns good intentions into action. Let your actions show it.", "author": "Branch School • Responsibility"}, {"text": "You can disagree and still choose respect. Let your actions show it.", "author": "Branch School • Respect"}, {"text": "When the first plan fails, change the plan—not the goal. Let your actions show it.", "author": "Branch School • Perseverance"}, {"text": "Every subject gives you another way to understand the world. Let your actions show it.", "author": "Branch School • Learning"}, {"text": "Helping another person succeed does not reduce your own success. Let your actions show it.", "author": "Branch School • Kindness"}, {"text": "Good leaders listen before they decide. Let your actions show it.", "author": "Branch School • Leadership"}, {"text": "Quality comes from attention to the details that matter. Let your actions show it.", "author": "Branch School • Excellence"}, {"text": "Finish what you start and give it the care it deserves. Let your actions show it.", "author": "Branch School • Responsibility"}, {"text": "Good communities grow when people look out for one another. Let your actions show it.", "author": "Branch School • Respect"}, {"text": "Small improvements add up faster than you think. Let your actions show it.", "author": "Branch School • Perseverance"}, {"text": "A question asked with courage can help the whole class learn. Let your actions show it.", "author": "Branch School • Learning"}, {"text": "Kindness is strongest when it becomes a habit. Let your actions show it.", "author": "Branch School • Kindness"}, {"text": "Confidence and kindness can belong in the same person. Let your actions show it.", "author": "Branch School • Leadership"}, {"text": "Give your future self something to be proud of. Let your actions show it.", "author": "Branch School • Excellence"}, {"text": "Preparation is one of the quietest forms of confidence. Let your actions show it.", "author": "Branch School • Responsibility"}, {"text": "The way you treat others says a lot about your character. Let your actions show it.", "author": "Branch School • Respect"}, {"text": "Keep going long enough to surprise yourself. Let your actions show it.", "author": "Branch School • Perseverance"}, {"text": "Knowledge grows when you use it, share it, and question it. Let your actions show it.", "author": "Branch School • Learning"}, {"text": "Choose words that leave people better than you found them. Let your actions show it.", "author": "Branch School • Kindness"}, {"text": "Be someone others can count on. Let your actions show it.", "author": "Branch School • Leadership"}, {"text": "Strong work is built one thoughtful choice at a time. Let your actions show it.", "author": "Branch School • Excellence"}, {"text": "Responsibility begins with choosing what is right over what is easy. Let your actions show it.", "author": "Branch School • Responsibility"}, {"text": "Respect includes taking care of the spaces and things we share. Let your actions show it.", "author": "Branch School • Respect"}, {"text": "Challenge is where stronger skills are built. Let your actions show it.", "author": "Branch School • Perseverance"}, {"text": "Your brain gets stronger when you give it meaningful work. Let your actions show it.", "author": "Branch School • Learning"}, {"text": "Look for a chance to help before someone has to ask. Let your actions show it.", "author": "Branch School • Kindness"}, {"text": "Leadership is using your influence to help others succeed. Let your actions show it.", "author": "Branch School • Leadership"}, {"text": "Aim for growth, not comparison. Let your actions show it.", "author": "Branch School • Excellence"}, {"text": "Do the small things well, especially when no one is watching. One good choice is a great start.", "author": "Branch School • Responsibility"}, {"text": "Respect is shown in how you listen, speak, and respond. One good choice is a great start.", "author": "Branch School • Respect"}, {"text": "A hard problem is an invitation to try a new approach. One good choice is a great start.", "author": "Branch School • Perseverance"}, {"text": "Ask a good question today; curiosity opens doors. One good choice is a great start.", "author": "Branch School • Learning"}, {"text": "Notice who could use encouragement today. One good choice is a great start.", "author": "Branch School • Kindness"}, {"text": "Leadership starts with setting a good example. One good choice is a great start.", "author": "Branch School • Leadership"}, {"text": "Your best does not have to be perfect; it has to be sincere. One good choice is a great start.", "author": "Branch School • Excellence"}, {"text": "Being responsible means being ready before you are reminded. One good choice is a great start.", "author": "Branch School • Responsibility"}, {"text": "Make room for other voices; listening is part of learning. One good choice is a great start.", "author": "Branch School • Respect"}, {"text": "Progress often looks like trying one more time. One good choice is a great start.", "author": "Branch School • Perseverance"}, {"text": "Learning grows when you connect what you know to something new. One good choice is a great start.", "author": "Branch School • Learning"}, {"text": "A small act of kindness can become someone's favorite part of the day. One good choice is a great start.", "author": "Branch School • Kindness"}, {"text": "You do not need a title to make a positive difference. One good choice is a great start.", "author": "Branch School • Leadership"}, {"text": "Excellence grows from good habits repeated consistently. One good choice is a great start.", "author": "Branch School • Excellence"}, {"text": "Your choices today help shape the person you become tomorrow. One good choice is a great start.", "author": "Branch School • Responsibility"}, {"text": "Kind words cost nothing and can change someone's whole day. One good choice is a great start.", "author": "Branch School • Respect"}, {"text": "Mistakes are evidence that you are stretching your skills. One good choice is a great start.", "author": "Branch School • Perseverance"}, {"text": "The best answer sometimes begins with 'I don't know yet.' One good choice is a great start.", "author": "Branch School • Learning"}, {"text": "Include someone who might otherwise be left out. One good choice is a great start.", "author": "Branch School • Kindness"}, {"text": "A leader helps the group become better, not just louder. One good choice is a great start.", "author": "Branch School • Leadership"}, {"text": "Take pride in work that shows your care and effort. One good choice is a great start.", "author": "Branch School • Excellence"}, {"text": "Take ownership of your work, your words, and your choices. One good choice is a great start.", "author": "Branch School • Responsibility"}, {"text": "Treat every person as someone worth hearing. One good choice is a great start.", "author": "Branch School • Respect"}, {"text": "You do not have to master it today; you do have to keep learning. One good choice is a great start.", "author": "Branch School • Perseverance"}, {"text": "Read closely, think carefully, and stay curious. One good choice is a great start.", "author": "Branch School • Learning"}, {"text": "Be the reason someone feels welcome here. One good choice is a great start.", "author": "Branch School • Kindness"}, {"text": "Lead by doing the work you hope others will do. One good choice is a great start.", "author": "Branch School • Leadership"}, {"text": "Do one thing today a little better than yesterday. One good choice is a great start.", "author": "Branch School • Excellence"}, {"text": "A dependable person turns good intentions into action. One good choice is a great start.", "author": "Branch School • Responsibility"}, {"text": "You can disagree and still choose respect. One good choice is a great start.", "author": "Branch School • Respect"}, {"text": "When the first plan fails, change the plan—not the goal. One good choice is a great start.", "author": "Branch School • Perseverance"}, {"text": "Every subject gives you another way to understand the world. One good choice is a great start.", "author": "Branch School • Learning"}, {"text": "Helping another person succeed does not reduce your own success. One good choice is a great start.", "author": "Branch School • Kindness"}, {"text": "Good leaders listen before they decide. One good choice is a great start.", "author": "Branch School • Leadership"}, {"text": "Quality comes from attention to the details that matter. One good choice is a great start.", "author": "Branch School • Excellence"}, {"text": "Finish what you start and give it the care it deserves. One good choice is a great start.", "author": "Branch School • Responsibility"}, {"text": "Good communities grow when people look out for one another. One good choice is a great start.", "author": "Branch School • Respect"}, {"text": "Small improvements add up faster than you think. One good choice is a great start.", "author": "Branch School • Perseverance"}, {"text": "A question asked with courage can help the whole class learn. One good choice is a great start.", "author": "Branch School • Learning"}, {"text": "Kindness is strongest when it becomes a habit. One good choice is a great start.", "author": "Branch School • Kindness"}, {"text": "Confidence and kindness can belong in the same person. One good choice is a great start.", "author": "Branch School • Leadership"}, {"text": "Give your future self something to be proud of. One good choice is a great start.", "author": "Branch School • Excellence"}, {"text": "Preparation is one of the quietest forms of confidence. One good choice is a great start.", "author": "Branch School • Responsibility"}, {"text": "The way you treat others says a lot about your character. One good choice is a great start.", "author": "Branch School • Respect"}, {"text": "Keep going long enough to surprise yourself. One good choice is a great start.", "author": "Branch School • Perseverance"}, {"text": "Knowledge grows when you use it, share it, and question it. One good choice is a great start.", "author": "Branch School • Learning"}, {"text": "Choose words that leave people better than you found them. One good choice is a great start.", "author": "Branch School • Kindness"}, {"text": "Be someone others can count on. One good choice is a great start.", "author": "Branch School • Leadership"}, {"text": "Strong work is built one thoughtful choice at a time. One good choice is a great start.", "author": "Branch School • Excellence"}, {"text": "Responsibility begins with choosing what is right over what is easy. One good choice is a great start.", "author": "Branch School • Responsibility"}, {"text": "Respect includes taking care of the spaces and things we share. One good choice is a great start.", "author": "Branch School • Respect"}, {"text": "Challenge is where stronger skills are built. One good choice is a great start.", "author": "Branch School • Perseverance"}, {"text": "Your brain gets stronger when you give it meaningful work. One good choice is a great start.", "author": "Branch School • Learning"}, {"text": "Look for a chance to help before someone has to ask. One good choice is a great start.", "author": "Branch School • Kindness"}, {"text": "Leadership is using your influence to help others succeed. One good choice is a great start.", "author": "Branch School • Leadership"}, {"text": "Aim for growth, not comparison. One good choice is a great start.", "author": "Branch School • Excellence"}, {"text": "Do the small things well, especially when no one is watching. Carry that idea into your next class.", "author": "Branch School • Responsibility"}, {"text": "Respect is shown in how you listen, speak, and respond. Carry that idea into your next class.", "author": "Branch School • Respect"}, {"text": "A hard problem is an invitation to try a new approach. Carry that idea into your next class.", "author": "Branch School • Perseverance"}, {"text": "Ask a good question today; curiosity opens doors. Carry that idea into your next class.", "author": "Branch School • Learning"}, {"text": "Notice who could use encouragement today. Carry that idea into your next class.", "author": "Branch School • Kindness"}, {"text": "Leadership starts with setting a good example. Carry that idea into your next class.", "author": "Branch School • Leadership"}, {"text": "Your best does not have to be perfect; it has to be sincere. Carry that idea into your next class.", "author": "Branch School • Excellence"}, {"text": "Being responsible means being ready before you are reminded. Carry that idea into your next class.", "author": "Branch School • Responsibility"}, {"text": "Make room for other voices; listening is part of learning. Carry that idea into your next class.", "author": "Branch School • Respect"}, {"text": "Progress often looks like trying one more time. Carry that idea into your next class.", "author": "Branch School • Perseverance"}, {"text": "Learning grows when you connect what you know to something new. Carry that idea into your next class.", "author": "Branch School • Learning"}, {"text": "A small act of kindness can become someone's favorite part of the day. Carry that idea into your next class.", "author": "Branch School • Kindness"}, {"text": "You do not need a title to make a positive difference. Carry that idea into your next class.", "author": "Branch School • Leadership"}, {"text": "Excellence grows from good habits repeated consistently. Carry that idea into your next class.", "author": "Branch School • Excellence"}, {"text": "Your choices today help shape the person you become tomorrow. Carry that idea into your next class.", "author": "Branch School • Responsibility"}, {"text": "Kind words cost nothing and can change someone's whole day. Carry that idea into your next class.", "author": "Branch School • Respect"}, {"text": "Mistakes are evidence that you are stretching your skills. Carry that idea into your next class.", "author": "Branch School • Perseverance"}, {"text": "The best answer sometimes begins with 'I don't know yet.' Carry that idea into your next class.", "author": "Branch School • Learning"}, {"text": "Include someone who might otherwise be left out. Carry that idea into your next class.", "author": "Branch School • Kindness"}, {"text": "A leader helps the group become better, not just louder. Carry that idea into your next class.", "author": "Branch School • Leadership"}, {"text": "Take pride in work that shows your care and effort. Carry that idea into your next class.", "author": "Branch School • Excellence"}, {"text": "Take ownership of your work, your words, and your choices. Carry that idea into your next class.", "author": "Branch School • Responsibility"}, {"text": "Treat every person as someone worth hearing. Carry that idea into your next class.", "author": "Branch School • Respect"}, {"text": "You do not have to master it today; you do have to keep learning. Carry that idea into your next class.", "author": "Branch School • Perseverance"}, {"text": "Read closely, think carefully, and stay curious. Carry that idea into your next class.", "author": "Branch School • Learning"}, {"text": "Be the reason someone feels welcome here. Carry that idea into your next class.", "author": "Branch School • Kindness"}, {"text": "Lead by doing the work you hope others will do. Carry that idea into your next class.", "author": "Branch School • Leadership"}, {"text": "Do one thing today a little better than yesterday. Carry that idea into your next class.", "author": "Branch School • Excellence"}, {"text": "A dependable person turns good intentions into action. Carry that idea into your next class.", "author": "Branch School • Responsibility"}];

function updateDailyQuote(){
  const quote = document.querySelector("blockquote");
  if (!quote) return;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now - start) / 86400000);
  const item = DAILY_QUOTES[(day - 1 + DAILY_QUOTES.length) % DAILY_QUOTES.length];
  quote.innerHTML = `“${item.text}”<small>— ${item.author}</small>`;
}
updateDailyQuote();
