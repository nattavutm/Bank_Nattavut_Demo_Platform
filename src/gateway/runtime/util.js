export const json = (value, status = 200, headers = {}) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
export class Fault extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export async function readJson(request, limit = 16000) {
  if (!request.headers.get("Content-Type")?.includes("application/json"))
    throw new Fault(415, "Send JSON.");
  let size = 0,
    text = "";
  const reader = request.body?.getReader(),
    decoder = new TextDecoder();
  if (reader)
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Fault(413, "Request too large.");
      }
      text += decoder.decode(value, { stream: true });
    }
  try {
    return JSON.parse(text + decoder.decode());
  } catch {
    throw new Fault(400, "Invalid JSON.");
  }
}
export function sameOrigin(request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    throw new Fault(403, "Invalid origin.");
}
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length)
    return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++)
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const profileDb = (env, profile) =>
  profile === "protected" ? env.LR_DB_PROTECTED : env.LR_DB;
export function config(env, profile = "unprotected") {
  const p = profile === "protected" ? "PROTECTED_" : "";
  const get = (key, fallback = "") =>
    env[p + key] ??
    (profile === "protected" ? fallback : (env[key] ?? fallback));
  return {
    label:
      profile === "protected"
        ? env.PROTECTED_LABEL || "TrendAI AI Gateway"
        : "Without protection",
    profile,
    llmDriver: get("LLM_DRIVER", "scripted"),
    llmBase: get("LLM_BASE_URL"),
    model: get("LLM_MODEL", "not-selected"),
    llmKey: get("LLM_API_KEY"),
    mcpDriver: get("MCP_DRIVER", "local"),
    mcpBase: get("MCP_BASE_URL"),
    mcpHeader: get("MCP_AUTH_HEADER", "x-mcp-token"),
    mcpValue: get("MCP_AUTH_VALUE", env.MCP_TOKEN),
    blockPattern: get(
      "BLOCK_PATTERN",
      "blocked|forbidden|denied|policy|guardrail",
    ),
    identityMode: get("IDENTITY_HEADER_MODE", "none"),
    egressDriver: get("EGRESS_DRIVER", "sink"),
    eventsUrl: env.PROTECTED_EVENTS_URL || "",
    configured:
      profile !== "protected" ||
      Boolean(env.PROTECTED_LLM_BASE_URL || env.PROTECTED_MCP_BASE_URL),
  };
}
export async function httpJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(12000),
    redirect: "error",
  });
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { text: raw };
  }
  return { status: response.status, ok: response.ok, data, raw };
}
