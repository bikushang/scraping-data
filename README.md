# Insta Fetcher

React/Vite frontend with a Netlify Function for the Instagram profile endpoint.

## Netlify deployment

Use the repository root as Netlify's base directory. The included `netlify.toml` sets:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

For MongoDB caching, add `MONGODB_URI` under Netlify project settings → Environment variables. Do not upload an `.env` file or commit credentials. The backend works without MongoDB, but it will not cache profiles.

For local development:

```bash
npm run dev
cd server
npm install
npm start
```
