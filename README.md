# Pronunciation Game

A game for practicing word pronunciation with speech recognition.

## Features
- Word pronunciation practice
- Speech recognition feedback
- Multiple difficulty levels
- Custom word lists
- Visual syllable highlighting

## Files
- `index.html` - Main entry point
- `src/` - Source JavaScript and CSS files
- `dist/` - Built static assets

## Deployment

This project is deployed as a Cloudflare Worker with static assets (see `wrangler.jsonc`) at https://pronounce.alldem.app.

### Automatic Deployment with GitHub Actions
The workflow in `.github/workflows/deploy-to-cloudflare.yml` runs `npm run deploy` on every push to `main`. It needs the repository secrets `CLOUDFLARE_API_TOKEN` (Workers edit permission plus DNS/zone access for the custom domain) and `CLOUDFLARE_ACCOUNT_ID`.

### Manual Deployment:
```bash
npx wrangler login
# Apply D1 migrations (one-time setup for remote database):
npx wrangler d1 migrations apply pronounce-results --remote
# For local development database:
npx wrangler d1 migrations apply pronounce-results --local
npm run deploy
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

### Important Notes:
- The project uses Vite for bundling
- Wrangler deploys the built `dist` directory as static assets
- The dist directory contains the compiled assets that will be served

If you have any build issues, make sure you're using Node.js 20 or higher.
