const $ = id => document.getElementById(id);
let timer = null;
let currentJobId = null;

async function loadSettings(){
  try {
    const r = await fetch("/api/settings");
    const s = await r.json();
    $("connections").innerHTML = `
      <div>Story AI: <b>${s.demoMode ? "Demo" : "Connected"}</b></div>
      <div>RunPod GPU: <b>${s.hasRunPod ? "Connected" : "Not connected"}</b></div>
      <div>Your voice: <b>${s.hasVoice ? "Voice ID saved" : "Not connected"}</b></div>
      <div>TikTok: <b>${s.hasTikTok ? "Connected" : "Not connected"}</b></div>
      <div>YouTube: <b>${s.hasYouTube ? "Connected" : "Not connected"}</b></div>
      <div>Persistent Story Bank: <b>${s.hasSupabase ? "Connected" : "Browser/server test mode"}</b></div>
    `;
  } catch {
    $("connections").textContent = "Could not load connection status.";
  }
}

async function loadBank(){
  try{
    const r = await fetch("/api/script-bank");
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || "Could not load Story Bank.");

    $("bankCount").textContent = `${data.available} unused`;
    $("availableCount").textContent = data.available;
    $("usedCount").textContent = data.used;
    $("totalCount").textContent = data.total;
    $("bankSummary").textContent =
      data.available
        ? `📚 Story Bank: ${data.available} ideas ready. AHM will take the next unused idea.`
        : `📚 Story Bank is empty. Add your next batch of ideas or let AI create a fresh idea.`;

    $("bankList").innerHTML = data.items.length ? data.items.map(item => `
      <div class="bankItem">
        <div>
          <strong>${escapeHtml(item.text)}</strong>
          <div class="historyMeta">${item.status === "used" ? `USED · ${item.usedAt ? new Date(item.usedAt).toLocaleString() : ""}` : "READY"}</div>
        </div>
        ${item.status !== "used" ? `<button class="mini danger" onclick="deleteBankItem('${item.id}')">DELETE</button>` : ""}
      </div>
    `).join("") : '<p class="muted">No ideas yet. Paste your first batch above.</p>';
  }catch(e){
    $("bankSummary").textContent = "Story Bank could not be loaded.";
  }
}

$("addBank").onclick = async () => {
  const text = $("bankInput").value.trim();
  if(!text) return alert("Paste your story ideas first — one idea per line.");
  const items = text.split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  $("addBank").disabled = true;
  try{
    const r = await fetch("/api/script-bank", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({items})
    });
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || "Could not add ideas.");
    $("bankInput").value = "";
    await loadBank();
    alert(`${data.added} new ideas added to your Story Bank.`);
  }catch(e){
    alert(e.message);
  }finally{
    $("addBank").disabled = false;
  }
};

window.deleteBankItem = async id => {
  if(!confirm("Delete this unused story idea?")) return;
  const r = await fetch(`/api/script-bank/${encodeURIComponent(id)}`, {method:"DELETE"});
  const data = await r.json();
  if(!r.ok) return alert(data.error || "Could not delete idea.");
  loadBank();
};

$("refreshBank").onclick = loadBank;
$("source").onchange = () => {
  const manual = $("source").value === "manual";
  $("idea").classList.toggle("hidden", !manual);
};

loadSettings();
loadHistory();
loadBank();

$("create").onclick = async () => {
  const source = $("source").value;
  const idea = $("idea").value.trim();

  if(source === "manual" && !idea){
    return alert("Enter your idea, or switch Story source to Story Bank / AI.");
  }

  $("create").disabled = true;
  $("jobCard").classList.remove("hidden");
  $("reviewActions").classList.add("hidden");
  $("status").textContent = "GENERATING";

  try{
    const r = await fetch("/api/jobs", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        idea: source === "manual" ? idea : "",
        source,
        targetDuration:$("duration").value
      })
    });
    const job = await r.json();
    if(!r.ok){
      alert(job.error || "Could not start job.");
      $("create").disabled = false;
      return;
    }
    currentJobId = job.id;
    poll(job.id);
    loadBank();
  }catch(e){
    alert(e.message || "Could not start job.");
    $("create").disabled = false;
  }
};

$("downloadBtn").onclick = async () => {
  if (!currentJobId) return;
  const r = await fetch(`/api/jobs/${currentJobId}/download`);
  if (!r.ok) return alert("The final video file is not available yet.");
  const blob = await r.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slugify($("stage").textContent || "ahm-video")}.mp4`;
  a.click();
  URL.revokeObjectURL(a.href);
};

$("postBtn").onclick = async () => {
  if (!currentJobId) return;
  if (!confirm("Post this reviewed video to the connected TikTok/YouTube accounts?")) return;
  $("postBtn").disabled = true;
  try{
    const r = await fetch(`/api/jobs/${currentJobId}/publish`, {method:"POST"});
    const data = await r.json();
    if (!r.ok) return alert(data.error || "Posting failed.");
    alert("Posting request completed. Check History for status.");
    poll(currentJobId);
    loadHistory();
  }finally{
    $("postBtn").disabled = false;
  }
};

$("refreshHistory").onclick = loadHistory;

async function poll(id){
  const r = await fetch(`/api/jobs/${id}`);
  const job = await r.json();
  if(!r.ok){
    $("status").textContent = "ERROR";
    $("result").innerHTML = `<p class="warn">❌ ${escapeHtml(job.error || "Job not found.")}</p>`;
    $("create").disabled = false;
    return;
  }

  $("stage").textContent = job.stage || "Working…";
  $("percent").textContent = `${job.progress || 0}%`;
  $("bar").style.width = `${job.progress || 0}%`;
  $("logs").textContent = (job.logs || [])
    .map(x => `[${new Date(x.at).toLocaleTimeString()}] ${x.message}`)
    .join("\n");

  if(job.status === "completed"){
    $("status").textContent = "READY FOR REVIEW";
    $("reviewActions").classList.remove("hidden");
    $("result").innerHTML = `
      <p class="ok">✅ Video generated and saved to the project history.</p>
      <p class="muted">Review/download it first. Nothing is posted by this button automatically.</p>
      <pre>${escapeHtml(JSON.stringify({
        title:job.story?.title,
        durationSec:job.story?.durationSec,
        source:job.input?.source,
        bankItem:job.input?.bankItemText,
        publishing:job.publishing
      }, null, 2))}</pre>`;
    $("create").disabled = false;
    loadHistory();
    loadBank();
    return;
  }

  if(job.status === "failed"){
    $("status").textContent = "FAILED";
    $("result").innerHTML = `<p class="warn">❌ ${escapeHtml(job.error || "Unknown error")}</p>`;
    $("create").disabled = false;
    loadHistory();
    loadBank();
    return;
  }

  clearTimeout(timer);
  timer = setTimeout(() => poll(id), 1500);
}

async function loadHistory(){
  try{
    const r = await fetch("/api/history");
    const items = await r.json();
    if(!items.length){
      $("history").innerHTML = '<p class="muted">No videos yet. Your generated videos will appear here.</p>';
      return;
    }
    $("history").innerHTML = items.map(j => `
      <div class="historyItem">
        <strong>${escapeHtml(j.story?.title || j.input?.idea || j.input?.bankItemText || "Untitled video")}</strong>
        <div class="historyMeta">
          ${j.story?.durationSec ? `${j.story.durationSec}s · ` : ""}${escapeHtml(j.status || "")}
          · ${new Date(j.createdAt).toLocaleString()}
        </div>
        <div class="historyButtons">
          <button onclick="reviewJob('${j.id}')">OPEN</button>
          ${j.video?.finalVideoUrl ? `<button onclick="window.open('${j.video.finalVideoUrl}','_blank')">VIEW</button>` : ""}
        </div>
      </div>`).join("");
  }catch(e){
    $("history").textContent = "Could not load history.";
  }
}

window.reviewJob = async id => {
  currentJobId = id;
  $("jobCard").classList.remove("hidden");
  poll(id);
  window.scrollTo({top:0,behavior:"smooth"});
};

function slugify(s){
  return String(s).toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-|-$/g,"").slice(0,60) || "ahm-video";
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
