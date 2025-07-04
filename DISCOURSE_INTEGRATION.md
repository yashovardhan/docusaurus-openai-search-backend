# Discourse Integration Documentation

## Overview

The Discourse Integration feature provides an enhanced AI-powered endpoint specifically designed to generate high-quality responses for community forum posts. This integration leverages the existing RAG (Retrieval-Augmented Generation) pipeline with Discourse-specific enhancements for better community engagement.

## Features

### 🎯 **Smart Response Generation**
- Context-aware responses based on post category, user level, and content type
- Automatic query type detection (how-to, troubleshooting, configuration, etc.)
- Intelligent keyword extraction and document retrieval
- Quality validation with confidence scoring

### 🔒 **Security & Authentication**
- API key-based authentication
- Rate limiting (configurable, default: 10 requests/minute)
- Input validation and sanitization
- Error handling with appropriate HTTP status codes

### ⚡ **Performance Optimization**
- Response caching with configurable TTL (default: 1 hour)
- Efficient Algolia search integration
- Metrics and monitoring capabilities
- Optimized for serverless deployment

### 📊 **Quality Assurance**
- Comprehensive response validation
- Source citation requirements
- Confidence scoring (HIGH/MEDIUM/LOW)
- Automatic posting recommendations

## Quick Start

### 1. Environment Setup

Add the following environment variables to your `.env` file:

```bash
# Required
DISCOURSE_API_KEY=your-discourse-specific-api-key-here

# Optional (with defaults)
DISCOURSE_RATE_LIMIT=10                    # Requests per minute
DISCOURSE_CACHE_TTL=3600                   # Cache TTL in seconds (1 hour)
DISCOURSE_MAX_RESPONSE_LENGTH=1500         # Maximum response length in tokens
```

### 2. API Endpoint

The main endpoint is available at:
```
POST /api/discourse-response
```

### 3. Authentication

Include your API key in the Authorization header:
```
Authorization: Bearer your-discourse-api-key
```

## API Reference

### POST /api/discourse-response

Generates an AI response for a Discourse forum post.

#### Request Body

```typescript
interface DiscourseRequest {
  post: {
    title: string;              // Post title
    content: string;            // Post content/body
    url: string;                // Forum post URL
    category: string;           // Forum category
    user: {
      username: string;         // User who posted
      trust_level: number;      // User trust level (0-5)
    };
  };
  context?: {
    tags?: string[];            // Optional tags
    previous_replies_count?: number;
    urgency?: 'low' | 'medium' | 'high';
  };
  config?: {
    max_response_length?: number;
    tone?: 'helpful' | 'professional' | 'friendly';
    include_code_examples?: boolean;
  };
}
```

#### Response Format

```typescript
interface DiscourseResponse {
  success: boolean;
  response: {
    content: string;            // Generated response
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    should_post: boolean;       // Recommendation
    reasoning: string;          // Explanation
  };
  sources: Array<{
    title: string;
    url: string;
    relevance_score: number;
  }>;
  metadata: {
    keywords_used: string[];
    documents_analyzed: number;
    processing_time_ms: number;
    query_type: string;
  };
}
```

#### Example Request

```bash
curl -X POST https://your-backend.vercel.app/api/discourse-response \
  -H "Authorization: Bearer your-discourse-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "post": {
      "title": "How to integrate Web3Auth with React",
      "content": "I am trying to integrate Web3Auth into my React application. Can someone help me with the basic setup steps?",
      "url": "https://community.web3auth.io/t/react-integration-help/12345",
      "category": "Integration Help",
      "user": {
        "username": "developer123",
        "trust_level": 1
      }
    },
    "context": {
      "tags": ["react", "integration", "web3auth"],
      "urgency": "medium"
    },
    "config": {
      "max_response_length": 1500,
      "tone": "helpful",
      "include_code_examples": true
    }
  }'
```

#### Example Response

```json
{
  "success": true,
  "response": {
    "content": "Welcome to the Web3Auth community! I'd be happy to help you integrate Web3Auth with React.\n\nHere's a step-by-step guide to get you started:\n\n## 1. Installation\n\n```bash\nnpm install @web3auth/modal\n```\n\n## 2. Basic Setup\n\n```javascript\nimport { Web3Auth } from \"@web3auth/modal\";\n\nconst web3auth = new Web3Auth({\n  clientId: \"your-client-id\",\n  chainConfig: {\n    chainNamespace: \"eip155\",\n    chainId: \"0x1\"\n  }\n});\n```\n\n[Continue with detailed implementation...]\n\nFeel free to ask if you need help with any specific part of the integration!",
    "confidence": "HIGH",
    "should_post": true,
    "reasoning": "High-quality response with complete information"
  },
  "sources": [
    {
      "title": "React Integration Guide",
      "url": "https://web3auth.io/docs/react-integration",
      "relevance_score": 0.92
    }
  ],
  "metadata": {
    "keywords_used": ["react", "integration", "web3auth", "setup"],
    "documents_analyzed": 5,
    "processing_time_ms": 2341,
    "query_type": "how-to"
  }
}
```

### GET /api/discourse-metrics

Retrieves metrics about the Discourse integration performance.

#### Response Format

```json
{
  "metrics": {
    "requests_total": 156,
    "requests_successful": 142,
    "requests_failed": 14,
    "avg_processing_time": 2847.5,
    "confidence_distribution": {
      "HIGH": 89,
      "MEDIUM": 53,
      "LOW": 14
    },
    "cache_hit_rate": 0.73
  },
  "cache_size": 45,
  "uptime": 86400
}
```

## Response Quality & Validation

### Confidence Scoring

The system uses a comprehensive scoring algorithm to determine response quality:

- **HIGH (≥80 points)**: Complete, well-structured response with code examples and sources
- **MEDIUM (60-79 points)**: Good response, may need minor review
- **LOW (<60 points)**: Insufficient information or low relevance

### Scoring Factors

| Factor | Points | Description |
|--------|--------|-------------|
| Code Examples | 25 | Response includes code snippets |
| Source Citations | 30 | Has documentation references |
| Step-by-Step Guide | 20 | Structured instructions |
| Embedded Links | 15 | Contains relevant links |
| Adequate Length | 10 | Response is substantial (>200 chars) |
| Keyword Relevance | 0-25 | Based on query match percentage |

### Post Recommendations

- **should_post: true** - Response meets quality standards
- **should_post: false** - Response needs human review or improvement

## User Experience Optimization

### Trust Level Adaptation

The system adapts responses based on user trust levels:

- **Level 0-1 (Beginner)**: Simple explanations, basic examples
- **Level 2-3 (Intermediate)**: Detailed guides, best practices
- **Level 4-5 (Advanced)**: Technical depth, advanced configurations

### Query Type Detection

Automatic classification enables tailored responses:

- **how-to**: Step-by-step instructions
- **what-is**: Concept explanations
- **troubleshooting**: Problem-solving approaches
- **configuration**: Setup and settings guidance
- **api-reference**: Technical specifications

## Caching Strategy

### Cache Key Generation

Cache keys are generated using:
```
discourse:{category}:{content-hash}
```

### Cache Behavior

- **TTL**: Configurable (default: 1 hour)
- **Invalidation**: Automatic on expiry
- **Hit Rate**: Typically >60% for active communities

## Error Handling

### HTTP Status Codes

- **200**: Success
- **400**: Bad Request (invalid input)
- **401**: Unauthorized (invalid API key)
- **429**: Too Many Requests (rate limit exceeded)
- **500**: Internal Server Error

### Error Response Format

```json
{
  "success": false,
  "error": "Error description"
}
```

## Testing

### Running Tests

```bash
# Set environment variables
export DISCOURSE_API_KEY=your-test-api-key
export TEST_URL=http://localhost:3000

# Run the test suite
node test-discourse-integration.js
```

### Test Coverage

The test suite covers:
- Authentication validation
- Response quality assessment
- Cache functionality
- Error handling
- Performance metrics
- Rate limiting

## Integration with Zapier

### Zapier Webhook Setup

1. **Create Webhook Trigger**: Set up a Zapier webhook that triggers on new Discourse posts
2. **Configure Payload**: Map Discourse post data to the expected format
3. **Set Authorization**: Include the Bearer token in headers
4. **Handle Response**: Process the AI response and post to Discourse

### Example Zapier Configuration

```javascript
// Zapier webhook payload transformation
const payload = {
  post: {
    title: inputData.topic_title,
    content: inputData.raw,
    url: inputData.url,
    category: inputData.category,
    user: {
      username: inputData.username,
      trust_level: inputData.trust_level
    }
  }
};

// Send to Discourse endpoint
const response = await fetch('https://your-backend.vercel.app/api/discourse-response', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.DISCOURSE_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
});
```

## Best Practices

### 1. Content Quality

- Ensure posts have sufficient content for analysis
- Include relevant category information
- Provide accurate user trust levels

### 2. Performance Optimization

- Use caching effectively
- Monitor response times
- Set appropriate rate limits

### 3. Security

- Rotate API keys regularly
- Monitor for abuse patterns
- Implement proper logging

### 4. Community Engagement

- Review low-confidence responses before posting
- Customize tone based on community culture
- Monitor community feedback

## Monitoring & Analytics

### Key Metrics

- **Response Quality**: Confidence distribution over time
- **Processing Time**: Average and p95 response times
- **Cache Performance**: Hit rates and cache size
- **Error Rates**: Failed requests and error patterns

### Logging

The system logs:
- Request/response pairs
- Performance metrics
- Error details
- Cache operations

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify API key is set correctly
   - Check Authorization header format

2. **Rate Limiting**
   - Adjust `DISCOURSE_RATE_LIMIT` if needed
   - Implement exponential backoff in clients

3. **Low Quality Responses**
   - Review source document quality
   - Adjust validation thresholds
   - Improve keyword generation

4. **Cache Issues**
   - Monitor cache hit rates
   - Adjust TTL settings
   - Clear cache if needed

### Debug Mode

Enable debug logging by setting:
```bash
NODE_ENV=development
```

## Deployment

### Vercel Deployment

The integration is optimized for Vercel with:
- 30-second timeout for processing
- Automatic scaling
- Built-in monitoring

### Environment Variables

Ensure all required environment variables are set in your deployment environment:

```bash
OPENAI_API_KEY=sk-...
DISCOURSE_API_KEY=your-discourse-key
ALLOWED_DOMAINS=https://your-frontend.com
```

## Migration Guide

### From Basic Zapier Integration

1. **Set up environment variables**
2. **Test with existing posts**
3. **Gradually migrate traffic**
4. **Monitor performance**
5. **Optimize based on results**

### Backward Compatibility

The Discourse integration doesn't affect existing endpoints:
- `/api/keywords` - Unchanged
- `/api/generate-answer` - Unchanged
- `/api/multi-source-search` - Unchanged

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the test suite results
3. Enable debug logging
4. Contact the development team

## Changelog

### v3.0.0 - Initial Release
- Added Discourse integration endpoint
- Implemented response caching
- Added comprehensive testing
- Created monitoring capabilities
- Integrated with existing RAG pipeline

---

*This documentation is maintained alongside the codebase and should be updated with any API changes.* 