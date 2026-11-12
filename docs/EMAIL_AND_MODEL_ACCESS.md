# Email inspection and model access demos

Two additions to the existing AI Gateway demo. All app logic, storage, model adapters and inference remain on the existing Cloudflare Worker / D1 / Workers AI services. Only the existing AI Gateway and its existing infrastructure run on EKS. No plan or service tier was changed.

## Presenter flow

- `/#gateway/email-injection`: normal supplier email, then a supplier email with embedded instructions to reveal fictional payroll context. The editable prompt is sent unchanged to both routes. The direct model may refuse: that is a model response, never evidence of Gateway protection. No email is sent and no mailbox is connected.
- `/#gateway/model-access`: Helpdesk calls Standard, Helpdesk tries Restricted, then Operations calls the same Restricted resource. The edited prompt is fixed for all three steps. Standard and Restricted use the same existing free Workers AI model; this demonstrates resource access, not premium-model quality.

Both pages retain the existing animated Without/With illustration, manual step buttons, editable prompt composer, two result panels, actual model answers, per-call timeline, request evidence, New comparison, Vision One Events link, and dark/daylight theme. Illustrations do not dispatch live requests.

## Registered configuration

Provider: `r5r5-demo-controls`, OpenAI-compatible, base URL `https://demo.nattavut.online/api/gateway/controls/upstream`. It references the pre-existing EKS environment variable `GATEWAY_DEMO_UPSTREAM_KEY`; no upstream secret was displayed or committed.

| Enabled model | Alias |
| --- | --- |
| r5r5-email-model | r5r5-email-review |
| r5r5-standard-model | r5r5-standard |
| r5r5-restricted-model | r5r5-restricted |

No routing rule was needed after the models were enabled for serving. Do not leave the discovered models unserved: the UI can show Active while alias invocation still returns 404.

Dedicated service-account identities and persistent demo Virtual Keys (explicitly approved by the operator):

- `r5r5-helpdesk-demo` / `r5r5-helpdesk-live-demo`, encrypted Worker Secret `GATEWAY_HELPDESK_KEY`.
- `r5r5-operations-demo` / `r5r5-operations-live-demo`, encrypted Worker Secret `GATEWAY_OPERATIONS_KEY`.

Keys retain the tenant's existing default access except for configured rules. They are not employee identities. The browser cannot choose or receive a key; the demo API permits only fixed server-selected resources and identities. Review scopes before reusing these keys outside this demo.

New access rule: `r5r5 demo - Helpdesk restricted model deny`, Forbid Invoke LLM model, restricted alias and resolved model only, Helpdesk identity only. Existing default rule and existing rules unchanged.

New request-only Guardrails assignment: `r5r5 demo - Email prompt inspection`, reuses existing `Bank-AI-Policy`, scoped to the new Helpdesk identity. It inspects that identity's requests, including its Standard/Restricted controls; it does not alter other identities or existing assignments. Resource-filtered assignment did not produce inspection in initial UAT; identity-scoped assignment was verified live. Do not claim resource-filtered assignment was validated. No AI Policy content or other Vision One solution was edited.

## API and evidence

Authenticated web APIs under `/api/gateway/controls/{email|models}`: config, create run, read own run, ordered step. Runs expire after 30 minutes and are tied to the authorized web session's cookie hash. Server validates session first, then ownership, origin, step order and prompt bounds. No client-owned operator ID, model selection, upstream URL or identity is accepted.

Upstream discovery and completion endpoints require the existing separate Bearer secret. Each model completion is additionally bound to a server-recorded run, call, random context, exact alias, system instruction and submitted prompt. Context is removed before inference. Receipt claims are atomic; closed, expired, changed and repeated calls cannot start another inference. Credentials/context proofs are omitted from browser evidence. This bounded adapter is not a general agent/MCP delegated identity implementation.

Required model path: app -> private Gateway binding -> Cloudflare adapter -> Workers AI. Direct path invokes the same adapter/inference implementation without Gateway. Neither path substitutes an example answer.

Only live-verified denial signatures are recognized:

- Content: HTTP 400, `policy_violation`, `invalid_request_error`, message starting `blocked by content policy: `, correlated UUID request ID.
- Model access: HTTP 403, `insufficient_permissions`, `invalid_request_error`, message starting `blocked by access policy: `, correlated UUID request ID.

A generic 403, missing request ID, model refusal, timeout or malformed provider response remains Unknown / Not verified. Pre-model block also requires no receipt and a closed call that fences new receiver claims. An existing receipt prevents claiming the model was never reached. Expected illustration state and observed run state are separate.

## Live UAT, 2026-11-12

Observed on production, real Gateway and Workers AI:

| Step | Observation | Gateway request ID |
| --- | --- | --- |
| Normal email | model invoked and returned summary | 01a1d000-07d7-7843-b32c-b94107256203 |
| Embedded email instruction | request Guardrail Deny, no model receipt/invocation | 01a1d000-9336-7cbb-8c5d-339e77eca18f |
| Helpdesk / Standard | real model reply | 01a1cffb-cb60-7aef-839a-68791e6f2f75 |
| Helpdesk / Restricted | access-policy Deny, no model receipt/invocation | 01a1cffc-35bb-706a-9389-06c5e7dc8e0a |
| Operations / Restricted | real model reply | 01a1cffd-7bac-7be6-b6a6-198bddf64dd3 |

Vision One Guardrail event `01a1d000-99bf-7824-9550-d6255760489b` explicitly references the email request ID above, request surface and `prompt_attack.default.classifier (high)`. Access Events identified Helpdesk and the new restricted-model deny policy. The initial UI kept these responses Unknown until their exact signatures were verified; the final classifier recognizes them.

The unprotected email model refused to reveal the fictional context. This remains visible as its actual response; the demonstration proves interception before inference, not guaranteed successful exploitation without Gateway. Detection is policy-dependent and does not prove protection against every prompt injection or recreate an entire real-world incident.

Validation: 127 automated tests pass, covering existing cases, new ownership/sequence/auth/delegation/replay controls, denial classification, negative permissive-Gateway cases, actual response propagation and diagram path reversal. These tests use controlled mocks and are distinct from live UAT above.
