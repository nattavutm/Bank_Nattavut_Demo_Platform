import { Fault, json, readJson, sameOrigin } from "./runtime/util.js";
import { fixtureBody, fixtureFields } from "../../public/gateway/redaction/fixture.js";
import { inspectRedaction } from "../../public/gateway/redaction/observation.js";

const base = "/api/gateway/redaction";
const jobId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const outcomes = new Set(["masked", "unmasked", "not confirmed", "no upstream receipt"]);
const encoder = new TextEncoder();
const initialized = new WeakMap();
const expiresIn = 120_000;

function database(env) {
  if (!env.LR_DB_PROTECTED || !env.REDACTION_RUNNER_PUBLIC_KEY)
    throw new Fault(503, "The EKS runner is not configured.");
  return env.LR_DB_PROTECTED;
}

async function initialize(db) {
  if (!initialized.has(db)) {
    initialized.set(db, db.prepare(`CREATE TABLE IF NOT EXISTS gateway_redaction_jobs (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, status TEXT NOT NULL,
      created INTEGER NOT NULL, expires INTEGER NOT NULL, claim TEXT, result TEXT
    )`).run().catch((error) => {
      initialized.delete(db);
      throw error;
    }));
  }
  await initialized.get(db);
}

async function sessionOwner(request) {
  const cookie = request.headers.get("Cookie").split(";").map((part) => part.trim())
    .find((part) => part.startsWith("__Host-trendai_session="));
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(cookie));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyRunner(request, env, path, body) {
  const time = request.headers.get("X-Redaction-Time");
  const signature = request.headers.get("X-Redaction-Signature");
  if (!/^\d{13}$/.test(time ?? "") || Math.abs(Date.now() - Number(time)) > 45_000 ||
      !/^[A-Za-z0-9+/]{86}==$/.test(signature ?? "")) return false;
  try {
    const bytes = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    const key = await crypto.subtle.importKey("spki", bytes(env.REDACTION_RUNNER_PUBLIC_KEY),
      "Ed25519", false, ["verify"]);
    const message = encoder.encode(["POST", path, time, JSON.stringify(body)].join("\n"));
    return await crypto.subtle.verify("Ed25519", key, bytes(signature), message);
  } catch {
    return false;
  }
}

function verifiedResult(result) {
  if (!result || !Number.isInteger(result.gatewayStatus) || result.gatewayStatus < 200 ||
      result.gatewayStatus > 599 || typeof result.upstreamReceived !== "boolean" ||
      typeof result.summaryPreserved !== "boolean" ||
      !Array.isArray(result.fields) || result.fields.length !== 4 ||
      result.fields.some((value) => !outcomes.has(value))) throw new Fault(400, "Invalid result.");
  if (result.gatewayRequestId !== null && !jobId.test(result.gatewayRequestId))
    throw new Fault(400, "Invalid Gateway request ID.");
  if (result.gatewayErrorCode !== undefined && result.gatewayErrorCode !== null &&
      result.gatewayErrorCode !== "policy_violation") throw new Fault(400, "Invalid Gateway error code.");
  if (result.gatewayErrorCode === "policy_violation" && result.gatewayStatus < 400)
    throw new Fault(400, "A successful response cannot establish a policy denial.");
  const rules = result.gatewayRuleIds ?? [];
  if (!Array.isArray(rules) || rules.length > 12 || rules.some((rule) =>
    typeof rule !== "string" || rule.length > 96 ||
    !/^(?:sensitive_information|harmful_content|prompt_attack)\.default\.[a-z0-9_]+$/.test(rule)))
    throw new Fault(400, "Invalid Gateway rule identifiers.");
  const observation = inspectRedaction(fixtureBody, result.receivedText, fixtureFields);
  if (result.receivedText !== undefined && result.receivedText !== null &&
      (!result.upstreamReceived || observation.receivedText !== result.receivedText ||
        observation.fields.some((value, i) => value !== result.fields[i])))
    throw new Fault(400, "Invalid synthetic receipt.");
  return {
    gatewayStatus: result.gatewayStatus,
    gatewayRequestId: result.gatewayRequestId,
    upstreamReceived: result.upstreamReceived,
    summaryPreserved: result.summaryPreserved,
    fields: result.fields,
    gatewayErrorCode: result.gatewayErrorCode ?? null,
    gatewayRuleIds: rules,
    receivedText: observation.receivedText,
  };
}

export async function redactionApi(request, env, runner = false) {
  const path = new URL(request.url).pathname;
  const now = Date.now();
  try {
    if (env.REDACTION_EXECUTION === "cloudflare") throw new Fault(410, "The legacy EKS runner has been retired.");
    const db = database(env);
    if (runner) {
      if (request.method !== "POST") throw new Fault(405, "Use POST.");
      const body = await readJson(request, 2048);
      if (!await verifyRunner(request, env, path, body)) throw new Fault(401, "Invalid runner signature.");
      if (!jobId.test(body.claim)) throw new Fault(400, "Invalid claim.");
      await initialize(db);
      if (path === base + "/runner/claim") {
        const job = await db.prepare(`UPDATE gateway_redaction_jobs SET status='running', claim=?
          WHERE id=(SELECT id FROM gateway_redaction_jobs WHERE status='queued' AND expires>?
            ORDER BY created LIMIT 1)
          AND NOT EXISTS (SELECT 1 FROM gateway_redaction_jobs WHERE claim=?)
          RETURNING id`).bind(body.claim, now, body.claim).first();
        return json(job);
      }
      if (!jobId.test(body.id)) throw new Fault(400, "Invalid run ID.");
      const result = body.result === null ? null : verifiedResult(body.result);
      await db.prepare(`UPDATE gateway_redaction_jobs SET status=?, result=?
        WHERE id=? AND claim=? AND status='running' AND expires>?`)
        .bind(result ? "done" : "failed", result ? JSON.stringify(result) : null, body.id, body.claim, now).run();
      return json({ ok: true });
    }
    if (request.method === "POST" && path === base) {
      sameOrigin(request);
      const owner = await sessionOwner(request);
      await initialize(db);
      const id = crypto.randomUUID();
      const [, inserted] = await db.batch([
        db.prepare("DELETE FROM gateway_redaction_jobs WHERE expires <= ?").bind(now),
        db.prepare(`INSERT INTO gateway_redaction_jobs (id, owner, status, created, expires)
          SELECT ?, ?, 'queued', ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM gateway_redaction_jobs WHERE status IN ('queued','running'))`)
          .bind(id, owner, now, now + expiresIn),
      ]);
      if (!inserted.meta.changes) throw new Fault(429, "A Gateway demo run is already in progress.");
      return json({ id, status: "queued" }, 202);
    }
    const id = path.slice(base.length + 1);
    if (request.method !== "GET" || !jobId.test(id)) throw new Fault(404, "Unknown demo route.");
    const owner = await sessionOwner(request);
    await initialize(db);
    const job = await db.prepare("SELECT status, result FROM gateway_redaction_jobs WHERE id=? AND owner=? AND expires>?")
      .bind(id, owner, now).first();
    if (!job) throw new Fault(404, "This run expired or is unavailable.");
    return json({ status: job.status, result: job.result ? JSON.parse(job.result) : null });
  } catch (error) {
    return error instanceof Fault ? json({ error: error.message }, error.status) :
      json({ error: "The Gateway demo is temporarily unavailable." }, 503);
  }
}
