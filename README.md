# Docusaurus OpenAI Search Backend Proxy

A simple, secure backend proxy for the Docusaurus OpenAI Search plugin that keeps your API key safe on the server.

## Features

- 🔒 **Secure**: API key stored server-side only
- 🛡️ **Domain Whitelisting**: Only authorized domains can access
- ⚡ **Rate Limiting**: Built-in protection against abuse
- 🚀 **Simple**: Minimal dependencies, easy to deploy

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo>
cd backend-proxy
npm install
```

### 2. Configure Environment

Copy `env.example` to `.env` and update:

```bash
cp env.example .env
```

Required variables:
- `OPENAI_API_KEY`: Your OpenAI API key
- `ALLOWED_DOMAINS`: Comma-separated list of allowed domains

### 3. Run

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## Deployment

### Vercel

```bash
npm run build
vercel
```

Then add environment variables in Vercel dashboard.

### Railway

1. Connect your GitHub repo to Railway
2. Add environment variables
3. Deploy (automatic)

### Heroku

```bash
heroku create your-app-name
heroku config:set OPENAI_API_KEY=sk-...
heroku config:set ALLOWED_DOMAINS=https://your-site.com
git push heroku main
```

### Any Node.js Host

1. Build: `npm run build`
2. Upload `dist/`, `package.json`, `package-lock.json`
3. Set environment variables
4. Run: `npm install --production && npm start`

## API Endpoints

### POST /api/chat/completions
OpenAI chat completion proxy.

### POST /api/summarize
Document summarization endpoint.

### GET /health
Health check endpoint.

## Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...              # Your OpenAI API key
ALLOWED_DOMAINS=https://site.com   # Comma-separated domains

# Optional
PORT=3000                          # Server port
NODE_ENV=production               # Environment
RATE_LIMIT=30                     # Requests per minute
```

## Security

- **Domain Whitelisting**: Set `ALLOWED_DOMAINS` to your site URLs
- **Rate Limiting**: Default 30 requests/minute per IP
- **CORS**: Properly configured with credentials support
- **HTTPS**: Always use HTTPS in production

## License

MIT 