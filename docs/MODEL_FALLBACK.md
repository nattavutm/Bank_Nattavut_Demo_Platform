# Primary Model Fails, App Keeps Responding

Rollout status: live Gateway routing verified on 2026-11-12. Both normal controls reached Primary. During the controlled outage, Direct returned 503; Gateway reached Primary (503), then Backup (200), and returned Backup's actual Workers AI answer. Unit tests use a simulated Gateway and are separate from this live evidence.

## Presentation

Open `/#gateway/model-fallback` under AI Gateway. Keep the existing database-deletion and data-masking cases.

1. **Run normal request** sends the same editable synthetic task (R2-D2 status by default) on two independent routes. Both should receive a primary-endpoint answer.
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

Both models are served. The enabled rule **r5r5 demo - Primary to Backup** matches **exactly** `r5r5-continuity`, routes to alias `r5r5-primary` with that model's weight 100, and falls back to `r5r5-backup` (priority 0). Do not use a wildcard, change tenant-wide defaults or edit existing mask/MCP policies. All resources are synthetic demo resources.

Official reference: [TrendAI Gateway Controls — Routing rules](https://docs.trendmicro.com/en-us/documentation/article/trend-vision-one-AIG-controls). The documentation supports ordered fallback aliases; eligibility of this controlled HTTP 503 must be verified against the installed Gateway rather than generalized to all errors.

## API and authentication

- Browser endpoints: `/api/gateway/fallback/config`, `POST .../runs` with `{}`, `GET .../runs/:id`, `POST .../runs/:id/step` with `{"step":"normal"}` or `{"step":"outage"}`. Existing verified web login is required. Ownership derives from the session, never request JSON. Mutations require exact same-origin requests and ordered steps with an atomic run lock.
- Upstream-only endpoints: `GET .../(primary|backup)/v1/models`, `POST .../(primary|backup)/v1/chat/completions`. Require the existing upstream Bearer credential, verified against its stored SHA-256 fingerprint.
- The coordinator creates a random, run/call-bound context with a 30-minute run lifetime. The model adapter checks it against a running call and the allowed destination set. Closing a call fences future receipt claims; replay after closure is rejected.
- The control envelope is stripped before inference. Workers AI receives only the server-owned system instruction and the comparison’s saved synthetic task, never the context proof, Virtual Key or upstream credential.
- Provider retries increment the receipt count but cannot invoke AI twice for the same call/provider. Repeated primary errors are capped at eight attempts. A new comparison creates fresh runs rather than deleting someone else's active run.

## Evidence contract

The snapshot contains `gateway_mode: live`, `model_mode: live`, `outage_mode: controlled`, requested model, saved prompt, transport status and provider receipts. No private context proof or credential is returned.

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
- Invalid ownership, origin, context, mid-call prompt substitution, edited model/destination and replay are rejected.
- Failed normal controls can be retried after configuration is repaired; prior failed receipts remain visible.
- Existing database and masking cases continue to work. No changes to AI Chat, AI Guard, Scanner, other Vision One solutions or subscription plans.

This uses existing Cloudflare bindings and quota. Free-tier quotas and vendor entitlement still apply; no plan upgrade is performed.

## Recorded live UAT — 2026-11-12

Run `4ebd957d-0aa8-40f3-a23c-da1426518632` completed both phases. The outage Gateway call `9d8eb6e3-24f4-4c62-becb-949185f48247` recorded one Primary receipt with controlled 503 followed by one completed Backup receipt with 200. Its returned answer matched the Backup receipt. Direct received only Primary 503. Both normal calls recorded Primary 200 and no Backup receipt.

The outage response header returned Gateway request ID `01a1cfa8-aeee-7597-8140-2ddb6c23a123`. Vision One LLM event `01a1cfa8-aeee-7639-bdfb-0e332a376a2c` has that same request ID, requested model `r5r5-continuity`, and resource `r5r5-demo-backup/r5r5-backup-model`. The normal response returned request ID `01a1cfa8-5246-7459-9d4c-890d1d5ef969`.

These are historical verification IDs, not links or IDs for future runs. The test proves fallback for the installed Gateway's controlled 503 behavior; it does not establish fallback for every error or a real provider outage.

## Editable prompt and illustration

The composer sends the edited user text verbatim to both routes. A prompt is fixed for one comparison, including both normal and outage phases. Editing it starts a new comparison; it cannot reuse old receipts. The authenticated adapter rejects a user message that differs from the saved run text before invoking Workers AI. System instruction, routing model, destination and scoped context remain server-owned. The server never sends context proofs or credentials to Workers AI.

The separate Without/With diagram illustrates normal and primary-failure paths. It uses a local animation clock only, never triggers inference, changes routing or reads live evidence. Pause, keyboard tab switching, mobile layout and reduced-motion static outcomes are supported. The input composer and the live result panels remain separate from this illustration.
