# Primary Model Fails, App Keeps Responding

Rollout status: application and bounded model endpoints prepared. Live routing verification is pending Vision One sign-in/configuration. Unit-test routing is simulated and is not production Gateway evidence.

## Presentation

Open `/#gateway/model-fallback` under AI Gateway. Keep the existing database-deletion and data-masking cases.

1. **Run normal request** sends the same fixed, synthetic R2-D2 status task on two independent routes. Both should receive a primary-endpoint answer.
2. **Simulate primary failure** repeats that task. The primary endpoint returns HTTP 503 only for this phase's scoped calls. Without Gateway fails. With Gateway should reach Backup and still return an answer, requesting `r5r5-continuity` throughout.

Primary and Backup are controlled Cloudflare adapter endpoints backed by the existing Workers AI model. This demonstrates Gateway routing between endpoints; it does not claim to reproduce an outage at an external vendor or to switch between two different underlying model families. The AI answers are live, not fixtures.

## Responsibility boundaries

- Cloudflare: web UI, existing password login, session-owned runs, D1 receipt ledger, controlled primary errors, authenticated model endpoints and Workers AI inference.
- Existing EKS: AI Gateway and its existing required dependencies/connector. No new AWS service or public ingress is needed; reuse the private port-8080 `AI_GATEWAY` binding.
- The application sends **one** request to Gateway per phase. It contains no application-side retry-to-Backup or fallback-response substitution.
- The direct baseline invokes only the Primary adapter's shared implementation. It cannot call Backup.
- Normal provider-discovery probes never invoke AI or trigger the controlled outage.

## Fixed Gateway configuration

Reuse the existing inactive demo providers, retaining their `GATEWAY_DEMO_UPSTREAM_KEY` environment reference:

| Provider | Base URL (no `/v1` suffix) | Model ID | Alias |
| --- | --- | --- | --- |
| `r5r5-demo-primary` | `https://demo.nattavut.online/api/gateway/fallback/primary` | `r5r5-primary-model` | `r5r5-primary` |
| `r5r5-demo-backup` | `https://demo.nattavut.online/api/gateway/fallback/backup` | `r5r5-backup-model` | `r5r5-backup` |

Serve these two models. Create one routing rule matching **exactly** `r5r5-continuity`, route to alias `r5r5-primary` with that model's weight 100, fallback to `r5r5-backup`. Enable after checking the values. Do not use a wildcard, change tenant-wide defaults or edit existing mask/MCP policies. All new resources are synthetic demo resources.

Official reference: [TrendAI Gateway Controls — Routing rules](https://docs.trendmicro.com/en-us/documentation/article/trend-vision-one-AIG-controls). The documentation supports ordered fallback aliases; eligibility of this controlled HTTP 503 must be verified against the installed Gateway rather than generalized to all errors.

## API and authentication

- Browser endpoints: `/api/gateway/fallback/config`, `POST .../runs` with `{}`, `GET .../runs/:id`, `POST .../runs/:id/step` with `{"step":"normal"}` or `{"step":"outage"}`. Existing verified web login is required. Ownership derives from the session, never request JSON. Mutations require exact same-origin requests and ordered steps with an atomic run lock.
- Upstream-only endpoints: `GET .../(primary|backup)/v1/models`, `POST .../(primary|backup)/v1/chat/completions`. Require the existing upstream Bearer credential, verified against its stored SHA-256 fingerprint.
- The coordinator creates a random, run/call-bound context with a 30-minute run lifetime. The model adapter checks it against a running call and the allowed destination set. Closing a call fences future receipt claims; replay after closure is rejected.
- The control envelope is stripped before inference. Workers AI receives only the server-owned system instruction and the fixed synthetic task, never the context proof, Virtual Key or upstream credential.
- Provider retries increment the receipt count but cannot invoke AI twice for the same call/provider. Repeated primary errors are capped at eight attempts. A new comparison creates fresh runs rather than deleting someone else's active run.

## Evidence contract

The snapshot contains `gateway_mode: live`, `model_mode: live`, `outage_mode: controlled`, requested model, fixed prompt, transport status and provider receipts. No private context proof or credential is returned.

`fallback_observed` requires all of:

- Gateway-side outage call is closed and returns HTTP 200 with an answer;
- Primary receipt records the controlled HTTP 503;
- Backup receipt completes with HTTP 200, after Primary was received;
- the returned answer matches the recorded Backup answer.

An HTTP 200 alone, a matching error string, missing logs or a fabricated response never prove fallback. A missing destination remains unknown while the call is running. The receipt-claim fence prevents new deliveries after closure; already-started inference remains explicitly `invoking` until completed/failed. Incomplete observations stay partial. Request IDs are recorded only if returned by the real Gateway.

## Acceptance

- Both normal controls actually reach Primary.
- Controlled outage: Direct records Primary 503 and no Backup; Gateway records Primary 503, Backup 200 and returns Backup's actual answer with unchanged requested-model name.
- Gateway's real Routing/LLM Events are checked separately; an event ID is not invented or reused in subsequent runs.
- A disabled/misconfigured Gateway route cannot be rescued by application code.
- Invalid ownership, origin, context, edited task/model/destination and replay are rejected.
- Failed normal controls can be retried after configuration is repaired; prior failed receipts remain visible.
- Existing database and masking cases continue to work. No changes to AI Chat, AI Guard, Scanner, other Vision One solutions or subscription plans.

This uses existing Cloudflare bindings and quota. Free-tier quotas and vendor entitlement still apply; no plan upgrade is performed.
