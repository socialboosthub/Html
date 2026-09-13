const $ = id => document.getElementById(id);
let timer = null;
let currentJobId = null;

async function loadSettings(){
  const r = await fetch("/api/settings");
  const s = await r.json();
  $("connections").innerHTML = `
    <div>Story AI: <b>${s.demoMode ? "Demo" : "Connected"}</b></div>
    <div>RunPod GPU: <b>${s.hasRunPod ? "Connected" : "Not connected"}</b></div>
    <div>Your voice: <b>${s.hasVoice ? "Voice ID saved" : "Not connected"}</b></div>
    <div>TikTok: <b>${s.hasTikTok ? "Connected" : "Not connected"}</b></div>
    <div>YouTube: <b>${s.hasYouTube ? "Connected" : "Not connected"}</b></div>
  `;
}
loadSettings();
loadHistory();

$("create").onclick = async () => {
  const idea = $("idea").value.trim();
  if (!idea) return alert("Enter a story idea first.");
  $("create").disabled = true;
  $("jobCard").classList.remove("hidden");
  $("reviewActions").classList.add("hidden");
  $("status").textContent = "GENERATING";
  const r = await fetch("/api/jobs", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({idea, targetDuration:$("duration").value})
  });
  const job = await r.json();
  if (!r.ok) {
    alert(job.error || "Could not start job.");
    $("create").disabled = false;
    return;
  }
  currentJobId = job.id;
  poll(job.id);
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
  const r = await fetch(`/api/jobs/${currentJobId}/publish`, {method:"POST"});
  const data = await r.json();
  $("postBtn").disabled = false;
  if (!r.ok) return alert(data.error || "Posting failed.");
  alert("Posting request completed. Check the History section for status.");
  poll(currentJobId);
  loadHistory();
};

$("refreshHistory").onclick = loadHistory;

async function poll(id){
  const r = await fetch(`/api/jobs/${id}`);
  const job = await r.json();
  $("stage").textContent = job.stage || "Working…";
  $("percent").textContent = `${job.progress || 0}%`;
  $("bar").style.width = `${job.progress || 0}%`;
  $("logs").textContent = (job.logs || []).map(x => `[${new Date(x.at).toLocaleTimeString()}] ${x.message}`).join("\n");

  if(job.status === "completed"){
    $("status").textContent = "READY FOR REVIEW";
    $("reviewActions").classList.remove("hidden");
    $("result").innerHTML = `
      <p class="ok">✅ Video generated and saved to the project history.</p>
      <p class="muted">Nothing is posted automatically at this stage. Review/download it first, then choose <b>POST AUTOMATICALLY</b> if you approve it.</p>
      <pre>${escapeHtml(JSON.stringify({title:job.story?.title,durationSec:job.story?.durationSec,publishing:job.publishing}, null, 2))}</pre>`;
    $("create").disabled = false;
    loadHistory();
    return;
  }
  if(job.status === "failed"){
    $("status").textContent = "FAILED";
    $("result").innerHTML = `<p class="warn">❌ ${escapeHtml(job.error || "Unknown error")}</p>`;
    $("create").disabled = false;
    loadHistory();
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
        <strong>${escapeHtml(j.story?.title || j.input?.idea || "Untitled video")}</strong>
        <div class="historyMeta">
          ${j.story?.durationSec ? `${j.story.durationSec}s · ` : ""}${escapeHtml(j.status || "")}
          · ${new Date(j.createdAt).toLocaleString()}
        </div>
        <div class="historyButtons">
          <button onclick="reviewJob('${j.id}')">OPEN</button>
          ${j.video?.finalVideoUrl ? `<button onclick="window.open('${j.video.finalVideoUrl}','_blank')">VIEW</button>` : ""}
        </div>
      </div>`).join("");
  }catch(e){ $("history").textContent = "Could not load history."; }
}

window.reviewJob = async id => {
  currentJobId = id;
  $("jobCard").classList.remove("hidden");
  poll(id);
  window.scrollTo({top:0,behavior:"smooth"});
};

function slugify(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60) || "ahm-video"; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
