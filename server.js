require("dotenv").config();
const express = require("express");
const path = require("path");
const {
  createJob,
  getJob,
  runPipeline,
  runPublishing,
  getScriptBank,
  addScriptBankItems,
  deleteScriptBankItem
} = require("./lib/orchestrator");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "AHM Studio V8", version: "8.1.0", feature: "script-bank" });
});

app.get("/api/script-bank", async (_req, res) => {
  try {
    res.json(await getScriptBank());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/script-bank", async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.items) ? req.body.items : [];
    const items = raw.map(x => String(x).trim()).filter(Boolean);
    if (!items.length) return res.status(400).json({ error: "No story ideas were supplied." });
    if (items.length > 500) return res.status(400).json({ error: "Maximum 500 ideas per batch." });

    const result = await addScriptBankItems(items);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/script-bank/:id", async (req, res) => {
  try {
    res.json(await deleteScriptBankItem(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/jobs", async (req, res) => {
  try {
    const { idea, targetDuration, source = "bank" } = req.body || {};

    if (!["bank", "ai", "manual"].includes(source)) {
      return res.status(400).json({ error: "Invalid story source." });
    }

    if (source === "manual" && !idea?.trim()) {
      return res.status(400).json({ error: "Please enter your story idea." });
    }

    const job = await createJob({
      idea: source === "manual" ? String(idea).trim() : "",
      source,
      targetDuration: targetDuration || "auto"
    });

    runPipeline(job.id).catch(err => console.error("Pipeline error:", err));
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json(job);
});

app.get("/api/history", (_req, res) => {
  // V8 history is currently in memory on Vercel.
  // Persistent video/history storage will be connected through external storage.
  res.json(require("./lib/orchestrator").getHistory());
});

app.get("/api/jobs/:id/download", (req, res) => {
  const job = getJob(req.params.id);
  const fs = require("fs");
  if (!job || !job.video?.localFinalFile || !fs.existsSync(job.video.localFinalFile)) {
    return res.status(404).json({ error: "Final video file is not available yet." });
  }
  res.download(job.video.localFinalFile, "ahm-studio-video.mp4");
});

app.post("/api/jobs/:id/publish", async (req, res) => {
  try {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found." });
    if (job.status !== "completed") {
      return res.status(400).json({ error: "Generate and review the video first." });
    }
    await runPublishing(job.id);
    res.json(getJob(job.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/settings", (_req, res) => {
  res.json({
    demoMode: String(process.env.DEMO_MODE).toLowerCase() === "true",
    voiceProvider: process.env.VOICE_PROVIDER || "elevenlabs",
    hasRunPod: !!process.env.RUNPOD_ENDPOINT_ID,
    hasVoice: !!process.env.ELEVENLABS_VOICE_ID,
    hasTikTok: !!process.env.TIKTOK_ACCESS_TOKEN,
    hasYouTube: !!process.env.YOUTUBE_REFRESH_TOKEN,
    hasSupabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  });
});

app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, "0.0.0.0", () => {
    console.log(`AHM Studio V8 running on http://localhost:${port}`);
  });
}

module.exports = app;
