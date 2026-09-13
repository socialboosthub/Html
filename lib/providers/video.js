const https = require("https");

function request(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method,
      headers: { "Content-Type": "application/json", ...headers }
    }, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = { raw: data }; }
        if (res.statusCode >= 400) reject(new Error(parsed.error || parsed.message || data));
        else resolve(parsed);
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function generateVideo({ jobId, story }) {
  if (process.env.DEMO_MODE === "true" || !process.env.RUNPOD_ENDPOINT_ID) {
    return {
      mode: "demo",
      finalVideoUrl: null,
      workerJobId: null,
      note: "Connect RUNPOD_ENDPOINT_ID and a worker implementation for real video generation."
    };
  }

  const url = `https://api.runpod.ai/v2/${process.env.RUNPOD_ENDPOINT_ID}/run`;
  const input = {
    job_type: "ahm_v8_video",
    job_id: jobId,
    aspect_ratio: "9:16",
    duration_sec: story.durationSec,
    story,
    style: {
      visual: "stylized-realistic cinematic 3D",
      annotations: { reveal: "neon green", danger: "red" },
      subtitles: true,
      no_on_screen_generated_text: true,
      characters_do_not_talk: true
    }
  };

  const result = await request(url, "POST", {
    Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`
  }, { input });

  if (!result.id) throw new Error("RunPod did not return a job id.");
  return { mode: "runpod", workerJobId: result.id, finalVideoUrl: null };
}

module.exports = { generateVideo };
