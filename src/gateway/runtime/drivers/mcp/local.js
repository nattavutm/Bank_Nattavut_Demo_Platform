import { rpc } from "../../mcp/handler.js";
export async function localRpc(ctx, server, message) {
  return rpc(ctx, server, message);
}
