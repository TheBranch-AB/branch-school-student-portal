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
    email && email.endsWith("@thebranchschool.org") ? "Branch account" : "Not connected";
}
setStudentInfo();

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


/* Web OAuth hook:
   Later, after Google Identity Services returns a signed-in user, call:
   setStudentInfo("Student Name", "student@thebranchschool.org");
*/
