import express from 'express';
import { createHash } from 'crypto';
import { OpenAI } from 'openai';
import { createRateLimiter } from './rateLimiting';
import { KEYWORD_GENERATION_PROMPT } from '../config';
import algoliasearch from 'algoliasearch';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Algolia client
const algoliaClient = algoliasearch(
  process.env.ALGOLIA_APP_ID || '6OF28D8CMV',
  process.env.ALGOLIA_API_KEY || '425a1e860cb4b9b4ce1f7d9b117c7a81'
);

// Discourse-specific interfaces
export interface DiscourseRequest {
  post: {
    title: string;
    content: string;
    url: string;
    category: string;
    user: {
      username: string;
      trust_level: number;
    };
  };
  context?: {
    tags?: string[];
    previous_replies_count?: number;
    urgency?: 'low' | 'medium' | 'high';
  };
  config?: {
    max_response_length?: number;
    tone?: 'helpful' | 'professional' | 'friendly';
    include_code_examples?: boolean;
  };
}

export interface DiscourseResponse {
  success: boolean;
  response: {
    content: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    should_post: boolean;
    reasoning: string;
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

// Discourse response cache
interface CacheEntry {
  response: DiscourseResponse;
  expiry: number;
}

export class DiscourseResponseCache {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL = parseInt(process.env.DISCOURSE_CACHE_TTL || '3600') * 1000; // Default 1 hour
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0
  };
  
  get(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    return entry;
  }
  
  set(key: string, response: DiscourseResponse): void {
    this.cache.set(key, {
      response,
      expiry: Date.now() + this.TTL
    });
    this.stats.sets++;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hit_rate: total > 0 ? (this.stats.hits / total) * 100 : 0,
      total_requests: total,
      cache_size: this.cache.size
    };
  }

  clear(): void {
    this.cache.clear();
  }
}

// Initialize Discourse cache
export const discourseCache = new DiscourseResponseCache();

// Discourse metrics
export const discourseMetrics = {
  requests_total: 0,
  requests_successful: 0,
  requests_failed: 0,
  avg_processing_time: 0,
  confidence_distribution: { HIGH: 0, MEDIUM: 0, LOW: 0 },
  cache_hit_rate: 0
};

// Discourse-specific rate limiter
export const discourseRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.DISCOURSE_RATE_LIMIT || '10'),
  message: 'Discourse API rate limit exceeded'
});

// Authentication for Discourse requests
export function authenticateDiscourseRequest(req: express.Request): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.slice(7);
  return token === process.env.DISCOURSE_API_KEY;
}

// Generate cache key for Discourse posts
export function generateCacheKey(post: DiscourseRequest['post']): string {
  const contentHash = createHash('md5')
    .update(post.title + post.content)
    .digest('hex');
  const categoryKey = post.category.toLowerCase().replace(/\s+/g, '-');
  return `discourse:${categoryKey}:${contentHash}`;
}

// Clean and process Discourse post content
export function processDiscoursePost(post: DiscourseRequest['post']) {
  // Clean HTML tags and unnecessary whitespace
  const cleanedContent = post.content
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  const combinedQuery = `${post.title} ${cleanedContent}`;
  
  // Extract context clues
  const context = {
    category: post.category,
    userLevel: inferUserLevel(post.user.trust_level),
    postType: classifyPostType(post.title, post.content)
  };
  
  return { cleanedContent, combinedQuery, context };
}

// Infer user experience level from trust level
export function inferUserLevel(trustLevel: number): 'beginner' | 'intermediate' | 'advanced' {
  if (trustLevel <= 1) return 'beginner';
  if (trustLevel <= 3) return 'intermediate';
  return 'advanced';
}

// Classify post type based on content
export function classifyPostType(title: string, content: string): string {
  const text = (title + ' ' + content).toLowerCase();
  
  if (text.includes('how to') || text.includes('how do')) return 'how-to';
  if (text.includes('what is') || text.includes('what are')) return 'what-is';
  if (text.includes('error') || text.includes('issue') || text.includes('problem')) return 'troubleshooting';
  if (text.includes('setup') || text.includes('configure') || text.includes('install')) return 'configuration';
  if (text.includes('api') || text.includes('method') || text.includes('function')) return 'api-reference';
  
  return 'general';
}

// Enhanced keyword generation for Discourse
export async function generateDiscourseKeywords(query: string, context: any): Promise<string[]> {
  const discourseSystemContext = `
    Web3Auth community forum post analysis.
    Category: ${context.category}
    User Level: ${context.userLevel}
    Post Type: ${context.postType}
  `;
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: KEYWORD_GENERATION_PROMPT(6, discourseSystemContext) },
        { role: 'user', content: query }
      ],
      max_tokens: 200,
      temperature: 0.3
    });
    
    const content = response.choices[0]?.message?.content || '[]';
    const keywords = JSON.parse(content);
    return Array.isArray(keywords) ? keywords : [];
  } catch (error) {
    console.error('Discourse keyword generation error:', error);
    return query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
  }
}

// Enhanced Algolia search for Discourse
export async function performEnhancedAlgoliaSearch(keywords: string[], originalQuery: string): Promise<any[]> {
  const index = algoliaClient.initIndex(process.env.ALGOLIA_INDEX_NAME || 'docs-web3auth');
  
  const searchQueries = [
    // Primary search with original query
    { query: originalQuery, params: { hitsPerPage: 4 } },
    // Secondary search with keywords
    { query: keywords.join(' '), params: { hitsPerPage: 4 } },
    // Tertiary search with individual important keywords
    ...keywords.slice(0, 2).map(keyword => ({ 
      query: keyword, 
      params: { hitsPerPage: 2 } 
    }))
  ];
  
  try {
    const results = await Promise.all(
      searchQueries.map(({ query, params }) => 
        index.search(query, {
          hitsPerPage: params.hitsPerPage,
          attributesToRetrieve: ['content', 'hierarchy', 'url', 'anchor', 'objectID'],
          attributesToSnippet: ['content:150'],
          removeWordsIfNoResults: 'allOptional',
          queryType: 'prefixLast',
          typoTolerance: 'min',
          ignorePlurals: true,
          removeStopWords: true
        })
      )
    );
    
    // Combine and deduplicate results
    const allHits = results.flatMap(result => result.hits);
    const uniqueHits = Array.from(
      new Map(allHits.map(hit => [hit.objectID, hit])).values()
    );
    
    // Process and format results
    return uniqueHits.map(hit => ({
      title: hit.hierarchy?.lvl1 || hit.hierarchy?.lvl0 || 'Documentation',
      url: hit.url,
      content: hit.content || hit._snippetResult?.content?.value || '',
      anchor: hit.anchor || '',
      hierarchy: hit.hierarchy || {},
      objectID: hit.objectID
    }));
  } catch (error) {
    console.error('Algolia search error:', error);
    return [];
  }
}

// Generate Discourse response
export async function generateDiscourseResponse(
  query: string, 
  documents: any[], 
  context: any
): Promise<{ answer: string; usage: any }> {
  const discoursePrompt = `You are an expert Web3Auth community assistant. Your role is to provide helpful, accurate responses to community questions based on the official Web3Auth documentation.

Context:
- Category: ${context.category}
- User Level: ${context.userLevel}
- Post Type: ${context.postType}

Guidelines:
1. Provide clear, actionable answers based on the documentation
2. Include relevant code examples when appropriate
3. Adapt complexity to user level (${context.userLevel})
4. Always cite sources with [text](url) format
5. Be helpful and professional
6. If information is incomplete, acknowledge limitations

Question: ${query}`;
  
  const documentContext = documents
    .map((doc: any, index: number) => 
      `## Document ${index + 1}: ${doc.title}\nURL: ${doc.url}\n\n${doc.content}`
    )
    .join('\n\n---\n\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: discoursePrompt },
      { role: 'user', content: `Based on the following documentation, please provide a comprehensive answer:\n\n${documentContext}` }
    ],
    max_tokens: parseInt(process.env.DISCOURSE_MAX_RESPONSE_LENGTH || '1500'),
    temperature: 0.3
  });

  const answer = response.choices[0]?.message?.content || 'Unable to generate answer';
  return { answer, usage: response.usage };
}

// Validate Discourse response quality
export function validateDiscourseResponse(answer: string, sources: any[], originalQuery: string): {
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  should_post: boolean;
  reasoning: string;
  quality_score: number;
} {
  const validation: {
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    should_post: boolean;
    reasoning: string;
    quality_score: number;
  } = {
    confidence: 'MEDIUM',
    should_post: false,
    reasoning: '',
    quality_score: 0
  };
  
  // Quality scoring factors
  const hasCodeExamples = answer.includes('```');
  const hasSourceCitations = sources.length > 0;
  const answerLength = answer.length;
  const hasStepByStep = /step \d+|1\.|2\.|3\.|•|\*/i.test(answer);
  const hasLinks = /\[.*?\]\(.*?\)/.test(answer);
  
  // Calculate relevance score (simple keyword matching)
  const queryWords = originalQuery.toLowerCase().split(/\s+/);
  const answerWords = answer.toLowerCase().split(/\s+/);
  const matchingWords = queryWords.filter(word => answerWords.includes(word));
  const relevanceScore = matchingWords.length / queryWords.length;
  
  // Scoring algorithm
  let score = 0;
  if (hasCodeExamples) score += 25;
  if (hasSourceCitations) score += 30;
  if (hasStepByStep) score += 20;
  if (hasLinks) score += 15;
  if (answerLength > 200) score += 10;
  score += relevanceScore * 25;
  
  // Confidence determination
  if (score >= 80) {
    validation.confidence = 'HIGH';
    validation.should_post = true;
    validation.reasoning = 'High-quality response with complete information';
  } else if (score >= 60) {
    validation.confidence = 'MEDIUM';
    validation.should_post = true;
    validation.reasoning = 'Good response, may need minor review';
  } else {
    validation.confidence = 'LOW';
    validation.should_post = false;
    validation.reasoning = 'Insufficient information or low relevance';
  }
  
  validation.quality_score = score;
  return validation;
}

// Log Discourse metrics
export function logDiscourseMetrics(metrics: any): void {
  if (metrics.success) {
    discourseMetrics.requests_successful++;
    if (metrics.confidence && metrics.confidence in discourseMetrics.confidence_distribution) {
      discourseMetrics.confidence_distribution[metrics.confidence as keyof typeof discourseMetrics.confidence_distribution]++;
    }
  } else {
    discourseMetrics.requests_failed++;
  }
  
  discourseMetrics.requests_total++;
  
  // Update average processing time
  const totalTime = discourseMetrics.avg_processing_time * (discourseMetrics.requests_total - 1);
  discourseMetrics.avg_processing_time = (totalTime + metrics.processing_time) / discourseMetrics.requests_total;
  
  // Log to console for monitoring
  console.log('Discourse Metrics:', {
    success: metrics.success,
    processing_time: metrics.processing_time,
    confidence: metrics.confidence,
    total_requests: discourseMetrics.requests_total,
    success_rate: discourseMetrics.requests_successful / discourseMetrics.requests_total
  });
} 