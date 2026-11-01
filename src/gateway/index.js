import { compareStream } from "./runtime/stream.js";
import { recordDamage, detectDamage } from "./runtime/damage.js";
import {
  json,
  Fault,
  readJson,
  sameOrigin,
  safeEqual,
  profileDb,
  config,
} from "./runtime/util.js";
import {
  scenarios,
  identities,
  runScenario,
  codeOf,
} from "./runtime/scenarios.js";
import { totalDamage } from "./runtime/damage.js";
import { resetDemo } from "./runtime/reset.js";
import { rpc } from "./runtime/mcp/handler.js";
const tables = ["customers", "deals", "notes", "employees", "tickets"];
// Called only after the platform's existing authentication gate.
export async function gatewayApi(request, originalEnv) {
  const env = {
    ...originalEnv,
    LLM_DRIVER: "scripted",
    EXTERNAL_LLM_DRIVER: "scripted",
    LLM_MODEL: "not-selected",
    MCP_DRIVER: "local",
    EGRESS_DRIVER: "sink",
    PROTECTED_LABEL: "TrendAI AI Gateway",
    PROTECTED_LLM_BASE_URL: "",
    PROTECTED_MCP_BASE_URL: "",
  };
  try {
    const url = new URL(request.url),
      path = url.pathname.replace(/^\/api\/gateway/, "/api");
    if (!env.LR_DB || !env.LR_DB_PROTECTED || !env.LR_EVENTS || !env.LR_STATE)
      return json(
        { error: "AI Gateway preview storage is not configured." },
        503,
      );
    if (path === "/api/health")
      return json({
        ok: true,
        profile: "hosted-preview",
        execution_mode: "scripted_tool_replay",
        live_ai: false,
        protected_connected: false,
        d1: (
          await env.LR_DB.prepare("SELECT count(*) AS n FROM customers").first()
        ).n,
        kv_configured: !!env.LR_EVENTS && !!env.LR_STATE,
      });
    if (path === "/api/scenarios")
      return json({ scenarios, identities, mode: env.LLM_DRIVER });
    if (path === "/api/profiles")
      return json({
        unprotected: {
          label: "Without protection",
          configured: true,
          mode: env.LLM_DRIVER,
        },
        protected: {
          label: env.PROTECTED_LABEL,
          configured: config(env, "protected").configured,
          events_url: env.PROTECTED_EVENTS_URL || null,
        },
        simulated_actions: true,
      });
    if (path === "/api/damage")
      return json({
        unprotected: await totalDamage(env.LR_DB),
        protected: await totalDamage(env.LR_DB_PROTECTED),
      });
    if (path === "/api/settings")
      return json({
        profile: "hosted-preview",
        drivers: {
          llm: env.LLM_DRIVER,
          model: env.LLM_MODEL,
          mcp: env.MCP_DRIVER,
          egress: env.EGRESS_DRIVER,
          rag: env.RAG_DRIVER,
        },
        urls: {
          mcp: env.MCP_BASE_URL || "local://mcp",
          llm: env.LLM_BASE_URL || "local://scripted-model",
        },
        secrets: "Configured values are never returned.",
        live_model_pending_owner_selection: true,
      });
    if (path === "/api/inbox") {
      const profile =
        url.searchParams.get("profile") === "protected"
          ? "protected"
          : "unprotected";
      return json({
        profile,
        messages: (
          await profileDb(env, profile)
            .prepare("SELECT * FROM inbox ORDER BY rowid DESC LIMIT 50")
            .all()
        ).results,
      });
    }
    const data = path.match(
      /^\/api\/data\/(customers|deals|notes|employees|tickets)$/,
    );
    if (data) {
      return json({
        rows: (
          await env.LR_DB.prepare(
            "SELECT * FROM " + data[1] + " ORDER BY id LIMIT 100",
          ).all()
        ).results,
        classification:
          "Synthetic data; intended permissions are deliberately unenforced.",
      });
    }
    if (path === "/api/events") {
      const profile =
          url.searchParams.get("profile") === "protected"
            ? "protected"
            : "unprotected",
        run = url.searchParams.get("run_id");
      const q = run
        ? profileDb(env, profile)
            .prepare(
              "SELECT json FROM events WHERE run_id=? ORDER BY rowid LIMIT 500",
            )
            .bind(run)
        : profileDb(env, profile).prepare(
            "SELECT json FROM events ORDER BY rowid DESC LIMIT 500",
          );
      return json({
        events: (await q.all()).results.map((r) => JSON.parse(r.json)),
      });
    }
    if (path === "/api/reset" && request.method === "POST") {
      sameOrigin(request);
      return json(await resetDemo(env));
    }
    const compare = path.match(/^\/api\/compare\/([\w-]+)$/),
      single = path.match(/^\/api\/scenarios\/([\w-]+)\/run$/);
    if ((compare || single) && request.method === "POST") {
      sameOrigin(request);
      const body = await readJson(request),
        scenario = codeOf((compare || single)[1]);
      if (!scenario) throw new Fault(404, "Unknown scenario");
      if (
        body.prompt !== undefined &&
        (typeof body.prompt !== "string" || body.prompt.length > 4000)
      )
        throw new Fault(400, "Invalid prompt");
      const options = {
        mode: "fallback",
        prompt: body.prompt,
      };
      if (
        compare &&
        request.headers.get("Accept")?.includes("application/x-ndjson")
      )
        return compareStream(env, scenario.id, options, runScenario);
      if (compare) {
        const [left, right] = await Promise.all([
          runScenario(env, scenario.id, "unprotected", options),
          runScenario(env, scenario.id, "protected", options),
        ]);
        return json({ unprotected: left, protected: right });
      }
      const profile =
        url.searchParams.get("profile") === "protected"
          ? "protected"
          : "unprotected";
      return json(await runScenario(env, scenario.id, profile, options));
    }
    if (path.startsWith("/api/")) throw new Fault(404, "Demo route not found");
    throw new Fault(404, "Gateway preview route not found");
  } catch (e) {
    return json({ error: e.message || "Demo error" }, e.status || 500);
  }
}
