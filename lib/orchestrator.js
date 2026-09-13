const crypto = require("crypto");

const { generateStoryPackage } = require("./providers/llm");
const { generateVideo } = require("./providers/video");
const { generateVoice } = require("./providers/voice");
const {
  publishTikTok,
  publishYouTube
} = require("./providers/publisher");

/*
  AHM Studio V8
  Vercel-safe orchestrator.

  IMPORTANT:
  Vercel functions do not use the deployment filesystem
  as persistent application storage.

  For now jobs are kept in memory so the application can
  boot and run correctly on Vercel.

  Permanent History/video storage will be connected later
  using external persistent storage.
*/

const jobs = new Map();

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

    publishing: {
      tiktok: null,
      youtube: null
    },

    logs: []
  };

  jobs.set(id, job);

  return job;
}

function update(job, patch) {
  Object.assign(job, patch);
}

function log(job, message) {
  job.logs.push({
    at: new Date().toISOString(),
    message
  });
}

function getJob(id) {
  return jobs.get(id) || null;
}

async function runPipeline(id) {
  const job = getJob(id);

  if (!job) {
    throw new Error("Job not found");
  }

  try {
    update(job, {
      status: "running",
      progress: 8,
      stage: "Writing the story"
    });

    log(
      job,
      "Creating a curiosity-driven short story and narration script."
    );

    const story = await generateStoryPackage(
      job.input.idea,
      job.input.targetDuration
    );

    update(job, {
      story,
      progress: 25,
      stage: "Planning visuals"
    });

    log(
      job,
      `Story duration selected: ${story.durationSec}s.`
    );

    log(
      job,
      `Planned ${story.scenes.length} scenes with recurring assets locked.`
    );

    const assets = buildAssetManifest(story);

    update(job, {
      assets,
      progress: 38,
      stage: "Generating 3D video"
    });

    const video = await generateVideo({
      jobId: job.id,
      story
    });

    update(job, {
      video,
      progress: 68,
      stage: "Creating your voice narration"
    });

    const voice = await generateVoice({
      jobId: job.id,
      script: story.narration
    });

    update(job, {
      voice,
      progress: 82,
      stage: "Editing subtitles, music and SFX"
    });

    const finalVideo = await finalize(
      job,
      video,
      voice,
      story
    );

    update(job, {
      video: finalVideo,
      progress: 100,
      stage: "Ready for review",
      status: "completed",

      publishing: {
        tiktok: {
          status: "awaiting_review"
        },

        youtube: {
          status: "awaiting_review"
        }
      }
    });

    log(
      job,
      "Video generation finished. Waiting for user review before publishing."
    );

    return job;

  } catch (err) {

    update(job, {
      status: "failed",
      stage: "Error",
      error: err.message
    });

    log(
      job,
      `ERROR: ${err.message}`
    );

    return job;
  }
}

function buildAssetManifest(story) {
  return {
    style:
      "stylized-realistic cinematic 3D short-form storytelling",

    aspectRatio: "9:16",

    characters: story.characters || [],

    environments: story.environments || [],

    props: story.props || [],

    continuity:
      "Every recurring asset is reference-driven across scenes."
  };
}

async function finalize(
  job,
  video,
  voice,
  story
) {
  if (
    String(process.env.DEMO_MODE).toLowerCase() === "true"
  ) {

    return {
      mode: "demo",

      finalVideoUrl: null,

      note:
        "Demo mode: generation/edit/publishing providers are not connected yet.",

      editPlan: {
        aspectRatio: "9:16",

        durationSec:
          story.durationSec,

        subtitles: true,

        music: true,

        sfx: true,

        zoomIns:
          (story.beats || []).filter(
            b => b.effect === "zoom"
          ),

        screenShakes:
          (story.beats || []).filter(
            b => b.effect === "shake"
          )
      }
    };
  }

  if (!video || !video.finalVideoUrl) {
    throw new Error(
      "Video worker did not return a finalVideoUrl."
    );
  }

  return {
    ...video,
    voice
  };
}

async function runPublishing(id) {
  const job = getJob(id);

  if (!job) {
    throw new Error("Job not found");
  }

  if (job.status !== "completed") {
    throw new Error(
      "Video is not ready for publishing."
    );
  }

  const publishing = {};

  publishing.tiktok =
    await publishTikTok(
      job.video,
      job.story
    );

  publishing.youtube =
    await publishYouTube(
      job.video,
      job.story
    );

  update(job, {
    publishing,

    stage:
      "Posted / posting status saved"
  });

  log(
    job,
    "Publishing action completed."
  );

  return job;
}

module.exports = {
  createJob,
  getJob,
  runPipeline,
  runPublishing
};
