import { interrupted, matchesBlock } from "../interruption.js";
import { httpJson } from "../../util.js";
import { emit } from "../../events.js";
export async function remoteRpc(ctx, server, message) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (ctx.cfg.mcpHeader && ctx.cfg.mcpValue)
    headers[ctx.cfg.mcpHeader] = ctx.cfg.mcpValue;
  if (ctx.cfg.identityMode === "bearer-per-identity") {
    const key = ctx.env[ctx.actor.apiKeyRef];
    if (!key) throw Error("Identity credential not configured");
    headers.Authorization = "Bearer " + key;
  }
  let response;
  try {
    response = await httpJson(
      ctx.cfg.mcpBase.replace(/\/$/, "") + "/" + server,
      { method: "POST", headers, body: JSON.stringify(message) },
    );
  } catch (e) {
    await emit(
      ctx,
      "error",
      { preview: "MCP connection failed" },
      { outcome: "interrupted" },
    );
    throw interrupted("MCP connection interrupted: " + e.message);
  }
  if (
    !response.ok ||
    response.data.error ||
    response.data.result?.isError ||
    matchesBlock(response.raw, ctx.cfg.blockPattern)
  ) {
    await emit(
      ctx,
      "error",
      { preview: "Upstream interrupted the MCP request" },
      {
        outcome: "interrupted",
        upstream: {
          status: response.status,
          body_preview: response.raw.slice(0, 500),
        },
      },
    );
    throw Object.assign(
      Error("Upstream interruption (not verified as a security decision)."),
      { interrupted: true },
    );
  }
  return response.data;
}
