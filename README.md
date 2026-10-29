# r5r5 TrendAI Demo Platform

A minimal English-language AI security demo with two modules: **AI Scanner** and **AI Guard**. The example banking application is **r5r5 Bank**.

Powered by Bank Nattavut.

## Current status

This version is an interactive UI preview. All chat replies, policy decisions, scan findings, and timings are local synthetic fixtures. It does not call an LLM, AI Guard, TMAS, or GitHub Actions. Sample results are labeled in the relevant screens.

- AI Scanner: target configuration, a sensitive-data-disclosure objective, example findings, and sample report export.
- AI Guard: Guard off/on comparison, input/output inspection traces, normal banking requests, request history, and JSON export.
- Minimal two-module navigation, Inter fonts bundled locally, and a responsive light console.

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

No LLM or TrendAI secrets are needed to deploy this UI preview. The user connects and deploys the Worker through Cloudflare; pushing this repository alone does not deploy a Worker.

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

- `GET /api/health` returns the preview mode and unconfigured integration statuses.
- Other `/api/*` routes return HTTP 503 until live integrations are implemented.
- Page and asset requests are served through the `ASSETS` binding.

## Next integrations

1. Connect a model provider and TrendAI AI Guard through server-side adapters.
2. Add separately authenticated baseline and protected chat endpoints with the same model and banking context.
3. Add a GitHub Actions workflow to run a pinned TMAS CLI against those endpoints.
4. Import real scan reports into the existing finding and evidence workflow.

Keep API keys in Cloudflare or GitHub Secrets. Local `.env` and `.dev.vars` files are ignored by Git. Future Gateway and Agentic integrations can reuse the banking context and evidence model.

## Fonts

Inter is bundled in `public/fonts/` under the included SIL Open Font License (`public/fonts/OFL.txt`). No external font request is needed.
