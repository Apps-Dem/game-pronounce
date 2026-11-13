# Pronunciation Game

A game for practicing word pronunciation with speech recognition.

## Features
- Word pronunciation practice
- Speech recognition feedback
- Multiple difficulty levels
- Custom word lists
- Visual syllable highlighting

Speech recognition uses Cactus Whistle locally in the browser. The first use
downloads approximately 18 MB of model and engine files from Hugging Face and
requires microphone access and WebAssembly on HTTPS or localhost. Later uses
may reuse the browser's cache. Audio is not sent to the server for transcription;
recognized transcripts and scores are still submitted to the results API, and
optional microphone diagnostics can include transcripts.

## Files
- `index.html` - Main entry point
- `src/` - Source JavaScript and CSS files
- `dist/` - Built static assets

## Deployment

This project is deployed as a Cloudflare Worker with static assets (see `wrangler.jsonc`) at https://pronounce.alldem.app.

### Automatic Deployment with GitHub Actions
The workflow in `.github/workflows/deploy-to-cloudflare.yml` runs `npm run deploy` on pushes to `main` and manual runs. **Manual runs can deploy to production from non-default branches.** The repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` must authorize deployment to the existing Worker and its production resources.

The separate `.github/workflows/preview-cloudflare.yml` workflow creates or updates a Cloudflare Worker Preview named `pr-<number>` for pull requests from branches in this repository; the URL appears in the job log and GitHub Actions step summary. Pull requests from forks do not receive repository secrets and do not deploy previews.

Before enabling PR previews:
1. Configure Cloudflare Access for **previews only** on the `pronounce-game` Worker. Preview URLs are otherwise public. Verify that unauthenticated requests are blocked and intended users can sign in.
2. Set the GitHub Actions repository variable `CLOUDFLARE_PREVIEW_ACCESS_READY` to `true`. This is an administrative confirmation, not an automatic check of the Access policy; remove or change it if protection is removed.
3. Ensure at least one Preview host is enabled on the existing Worker. In the Cloudflare dashboard, open the Worker's **Domains** tab and enable **Preview** under **Worker URL**, or configure a custom domain for previews. The `preview_urls` and custom-domain settings in `wrangler.jsonc` take effect only when applied to the Worker by a production deployment; `wrangler preview` does not apply them. If a preview is deployed but both URL lists are empty, configure a host and rerun the preview workflow. See [Cloudflare's preview URL configuration](https://developers.cloudflare.com/workers/previews/custom-domains/).

New previews are created with `--ignore-base-config` and do not bind the production D1 database. Existing preview secrets can persist across updates. Result and microphone debug logging and the admin dashboard API are therefore unavailable in previews. Preview resources are not automatically deleted when a PR closes.

### Deployment validation

To validate the Worker locally without deploying or applying remote migrations:
```bash
npm run build
npx wrangler deploy --dry-run
```

### For local development:
```bash
npm install
# Apply D1 migrations to local database:
npx wrangler d1 migrations apply pronounce-results --local
# Run the game with the Worker API and local D1 database:
npm run build
npx wrangler dev
```

`npm run dev` starts only the Vite dev server, which does not serve `/api/results`; use `wrangler dev` when testing result logging.

When microphone debug mode is enabled with `?debugMic=1` or `localStorage.setItem("pronounce.debugMic", "1")`, its diagnostic events are also stored in the `debug_mic_events` D1 table. Each event includes its details, browser user agent, timestamp, and a session ID to group events from the same page load. These diagnostics can include recognized transcripts and device information. To inspect recent events:
```bash
npx wrangler d1 execute pronounce-results --remote --command "SELECT created_at, session_id, event, details_json, user_agent FROM debug_mic_events ORDER BY id DESC LIMIT 100"
```

### Important Notes:
- The project uses Vite for bundling
- Wrangler deploys the built `dist` directory as static assets
- The dist directory contains the compiled assets that will be served

If you have any build issues, make sure you're using Node.js 20 or higher.
