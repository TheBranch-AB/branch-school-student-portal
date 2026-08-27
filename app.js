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
let classroomAccessToken = "";
let weekCalendarEvents = [];
let classroomAssignments = [];

function initializeCalendarAuth() {
  const clientId = window.PORTAL_CONFIG?.googleClientId || "";

  if (!clientId) return;

  if (!window.google?.accounts?.oauth2) {
    setTimeout(initializeCalendarAuth, 250);
    return;
  }

  calendarTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: [
      "https://www.googleapis.com/auth/calendar.events.readonly",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/classroom.courses.readonly",
      "https://www.googleapis.com/auth/classroom.coursework.me.readonly"
    ].join(" "),
    callback: async tokenResponse => {
      if (tokenResponse.error) {
        console.error("Google data authorization failed:", tokenResponse);
        return;
      }

      calendarAccessToken = tokenResponse.access_token || "";
      classroomAccessToken = tokenResponse.access_token || "";

      await Promise.allSettled([
        loadWeekdayCalendar(),
        loadClassroomAssignments()
      ]);
    }
  });
}

function formatCalendarEventTime(event) {
  const startValue = event?.start?.dateTime || event?.start?.date;
  const endValue = event?.end?.dateTime || event?.end?.date;

  if (!startValue) return "Time not available";

  // Google uses date-only values for all-day events.
  if (event?.start?.date && !event?.start?.dateTime) {
    return "All day";
  }

  const start = new Date(startValue);
  const end = endValue ? new Date(endValue) : null;
  const timeOptions = { hour: "numeric", minute: "2-digit" };
  const startText = start.toLocaleTimeString([], timeOptions);

  if (!end || Number.isNaN(end.getTime())) return startText;
  return `${startText} – ${end.toLocaleTimeString([], timeOptions)}`;
}

function ensureCalendarEventModal() {
  let modal = document.getElementById("branchCalendarEventModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "branchCalendarEventModal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="branch-calendar-backdrop" data-calendar-close></div>
    <section class="branch-calendar-dialog" role="dialog" aria-modal="true" aria-labelledby="branchCalendarEventTitle">
      <button class="branch-calendar-close" type="button" aria-label="Close calendar events" data-calendar-close>×</button>
      <div class="branch-calendar-kicker">Monday – Friday</div>
      <h2 id="branchCalendarEventTitle">Weekly Schedule</h2>
      <div id="branchCalendarEventList" class="branch-calendar-event-list"></div>
      <a class="branch-calendar-open-google" href="https://calendar.google.com/calendar/u/0/r/week" target="_blank" rel="noopener noreferrer">Open Google Calendar ↗</a>
    </section>`;

  const style = document.createElement("style");
  style.id = "branchCalendarEventModalStyles";
  style.textContent = `
    #branchCalendarEventModal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}
    #branchCalendarEventModal.is-open{display:flex}
    #branchCalendarEventModal .branch-calendar-backdrop{position:absolute;inset:0;background:rgba(10,8,24,.72);backdrop-filter:blur(5px)}
    #branchCalendarEventModal .branch-calendar-dialog{position:relative;width:min(560px,100%);max-height:min(72vh,680px);overflow:auto;border-radius:24px;padding:28px;background:#fff;color:#241b3b;box-shadow:0 24px 80px rgba(0,0,0,.35)}
    #branchCalendarEventModal .branch-calendar-close{position:absolute;right:16px;top:12px;border:0;background:transparent;font-size:34px;line-height:1;cursor:pointer;color:#55476f}
    #branchCalendarEventModal .branch-calendar-kicker{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7258a5;margin-bottom:6px}
    #branchCalendarEventModal h2{margin:0 42px 18px 0;font-size:28px}
    #branchCalendarEventModal .branch-calendar-event-list{display:grid;gap:10px}
    #branchCalendarEventModal .branch-calendar-event{padding:14px 16px;border:1px solid rgba(84,64,121,.16);border-radius:16px;background:#f8f6fb}
    #branchCalendarEventModal .branch-calendar-event-date{font-size:12px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;color:#55476f;margin-bottom:2px}
    #branchCalendarEventModal .branch-calendar-event-time{font-size:13px;font-weight:800;color:#7258a5;margin-bottom:4px}
    #branchCalendarEventModal .branch-calendar-event-name{font-size:17px;font-weight:800;color:#241b3b}
    #branchCalendarEventModal .branch-calendar-event-meta{font-size:13px;color:#6a6274;margin-top:5px;white-space:pre-line}
    #branchCalendarEventModal .branch-calendar-empty{padding:18px;border-radius:16px;background:#f8f6fb;color:#6a6274;text-align:center}
    #branchCalendarEventModal .branch-calendar-open-google{display:inline-block;margin-top:18px;font-weight:800;text-decoration:none;color:#6746a5}
  `;

  document.head.appendChild(style);
  document.body.appendChild(modal);

  modal.querySelectorAll("[data-calendar-close]").forEach(el => {
    el.addEventListener("click", closeCalendarEventModal);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeCalendarEventModal();
  });

  return modal;
}

function closeCalendarEventModal() {
  const modal = document.getElementById("branchCalendarEventModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

function getCurrentSchoolWeekBounds() {
  const now = new Date();
  const day = now.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;

  const start = new Date(now);
  start.setDate(now.getDate() - daysFromMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 5); // Saturday 12:00 AM, exclusive
  end.setHours(0, 0, 0, 0);

  return { start, end };
}

function getWeekScheduleItems() {
  const { start, end } = getCurrentSchoolWeekBounds();

  const calendarItems = weekCalendarEvents.map(event => {
    const startDate = new Date(event?.start?.dateTime || event?.start?.date || 0);
    return {
      type: "calendar",
      sortDate: startDate,
      title: event.summary || "Untitled event",
      dateText: Number.isNaN(startDate.getTime()) ? "" : startDate.toLocaleDateString([], {
        weekday: "long", month: "short", day: "numeric"
      }),
      timeText: formatCalendarEventTime(event),
      sourceText: event._calendarName || "Google Calendar",
      details: [event.location, event.description].filter(Boolean).join("\n"),
      url: event.htmlLink || ""
    };
  });

  const classroomItems = classroomAssignments
    .map(work => ({ work, due: classroomDueDateToDate(work) }))
    .filter(item => item.due && item.due >= start && item.due < end)
    .map(({ work, due }) => ({
      type: "classroom",
      sortDate: due,
      title: work.title || "Untitled assignment",
      dateText: due.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }),
      timeText: work.dueTime
        ? due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : "Due this day",
      sourceText: `Google Classroom • ${work.courseName || "Classroom"}`,
      details: work.description || "",
      url: work.alternateLink || "https://classroom.google.com/"
    }));

  const seen = new Set();
  return [...calendarItems, ...classroomItems]
    .filter(item => {
      // Classroom due dates can sometimes also appear as Calendar events. Avoid obvious duplicates.
      const dayKey = Number.isNaN(item.sortDate?.getTime?.())
        ? ""
        : `${item.sortDate.getFullYear()}-${item.sortDate.getMonth() + 1}-${item.sortDate.getDate()}`;
      const key = `${(item.title || "").trim().toLowerCase()}|${dayKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.sortDate - b.sortDate);
}

function updateWeeklyScheduleLabels() {
  const items = getWeekScheduleItems();
  const scheduleBtn = document.querySelector(".schedule-btn");
  const todayCalendarLink = document.querySelector('.reminder-line a[href*="calendar.google.com"]');

  if (scheduleBtn) {
    scheduleBtn.textContent = items.length === 1
      ? "1 Item This Week ›"
      : `${items.length} Items This Week ›`;
    scheduleBtn.dataset.calendarLoaded = "true";
  }

  if (todayCalendarLink) {
    todayCalendarLink.textContent = items.length === 1
      ? "1 item this week"
      : `${items.length} items this week`;
  }
}

function showWeekdayCalendarEvents() {
  const modal = ensureCalendarEventModal();
  const list = modal.querySelector("#branchCalendarEventList");
  const title = modal.querySelector("#branchCalendarEventTitle");

  if (!list || !title) return;

  const weekItems = getWeekScheduleItems();

  title.textContent = weekItems.length === 1
    ? "1 Item This Week"
    : `${weekItems.length} Items This Week`;

  list.innerHTML = "";

  if (!weekItems.length) {
    list.innerHTML = '<div class="branch-calendar-empty">No calendar events or Classroom due dates are scheduled Monday through Friday this week.</div>';
  } else {
    weekItems.forEach(scheduleItem => {
      const item = document.createElement(scheduleItem.url ? "a" : "div");
      item.className = "branch-calendar-event";

      if (scheduleItem.url) {
        item.href = scheduleItem.url;
        item.target = "_blank";
        item.rel = "noopener noreferrer";
        item.style.textDecoration = "none";
        item.style.color = "inherit";
      }

      const date = document.createElement("div");
      date.className = "branch-calendar-event-date";
      date.textContent = scheduleItem.dateText || "";

      const time = document.createElement("div");
      time.className = "branch-calendar-event-time";
      time.textContent = scheduleItem.timeText || "";

      const name = document.createElement("div");
      name.className = "branch-calendar-event-name";
      name.textContent = scheduleItem.title || "Untitled item";

      if (date.textContent) item.appendChild(date);
      if (time.textContent) item.appendChild(time);
      item.appendChild(name);

      const details = [scheduleItem.sourceText, scheduleItem.details].filter(Boolean).join("\n");
      if (details) {
        const meta = document.createElement("div");
        meta.className = "branch-calendar-event-meta";
        meta.textContent = details;
        item.appendChild(meta);
      }

      list.appendChild(item);
    });
  }

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

async function loadWeekdayCalendar() {
  if (!calendarAccessToken) return;

  // Current school week: Monday 12:00 AM through Saturday 12:00 AM.
  // Saturday is the exclusive end, so weekends are never included.
  const { start, end } = getCurrentSchoolWeekBounds();

  const scheduleBtn = document.querySelector(".schedule-btn");

  try {
    if (scheduleBtn) scheduleBtn.textContent = "Loading schedule…";

    // Google Calendar's web UI can display events from several calendars at once
    // (primary, Classroom course calendars, shared calendars, etc.).  Querying only
    // /calendars/primary/events misses those.  First get the student's calendar
    // list, then combine events from every calendar that is currently selected.
    const calendarListResponse = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&showHidden=false&maxResults=250",
      {
        headers: { Authorization: `Bearer ${calendarAccessToken}` }
      }
    );

    if (!calendarListResponse.ok) {
      const body = await calendarListResponse.text();
      throw new Error(`Calendar list API HTTP ${calendarListResponse.status}: ${body}`);
    }

    const calendarListData = await calendarListResponse.json();
    const calendars = (calendarListData.items || []).filter(calendar => {
      // Match what the student normally sees in Google Calendar. Primary is always
      // included; other calendars are included unless Google marks them selected:false.
      return calendar.primary || calendar.selected !== false;
    });

    // Safety fallback in case Google returns an empty calendar list.
    if (!calendars.length) {
      calendars.push({ id: "primary", summary: "Primary", primary: true });
    }

    const params = new URLSearchParams({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "50"
    });

    const eventResults = await Promise.allSettled(
      calendars.map(async calendar => {
        const calendarId = encodeURIComponent(calendar.id || "primary");
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`,
          {
            headers: { Authorization: `Bearer ${calendarAccessToken}` }
          }
        );

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`${calendar.summary || calendar.id}: HTTP ${response.status}: ${body}`);
        }

        const data = await response.json();
        return (data.items || []).map(event => ({
          ...event,
          _calendarId: calendar.id,
          _calendarName: calendar.summary || "Calendar"
        }));
      })
    );

    const combinedEvents = [];
    eventResults.forEach(result => {
      if (result.status === "fulfilled") {
        combinedEvents.push(...result.value);
      } else {
        console.warn("Could not load one calendar:", result.reason);
      }
    });

    // Remove accidental duplicates and sort the combined week chronologically.
    const seen = new Set();
    weekCalendarEvents = combinedEvents
      .filter(event => {
        const key = [
          event.iCalUID || event.id || "",
          event?.start?.dateTime || event?.start?.date || "",
          event.summary || ""
        ].join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const aTime = new Date(a?.start?.dateTime || a?.start?.date || 0).getTime();
        const bTime = new Date(b?.start?.dateTime || b?.start?.date || 0).getTime();
        return aTime - bTime;
      });

    console.log("Weekday calendars checked:", calendars.map(c => c.summary || c.id));
    console.log("Weekday calendar events:", weekCalendarEvents);

    updateWeeklyScheduleLabels();
  } catch (error) {
    console.error("Calendar loading failed:", error);
    weekCalendarEvents = [];
    if (scheduleBtn) {
      scheduleBtn.textContent = "Calendar unavailable";
      scheduleBtn.dataset.calendarLoaded = "false";
    }
  }
}

function classroomDueDateToDate(courseWork) {
  const dueDate = courseWork?.dueDate;
  if (!dueDate?.year || !dueDate?.month || !dueDate?.day) return null;

  const dueTime = courseWork?.dueTime || {};
  return new Date(
    dueDate.year,
    dueDate.month - 1,
    dueDate.day,
    Number(dueTime.hours || 23),
    Number(dueTime.minutes || 59),
    Number(dueTime.seconds || 0)
  );
}

function formatClassroomDueDate(courseWork) {
  const due = classroomDueDateToDate(courseWork);
  if (!due) return "No due date";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const dayDiff = Math.round((dueDay - today) / 86400000);

  const timeText = courseWork?.dueTime
    ? due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";

  if (dayDiff === 0) return `Due today${timeText ? " at " + timeText : ""}`;
  if (dayDiff === 1) return `Due tomorrow${timeText ? " at " + timeText : ""}`;

  const dateText = due.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
  return `Due ${dateText}${timeText ? " at " + timeText : ""}`;
}

function ensureClassroomModal() {
  let modal = document.getElementById("branchClassroomModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "branchClassroomModal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="branch-classroom-backdrop" data-classroom-close></div>
    <section class="branch-classroom-dialog" role="dialog" aria-modal="true" aria-labelledby="branchClassroomTitle">
      <button class="branch-classroom-close" type="button" aria-label="Close Classroom assignments" data-classroom-close>×</button>
      <div class="branch-classroom-kicker">Google Classroom</div>
      <h2 id="branchClassroomTitle">Upcoming Assignments</h2>
      <div id="branchClassroomList" class="branch-classroom-list"></div>
      <a class="branch-classroom-open-google" href="https://classroom.google.com/" target="_blank" rel="noopener noreferrer">Open Google Classroom ↗</a>
    </section>`;

  const style = document.createElement("style");
  style.id = "branchClassroomModalStyles";
  style.textContent = `
    #branchClassroomModal{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;padding:20px}
    #branchClassroomModal.is-open{display:flex}
    #branchClassroomModal .branch-classroom-backdrop{position:absolute;inset:0;background:rgba(10,8,24,.72);backdrop-filter:blur(5px)}
    #branchClassroomModal .branch-classroom-dialog{position:relative;width:min(640px,100%);max-height:min(78vh,760px);overflow:auto;border-radius:24px;padding:28px;background:#fff;color:#241b3b;box-shadow:0 24px 80px rgba(0,0,0,.35)}
    #branchClassroomModal .branch-classroom-close{position:absolute;right:16px;top:12px;border:0;background:transparent;font-size:34px;line-height:1;cursor:pointer;color:#55476f}
    #branchClassroomModal .branch-classroom-kicker{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#2e7d5b;margin-bottom:6px}
    #branchClassroomModal h2{margin:0 42px 18px 0;font-size:28px}
    #branchClassroomModal .branch-classroom-list{display:grid;gap:10px}
    #branchClassroomModal .branch-classroom-item{display:block;padding:14px 16px;border:1px solid rgba(46,125,91,.17);border-radius:16px;background:#f6faf8;text-decoration:none;color:inherit}
    #branchClassroomModal .branch-classroom-item:hover{background:#edf7f2}
    #branchClassroomModal .branch-classroom-course{font-size:12px;font-weight:800;color:#2e7d5b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
    #branchClassroomModal .branch-classroom-name{font-size:17px;font-weight:800;color:#241b3b}
    #branchClassroomModal .branch-classroom-due{font-size:13px;font-weight:700;color:#7258a5;margin-top:5px}
    #branchClassroomModal .branch-classroom-description{font-size:13px;color:#6a6274;margin-top:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    #branchClassroomModal .branch-classroom-empty{padding:18px;border-radius:16px;background:#f6faf8;color:#6a6274;text-align:center}
    #branchClassroomModal .branch-classroom-open-google{display:inline-block;margin-top:18px;font-weight:800;text-decoration:none;color:#2e7d5b}
  `;

  document.head.appendChild(style);
  document.body.appendChild(modal);

  modal.querySelectorAll("[data-classroom-close]").forEach(el => {
    el.addEventListener("click", closeClassroomModal);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeClassroomModal();
  });

  return modal;
}

function closeClassroomModal() {
  const modal = document.getElementById("branchClassroomModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

function showClassroomAssignments() {
  const modal = ensureClassroomModal();
  const list = modal.querySelector("#branchClassroomList");
  const title = modal.querySelector("#branchClassroomTitle");
  if (!list || !title) return;

  title.textContent = classroomAssignments.length === 1
    ? "1 Upcoming Assignment"
    : `${classroomAssignments.length} Upcoming Assignments`;
  list.innerHTML = "";

  if (!classroomAssignments.length) {
    list.innerHTML = '<div class="branch-classroom-empty">No upcoming assignments were found.</div>';
  } else {
    classroomAssignments.forEach(item => {
      const link = document.createElement("a");
      link.className = "branch-classroom-item";
      link.href = item.alternateLink || "https://classroom.google.com/";
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      const course = document.createElement("div");
      course.className = "branch-classroom-course";
      course.textContent = item.courseName || "Google Classroom";

      const name = document.createElement("div");
      name.className = "branch-classroom-name";
      name.textContent = item.title || "Untitled assignment";

      const due = document.createElement("div");
      due.className = "branch-classroom-due";
      due.textContent = formatClassroomDueDate(item);

      link.append(course, name, due);

      if (item.description) {
        const description = document.createElement("div");
        description.className = "branch-classroom-description";
        description.textContent = item.description;
        link.appendChild(description);
      }

      list.appendChild(link);
    });
  }

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

async function classroomFetch(url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${classroomAccessToken}` }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Classroom API HTTP ${response.status}: ${body}`);
  }
  return response.json();
}

async function loadClassroomAssignments() {
  if (!classroomAccessToken) return;

  try {
    const coursesData = await classroomFetch(
      "https://classroom.googleapis.com/v1/courses?studentId=me&courseStates=ACTIVE&pageSize=100"
    );
    const courses = coursesData.courses || [];

    const results = await Promise.allSettled(courses.map(async course => {
      const data = await classroomFetch(
        `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(course.id)}/courseWork?courseWorkStates=PUBLISHED&pageSize=100`
      );
      return (data.courseWork || []).map(work => ({ ...work, courseName: course.name || "Classroom" }));
    }));

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const futureLimit = new Date(startOfToday);
    futureLimit.setDate(futureLimit.getDate() + 60);

    classroomAssignments = results
      .filter(result => result.status === "fulfilled")
      .flatMap(result => result.value)
      .filter(work => work.workType === "ASSIGNMENT" || work.workType === "SHORT_ANSWER_QUESTION" || work.workType === "MULTIPLE_CHOICE_QUESTION")
      .filter(work => {
        const due = classroomDueDateToDate(work);
        return !due || (due >= startOfToday && due <= futureLimit);
      })
      .sort((a, b) => {
        const aDue = classroomDueDateToDate(a);
        const bDue = classroomDueDateToDate(b);
        if (!aDue && !bDue) return 0;
        if (!aDue) return 1;
        if (!bDue) return -1;
        return aDue - bDue;
      })
      .slice(0, 20);

    console.log("Upcoming Classroom assignments:", classroomAssignments);
    updateClassroomLinkLabel();
    updateWeeklyScheduleLabels();
  } catch (error) {
    console.error("Classroom loading failed:", error);
    classroomAssignments = [];
    updateClassroomLinkLabel(true);
    updateWeeklyScheduleLabels();
  }
}

function findClassroomLinks() {
  return [...document.querySelectorAll('a[href*="classroom.google.com"]')];
}

function updateClassroomLinkLabel(failed = false) {
  findClassroomLinks().forEach(link => {
    link.dataset.classroomLoaded = failed ? "false" : "true";
    link.setAttribute("aria-label", failed
      ? "Open Google Classroom"
      : `Show ${classroomAssignments.length} upcoming Classroom assignments`);
  });
}

function handleClassroomClick(event) {
  const link = event.currentTarget;

  if (classroomAccessToken && link?.dataset.classroomLoaded === "true") {
    event.preventDefault();
    event.stopPropagation();
    showClassroomAssignments();
    return;
  }

  if (!classroomAccessToken && calendarTokenClient) {
    event.preventDefault();
    event.stopPropagation();
    calendarTokenClient.requestAccessToken({ prompt: "" });
  }
}

function wireClassroomLinks() {
  findClassroomLinks().forEach(link => {
    if (link.dataset.classroomWired === "true") return;
    link.dataset.classroomWired = "true";
    link.addEventListener("click", handleClassroomClick);
  });
}

function requestCalendarAccess() {
  if (!calendarTokenClient) {
    console.error("Calendar OAuth is not ready yet.");
    return;
  }

  // This is only used when the portal does not yet have Calendar access.
  calendarTokenClient.requestAccessToken({ prompt: "" });
}

function handleCalendarButtonClick(event) {
  event.preventDefault();
  event.stopPropagation();

  const scheduleBtn = event.currentTarget;

  // Once events are loaded, clicking the count opens the event list and NEVER
  // starts another OAuth popup.
  if (scheduleBtn?.dataset.calendarLoaded === "true" || calendarAccessToken) {
    showWeekdayCalendarEvents();
    return;
  }

  // First-use fallback: request Calendar permission only if we truly do not
  // have a token yet. The OAuth callback will load this week's weekday events afterward.
  requestCalendarAccess();
}

function wireCalendarButton() {
  const scheduleBtn = document.querySelector(".schedule-btn");
  if (!scheduleBtn) return;

  scheduleBtn.removeAttribute("href");
  scheduleBtn.setAttribute("role", "button");
  scheduleBtn.setAttribute("aria-label", "Show this week's Monday through Friday calendar events");
  scheduleBtn.style.cursor = "pointer";
  scheduleBtn.addEventListener("click", handleCalendarButtonClick);
}

initializeCalendarAuth();
wireCalendarButton();
wireClassroomLinks();

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
