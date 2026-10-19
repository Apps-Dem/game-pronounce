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

This project is designed to be deployed as a static site. It can be easily deployed using Cloudflare Pages or similar static hosting services.

### To deploy with Cloudflare Pages:
1. Push this repository to GitHub/GitLab
2. Create a new Pages project in Cloudflare Dashboard
3. Set build command: `npm run build` 
4. Set output directory: `dist`
5. Add custom domain `pronounce.game.alldem.app`

### For local development:
```bash
npm install
npm run dev
```

### Important Notes:
- The project uses Vite for bundling
- Cloudflare Pages will automatically install dependencies and build the application using the existing package.json
- The dist directory contains the compiled assets that will be served

If you have any build issues, make sure you're using a modern Node.js version (16 or higher) locally for development.