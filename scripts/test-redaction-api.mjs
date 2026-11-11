import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { redactionApi } from "../src/gateway/redaction.js";
import { fixtureBody, fixtureFields } from "../public/gateway/redaction/fixture.js";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  return {
    close: () => sqlite.close(),
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async run() { return { meta: { changes: stmt.run(...values).changes } }; },
        async first() { return stmt.get(...values) ?? null; },
      };
    },
    async batch(statements) { return Promise.all(statements.map((stmt) => stmt.run())); },
  };
}

test("signed policy-denial evidence round-trips without exposing secrets and stays session scoped", async () => {
  const db = database();
  try {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const env = { LR_DB_PROTECTED: db,
      REDACTION_RUNNER_PUBLIC_KEY: publicKey.export({ type: "spki", format: "der" }).toString("base64") };
    const origin = "https://demo.test", base = "/api/gateway/redaction";
    function browser(path, method = "GET", cookie = "session-a") {
      return redactionApi(new Request(origin + path, { method,
        headers: { Cookie: "__Host-trendai_session=" + cookie, Origin: origin } }), env);
    }
    function runner(route, data) {
      const path = base + "/runner/" + route, time = String(Date.now()), body = JSON.stringify(data);
      const signature = sign(null, Buffer.from(["POST", path, time, body].join("\n")), privateKey).toString("base64");
      return redactionApi(new Request(origin + path, { method: "POST", body,
        headers: { "Content-Type": "application/json", "X-Redaction-Time": time,
          "X-Redaction-Signature": signature } }), env, true);
    }
    const { id } = await (await browser(base, "POST")).json();
    const claim = randomUUID();
    assert.equal((await (await runner("claim", { claim })).json()).id, id);
    const result = { gatewayStatus: 400, gatewayRequestId: randomUUID(), upstreamReceived: false,
      summaryPreserved: false, fields: Array(4).fill("no upstream receipt"),
      gatewayErrorCode: "policy_violation", gatewayRuleIds: ["sensitive_information.default.cr_003n_001"],
      authorization: "Bearer must-not-return" };
    assert.equal((await runner("finish", { id, claim, result: { ...result, gatewayStatus: 200 } })).status, 400);
    assert.equal((await runner("finish", { id, claim, result: { ...result, gatewayRuleIds: ["Bearer secret"] } })).status, 400);
    assert.equal((await runner("finish", { id, claim, result })).status, 200);
    assert.equal((await browser(base + "/" + id, "GET", "session-b")).status, 404);
    const observed = await (await browser(base + "/" + id)).json();
    assert.equal(observed.status, "done");
    assert.equal(observed.result.gatewayErrorCode, "policy_violation");
    assert.deepEqual(observed.result.gatewayRuleIds, result.gatewayRuleIds);
    assert.ok(!JSON.stringify(observed).includes("must-not-return"));
    const maskedId = (await (await browser(base, "POST")).json()).id;
    const maskedClaim = randomUUID();
    assert.equal((await (await runner("claim", { claim: maskedClaim })).json()).id, maskedId);
    const receivedText = fixtureFields.reduce((text, field) => text.replace(field.value, "[REDACTED]"), fixtureBody);
    const masked = { ...result, gatewayStatus: 200, gatewayRequestId: randomUUID(), upstreamReceived: true,
      summaryPreserved: true, fields: Array(4).fill("masked"), gatewayErrorCode: null, gatewayRuleIds: [], receivedText };
    assert.equal((await runner("finish", { id: maskedId, claim: maskedClaim,
      result: { ...masked, receivedText: "Bearer must-not-return" } })).status, 400);
    assert.equal((await runner("finish", { id: maskedId, claim: maskedClaim,
      result: { ...masked, fields: Array(4).fill("unmasked") } })).status, 400);
    assert.equal((await runner("finish", { id: maskedId, claim: maskedClaim, result: masked })).status, 200);
    const maskedObserved = await (await browser(base + "/" + maskedId)).json();
    assert.equal(maskedObserved.result.receivedText, receivedText);
  } finally { db.close(); }
});
