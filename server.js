require("dotenv").config();
const express = require("express");
const path = require("path");
const { createJob, getJob, runPipeline } = require("./lib/orchestrator");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "AHM Studio V8", version: "8.0.0" });
});

app.post("/api/jobs", async (req, res) => {
  try {
    const { idea, targetDuration } = req.body || {};
    if (!idea || !String(idea).trim()) {
      return res.status(400).json({ error: "Please enter a story idea." });
    }
    const job = createJob({
      idea: String(idea).trim(),
      targetDuration: targetDuration || "auto"
    });
    // Start in the background so the browser gets a job id immediately.
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
  const fs = require("fs");
  const dir = path.join(__dirname, "data");
  if (!fs.existsSync(dir)) return res.json([]);
  const items = fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; } })
    .filter(Boolean)
    .sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json(items);
});

app.get("/api/jobs/:id/download", (req, res) => {
  const job = getJob(req.params.id);
  if (!job || !job.video?.localFinalFile || !require("fs").existsSync(job.video.localFinalFile)) {
    return res.status(404).json({ error: "Final video file is not available." });
  }
  res.download(job.video.localFinalFile, "ahm-studio-video.mp4");
});

app.post("/api/jobs/:id/publish", async (req, res) => {
  const { runPublishing } = require("./lib/orchestrator");
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  if (job.status !== "completed") return res.status(400).json({ error: "Generate and review the video first." });
  try {
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
    hasYouTube: !!process.env.YOUTUBE_REFRESH_TOKEN
  });
});

app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => {
  console.log(`AHM Studio V8 running on http://localhost:${port}`);
});
