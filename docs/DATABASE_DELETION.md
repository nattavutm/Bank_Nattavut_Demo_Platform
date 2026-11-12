# Check Status, Prevent Database Deletion

Current rollout state: implementation prepared; private MCP connection and Gateway policy verification are pending approval. No production Gateway deny is claimed yet.

## Application

- The Gateway navigation lists only this case and Mask Sensitive Data Before Inference. Old scenario URLs fall through to this case; legacy execution APIs return 410. Archived source and stored evidence are retained.
- Cloudflare owns the API, per-session runs, synthetic databases, MCP server, observations and optional Workers AI planner. EKS still runs only Gateway, Redis and the existing network connector.
- Guided mode dispatches prescribed tools. Live Agent requests a bounded JSON tool proposal from Workers AI. The model never receives credentials or the delegated proof; a missing or unexpected proposal is shown rather than replaced by a scripted tool.
- Each comparison has two independent D1 sandbox states. `delete_volume` changes only one synthetic state to Offline; it cannot address AWS databases, EKS volumes, or arbitrary resources.

## Expected demonstration (not production evidence)

1. `get_status` reaches both sandboxes and reports Online.
2. Direct `delete_volume` commits a synthetic deletion. The Gateway call should be denied by its Access Control rule before reaching the MCP tool.
3. `get_status` verifies Direct Offline / Gateway Online.

The UI shows request evidence and an Events link. It must not label an unknown failure or missing log as a Gateway policy deny. Normalize the observed Gateway denial signature only after correlating it with the configured rule in Vision One. Until then it remains Not verified.

## Trust boundaries

- Normal login is required for browser endpoints. Ownership comes from the verified session cookie and never from request JSON.
- MCP discovery and tool requests require the existing upstream bearer credential (verified by SHA-256; no new credential is exposed to the browser).
- Trusted dispatch creates a one-use proof bound to run, side and tool in D1. The browser and model never receive it. The mock checks it before any action and closes it after transport completes, preventing delayed retries from performing a later action.
- Observations distinguish receipt, committed action, returned response and Gateway decision. A successful initial status control is required before deletion testing can advance.
- Network destinations and tool names are fixed in server code. User-supplied tool names, identities, destinations and database IDs are rejected.

## Pending connection changes

- Create `AI_GATEWAY_MCP`: HTTP VPC Service through existing Tunnel `bd3ee7ce-f9ad-4ef7-9aaa-5fda356e81db`, limited to `trendai-gateway-gateway.trendai-gateway.svc.cluster.local` port 8081. Preserve the existing 8080 binding.
- `deploy/gateway-mcp-network.json` preserves the connector restrictions and adds only TCP 8081 to the same Gateway pod selector. No public ingress or management-port access is added.
- Point the existing inactive demo MCP resource to `https://demo.nattavut.online/api/gateway/database/mcp`, retain its `GATEWAY_DEMO_UPSTREAM_KEY` environment reference, and discover only get_status/delete_volume for the `r5r5-database-demo` resource.
- Allow status reads and deny deletion only for the demo resource/identity. Do not change other solutions or tenant-wide defaults.
- Verify all three Guided steps, correlate the deny request ID with Events, check the receiver ledger and repeat with Live Agent without substituting a missing proposal.

References: [TrendAI Gateway Controls](https://docs.trendmicro.com/en-us/documentation/article/trend-vision-one-AIG-controls), [MCP resources](https://docs.trendmicro.com/en-us/documentation/article/trend-vision-one-AIG-resources).
