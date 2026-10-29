# r5r5 TrendAI Demo Platform

A minimal English-language AI security demo with standalone **AI Chat** and an **AI Security** group containing **AI Blueprint**, **AI Risk Insights**, **AI Scanner**, and **AI Guard**. Blueprint and Risk Insights are empty placeholder pages. The example banking application is **r5r5 Bank**.

Powered by Bank Nattavut.

## Password sign-in

The application and all API routes require a server-verified session. The public `/login` screen has a single password field. Its visual assets are explicitly allowlisted, including protection against missing-asset SPA fallbacks. `APP_AUTH_SECRET` is a Cloudflare Worker secret containing a shared demo password and a random signing key; its value must never be committed or placed in browser JavaScript.

Login compares credentials using Web Crypto HMAC verification, then issues an eight-hour host-bound HMAC-signed `__Host-` cookie with Secure, HttpOnly, SameSite=Lax, and Path=/. The password is not in the cookie or browser storage. Login/logout require an exact same-origin POST. Invalid login attempts have a best-effort per-IP throttle within each isolate (not a global distributed rate limit). Missing configuration fails closed.

Sign out clears the browser cookie and chat history. Sessions are stateless; a copied valid cookie remains valid until expiry. Rotate the secret with a new signing key to invalidate all sessions. This is a shared-password demo gate, not individual user identity or enterprise SSO.

The Worker runs before static assets for every route so direct navigation and API calls cannot bypass login. The Node preview remains a static UI preview; `/login.html` previews the appearance but does not authenticate. Use a deployed Worker for actual authentication.

## AI Chat

AI Chat calls Cloudflare Workers AI using the `AI` binding and `@cf/meta/llama-3.2-3b-instruct`. The binding is declared in `wrangler.jsonc`; no model API key is needed. Daily Workers AI free quotas apply. Chat context is stored in browser session storage, capped to five turns. New chat clears this context. Guard Off calls the model directly. Guard On inspects the request and response with the official US TrendAI AI Guard API. Set `AI_GUARD_API_KEY` as an encrypted Cloudflare Worker secret; never put its value in the repository. The application name sent to TrendAI is `r5r5-demo-platform`. Block decisions replace unsafe content, and service/authentication failures stop the request without bypassing Guard.

`POST /api/chat` accepts bounded user/assistant conversation history, rejects client system prompts, and reports provider/usage errors separately. Deploy through the connected Cloudflare Git build. The Node preview server has no AI binding and cannot run live inference; use a deployed Worker for real responses.

## AI Guard comparison

The AI Guard page runs one prompt through two live paths side by side: Without protection and Protected by TrendAI AI Guard. Its footer opens the US Vision One AI Guard console in a new tab. Presets distinguish previously verified enforcement examples from exploratory text-only probes; all use real API calls. After the user changed policy actions, five live examples were verified across three risk categories: LLM01:2026 prompt injection and jailbreak; LLM02:2026 synthetic card data and public AWS example credentials; LLM08:2026 hidden context extraction. They demonstrate input blocking before the model is called, not full category coverage. The selector includes nine OWASP 2026 categories; LLM07 Misinformation is omitted at the user’s request. Six additional categories offer runnable text-only probes using fictional scenarios and real model/Guard calls. A visible scope notice explains that tool execution, artifact scanning, training integrity, load generation, and vector access control are not exercised. These probes do not establish prevention of the full risk category. The five verified examples remain available as variants under LLM01, LLM02, and LLM08. Select a preset, then send once to compare. Each path gets a fresh conversation with the same model and server-owned system instructions. Model generation is nondeterministic, so responses can differ even when both paths are allowed.

An API Block is labeled blocked. The observed HTTP 403 `SensitiveDataDetected` denial is also enforced and labeled separately as Blocked by TrendAI API; generic 401/403 responses remain configuration errors. An Allow is shown as allowed even if the model refuses the request. Results arrive independently; errors do not hide the other path. View details shows measured client elapsed time, returned Guard reasons, and decision IDs. New comparison cancels pending browser requests and clears the displayed results; already-started upstream processing may still finish. Comparisons are held in page memory and do not change AI Chat history.

Validation evidence, product sources, and excluded OWASP risks are recorded in [docs/guard-validation.md](docs/guard-validation.md).

## AI Scanner status

AI Scanner now has two minimal pages, available from the hover/click navigation submenu:

- **Standard Scan** (`#scanner`): select five objective groups, preview three planned prompts per group, and enter an HTTPS target endpoint.
- **Agentic Scan** (`#agentic`): select an objective, set a maximum of 3/5/10 attempts, and inspect the objective before execution.

These are configuration interfaces, not an implemented scan runner. Run buttons remain disabled with an explicit connection status. The previous simulated findings and progress playback have been removed. Validate URL checks URL syntax only; it does not contact the endpoint. Target credentials must be configured on the runner. No attacker, target or judge request is sent by these pages.

Live execution still requires a GitHub Actions/TMAS runner, separate service authentication for the target, synthetic target context, attacker/judge credentials and report ingestion. Sensitive-data and hidden-instruction evaluation must verify the seeded values; indirect injection currently previews document text in a request, not a real retrieval pipeline. Custom objective tags and TMAS schema versions must be validated when connecting the runner.

## Connect Cloudflare Workers to this repository

Create a Worker using **Import a repository** in Cloudflare Workers & Pages and select this repository.

| Setting | Value |
| --- | --- |
| Worker / project name | `bank-nattavut-demo-platform` |
| Production branch | `main` |
| Root directory | Repository root (`/`) |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |

Use the Worker name shown above so it matches `wrangler.jsonc`. The build command checks JavaScript syntax; there is no frontend compilation step. Wrangler publishes the static files from `public/` together with `src/worker.js`.

The static UI can deploy without TrendAI secrets. Live Guard requests require `AI_GUARD_API_KEY`; live inference requires the declared Workers AI binding. With the repository connected to Workers Builds, pushes to main trigger deployment.

Cloudflare build settings: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/

## Local development

Use Node.js 22 or later.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:8787. The local preview server uses Node.js and serves the same static UI; it is not a Workers runtime emulator.

```sh
npm run build
npm run deploy:check
```

`deploy:check` bundles the Worker without publishing it. `npm run deploy` performs a real deployment and requires Cloudflare authentication.

## Worker behavior

- `GET /api/health` reports whether the AI binding and Guard secret are configured; it does not test connectivity.
- `POST /api/chat` handles live chat and Guard comparisons.
- Other `/api/*` routes return HTTP 503 until those integrations are implemented.
- Page and asset requests are served through the `ASSETS` binding.

## Next integrations

1. Add separately authenticated scanner target endpoints.
2. Add a GitHub Actions workflow to run a pinned TMAS CLI against those endpoints.
3. Import real scan reports into the finding workflow.
4. Add Gateway and Agentic controls as separate integrations.

Keep API keys in Cloudflare or GitHub Secrets. Local `.env` and `.dev.vars` files are ignored by Git. Future Gateway and Agentic integrations can reuse the banking context and evidence model.

## Fonts

Inter is bundled in `public/fonts/` under the included SIL Open Font License (`public/fonts/OFL.txt`). No external font request is needed.
