# AI Gateway Preview release — 2026-11-01

This release integrates the twelve synthetic LeakReady scenarios into the existing r5r5 platform at `/#gateway/s03`. It uses the existing login and does not replace its password.

## Final UI scope

- AI Guard remains its existing direct navigation link, use-case grid, prompts and live behavior. Its implementation block is unchanged.
- AI Chat remains its existing direct navigation link.
- AI Scanner retains Standard Scan / Agentic Scan, using the shared rounded dropdown presentation.
- AI Gateway has a **Preview** badge and three category flyouts: Data leakage, Prompt & tool attacks, Agent misuse. The twelve use-case links open focused views.
- AI Risk Insights and AI Blueprint remain **TBD** placeholders and direct links.

## Runtime boundaries

Gateway routes are under `/api/gateway/*` and pass the same platform authentication gate as other private APIs. All Gateway assets are also authenticated. The Gateway view is embedded from the same origin at `/gateway/`; only this exact view and its canonical index alias allow SAMEORIGIN framing, with `frame-ancestors 'self'`. Other pages retain frame denial.

Gateway execution is server-forced scripted replay with in-process MCP tools and a synthetic communication sink. Passing `mode: llm` does not enable inference. No external MCP endpoint, arbitrary model endpoint or live Gateway protection is exposed in this hosted preview. The protected panel remains Not connected.

D1 `LR_DB` and `LR_DB_PROTECTED` hold separately seeded synthetic datasets. KV `LR_EVENTS` and `LR_STATE` are dedicated to Gateway events and run mirrors. Existing `SCAN_JOBS` and scanner bindings are preserved. Reset touches only Gateway resources. Preview state is shared among people using this password-protected demo workspace; it is not per-employee identity.

The preview displays actual demo database mutations and payload observations. Scripted replay does not prove that a live model follows an injection or a Gateway blocks it. No real email/Slack messages or live model inference occur through these routes.

## Validation

- 57 Node tests passed, including the existing Chat, Guard, authentication and Scanner suites.
- All 12 integrated Gateway cases passed through Wrangler local with exact observed damage metrics and protected Not connected. An attempted `mode: llm` remained scripted.
- Browser verification: existing login; unified header labels; original AI Guard page; Gateway S06 produces 50 PII records in the sink; iframe loads under its narrow same-origin policy.
- Wrangler dry-run bundle check passed before deployment.
- Previous production version recorded for rollback: `742733b0-9f46-450c-8985-51d75f19651d`.

Live product Gateway enforcement, live agent/model selection, OIDC and isolated per-operator workspaces remain future work.
