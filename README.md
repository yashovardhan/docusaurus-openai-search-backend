# Docusaurus OpenAI Search Backend

AI backend service for the Docusaurus OpenAI Search plugin. This service is the brain of the AI search functionality, handling all AI operations including intelligent keyword generation and RAG-based answer generation, while keeping your OpenAI API keys secure on the server side.

## Architecture

This backend service is responsible for:
- **AI Logic**: All prompts and AI interactions are handled here
- **Keyword Generation**: Analyzes queries to generate optimal search keywords
- **Answer Generation**: Uses RAG to create comprehensive answers from documentation
- **Security**: Keeps API keys secure and validates all requests
- **Bot Protection**: reCAPTCHA v3 integration to prevent abuse
- **Scalability**: Optimized for serverless deployment with smart rate limiting

The frontend SDK simply coordinates between this backend and Algolia search.

## Deployment Status

Deployed on Vercel: https://docusaurus-openai-search-backend.vercel.app

## Features

- 🔑 Secure API key management
- 🎯 Intelligent keyword generation from user queries
- 📚 RAG-based answer generation from documentation
- ⚡ Smart rate limiting (environment-aware)
- 🌐 CORS configuration for secure frontend communication
- 🛡️ reCAPTCHA v3 integration for bot protection
- 🚀 Optimized for Vercel/serverless deployment
- 📊 Handles multiple concurrent users efficiently

## Quick Start

1. Clone this repository

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

### POST /api/keywords
Generates optimized search keywords from a user query.

**Request:**
```json
{
  "query": "How do I authenticate users?",
  "systemContext": "Documentation for a React authentication library",
  "maxKeywords": 5
}
```

**Response:**
```json
{
  "keywords": ["user authentication", "login setup", "auth configuration", "authentication methods", "secure login"],
  "usage": { /* OpenAI usage stats */ }
}
```

### POST /api/generate-answer
Generates a comprehensive answer using RAG from provided documents.

**Request:**
```json
{
  "query": "How do I authenticate users?",
  "documents": [
    {
      "title": "Authentication Guide",
      "url": "https://docs.example.com/auth",
      "content": "..."
    }
  ],
  "systemContext": "Documentation for a React authentication library",
  "model": "gpt-4o-mini",
  "maxTokens": 1500
}
```

**Response:**
```json
{
  "answer": "To authenticate users in our React library...",
  "usage": { /* OpenAI usage stats */ },
  "model": "gpt-4o-mini"
}
```

### POST /api/chat/completions (Legacy)
Direct proxy to OpenAI chat completions API (kept for backward compatibility).

### POST /api/summarize (Legacy)
Summarizes documentation content (kept for backward compatibility).

## Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `OPENAI_API_KEY` | Yes | Your OpenAI API key | - |
| `ALLOWED_DOMAINS` | Yes | Comma-separated list of allowed domains | - |
| `PORT` | No | Port to run the server on | 3000 |
| `NODE_ENV` | No | Environment (development/production) | development |
| `RATE_LIMIT` | No | Max requests per minute per IP | 30 |
| `GITHUB_TOKEN` | No | GitHub Personal Access Token for issue/discussion search | - |
| `RECAPTCHA_SECRET_KEY` | No | Google reCAPTCHA v3 secret key | - |
| `RECAPTCHA_SCORE_THRESHOLD` | No | Minimum reCAPTCHA score (0.0-1.0) | 0.5 |

### Security Note

The GitHub Personal Access Token (`GITHUB_TOKEN`) is stored securely as an environment variable on the backend. It is never exposed to or passed from the frontend, ensuring your token remains secure.

## Security

- **Domain Whitelisting**: Set `ALLOWED_DOMAINS` to your site URLs
- **Rate Limiting**: Smart rate limiting that adapts to deployment environment
  - Standard environments: 30 requests/minute per IP
  - Vercel/serverless: Automatically adjusted for stateless nature
- **reCAPTCHA v3**: Bot protection with score-based validation
- **CORS**: Properly configured with credentials support
- **HTTPS**: Always use HTTPS in production
- **API Key Security**: All sensitive keys (OpenAI, GitHub) stored as environment variables

## Scalability

This backend is designed to handle high traffic and multiple concurrent users:

- **Serverless-Ready**: Optimized for Vercel and similar platforms
- **Stateless Design**: No session storage, perfect for horizontal scaling
- **Automatic Scaling**: Leverages platform auto-scaling capabilities
- **Environment Detection**: Automatically adjusts behavior for optimal performance

For detailed information about scalability and handling high traffic, see [SCALABILITY.md](./SCALABILITY.md).

## License

MIT