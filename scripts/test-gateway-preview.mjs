import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { gatewayApi } from "../src/gateway/index.js";
import { config } from "../src/gateway/runtime/util.js";
import { detectDamage } from "../src/gateway/runtime/damage.js";
const bindings = {
  LR_DB: {},
  LR_DB_PROTECTED: {},
  LR_EVENTS: {},
  LR_STATE: {},
};
test("Gateway API and all its assets require the existing platform login", async () => {
  for (const path of [
    "/api/gateway/scenarios",
    "/api/gateway/compare/s03",
    "/api/gateway/data/customers",
    "/gateway/index.html",
    "/gateway/app.js",
    "/gateway/redaction/",
    "/gateway/redaction/frame.js",
    "/gateway/redaction/debug.js",
    "/gateway/redaction/mask-explainer.js",
  ]) {
    const r = await worker.fetch(new Request("https://demo.test" + path), {});
    assert.equal(r.status, path.startsWith("/api/") ? 401 : 303);
  }
});
test("Gateway Preview fails closed without its isolated bindings", async () => {
  assert.equal(
    (
      await gatewayApi(
        new Request("https://demo.test/api/gateway/scenarios"),
        {},
      )
    ).status,
    503,
  );
});
test("Archived engine retains twelve scripted fixtures (not exposed by the platform)", async () => {
  const r = await gatewayApi(
    new Request("https://demo.test/api/gateway/scenarios"),
    { ...bindings, LLM_DRIVER: "workers-ai" },
  );
  const j = await r.json();
  assert.equal(j.scenarios.length, 12);
  assert.equal(j.mode, "scripted");
});
test("Preview never treats inherited product URLs as verified protection", async () => {
  const r = await gatewayApi(
    new Request("https://demo.test/api/gateway/profiles"),
    { ...bindings, PROTECTED_MCP_BASE_URL: "https://must-not-call.test" },
  );
  assert.equal((await r.json()).protected.configured, false);
});
test("Cross-origin reset cannot mutate demo storage", async () => {
  const r = await gatewayApi(
    new Request("https://demo.test/api/gateway/reset", {
      method: "POST",
      headers: { Origin: "https://elsewhere.test" },
    }),
    bindings,
  );
  assert.equal(r.status, 403);
});
test("Hosted Preview exposes no external MCP or arbitrary model API", async () => {
  for (const path of ["mcp/crm", "copilot", "public-ai"])
    assert.equal(
      (
        await gatewayApi(
          new Request("https://demo.test/api/gateway/" + path),
          bindings,
        )
      ).status,
      404,
    );
});
test("A claim of leaked records is not observed damage", () => {
  assert.equal(detectDamage("50 records leaked").length, 0);
});
test("Only the authenticated Gateway view permits same-origin framing", async () => {
  const origin = "https://demo.test";
  const env = {
    APP_AUTH_SECRET: JSON.stringify({
      password: "unit-test-password-only",
      sessionKey: "unit-test-session-key-long-enough-for-tests",
    }),
    ASSETS: { fetch: async () => new Response("asset") },
  };
  const login = await worker.fetch(
    new Request(origin + "/api/login", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ password: "unit-test-password-only" }),
    }),
    env,
  );
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const framedPages = [
    "/gateway/index.html",
    "/gateway/",
    "/gateway/redaction/index.html",
    "/gateway/redaction/",
  ];
  for (const path of [...framedPages, "/", "/app.js", "/gateway/redaction/frame.js"]) {
    const r = await worker.fetch(
      new Request(origin + path, { headers: { Cookie: cookie } }),
      env,
    );
    assert.equal(
      r.headers.get("X-Frame-Options"),
      framedPages.includes(path)
        ? "SAMEORIGIN"
        : "DENY",
    );
    if (framedPages.includes(path))
      assert.equal(
        r.headers.get("Content-Security-Policy"),
        "frame-ancestors 'self'",
      );
  }
});

test('platform catalog exposes only the two current Gateway cases and retires old execution routes',async()=>{
 const env={APP_AUTH_SECRET:JSON.stringify({password:'unit-test-password-only',sessionKey:'unit-test-session-key-long-enough-for-tests'}),ASSETS:{fetch:async()=>new Response('asset')}};
 const login=await worker.fetch(new Request('https://demo.test/api/login',{method:'POST',headers:{Origin:'https://demo.test','Content-Type':'application/json'},body:JSON.stringify({password:'unit-test-password-only'})}),env);
 const headers={Cookie:login.headers.get('set-cookie').split(';')[0]};
 const catalog=await (await worker.fetch(new Request('https://demo.test/api/gateway/scenarios',{headers}),env)).json();
 assert.deepEqual(catalog.scenarios.map(x=>x.id),['database-deletion','card-redaction']);
 for(const path of ['compare/s03','profiles','data/customers','reset'])assert.equal((await worker.fetch(new Request('https://demo.test/api/gateway/'+path,{headers}),env)).status,410);
});
