import { createServer } from "node:http";
import { createPrivateKey, randomUUID, sign, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { fixtures } from "/app/public/gateway/demo-cases.js";
import { inspectRedaction } from "./observation.mjs";

const origin = "https://demo.nattavut.online";
const base = "/api/gateway/redaction/live";
const gateway = "http://trendai-gateway-gateway.trendai-gateway.svc.cluster.local:8080";
const adapter = "http://127.0.0.1:4892/v1/chat/completions";
const signingKey = createPrivateKey(readFileSync("/var/run/r5r5-mask-signing/private-key"));
const upstreamKey = process.env.GATEWAY_DEMO_UPSTREAM_KEY;
const virtualKey = process.env.GATEWAY_DEMO_VIRTUAL_KEY;
if (!upstreamKey || !virtualKey) throw new Error("Missing demo credentials.");
let active = null;

function request(url, headers, body, timeout = 45000) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(timeout) });
}
async function worker(route, body) {
  const path = base + route, time = String(Date.now());
  const signature = sign(null, Buffer.from(["POST", path, time, JSON.stringify(body)].join("\n")), signingKey).toString("base64");
  const response = await request(origin + path, { "X-Redaction-Time": time, "X-Redaction-Signature": signature }, body);
  if (!response.ok) throw new Error("Inference service HTTP " + response.status);
  return response.json();
}
function authorized(header) {
  const expected = Buffer.from("Bearer " + upstreamKey), actual = Buffer.from(header || "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function respond(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

// ClusterIP-only OpenAI adapter. The existing signing key stays in this runner.
// Only the currently claimed fixed-fixture job can cause an inference call.
createServer(async (req, res) => {
  if (!authorized(req.headers.authorization)) return respond(res, 401, { error: "Invalid adapter credential." });
  if (req.url === "/v1/models" && req.method === "GET") return respond(res, 200, {
    object: "list", data: [{ id: "synthetic-summary", object: "model", owned_by: "r5r5-workers-ai-adapter" }],
  });
  if (req.url !== "/v1/chat/completions" || req.method !== "POST") return respond(res, 404, { error: "Unknown adapter route." });
  try {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk.toString();
      if (Buffer.byteLength(raw) > 8000) return respond(res, 413, { error: "Input too large." });
    }
    const body = JSON.parse(raw), job = active;
    if (!job || !["synthetic-summary", "r5r5-summary"].includes(body.model) || body.stream === true ||
        !Array.isArray(body.messages) || body.messages.length !== 2 ||
        body.messages[0]?.role !== "system" || body.messages[0]?.content !== "Demo run: " + job.id ||
        body.messages[1]?.role !== "user") return respond(res, 409, { error: "No matching active demo context." });
    const receivedText = body.messages[1].content;
    const observation = inspectRedaction(fixtures.card.body, receivedText, fixtures.card.fields);
    if (!observation.receivedText || (job.mode === "direct" && receivedText !== fixtures.card.body))
      return respond(res, 400, { error: "Only the fixed fixture or its redaction is allowed." });
    const completion = await worker("/inference", { id: job.id, claim: job.claim, receivedText });
    respond(res, 200, completion);
  } catch {
    respond(res, 503, { error: { code: "live_inference_unavailable", message: "Workers AI inference did not complete. No fixture reply was substituted." } });
  }
}).listen(4892, "0.0.0.0", () => console.log("Live inference adapter listening on 4892"));

while (true) {
  const claim = randomUUID();
  try {
    const job = await worker("/runner/claim", { claim });
    if (job) {
      active = { ...job, claim };
      let result = null;
      try {
        const direct = job.mode === "direct";
        if (!direct && job.mode !== "gateway") throw new Error("Unknown job mode");
        const response = await request(direct ? adapter : gateway + "/v1/chat/completions",
          { Authorization: "Bearer " + (direct ? upstreamKey : virtualKey) }, {
            model: direct ? "synthetic-summary" : "r5r5-summary", stream: false,
            messages: [{ role: "system", content: "Demo run: " + job.id }, { role: "user", content: fixtures.card.body }],
          }, 60000);
        const payload = await response.json().catch(() => null);
        result = { responseStatus: response.status,
          gatewayRequestId: direct ? null : response.headers.get("x-request-id"),
          gatewayErrorCode: !direct && response.status >= 400 && payload?.error?.code === "policy_violation" ? "policy_violation" : null,
          reply: typeof payload?.choices?.[0]?.message?.content === "string" ? payload.choices[0].message.content : null };
      } catch { /* A transport failure remains unverified. */ }
      active = null;
      await worker("/runner/finish", { id: job.id, claim, result });
      console.log("Live comparison completed", { id: job.id, mode: job.mode, status: result?.responseStatus });
    }
  } catch { console.error("Live comparison poll did not complete"); }
  await delay(6000);
}
