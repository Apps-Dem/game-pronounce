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
npm run deploy
```

### For local development:
```bash
npm install
npm run dev
```

### Important Notes:
- The project uses Vite for bundling
- Wrangler deploys the built `dist` directory as static assets
- The dist directory contains the compiled assets that will be served

If you have any build issues, make sure you're using Node.js 20 or higher.
