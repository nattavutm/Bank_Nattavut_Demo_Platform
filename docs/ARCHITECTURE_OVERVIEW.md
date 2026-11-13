# Architecture Overview — product-level logical flow

Status: published and browser-verified on 2026-11-13 at `https://demo.nattavut.online/#gateway/architecture`. Cloudflare Worker version: `8e99d5ef-e7d2-4546-b3fd-b632e08fabcb`. Release source: `4ee9153`.

This read-only illustration explains TrendAI AI Gateway's product roles. It generates no network requests, model inference, tool execution, live decisions or live Events. The existing executable use-case pages, Gateway configuration and deployment remain unchanged.

## Diagram contract

Use only these primary roles:

- Application / AI Agent, upper left: the caller sending model requests or MCP tool calls.
- TrendAI AI Gateway, center: applies the configured controls to traffic routed through it.
- LLM Provider, upper right: model inference and response.
- MCP Server, lower right: tools and their results.
- Vision One, lower left: management and Events.

Routing Rules shows Primary and Backup LLM providers in place of the single provider/MCP pair. This is a logical example, not a statement about which model or platform backs the executable demo.

Data edges are bidirectional on the same connection: caller ↔ Gateway, Gateway ↔ provider, Gateway ↔ MCP. Configuration goes Vision One → Gateway; Events go Gateway → Vision One on distinct dashed edges. The latter are management/telemetry relationships, not prompt-processing hops or authorization lookups. The illustration does not establish sync protocols, caches, event timing or the physical location of detection services.

No hosting names, runtime names, databases, connectors, ports, credentials, browser-to-Worker orchestration or deployment-specific Guided/Live Agent selector appear in this page. Actual deployment facts remain in the existing deployment and use-case documents, not in this product walkthrough.

## Shared diagram layout across use cases

This revision uses one geometry/renderer in `public/gateway/product-diagram.js` and its component stylesheet. Application / AI Agent and Vision One have identical left alignment and box proportions. Policy / Configuration and Events have the same center, capsule width and height, with separate evenly spaced lanes. Labels do not overlap nodes.

Invoice, Database, Email, Model Access, Fallback and Mask Data all reuse this diagram layout. Their existing scenario selectors, pause controls and explanatory animation remain. Case-specific tools, identities, redaction and business-state illustrations remain visible; executable composers, APIs, credentials, policies and result/evidence panels are unchanged.

Case illustrations show the configuration relationship statically and animate Events separately after the response. They do not simulate fetching policy from the console on every call. MCP business-state changes are represented at the MCP service boundary rather than by an extra infrastructure/database hop. Only the read-only illustration is being changed, not actual execution or evidence.

## Presenter steps

| Category | With Gateway: 6 steps |
| --- | --- |
| Overview | Configure → Model request → Model response → MCP call → Tool result → Events |
| Access Control | Configure → Approved tool round trip → Restricted call → Deny → Return denial → Events |
| Guardrails | Configure → Inspect/redact request → Inspect/return response → Prompt attack → Deny/return → Events |
| Routing Rules | Configure → Primary request → Eligible error → Backup route → Return response → Events |

Without Gateway has 4 steps per category. Automatic beats inside a step preserve the ordering of processing and request/response legs. Next/Back/Restart and category/route changes cancel prior animation. Hidden tabs stop animation; reduced motion shows the last static beat of the selected step.

## Correctness boundaries

- Evaluate applicable controls in the documented order: Access Control → Routing Rules → Guardrails. Do not imply LLM routing applies to every MCP request.
- MCP access depends on identity, action and resource. Denied calls stop at Gateway; the caller receives the denial instead of an invented tool result.
- The response returns to the same Application / AI Agent that initiated the transaction. Model and MCP transactions are separate, not a multicast response.
- Guardrail inspection follows the assigned request/response policy. The redaction and blocked-prompt examples illustrate different requests and policy outcomes, not guaranteed protection against every input.
- Without Gateway does not guarantee a breach or successful destructive action. Provider, application and MCP authorization can still refuse a request.
- Fallback requires configured conditions. HTTP 503 is an illustrative eligible error here, not a claim that every error triggers fallback or that a particular provider failed live.
- Events are out-of-band observability, not a prerequisite approval step. The final Events step is explanatory grouping, not a promise about when logs arrive.

## Validation

Storyboard tests cover 4/6-step limits, absence of stack-specific UI labels, connected edge sequences, balanced request/response legs, separated model/MCP transactions, management/telemetry separation, denied-tool boundaries, inspection ordering and fallback ordering. They do not constitute live Gateway UAT.

Product sources:
- [TrendAI Gateway Controls](https://docs.trendmicro.com/en-us/documentation/article/trend-vision-one-AIG-controls)
- [TrendAI Gateway Resources](https://docs.trendmicro.com/en-us/documentation/article/trend-vision-one-AIG-resources)
- [Identity Management](https://docs.trendmicro.com/en-us/documentation/article/trend-vision-one-aig-identity-management)

## Production verification — 2026-11-13

- JavaScript checks and all 137 automated tests passed before publication.
- Browser login and Overview Next/Restart worked on the custom production domain.
- All six case routes rendered the shared diagram and Policy / Configuration relationship: Invoice, Database, Email, Model Access, Fallback and Mask Data.
- These checks verify publication and illustration UI, not a new live Gateway execution or policy test.
