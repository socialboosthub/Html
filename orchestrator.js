const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { generateStoryPackage } = require("./providers/llm");
const { generateVideo } = require("./providers/video");
const { generateVoice } = require("./providers/voice");
const { publishTikTok, publishYouTube } = require("./providers/publisher");

const jobs = new Map();
const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function createJob(input) {
  const id = crypto.randomUUID();
  const job = {
    id,
    createdAt: new Date().toISOString(),
    status: "queued",
    progress: 0,
    stage: "Starting",
    input,
    story: null,
    assets: null,
    video: null,
    voice: null,
    publishing: { tiktok: null, youtube: null },
    logs: []
  };
  jobs.set(id, job);
  save(job);
  return job;
}

function save(job) {
  fs.writeFileSync(path.join(dataDir, `${job.id}.json`), JSON.stringify(job, null, 2));
}

function update(job, patch) {
  Object.assign(job, patch);
  save(job);
}

function log(job, message) {
  job.logs.push({ at: new Date().toISOString(), message });
  save(job);
}

function getJob(id) {
  if (jobs.has(id)) return jobs.get(id);
  const file = path.join(dataDir, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  const job = JSON.parse(fs.readFileSync(file, "utf8"));
  jobs.set(id, job);
  return job;
}

async function runPipeline(id) {
  const job = getJob(id);
  if (!job) throw new Error("Job not found");

  try {
    update(job, { status: "running", progress: 8, stage: "Writing the story" });
    log(job, "Creating a curiosity-driven short story and narration script.");
    const story = await generateStoryPackage(job.input.idea, job.input.targetDuration);
    update(job, { story, progress: 25, stage: "Planning visuals" });

    log(job, `Story duration selected: ${story.durationSec}s.`);
    log(job, `Planned ${story.scenes.length} scenes with recurring assets locked.`);

    update(job, { assets: buildAssetManifest(story), progress: 38, stage: "Generating 3D video" });
    const video = await generateVideo({ jobId: job.id, story });
    update(job, { video, progress: 68, stage: "Creating your voice narration" });

    const voice = await generateVoice({ jobId: job.id, script: story.narration });
    update(job, { voice, progress: 82, stage: "Editing subtitles, music and SFX" });

    // The worker is responsible for the actual final edit. In demo mode it returns
    // a manifest rather than pretending a finished MP4 exists.
    const finalVideo = await finalize(job, video, voice, story);
    update(job, { video: finalVideo, progress: 92, stage: "Publishing" });

    const publishing = {};
    publishing.tiktok = await publishTikTok(finalVideo, story);
    publishing.youtube = await publishYouTube(finalVideo, story);
    // Generation is complete but publishing is intentionally NOT automatic.
    // The user reviews the finished video first and presses POST AUTOMATICALLY.
    update(job, { publishing: { tiktok: { status: "awaiting_review" }, youtube: { status: "awaiting_review" } },
      progress: 100, stage: "Ready for review", status: "completed" });
    log(job, "Video generated and saved. Waiting for manual approval before posting.");
  } catch (err) {
    update(job, { status: "failed", stage: "Error", error: err.message });
    log(job, `ERROR: ${err.message}`);
  }
}

function buildAssetManifest(story) {
  return {
    style: "stylized-realistic cinematic 3D short-form storytelling",
    aspectRatio: "9:16",
    characters: story.characters || [],
    environments: story.environments || [],
    props: story.props || [],
    continuity: "Every recurring asset is reference-driven across scenes."
  };
}

async function finalize(job, video, voice, story) {
  if (process.env.DEMO_MODE === "true") {
    return {
      mode: "demo",
      finalVideoUrl: null,
      note: "Demo mode: generation/edit/publishing providers are not connected yet.",
      editPlan: {
        aspectRatio: "9:16",
        durationSec: story.durationSec,
        subtitles: true,
        music: true,
        sfx: true,
        zoomIns: story.beats.filter(b => b.effect === "zoom"),
        screenShakes: story.beats.filter(b => b.effect === "shake")
      }
    };
  }

  if (!video.finalVideoUrl) {
    throw new Error("Video worker did not return a finalVideoUrl.");
  }
  return { ...video, voice };
}

async function runPublishing(id) {
  const job = getJob(id);
  if (!job) throw new Error("Job not found");
  if (job.status !== "completed") throw new Error("Video is not ready for publishing.");
  const publishing = {};
  publishing.tiktok = await publishTikTok(job.video, job.story);
  publishing.youtube = await publishYouTube(job.video, job.story);
  update(job, { publishing, stage: "Posted / posting status saved" });
  log(job, "Publishing action completed and saved to history.");
  return job;
}

module.exports = { createJob, getJob, runPipeline, runPublishing };
