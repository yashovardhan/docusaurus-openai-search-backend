# Scalability and Security Features

This backend is designed to handle multiple concurrent users efficiently while protecting against abuse.

## 🛡️ Security Features

### 1. reCAPTCHA v3 Integration
- **Purpose**: Protects against bots and automated abuse
- **Implementation**: Google reCAPTCHA v3 with score-based validation
- **Configuration**:
  ```env
  RECAPTCHA_SECRET_KEY=your-secret-key
  RECAPTCHA_SCORE_THRESHOLD=0.5  # 0.0-1.0, higher = stricter
  ```
- **Protected Endpoints**: `/api/keywords` and `/api/generate-answer`

### 2. Rate Limiting
- **Purpose**: Prevents API abuse and ensures fair usage
- **Default**: 30 requests per minute per IP address
- **Vercel Optimization**: Automatically adjusts for serverless environment

## 🚀 Scalability Features

### 1. Serverless-Ready Architecture
- **Stateless Design**: Each request is independent
- **Automatic Scaling**: Vercel automatically scales based on demand
- **No Server Management**: Zero infrastructure overhead

### 2. Environment-Aware Rate Limiting
The backend detects the deployment environment and adjusts accordingly:

#### Standard Environment (VPS, Docker, etc.)
- Uses in-memory rate limiting
- Strict request limits
- Suitable for single-instance deployments

#### Vercel/Serverless Environment
- Adapts to stateless nature of serverless functions
- More lenient limits (2x standard)
- Proper IP extraction from edge network headers
- Recommended: Use Vercel's Edge Config or external rate limiting service for production

### 3. Concurrent User Handling

#### How It Works:
1. **Request Isolation**: Each API request is handled independently
2. **No Shared State**: No in-memory session storage
3. **Horizontal Scaling**: Vercel automatically spins up multiple instances
4. **Load Distribution**: Requests are distributed across available instances

#### Performance Characteristics:
- **Cold Starts**: ~100-500ms on first request
- **Warm Requests**: <50ms response time
- **Concurrent Requests**: Limited only by Vercel plan limits
- **OpenAI API**: Rate limits apply per API key

## 📊 Handling High Traffic

### Best Practices:

1. **Enable reCAPTCHA**: Reduces bot traffic significantly
   ```javascript
   // Frontend configuration
   recaptcha: {
     siteKey: 'your-site-key'
   }
   ```

2. **Configure Rate Limits**: Adjust based on your needs
   ```env
   RATE_LIMIT=60  # Increase for higher traffic sites
   ```

3. **Monitor Usage**: Track API usage and errors
   - Check Vercel Functions logs
   - Monitor OpenAI API usage dashboard
   - Set up alerts for high usage

4. **Optimize OpenAI Calls**:
   - Use efficient models (gpt-3.5-turbo for keywords)
   - Implement client-side caching
   - Batch requests when possible

### Scaling Limits:

| Component | Limit | Notes |
|-----------|-------|-------|
| Vercel Free | 100GB bandwidth/month | ~1M API calls |
| Vercel Pro | 1TB bandwidth/month | ~10M API calls |
| OpenAI API | Varies by tier | Check your OpenAI limits |
| reCAPTCHA | 1M/month free | Then $1/1000 calls |

## 🔧 Advanced Configuration

### For Very High Traffic (>1000 req/min):

1. **External Rate Limiting**: Use Redis/Upstash
   ```javascript
   // Example: Upstash Redis rate limiting
   import { Ratelimit } from "@upstash/ratelimit";
   import { Redis } from "@upstash/redis";
   ```

2. **Edge Caching**: Cache keyword generation results
   ```javascript
   // Use Vercel Edge Config or KV storage
   ```

3. **Request Queuing**: Implement job queues for heavy operations

4. **Multi-Region Deployment**: Deploy to multiple Vercel regions

## 📈 Monitoring and Debugging

### Key Metrics to Monitor:
- Request rate per minute/hour
- Average response time
- Error rate (4xx/5xx responses)
- OpenAI API usage and costs
- reCAPTCHA scores distribution

### Debug Headers:
When `NODE_ENV !== 'production'`, the API returns helpful headers:
- `X-RateLimit-Limit`: Total allowed requests
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Window reset time

## 🚨 Troubleshooting

### Common Issues:

1. **"Too many requests" errors**
   - Increase `RATE_LIMIT` value
   - Check if IP detection is working correctly
   - Consider implementing user-based rate limiting

2. **High latency**
   - Check OpenAI API response times
   - Enable response caching
   - Use faster models for keywords

3. **reCAPTCHA failures**
   - Verify secret key is correct
   - Check score threshold isn't too high
   - Monitor score distribution

4. **Memory issues on Vercel**
   - Reduce response size limits
   - Stream large responses
   - Optimize document processing 

# Security Best Practices

## API Key Management

1. **Never expose API keys in frontend code**
   - All sensitive keys (OpenAI, GitHub) are stored as environment variables
   - Frontend only knows the backend URL
   
2. **GitHub Token Security**
   - GitHub Personal Access Token is stored as `GITHUB_TOKEN` env var
   - Never passed from frontend to backend
   - Backend handles all GitHub API authentication
   
3. **Domain Whitelisting**
   - Only configured domains can access the backend
   - Set via `ALLOWED_DOMAINS` environment variable

## Monitoring 