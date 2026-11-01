import { localRpc } from "./local.js";
import { remoteRpc } from "./http.js";
export async function mcp(ctx, server, method, params = {}) {
  const message = { jsonrpc: "2.0", id: crypto.randomUUID(), method, params };
  const reply =
    ctx.cfg.mcpDriver === "http"
      ? await remoteRpc(ctx, server, message)
      : await localRpc(ctx, server, message);
  if (reply?.error) throw Error(reply.error.message);
  if (reply?.result?.isError) throw Error(reply.result.content[0].text);
  return reply?.result;
}
export async function tool(ctx, server, name, args = {}) {
  const result = await mcp(ctx, server, "tools/call", {
    name,
    arguments: args,
  });
  return JSON.parse(result.content[0].text);
}
