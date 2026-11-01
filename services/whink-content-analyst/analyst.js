#!/usr/bin/env node
/**
 * WHINK Content Analyst
 * Reverse-engineers any YouTube or Instagram video using Gemini 1.5 Pro.
 *
 * Usage:
 *   node analyst.js <url>
 *   node analyst.js <url> --output json
 *   GEMINI_API_KEY=your_key node analyst.js <url>
 *
 * Env vars:
 *   GEMINI_API_KEY  — required. Get one free at https://aistudio.google.com/app/apikey
 */

const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");

// ─── Config ──────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OUTPUT_FORMAT = process.argv.includes("--output")
  ? process.argv[process.argv.indexOf("--output") + 1]
  : "text";
const URL_ARG = process.argv.find(a => a.startsWith("http"));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  if (OUTPUT_FORMAT !== "json") process.stderr.write(`[WHINK] ${msg}\n`);
}

function fail(msg) {
  console.error(`[WHINK ERROR] ${msg}`);
  process.exit(1);
}

function isYouTube(url) {
  return /youtube\.com|youtu\.be/.test(url);
}

function isInstagram(url) {
  return /instagram\.com/.test(url);
}

// ─── Video Download ───────────────────────────────────────────────────────────

function downloadVideo(url, tmpDir) {
  log(`Downloading video from: ${url}`);

  const outTemplate = path.join(tmpDir, "video.%(ext)s");

  // Download best quality up to 1080p, prefer mp4
  const result = spawnSync("yt-dlp", [
    "--format", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]",
    "--merge-output-format", "mp4",
    "--output", outTemplate,
    "--no-playlist",
    "--quiet",
    "--no-warnings",
    // Instagram and YouTube specific
    "--add-header", "User-Agent:Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    url
  ], { encoding: "utf8", timeout: 120000 });

  if (result.status !== 0) {
    // Try fallback: any format
    log("MP4 download failed, trying any format...");
    const fallback = spawnSync("yt-dlp", [
      "--format", "best[height<=720]/best",
      "--output", outTemplate,
      "--no-playlist",
      "--quiet",
      url
    ], { encoding: "utf8", timeout: 120000 });

    if (fallback.status !== 0) {
      fail(`Download failed: ${result.stderr || fallback.stderr}\n\nMake sure the video is public.`);
    }
  }

  // Find the downloaded file
  const files = fs.readdirSync(tmpDir).filter(f => f.startsWith("video."));
  if (!files.length) fail("Download completed but no video file found.");

  const videoPath = path.join(tmpDir, files[0]);
  const stats = fs.statSync(videoPath);
  log(`Downloaded: ${files[0]} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

  return videoPath;
}

// ─── Get Video Metadata ───────────────────────────────────────────────────────

function getMetadata(url) {
  log("Fetching video metadata...");

  const result = spawnSync("yt-dlp", [
    "--dump-json",
    "--no-playlist",
    "--no-warnings",
    url
  ], { encoding: "utf8", timeout: 30000 });

  if (result.status !== 0) return null;

  try {
    const data = JSON.parse(result.stdout);
    return {
      title: data.title,
      description: data.description,
      duration: data.duration,
      view_count: data.view_count,
      like_count: data.like_count,
      uploader: data.uploader || data.channel,
      upload_date: data.upload_date,
      tags: data.tags,
      categories: data.categories,
    };
  } catch {
    return null;
  }
}

// ─── Gemini File Upload ───────────────────────────────────────────────────────

function uploadToGemini(filePath) {
  log("Uploading video to Gemini Files API...");

  const stats = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".avi": "video/avi",
  };
  const mimeType = mimeTypes[ext] || "video/mp4";

  return new Promise((resolve, reject) => {
    // Step 1: Initiate resumable upload
    const initBody = JSON.stringify({
      file: { display_name: path.basename(filePath) }
    });

    const initOptions = {
      hostname: "uploadfiltering.googleapis.com",
      path: "/upload/v1beta/files?uploadType=resumable",
      method: "POST",
      headers: {
        "X-Goog-Api-Key": GEMINI_API_KEY,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": stats.size,
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(initBody),
      }
    };

    // Use the correct Files API endpoint
    const opts2 = {
      hostname: "generativelanguage.googleapis.com",
      path: `/upload/v1beta/files?uploadType=resumable`,
      method: "POST",
      headers: {
        "X-Goog-Api-Key": GEMINI_API_KEY,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": stats.size,
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(initBody),
      }
    };

    const initReq = https.request(opts2, (res) => {
      const uploadUrl = res.headers["x-goog-upload-url"];
      if (!uploadUrl) {
        let body = "";
        res.on("data", d => body += d);
        res.on("end", () => reject(new Error(`Failed to get upload URL. Status: ${res.statusCode}. Body: ${body}`)));
        return;
      }

      log(`Upload URL obtained. Uploading ${(stats.size / 1024 / 1024).toFixed(1)} MB...`);

      // Step 2: Upload the file
      const fileStream = fs.createReadStream(filePath);
      const uploadUrl_parsed = new URL(uploadUrl);

      const uploadOptions = {
        hostname: uploadUrl_parsed.hostname,
        path: uploadUrl_parsed.pathname + uploadUrl_parsed.search,
        method: "POST",
        headers: {
          "Content-Length": stats.size,
          "X-Goog-Upload-Offset": 0,
          "X-Goog-Upload-Command": "upload, finalize",
        }
      };

      const uploadReq = https.request(uploadOptions, (uploadRes) => {
        let data = "";
        uploadRes.on("data", chunk => data += chunk);
        uploadRes.on("end", () => {
          try {
            const fileObj = JSON.parse(data);
            if (fileObj.file && fileObj.file.uri) {
              log(`Upload complete. File URI: ${fileObj.file.uri}`);
              resolve({ uri: fileObj.file.uri, mimeType });
            } else {
              reject(new Error(`Upload response missing file URI: ${data}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse upload response: ${data}`));
          }
        });
      });

      uploadReq.on("error", reject);
      fileStream.pipe(uploadReq);
    });

    initReq.on("error", reject);
    initReq.write(initBody);
    initReq.end();
  });
}

// ─── Wait for Gemini File Processing ─────────────────────────────────────────

function waitForFileReady(fileUri) {
  return new Promise((resolve, reject) => {
    const fileId = fileUri.split("/").pop();
    let attempts = 0;
    const maxAttempts = 30;

    const check = () => {
      attempts++;
      log(`Waiting for Gemini to process video... (${attempts}/${maxAttempts})`);

      const options = {
        hostname: "generativelanguage.googleapis.com",
        path: `/v1beta/files/${fileId}?key=${GEMINI_API_KEY}`,
        method: "GET",
      };

      https.get(options, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try {
            const fileInfo = JSON.parse(data);
            if (fileInfo.state === "ACTIVE") {
              log("Video processing complete.");
              resolve(fileUri);
            } else if (fileInfo.state === "FAILED") {
              reject(new Error("Gemini file processing failed."));
            } else if (attempts >= maxAttempts) {
              reject(new Error("Timeout waiting for Gemini to process video."));
            } else {
              setTimeout(check, 5000);
            }
          } catch (e) {
            reject(new Error(`Failed to check file status: ${data}`));
          }
        });
      }).on("error", reject);
    };

    setTimeout(check, 3000);
  });
}

// ─── Gemini Analysis ──────────────────────────────────────────────────────────

function analyzeWithGemini(fileUri, mimeType, metadata) {
  log("Sending to Gemini 1.5 Pro for analysis...");

  return new Promise((resolve, reject) => {
    const metaContext = metadata ? `
Video metadata:
- Title: ${metadata.title || "Unknown"}
- Creator: ${metadata.uploader || "Unknown"}
- Duration: ${metadata.duration ? `${Math.round(metadata.duration / 60)} minutes` : "Unknown"}
- Views: ${metadata.view_count ? metadata.view_count.toLocaleString() : "Unknown"}
- Description: ${(metadata.description || "").substring(0, 500)}
` : "";

    const prompt = `You are a content strategist and video producer. Analyze this video completely and provide a detailed recreation brief.

${metaContext}

Provide your analysis in this exact structure:

## HOOK ANALYSIS
- Opening technique (first 3-5 seconds)
- Hook type (question, statement, shock, promise, etc.)
- Emotional trigger used
- Exact hook script or description

## CONTENT STRUCTURE
- Total sections/segments with timestamps
- Narrative arc (problem/solution, story, tutorial, etc.)
- Pacing notes (fast cuts, slow burn, etc.)
- Transitions used

## SCRIPT PATTERN
- Speaking style (conversational, authoritative, energetic, etc.)
- Key phrases and language patterns
- Call to action approach
- Tone throughout

## VISUAL STYLE
- Camera setup (talking head, B-roll heavy, screen recording, etc.)
- Editing style (jump cuts, smooth transitions, text overlays, etc.)
- On-screen text usage
- Color grading / aesthetic
- Any recurring visual motifs

## AUDIO
- Music style and energy level
- Sound effects used
- Voice delivery style

## RECREATION BLUEPRINT
Step-by-step instructions to recreate this video:
1. Equipment/setup needed
2. Script outline (key points in order)
3. Shot list
4. Editing notes
5. Thumbnail strategy (if applicable)

## WHY IT WORKS
- Core psychological appeal
- What makes this shareable/engaging
- Target audience hooks

Be specific. Give me exactly what I need to recreate this content.`;

    const body = JSON.stringify({
      contents: [{
        parts: [
          { file_data: { mime_type: mimeType, file_uri: fileUri } },
          { text: prompt }
        ]
      }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
      }
    });

    const options = {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          if (response.candidates && response.candidates[0]) {
            const text = response.candidates[0].content.parts[0].text;
            resolve(text);
          } else if (response.error) {
            reject(new Error(`Gemini API error: ${response.error.message}`));
          } else {
            reject(new Error(`Unexpected response: ${data.substring(0, 500)}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse Gemini response: ${data.substring(0, 500)}`));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── Delete Gemini File ───────────────────────────────────────────────────────

function deleteGeminiFile(fileUri) {
  const fileId = fileUri.split("/").pop();
  const options = {
    hostname: "generativelanguage.googleapis.com",
    path: `/v1beta/files/${fileId}?key=${GEMINI_API_KEY}`,
    method: "DELETE",
  };
  const req = https.request(options, () => {});
  req.on("error", () => {});
  req.end();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Validate
  if (!URL_ARG) {
    fail(`No URL provided.\n\nUsage: node analyst.js <youtube-or-instagram-url>\n\nExamples:\n  node analyst.js https://www.youtube.com/watch?v=dQw4w9WgXcQ\n  node analyst.js https://www.instagram.com/reel/ABC123/`);
  }

  if (!GEMINI_API_KEY) {
    fail(`GEMINI_API_KEY environment variable is not set.\n\nGet a free key at: https://aistudio.google.com/app/apikey\n\nThen run:\n  GEMINI_API_KEY=your_key node analyst.js ${URL_ARG}`);
  }

  if (!isYouTube(URL_ARG) && !isInstagram(URL_ARG)) {
    fail(`Unsupported URL. Currently supports YouTube and Instagram only.\n\nGot: ${URL_ARG}`);
  }

  const platform = isYouTube(URL_ARG) ? "YouTube" : "Instagram";
  log(`Platform detected: ${platform}`);

  // Create temp dir
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "whink-analyst-"));
  log(`Working directory: ${tmpDir}`);

  let fileUri = null;

  try {
    // Get metadata
    const metadata = getMetadata(URL_ARG);
    if (metadata) {
      log(`Video: "${metadata.title}" by ${metadata.uploader}`);
    }

    // Download video
    const videoPath = downloadVideo(URL_ARG, tmpDir);

    // Upload to Gemini
    const { uri, mimeType } = await uploadToGemini(videoPath);
    fileUri = uri;

    // Wait for processing
    await waitForFileReady(fileUri);

    // Analyze
    const brief = await analyzeWithGemini(fileUri, mimeType, metadata);

    // Output
    if (OUTPUT_FORMAT === "json") {
      console.log(JSON.stringify({
        success: true,
        platform,
        url: URL_ARG,
        metadata,
        brief,
        generated_at: new Date().toISOString(),
      }, null, 2));
    } else {
      console.log("\n" + "═".repeat(60));
      console.log("  WHINK CONTENT ANALYST — RECREATION BRIEF");
      console.log("═".repeat(60));
      if (metadata) {
        console.log(`\nSource: ${metadata.title || URL_ARG}`);
        console.log(`Creator: ${metadata.uploader || "Unknown"}`);
        console.log(`Platform: ${platform}`);
      }
      console.log("\n" + brief);
      console.log("\n" + "═".repeat(60));
      console.log("  Brief generated by WHINK Content Analyst");
      console.log("═".repeat(60) + "\n");
    }

  } finally {
    // Cleanup
    if (fileUri) {
      log("Cleaning up Gemini file...");
      deleteGeminiFile(fileUri);
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch(err => {
  console.error(`\n[WHINK ERROR] ${err.message}`);
  process.exit(1);
});
