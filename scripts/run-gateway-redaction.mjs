import { createPrivateKey, randomUUID, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { fixtures } from "/app/public/gateway/demo-cases.js";

const origin = "https://demo.nattavut.online";
const path = "/api/gateway/redaction/runner/";
const mock = "http://r5r5-upstreams.r5r5-demo.svc.cluster.local:4891";
const gateway = "http://trendai-gateway-gateway.trendai-gateway.svc.cluster.local:8080";
const signingKey = createPrivateKey(readFileSync("/var/run/r5r5-mask-signing/private-key"));
const controlKey = process.env.GATEWAY_DEMO_CONTROL_KEY;
const virtualKey = process.env.GATEWAY_DEMO_VIRTUAL_KEY;
if (!controlKey || !virtualKey) throw new Error("Missing demo credentials.");

function request(url, method, headers, body, timeout = 10_000) {
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(timeout),
  });
}

async function worker(operation, body) {
  const route = path + operation;
  const time = String(Date.now());
  const payload = JSON.stringify(body);
  const message = ["POST", route, time, payload].join("\n");
  const signature = sign(null, Buffer.from(message), signingKey).toString("base64");
  const response = await request(origin + route, "POST", {
    "X-Redaction-Time": time,
    "X-Redaction-Signature": signature,
  }, payload);
  if (!response.ok) throw new Error("Runner " + operation + " HTTP " + response.status);
  return response.json();
}

async function control(route, method) {
  const response = await request(mock + route, method, { Authorization: "Bearer " + controlKey });
  if (!response.ok) throw new Error("Fixture control HTTP " + response.status);
  return response.json();
}

async function run() {
  const { runId } = await control("/runs", "POST");
  const response = await request(gateway + "/v1/chat/completions", "POST", {
    Authorization: "Bearer " + virtualKey,
  }, JSON.stringify({
    model: "r5r5-summary",
    messages: [
      { role: "system", content: "Demo run: " + runId },
      { role: "user", content: fixtures.card.body },
    ],
  }), 30_000);
  const responseBody = await response.json().catch(() => null);
  const reply = responseBody?.choices?.[0]?.message?.content;
  const policyViolation = response.status >= 400 && responseBody?.error?.code === "policy_violation";
  // Export rule identifiers only, never the raw error message or headers.
  const gatewayRuleIds = policyViolation && typeof responseBody?.error?.message === "string"
    ? [...new Set(responseBody.error.message.match(/(?:sensitive_information|harmful_content|prompt_attack)\.default\.[a-z0-9_]+/g) || [])].slice(0, 12)
    : [];
  const { receipts } = await control("/runs/" + runId, "GET");
  if (receipts.length > 1) throw new Error("Unexpected number of upstream receipts.");
  const received = receipts[0]?.receivedText;
  const fields = fixtures.card.fields.map(({ label, value }) => {
    if (received === undefined) return "no upstream receipt";
    if (received.includes(value)) return "unmasked";
    const line = received.split("\n").find((text) => text.startsWith(label + ":"));
    return line?.slice(label.length + 1).includes("*") ? "masked" : "not confirmed";
  });
  return {
    gatewayStatus: response.status,
    gatewayRequestId: response.headers.get("x-request-id"),
    upstreamReceived: received !== undefined,
    summaryPreserved: typeof reply === "string" && reply.includes("THB 1,250") &&
      reply.includes("Millennium Falcon parking fee"),
    fields,
    gatewayErrorCode: policyViolation ? "policy_violation" : null,
    gatewayRuleIds,
  };
}

while (true) {
  const claim = randomUUID();
  try {
    const job = await worker("claim", { claim });
    if (job) {
      const result = await run().catch(() => null);
      const body = { id: job.id, claim, result };
      await worker("finish", body).catch(() => worker("finish", body));
      console.log("Redaction run completed", {
        id: job.id, gatewayStatus: result?.gatewayStatus, upstreamReceived: result?.upstreamReceived,
      });
    }
  } catch (error) {
    console.error("Redaction runner could not complete its poll", error.message);
  }
  await delay(12_000);
}
