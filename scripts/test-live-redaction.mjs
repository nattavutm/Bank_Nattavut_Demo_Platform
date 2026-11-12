import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { generateKeyPairSync, randomUUID, sign, createHash } from "node:crypto";
import { liveRedactionApi } from "../src/gateway/live-redaction.js";
import { fixtureBody, fixtureFields } from "../public/gateway/redaction/fixture.js";
import { MODEL } from "../src/constants.js";

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  const db = { prepare(sql) {
    const stmt = sqlite.prepare(sql); let values = [];
    return { bind(...args) { values = args; return this; },
      async run() { return { meta: { changes: stmt.run(...values).changes } }; },
      async first() { return stmt.get(...values) ?? null; } };
  }, async batch(statements) { return Promise.all(statements.map(stmt => stmt.run())); } };
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const calls = [];
  const env = { REDACTION_UPSTREAM_KEY_SHA256: createHash("sha256").update("test-only-upstream").digest("hex"), LR_DB_PROTECTED: db, REDACTION_RUNNER_PUBLIC_KEY: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    AI: { async run(model, params) { calls.push({ model, params }); return { response: "Han Solo requests a THB 1,250 refund for the Millennium Falcon parking fee. Generated live test answer." }; } } };
  const origin = "https://demo.test", base = "/api/gateway/redaction/live";
  function browser(path = "", method = "GET", data, session = "a") {
    return liveRedactionApi(new Request(origin + base + path, { method,
      headers: { "Content-Type": "application/json", Origin: origin, Cookie: "__Host-trendai_session=" + session },
      body: data === undefined ? undefined : JSON.stringify(data) }), env);
  }
  function service(route, data, corrupt = false) {
    const path = base + route, time = String(Date.now()), body = JSON.stringify(data);
    let signature = sign(null, Buffer.from(["POST", path, time, body].join("\n")), privateKey).toString("base64");
    if (corrupt) signature = "A".repeat(86) + "==";
    return liveRedactionApi(new Request(origin + path, { method: "POST", body,
      headers: { "Content-Type": "application/json", "X-Redaction-Time": time, "X-Redaction-Signature": signature } }), env, true);
  }
  return { sqlite, calls, env, browser, service };
}

test("both modes invoke the same real AI binding with independently recorded original/masked inputs", async () => {
  const t = setup();
  try {
    for (const mode of ["direct", "gateway"]) {
      const created = await t.browser("", "POST", { mode }); assert.equal(created.status, 202);
      const { id } = await created.json(), claim = randomUUID();
      assert.deepEqual(await (await t.service("/runner/claim", { claim })).json(), { id, mode });
      assert.equal((await t.browser("/" + id, "GET", undefined, "another-session")).status, 404);
      const receivedText = mode === "direct" ? fixtureBody : fixtureFields.reduce((s, f) => s.replace(f.value, "[REDACTED]"), fixtureBody);
      const context = { id, claim, receivedText };
      assert.equal((await t.service("/inference", context, true)).status, 401);
      assert.equal((await t.service("/inference", { ...context, claim: randomUUID() })).status, 409);
      assert.equal((await t.service("/inference", { ...context, receivedText: "arbitrary private content" })).status, 400);
      assert.equal(t.calls.length, mode === "direct" ? 0 : 1);
      const response = await t.service("/inference", context); assert.equal(response.status, 200);
      const completion = await response.json(); assert.equal(completion.model, MODEL);
      assert.equal((await t.service("/inference", context)).status, 409, "signed replay cannot spend a second inference");
      assert.equal(t.calls.at(-1).params.messages.at(-1).content, receivedText);
      const result = { responseStatus: 200, gatewayRequestId: mode === "gateway" ? randomUUID() : null,
        gatewayErrorCode: null, reply: completion.choices[0].message.content, authorization: "secret-not-exported" };
      assert.equal((await t.service("/runner/finish", { id, claim, result })).status, 200);
      const observed = await (await t.browser("/" + id)).json();
      assert.equal(observed.mode, mode); assert.equal(observed.result.mode, mode);
      assert.equal(observed.result.modelMode, "live");
      assert.equal(observed.result.receivedText, receivedText);
      assert.equal(observed.result.reply, result.reply);
      assert.deepEqual(observed.result.fields, Array(4).fill(mode === "direct" ? "unmasked" : "masked"));
      assert.equal(observed.result.summaryPreserved, true);
      assert.ok(!JSON.stringify(observed).includes("secret-not-exported"));
      assert.equal((await t.service("/runner/finish", { id, claim, result })).status, 409);
    }
    assert.equal(t.calls.length, 2); assert.ok(t.calls.every(c => c.model === MODEL));
  } finally { t.sqlite.close(); }
});

test("no receipt cannot become a live success, direct input cannot be pre-masked and arbitrary targets are rejected", async () => {
  const t = setup();
  try {
    assert.equal((await t.browser("", "POST", { mode: "direct", url: "https://untrusted.test" })).status, 400);
    assert.equal((await t.browser("", "POST", { mode: "anything" })).status, 400);
    const { id } = await (await t.browser("", "POST", { mode: "direct" })).json(), claim = randomUUID();
    await t.service("/runner/claim", { claim });
    const result = { responseStatus: 200, gatewayRequestId: null, reply: "Fake success" };
    assert.equal((await t.service("/runner/finish", { id, claim, result })).status, 400);
    assert.equal((await t.service("/inference", { id, claim, receivedText: fixtureBody.replace(fixtureFields[0].value, "****") })).status, 400);
    assert.equal(t.calls.length, 0);
    assert.equal((await t.service("/runner/finish", { id, claim, result: { responseStatus: 503, gatewayRequestId: null, reply: null } })).status, 200);
    const observed = await (await t.browser("/" + id)).json();
    assert.equal(observed.result.modelMode, "unconfirmed"); assert.equal(observed.result.receivedText, null);
    assert.equal(observed.result.gatewayErrorCode, null);
  } finally { t.sqlite.close(); }
});

test("Workers AI failure never substitutes a canned summary or labels the inference complete", async () => {
  const t = setup();
  try {
    t.env.AI.run = async () => { throw new Error("quota"); };
    const { id } = await (await t.browser("", "POST", { mode: "gateway" })).json(), claim = randomUUID();
    await t.service("/runner/claim", { claim });
    assert.equal((await t.service("/inference", { id, claim, receivedText: fixtureBody })).status, 503);
    await t.service("/runner/finish", { id, claim, result: { responseStatus: 503, gatewayRequestId: randomUUID(), reply: null } });
    const observed = await (await t.browser("/" + id)).json();
    assert.equal(observed.result.modelMode, "unconfirmed"); assert.equal(observed.result.modelStatus, "failed");
    assert.equal(observed.result.reply, null);
  } finally { t.sqlite.close(); }
});

test("Cloudflare owns orchestration and inference; Gateway receives only a fixed request and an unexposed one-use context", async () => {
  const t = setup();
  try {
    t.env.REDACTION_EXECUTION = "cloudflare";
    t.env.GATEWAY_DEMO_VIRTUAL_KEY = "test-only-virtual-key";
    const gatewayCalls = [];
    t.env.AI_GATEWAY = { async fetch(url, options) {
      gatewayCalls.push({ url, options });
      assert.equal(options.redirect, "manual", "private fetch must not follow credential-bearing redirects");
      const body = JSON.parse(options.body);
      assert.equal(options.headers.Authorization, "Bearer test-only-virtual-key");
      assert.equal(url, "http://trendai-gateway-gateway.trendai-gateway.svc.cluster.local:8080/v1/chat/completions");
      body.model = "synthetic-summary";
      body.messages[1].content = fixtureFields.reduce((s, f) => s.replace(f.value, "[REDACTED]"), body.messages[1].content);
      const modelResponse = await liveRedactionApi(new Request("https://demo.test/api/gateway/redaction/live/model/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer test-only-upstream" }, body: JSON.stringify(body),
      }), t.env, true);
      assert.equal(modelResponse.status, 200);
      const headers = new Headers(modelResponse.headers); headers.set("x-request-id", randomUUID());
      return new Response(modelResponse.body, { status: 200, headers });
    } };
    for (const mode of ["direct", "gateway"]) {
      const response = await t.browser("", "POST", { mode }); assert.equal(response.status, 202);
      const created = await response.json(); assert.equal(created.status, "processed");
      const job = await (await t.browser("/" + created.id)).json();
      assert.equal(job.status, "done"); assert.equal(job.result.modelMode, "live");
      assert.deepEqual(job.result.fields, Array(4).fill(mode === "direct" ? "unmasked" : "masked"));
      assert.ok(!JSON.stringify(job).includes("Context:"));
      assert.ok(!JSON.stringify(job).includes("test-only-virtual-key"));
    }
    assert.equal(t.calls.length, 2); assert.equal(gatewayCalls.length, 1);
    assert.equal((await t.service("/runner/claim", { claim: randomUUID() })).status, 410);
    const replay = await liveRedactionApi(new Request("https://demo.test/api/gateway/redaction/live/model/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer test-only-upstream" }, body: gatewayCalls[0].options.body,
    }), t.env, true);
    assert.equal(replay.status, 409);
    assert.equal(t.calls.length, 2);
  } finally { t.sqlite.close(); }
});

test("Cloudflare model endpoint refuses missing or guessed context and missing private connectivity does not bypass Gateway", async () => {
  const t = setup();
  try {
    t.env.REDACTION_EXECUTION = "cloudflare";
    assert.equal((await t.browser("", "POST", { mode: "gateway" })).status, 503);
    const call = messages => liveRedactionApi(new Request("https://demo.test/api/gateway/redaction/live/model/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer test-only-upstream" }, body: JSON.stringify({ model: "synthetic-summary", messages }),
    }), t.env, true);
    assert.equal((await call([{ role: "system", content: "No context" }, { role: "user", content: fixtureBody }])).status, 401);
    assert.equal((await call([{ role: "system", content: "Demo run: " + randomUUID() + "\nContext: " + randomUUID() }, { role: "user", content: fixtureBody }])).status, 409);
    assert.equal(t.calls.length, 0);
  } finally { t.sqlite.close(); }
});

test("Cloudflare model discovery requires the existing upstream credential and never invokes AI", async () => {
  const t = setup();
  try {
    t.env.REDACTION_EXECUTION = "cloudflare";
    const url = "https://demo.test/api/gateway/redaction/live/model/v1/models";
    assert.equal((await liveRedactionApi(new Request(url), t.env, true)).status, 401);
    const response = await liveRedactionApi(new Request(url, { headers: { Authorization: "Bearer test-only-upstream" } }), t.env, true);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data[0].id, "synthetic-summary");
    assert.equal(t.calls.length, 0);
  } finally { t.sqlite.close(); }
});
