# Target architecture — Cloudflare app, EKS Gateway only

The target supersedes the temporary EKS runner/adapter arrangement described in Git history. Migration is not complete until the production evidence and retired workload checks below pass.

- Without: authenticated browser → Cloudflare Worker → Workers AI.
- With: authenticated browser → Cloudflare Worker → narrowly scoped Workers VPC Service → Cloudflare Tunnel connector → TrendAI AI Gateway → HTTPS Cloudflare model endpoint → Workers AI → Gateway response inspection → Cloudflare Worker → browser.
- EKS runs the AI Gateway and its required Redis/network connector only. No application, fixture service, model adapter, job runner or evidence store remains on EKS after migration.
- UI, login, job orchestration, fixed synthetic fixtures, input receipts and model inference run on Cloudflare. D1 stores isolated session-owned jobs and receipts.

## Private connectivity and secrets

`AI_GATEWAY` is a Workers VPC Service binding restricted to the Gateway Service at HTTP port 8080. There is no public Gateway hostname, ingress or load balancer. `deploy/gateway-private-connector.json` adds only a transport connector in the Gateway namespace; its network policy permits the Gateway port, DNS and Cloudflare Tunnel transport, and does not permit the MCP or management port. The connector token is held in a Kubernetes Secret. The existing dedicated demo Virtual Key is moved to an encrypted Worker Secret named `GATEWAY_DEMO_VIRTUAL_KEY`; no key enters browser code or Git.

The Cloudflare model endpoint accepts only an active server-created job ID plus a random, one-use delegated context. This context is created inside the authenticated Worker, sent to Gateway in the server-owned system message, never returned to the browser, tied to the fixed fixture/redaction and current run, and expires within 3 minutes. A persistent unique inference receipt prevents replay. The Gateway sees the existing app identity; this is not individual employee authentication.

## Inference and evidence

Both sides use `@cf/meta/llama-3.2-3b-instruct`. The Gateway alias remains `r5r5-summary`. The upstream protocol ID `synthetic-summary` is a legacy alias retained to preserve policy/resource IDs; the registered provider now forwards to Workers AI rather than returning canned replies. The result records the actual inference model.

The Worker records the validated original or redacted prompt immediately before invoking Workers AI. It records completed/failed inference separately from the response returned through Gateway. Raw model replies blocked by Gateway are not returned through the comparison API. A missing receipt is unknown, not proof of blocking. No failure substitutes a fixture answer. One request is active at a time. Workers AI quota applies.

## Cutover

1. Create the private Tunnel/VPC Service, store the connector token and existing dedicated demo Virtual Key in their target secrets, and deploy the connector.
2. Add `AI_GATEWAY` to Wrangler bindings and set `REDACTION_EXECUTION=cloudflare` only when connectivity is ready. Change only the summary provider base URL to `https://demo.nattavut.online/api/gateway/redaction/live/model`; retain its model/alias/guardrail assignments.
3. The Worker owns execution; EKS runner routes return 410. Run both buttons and match Gateway evidence with the received Worker prompt and real model reply.
4. The platform’s existing scripted fixtures remain in the Cloudflare app. Retire the old EKS bootstrap/mock service. Its unused MCP/probe/primary/backup resource registrations are historical/planned configuration, not evidence of working live cases; future live use must wire these dedicated resources to Cloudflare implementations and validate them before presentation.
5. Scale `r5r5-mask-runner` and `r5r5-upstreams` to zero. Retain their manifests for rollback; do not delete run evidence, credentials or persistent volumes as part of this change. Verify the active EKS workloads are only Gateway dependencies and the connector.

## Checks

The test suite exercises real SQLite persistence and a test AI binding: session ownership, fixed input restrictions, direct vs protected paths, unexposed one-use context, replay rejection, no live success without an inference receipt, no fallback on error, and no public arbitrary-target API. Production verification must separately demonstrate both paths and confirm EKS workload retirement.

References: https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/ and https://developers.cloudflare.com/workers-vpc/configuration/tunnel/ (Workers VPC is currently beta).

## Verified cutover — 2026-11-12

Workers VPC Service `01a1cddf-0fae-70f0-8ae4-9b241c187905` uses private Tunnel `bd3ee7ce-f9ad-4ef7-9aaa-5fda356e81db` to the Gateway Service on 8080. The summary provider uses the HTTPS Cloudflare model endpoint. Its existing bearer credential is verified against a SHA-256 fingerprint, so only the Virtual Key and connector credential needed a new storage location. The underlying model is Workers AI; both Direct and Gateway tests returned real generated summaries and the Gateway path masked all four input fields.

The `r5r5-mask-runner` and `r5r5-upstreams` Deployments are scaled to zero. Active lab workloads are the Gateway, its Redis dependency, and `r5r5-gateway-connector`. Their code/manifests and Secrets remain available for rollback; they are not running. Legacy signed runner routes are retired with HTTP 410 while Cloudflare execution is enabled.
