# Live Workers AI comparison — sensitive-data case only

Both buttons create fresh, session-owned jobs; neither renders a recorded baseline.
Both paths invoke `@cf/meta/llama-3.2-3b-instruct` through the existing Cloudflare AI binding.

- Direct: browser → authenticated Worker job → EKS runner's local adapter → signed Worker inference → Workers AI.
- Protected: browser → authenticated Worker job → EKS runner → TrendAI AI Gateway → the same EKS adapter → signed Worker inference → Workers AI → Gateway response inspection → runner.

The EKS component is an OpenAI-compatible adapter, not the LLM. `r5r5-summary` remains the Gateway alias. Its existing upstream protocol model ID `synthetic-summary` is retained only to avoid replacing resource IDs/policy targets. It no longer returns canned text after the dedicated provider's URL is switched to the adapter. The actual inferred model is recorded in each result.

## Auth and evidence

The adapter keeps the existing runner signing key in the same process. No key is sent to the browser or copied to another service. The runner no longer needs the fixture control key; it uses the existing demo upstream key for adapter authentication. The new Service is ClusterIP only, with ingress restricted to the Gateway pods on 4892.

The Worker independently verifies the signed active job/claim, accepts only the fixed synthetic fixture or validated redaction, and atomically creates one inference receipt per job. A replay cannot spend another inference. Browser sessions cannot read other sessions' jobs. Completion and input receipts are recorded by the Worker, not inferred from a displayed animation. Errors do not substitute canned answers. A missing receipt alone never establishes a Gateway block. The returned model answer is the answer received through the selected route; raw model text withheld by Gateway is not exposed via polling.

Jobs/receipts expire after 3 minutes and are cleaned up when a new job is created. Existing login/session lifetime remains unchanged. One active comparison request is allowed at a time. Workers AI quota still applies.

## Coordinated rollout

1. Deploy `src/gateway/live-redaction.js` and its worker dispatch before starting the new runner.
2. Update `r5r5-mask-runner-source` ConfigMap with `live.mjs` from `scripts/run-live-redaction.mjs`, `observation.mjs` from the shared public parser, and preserve `run.mjs` as a rollback source.
3. Apply `live-redaction-adapter.json`, then strategically patch `r5r5-mask-runner` using `live-redaction-runner-patch.json`. Existing secret references/mounts and security context are preserved. No public ingress/load balancer is created.
4. Change only the existing `r5r5-demo-summary` provider base URL to `http://r5r5-mask-runner.r5r5-demo.svc.cluster.local:4892`. Keep OpenAI type, existing environment-variable auth, model ID, alias and policy targets unchanged.
5. Deploy the two-button UI, run Direct and Gateway separately, and verify real generated answers plus the original/masked Worker receipts. Check the Gateway request ID in Vision One Events.

The old synthetic-model and MCP service remain available for other demo cases. Do not modify shared policies or unrelated Vision One solutions.

## Verification

`npm test` includes actual SQLite job/receipt persistence, Ed25519 authentication, session isolation, mode validation, one-shot inference, fake success rejection, input restrictions and provider failure behavior. The AI binding is a test double in these tests; production evidence must be checked separately before claiming live deployment complete.
