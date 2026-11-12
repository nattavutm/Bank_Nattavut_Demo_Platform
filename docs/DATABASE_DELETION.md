# Check Status, Prevent Database Deletion

Current rollout state (2026-11-12): Guided demo verified against the live EKS Gateway. Cloudflare hosts the application, synthetic MCP service and D1 state. Live Agent was also verified against Workers AI: it proposed get_status and then delete_volume, the Gateway denied the proposed deletion, and the final scripted read observed the protected sandbox Online. Model behavior may change between runs; its choice is never forced to match the Guided attack.

## Application

- The Gateway navigation lists only this case and Mask Sensitive Data Before Inference. Old scenario URLs fall through to this case; legacy execution APIs return 410. Archived source and stored evidence are retained.
- Cloudflare owns the API, per-session runs, synthetic databases, MCP server, observations and optional Workers AI planner. EKS still runs only Gateway, Redis and the existing network connector.
- Guided mode dispatches prescribed tools. Live Agent requests a bounded JSON tool proposal from Workers AI. The model never receives credentials or the delegated proof; a missing or unexpected proposal is shown rather than replaced by a scripted tool.
- Each comparison has two independent D1 sandbox states. `delete_volume` changes only one synthetic state to Offline; it cannot address AWS databases, EKS volumes, or arbitrary resources.

## Demonstration and observed rollout verification

1. `get_status` reaches both sandboxes and reports Online.
2. Direct `delete_volume` commits a synthetic deletion. The Gateway call is denied by its Access Control rule before reaching the MCP tool.
3. `get_status` verifies Direct Offline / Gateway Online.

The UI shows request evidence and an Events link. Only the observed, exact MCP proxy policy-denial response is classified as `deny`; generic HTTP errors, different policy messages, conflicting receiver receipts and incomplete calls remain `unknown` / `partial`. A real deny is HTTP 200 with JSON-RPC error code 0, so HTTP status alone is insufficient.

Rollout evidence: run `3a4b33fe-f8df-4a4d-bf2b-2d421e74e9ed` reached both status endpoints; direct deletion committed once; the Gateway deletion did not reach the receiver; a final status read observed Direct Offline / Gateway Online. Vision One showed Access Deny event `01a1cf5f-5e64-7599-8d8d-fa8c19e77c1c` and MCP Deny event `01a1cf5f-5e63-7197-a539-bb3269e2ab4d`, sharing request ID `01a1cf5f-5e62-7c20-8e32-608b128ea7c1`, for identity `r5r5-mask-card-demo`, resource `r5r5-database-demo/delete_volume`, and policy `r5r5 demo - Deny database deletion`.

Live Agent verification run: `575c3b8d-38ff-482e-b730-a014608b08c0`. The planner handles both the legacy Workers AI `response` field and the actually observed chat-completion envelope (`choices[0].message.content`); an unrecognized, truncated or unexpected proposal is not substituted. The final verification read is explicitly scripted.

The MCP proxy did not return that Gateway request ID in an `x-request-id` response header. Browser evidence therefore leaves `request_id` null and exposes a separate `client_call_id` for each local dispatch; it does not invent or reuse an event ID. The rollout Events check was manual, using the single test attempt, timestamp, resource, identity and named policy. Per-run Events links open the real console rather than claiming automatic event correlation.

## Trust boundaries

- Normal login is required for browser endpoints. Ownership comes from the verified session cookie and never from request JSON.
- MCP discovery and tool requests require the existing upstream bearer credential (verified by SHA-256; no new credential is exposed to the browser).
- Trusted dispatch creates a one-use proof bound to run, side and tool in D1. The browser and model never receive it. The mock checks it before any action and closes it after transport completes, preventing delayed retries from performing a later action.
- Observations distinguish receipt, committed action, returned response and Gateway decision. A successful initial status control is required before deletion testing can advance.
- Network destinations and tool names are fixed in server code. User-supplied tool names, identities, destinations and database IDs are rejected.

## Live connection configuration

- Created `AI_GATEWAY_MCP` (VPC Service `01a1cf42-b305-7890-95a3-860adb394362`): HTTP VPC Service through existing Tunnel `bd3ee7ce-f9ad-4ef7-9aaa-5fda356e81db`, limited to `trendai-gateway-gateway.trendai-gateway.svc.cluster.local` port 8081. Preserve the existing 8080 binding.
- `deploy/gateway-mcp-network.json` preserves the connector restrictions and adds only TCP 8081 to the same Gateway pod selector. No public ingress or management-port access is added.
- Pointed the existing demo MCP resource to `https://demo.nattavut.online/api/gateway/database/mcp`, retain its `GATEWAY_DEMO_UPSTREAM_KEY` environment reference, and enabled `get_status` / `delete_volume` for `r5r5-database-demo`. Old GitHub tools are Missing and disabled; no inactive EKS mock deployment was restarted.
- Status reads use the unchanged default Allow; the existing demo rule was retargeted to Forbid `delete_volume` only for identity `r5r5-mask-card-demo`. Other solutions, Guard policies, model resources and tenant-wide defaults were unchanged.
- All three Guided steps and the receiver ledger were verified; see evidence above. Live Agent remains explicitly separate: an unexpected or absent tool proposal cannot be presented as a successful Gateway attack test.

References: [TrendAI Gateway Controls](https://docs.trendmicro.com/en-us/documentation/article/trend-vision-one-AIG-controls), [MCP resources](https://docs.trendmicro.com/en-us/documentation/article/trend-vision-one-AIG-resources).
