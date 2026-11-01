/**
 * WHINK Voice Service
 * Webhook server that triggers outbound AI phone calls via Bland.ai
 * Deploy on Render as a Node.js web service
 */

const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3000;
const BLAND_API_KEY = process.env.BLAND_API_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
// No hardcoded fallback number. Set DEFAULT_PHONE in the environment if wanted.
const DEFAULT_PHONE = process.env.DEFAULT_PHONE || null;

if (!BLAND_API_KEY) {
  console.error("FATAL: BLAND_API_KEY environment variable is not set.");
  process.exit(1);
}

function blandCall(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: "api.bland.ai",
      path: "/v1/calls",
      method: "POST",
      headers: {
        "authorization": BLAND_API_KEY,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
  });
}

// Returns a response and false if the request is not authorised, true if it is.
function authorise(req, res) {
  if (!WEBHOOK_SECRET) {
    send(res, 500, { error: "WEBHOOK_SECRET not set" });
    return false;
  }
  const token = req.headers["x-whink-secret"] || req.headers["authorization"];
  if (token !== WEBHOOK_SECRET && token !== `Bearer ${WEBHOOK_SECRET}`) {
    send(res, 401, { error: "Unauthorized" });
    return false;
  }
  return true;
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);

  // Health check
  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, { status: "ok", service: "whink-voice" });
  }

  // Trigger a call
  if (req.method === "POST" && url.pathname === "/call") {

    // Auth check
    if (!authorise(req, res)) return;

    let body;
    try {
      body = await parseBody(req);
    } catch {
      return send(res, 400, { error: "Invalid JSON body" });
    }

    const phone = body.phone_number || DEFAULT_PHONE;
    if (!phone) {
      return send(res, 400, { error: "phone_number required" });
    }
    const task = body.task || "You are WHINK, the AI Chief of Staff for Victor Igboekwe. You are calling Victor with an important update from the WHINK organization. Be brief, direct, and professional. State your message clearly and ask if he needs anything from you.";
    const message = body.message || null;

    const payload = {
      phone_number: phone,
      task: task,
      voice: "nat",
      reduce_latency: true,
      wait_for_greeting: true,
      record: false,
      language: "en",
    };

    if (message) {
      payload.task = `${task}\n\nSpecific message to deliver: ${message}`;
    }

    console.log(`[WHINK Voice] Initiating call to ${phone}`);

    try {
      const result = await blandCall(payload);
      console.log(`[WHINK Voice] Bland.ai response: ${result.status}`, result.body);

      if (result.status === 200 || result.status === 201) {
        return send(res, 200, {
          success: true,
          call_id: result.body.call_id,
          phone: phone,
        });
      } else {
        return send(res, result.status, {
          success: false,
          error: result.body,
        });
      }
    } catch (err) {
      console.error("[WHINK Voice] Call error:", err.message);
      return send(res, 500, { error: "Failed to initiate call", detail: err.message });
    }
  }

  // Get call status
  if (req.method === "GET" && url.pathname.startsWith("/call/")) {
    if (!authorise(req, res)) return;
    const callId = url.pathname.split("/call/")[1];
    if (!callId || !/^[A-Za-z0-9_-]{1,128}$/.test(callId)) {
      return send(res, 400, { error: "Missing or invalid call ID" });
    }

    const options = {
      hostname: "api.bland.ai",
      path: `/v1/calls/${callId}`,
      method: "GET",
      headers: { "authorization": BLAND_API_KEY },
    };

    https.get(options, (blandRes) => {
      let data = "";
      blandRes.on("data", (chunk) => (data += chunk));
      blandRes.on("end", () => {
        try {
          send(res, blandRes.statusCode, JSON.parse(data));
        } catch {
          send(res, 500, { error: "Failed to parse response" });
        }
      });
    }).on("error", (err) => {
      send(res, 500, { error: err.message });
    });

    return;
  }

  return send(res, 404, { error: "Not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[WHINK Voice] Service running on 127.0.0.1:${PORT}`);
});
