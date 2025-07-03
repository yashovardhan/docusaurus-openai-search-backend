import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import { recaptchaMiddleware } from './middleware/recaptcha';
import { createRateLimiter, rateLimitLogger, customRateLimitHandler } from './middleware/rateLimiting';
import { 
  DEFAULT_CONFIG, 
  KEYWORD_GENERATION_PROMPT, 
  ANSWER_GENERATION_PROMPT,
  QUERY_SPECIFIC_PROMPTS,
  RESULT_AGGREGATION_PROMPT
} from './config';
import { RecursiveEnhancer, DocumentContent } from './services/recursiveEnhancer';

// Load environment variables
dotenv.config();

// Validate required environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY is required');
  process.exit(1);
}

if (!process.env.ALLOWED_DOMAINS) {
  console.error('Error: ALLOWED_DOMAINS is required');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Parse allowed domains
const allowedDomains = process.env.ALLOWED_DOMAINS.split(',').map(d => d.trim());

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like curl, Postman, or server-to-server requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if the origin is allowed
    if (allowedDomains.some(domain => {
      // Support wildcard subdomains
      if (domain.startsWith('*.')) {
        const baseDomain = domain.slice(2);
        return origin.endsWith(baseDomain);
      }
      return origin === domain || origin.endsWith(`://${domain}`);
    })) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));

// Enhanced rate limiting for Vercel/serverless environments
const limiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT || '30'),
  message: 'Too many requests, please try again later.',
  handler: customRateLimitHandler
});

// Apply rate limiting to API routes
app.use('/api/', limiter);

// Optional: Add rate limit logging for debugging
if (process.env.NODE_ENV !== 'production') {
  app.use(rateLimitLogger());
}

// Apply reCAPTCHA middleware to API endpoints
const captcha = recaptchaMiddleware({
  skipPaths: ['/health', '/api/chat/completions', '/api/summarize'],
  scoreThreshold: parseFloat(process.env.RECAPTCHA_SCORE_THRESHOLD || '0.5'),
  enabledActions: ['keywords', 'generate_answer']
});

// Apply captcha middleware only to specific endpoints
app.use('/api/keywords', captcha);
app.use('/api/generate-answer', captcha);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize RecursiveEnhancer for Stage 3 fine-tuned model support
const recursiveEnhancer = new RecursiveEnhancer();

/**
 * Week 3 Enhancement: Query type detection for intelligent processing
 */
interface QueryAnalysis {
  type: 'how-to' | 'what-is' | 'troubleshooting' | 'configuration' | 'api-reference' | 'general';
  intent: string;
  reformulated?: string;
  keywords: string[];
  complexity: 'beginner' | 'intermediate' | 'advanced';
}

async function analyzeQueryIntent(query: string): Promise<QueryAnalysis> {
  try {
    const analysisPrompt = `Analyze this documentation search query and categorize it.

Query: "${query}"

Determine:
1. Type: how-to, what-is, troubleshooting, configuration, api-reference, or general
2. Intent: What the user is trying to accomplish (1 sentence)
3. Reformulated: A clearer version of the query if needed
4. Keywords: 3-5 key search terms
5. Complexity: beginner, intermediate, or advanced

Return ONLY valid JSON in this format:
{
  "type": "how-to",
  "intent": "User wants to learn how to...",
  "reformulated": "clearer query version",
  "keywords": ["term1", "term2", "term3"],
  "complexity": "beginner"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: analysisPrompt },
        { role: 'user', content: query }
      ],
      max_tokens: 300,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content || '{}';
    const analysis = JSON.parse(content);
    
    // Validate and provide fallbacks
    return {
      type: analysis.type || 'general',
      intent: analysis.intent || 'General information request',
      reformulated: analysis.reformulated || query,
      keywords: Array.isArray(analysis.keywords) ? analysis.keywords : [],
      complexity: analysis.complexity || 'beginner'
    };
  } catch (error) {
    console.error('Query analysis failed:', error);
    // Fallback to basic analysis
    const isHowTo = /how\s+to|how\s+do|how\s+can/i.test(query);
    const isWhatIs = /what\s+is|what\s+are|what\s+does/i.test(query);
    const isTroubleshooting = /error|issue|problem|fix|broken|not\s+working/i.test(query);
    const isConfig = /config|setup|install|configure/i.test(query);
    
    let type: QueryAnalysis['type'] = 'general';
    if (isHowTo) type = 'how-to';
    else if (isWhatIs) type = 'what-is';
    else if (isTroubleshooting) type = 'troubleshooting';
    else if (isConfig) type = 'configuration';
    
    return {
      type,
      intent: `User is asking about ${query}`,
      reformulated: query,
      keywords: query.toLowerCase().split(/\s+/).filter(w => w.length > 2).slice(0, 5),
      complexity: 'beginner'
    };
  }
}

/**
 * Enhanced Week 2 validation system with comprehensive response analysis
 */
interface ValidationResult {
  isValid: boolean;
  hasCitation: boolean;
  hasConfidence: boolean;
  confidence: string;
  isNotFound: boolean;
  warnings: string[];
  score: number;
  qualityMetrics: {
    hasCodeExamples: boolean;
    hasStepByStep: boolean;
    hasSpeculativeLanguage: boolean;
    citationCount: number;
    wordCount: number;
  };
}

function validateAIResponse(answer: string, documents: any[]): ValidationResult {
  const warnings: string[] = [];
  
  // Check for citations
  const citations = answer.match(/\[Source:.*?\]\(.*?\)/g) || [];
  const hasCitation = citations.length > 0;
  
  // Check for confidence
  const confidenceMatch = answer.match(/Confidence:\s*(HIGH|MEDIUM|LOW)/i);
  const hasConfidence = !!confidenceMatch;
  const confidence = confidenceMatch?.[1]?.toUpperCase() || 'UNKNOWN';
  
  // Check if it's a "not found" response
  const notFoundPattern = /couldn't find this information|not.*in.*documentation|no.*information.*available/i;
  const isNotFound = notFoundPattern.test(answer);
  
  // Quality metrics
  const hasCodeExamples = /```[\s\S]*?```|\`[^`]+\`/g.test(answer);
  const hasStepByStep = /\d+\.\s|\n-\s|\n\*\s/g.test(answer);
  const speculativeWords = /might be|probably|likely|seems like|appears to|I think|I believe/i;
  const hasSpeculativeLanguage = speculativeWords.test(answer);
  const wordCount = answer.split(/\s+/).length;
  
  // Validation warnings
  if (!hasCitation && !isNotFound) {
    warnings.push('Response should include source citations');
  }
  if (!hasConfidence) {
    warnings.push('Response should include confidence level');
  }
  if (hasSpeculativeLanguage && !isNotFound) {
    warnings.push('Response contains speculative language');
  }
  if (wordCount < 20 && !isNotFound) {
    warnings.push('Response may be too brief');
  }
  if (documents.length > 0 && citations.length === 0 && !isNotFound) {
    warnings.push('Response should reference provided documents');
  }
  
  // Calculate comprehensive score
  let score = 0;
  if (hasConfidence) score += 25;
  if (hasCitation || isNotFound) score += 25;
  if (hasCodeExamples) score += 15;
  if (hasStepByStep) score += 15;
  if (!hasSpeculativeLanguage) score += 10;
  if (wordCount >= 50) score += 10;
  
  return {
    isValid: score >= 60,
    hasCitation,
    hasConfidence,
    confidence,
    isNotFound,
    warnings,
    score,
    qualityMetrics: {
      hasCodeExamples,
      hasStepByStep,
      hasSpeculativeLanguage,
      citationCount: citations.length,
      wordCount
    }
  };
}

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Chat completion endpoint
app.post('/api/chat/completions', async (req, res) => {
  try {
    const { model, messages, max_tokens, temperature, stream } = req.body;

    // Basic validation
    if (!model || !messages || !Array.isArray(messages)) {
      return res.status(400).json({ 
        error: { message: 'Invalid request: model and messages are required' } 
      });
    }

    // Make OpenAI request
    const response = await openai.chat.completions.create({
      model,
      messages,
      max_tokens: max_tokens || 2000,
      temperature: temperature || 0.5,
      stream: stream || false,
    });

    return res.json(response);
  } catch (error: any) {
    console.error('OpenAI API error:', error);
    
    const statusCode = error.status || 500;
    const message = error.message || 'Internal server error';
    
    return res.status(statusCode).json({
      error: { message, statusCode }
    });
  }
});

// Summarization endpoint
app.post('/api/summarize', async (req, res) => {
  try {
    const { query, content, model, maxTokens, systemPrompt } = req.body;

    // Basic validation
    if (!query || !content || !Array.isArray(content)) {
      return res.status(400).json({ 
        error: { message: 'Invalid request: query and content array are required' } 
      });
    }

    // Use provided systemPrompt or fall back to default
    const finalSystemPrompt = systemPrompt || `You are a helpful assistant that summarizes documentation content.
Your task is to create a concise summary that captures the most relevant information for answering the user's query.
Focus on extracting key points, code examples, and important details that directly relate to the query.`;

    const userPrompt = `Query: "${query}"

Please summarize the following documentation content, focusing on information relevant to the query above:

${content.map((c, i) => `Document ${i + 1}:\n${c}`).join('\n\n---\n\n')}

Provide a concise summary that will help answer the query.`;

    const response = await openai.chat.completions.create({
      model: model || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: finalSystemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: maxTokens || 1000,
      temperature: 0.3
    });

    return res.json({
      summary: response.choices[0]?.message?.content || 'Unable to generate summary'
    });
  } catch (error: any) {
    console.error('Summarization error:', error);
    
    const statusCode = error.status || 500;
    const message = error.message || 'Internal server error';
    
    return res.status(statusCode).json({
      error: { message, statusCode }
    });
  }
});

// Generate search keywords endpoint
app.post('/api/keywords', async (req, res) => {
  try {
    const { query, systemContext, maxKeywords = DEFAULT_CONFIG.maxKeywords } = req.body;

    // Basic validation
    if (!query) {
      return res.status(400).json({ 
        error: { message: 'Invalid request: query is required' } 
      });
    }

    const systemPrompt = KEYWORD_GENERATION_PROMPT(maxKeywords, systemContext);
    const userPrompt = `Generate search keywords for this query: "${query}"`;

    const response = await openai.chat.completions.create({
      model: DEFAULT_CONFIG.models.keywords.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: DEFAULT_CONFIG.models.keywords.maxTokens,
      temperature: DEFAULT_CONFIG.models.keywords.temperature
    });

    const content = response.choices[0]?.message?.content || '[]';
    
    try {
      const keywords = JSON.parse(content);
      if (!Array.isArray(keywords)) {
        throw new Error('Invalid response format');
      }
      
      return res.json({
        keywords: keywords.slice(0, maxKeywords),
        usage: response.usage
      });
    } catch (parseError) {
      console.error('Failed to parse keywords:', content);
      // Fallback to simple keyword extraction
      const fallbackKeywords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((word: string) => word.length > 2)
        .slice(0, maxKeywords);
      
      return res.json({
        keywords: [query, ...fallbackKeywords].slice(0, maxKeywords),
        usage: response.usage
      });
    }
  } catch (error: any) {
    console.error('Keywords generation error:', error);
    
    const statusCode = error.status || 500;
    const message = error.message || 'Internal server error';
    
    return res.status(statusCode).json({
      error: { message, statusCode }
    });
  }
});

// Generate answer with RAG endpoint with Week 3 Query Intelligence
app.post('/api/generate-answer', async (req, res) => {
  try {
    const { 
      query, 
      documents, 
      systemContext, 
      model = DEFAULT_CONFIG.models.answer.model,
      maxTokens = DEFAULT_CONFIG.models.answer.maxTokens 
    } = req.body;

    // Basic validation
    if (!query || !documents || !Array.isArray(documents)) {
      return res.status(400).json({ 
        error: { message: 'Invalid request: query and documents array are required' } 
      });
    }

    // Week 3 Enhancement: Analyze query type for intelligent processing
    const queryAnalysis = await analyzeQueryIntent(query);
    
    // Stage 3: Optional recursive enhancement with fine-tuned model
    let enhancedDocuments = documents;
    let recursiveEnhanced = false;
    
    if (recursiveEnhancer.isEnabled()) {
      try {
        console.log('🔄 Attempting recursive enhancement...');
        
        // Convert documents to DocumentContent format
        const documentContent: DocumentContent[] = documents.map(doc => ({
          title: doc.title,
          content: doc.content,
          url: doc.url,
          hierarchy: doc.hierarchy
        }));
        
        const enhancedContent = await recursiveEnhancer.enhanceContext(
          query, 
          documentContent
        );
        
        // Convert back to expected format
        enhancedDocuments = enhancedContent.map(doc => ({
          title: doc.title,
          content: doc.content,
          url: doc.url,
          hierarchy: doc.hierarchy
        }));
        
        recursiveEnhanced = enhancedDocuments.length > documents.length;
        
        if (recursiveEnhanced) {
          console.log(`✅ Recursive enhancement successful: ${documents.length} → ${enhancedDocuments.length} documents`);
        }
      } catch (error) {
        console.log('⚠️ Recursive enhancement failed, using original documents:', error);
        enhancedDocuments = documents;
      }
    }
    
    // Select appropriate prompt based on query type
    const systemPrompt = QUERY_SPECIFIC_PROMPTS[queryAnalysis.type] 
      ? QUERY_SPECIFIC_PROMPTS[queryAnalysis.type](systemContext)
      : ANSWER_GENERATION_PROMPT(systemContext);
    
    const documentContext = enhancedDocuments
      .map((doc: any, index: number) => 
        `## Document ${index + 1}: ${doc.title}\nURL: ${doc.url}\n\n${doc.content}`
      )
      .join('\n\n---\n\n');

    // Enhanced user prompt with query analysis context
    const userPrompt = `Query Type: ${queryAnalysis.type}
Intent: ${queryAnalysis.intent}
Complexity Level: ${queryAnalysis.complexity}

Original Question: "${query}"

Based on the following documentation, please provide a comprehensive answer:

${documentContext}`;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: maxTokens,
      temperature: DEFAULT_CONFIG.models.answer.temperature
    });

    const answer = response.choices[0]?.message?.content || 'Unable to generate answer';
    
    // Enhanced Week 2 validation with comprehensive analysis
    const validation = validateAIResponse(answer, documents);
    
    // Log validation results for monitoring and improvement
    if (!validation.isValid || validation.warnings.length > 0) {
      console.log('Response validation report:', {
        query: query.substring(0, 100),
        queryType: queryAnalysis.type,
        complexity: queryAnalysis.complexity,
        valid: validation.isValid,
        confidence: validation.confidence,
        score: validation.score,
        warnings: validation.warnings,
        metrics: validation.qualityMetrics
      });
    }

    return res.json({
      answer,
      usage: response.usage,
      model,
      queryAnalysis: {
        type: queryAnalysis.type,
        intent: queryAnalysis.intent,
        complexity: queryAnalysis.complexity
      },
      validation: {
        confidence: validation.confidence,
        isNotFound: validation.isNotFound,
        hasSources: validation.hasCitation,
        score: validation.score,
        qualityMetrics: validation.qualityMetrics,
        warnings: validation.warnings
      },
      enhancement: {
        recursiveEnhanced,
        documentsAnalyzed: enhancedDocuments.length,
        fineTunedModelUsed: recursiveEnhancer.isEnabled()
      }
    });
  } catch (error: any) {
    console.error('Answer generation error:', error);
    
    const statusCode = error.status || 500;
    const message = error.message || 'Internal server error';
    
    return res.status(statusCode).json({
      error: { message, statusCode }
    });
  }
});

/**
 * Stage 2: Multi-source search interfaces and types
 */
interface MultiSourceResult {
  source: 'documentation' | 'github' | 'blog' | 'changelog';
  title: string;
  url: string;
  content: string;
  metadata: {
    weight: number;
    timestamp?: string;
    author?: string;
    type?: string;
  };
}

interface AggregatedSearchResult {
  answer: string;
  sources: MultiSourceResult[];
  aggregationMetrics: {
    totalSources: number;
    sourceBreakdown: Record<string, number>;
    confidenceScore: number;
  };
}

/**
 * Stage 2: GitHub API integration for issues and discussions
 */
async function searchGitHubIssues(query: string, repository: string): Promise<MultiSourceResult[]> {
  if (!repository) return [];
  
  // Use GitHub token from environment variable
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn('GitHub search requested but GITHUB_TOKEN not configured');
    return [];
  }

  try {
    const searchQuery = `${query} repo:${repository} is:issue`;
    const response = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(searchQuery)}&per_page=5&sort=updated`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Docusaurus-AI-Search'
      }
    });

    if (!response.ok) {
      console.error('GitHub API error:', response.status, response.statusText);
      return [];
    }

    const data = await response.json() as any;
    const issues = data.items || [];

    return issues.map((issue: any) => ({
      source: 'github' as const,
      title: `Issue #${issue.number}: ${issue.title}`,
      url: issue.html_url,
      content: `${issue.body || ''}\n\n${issue.comments > 0 ? `Comments: ${issue.comments}` : ''}`,
      metadata: {
        weight: DEFAULT_CONFIG.multiSource.sources.github.weight,
        timestamp: issue.updated_at,
        author: issue.user.login,
        type: issue.state === 'closed' ? 'resolved' : 'open'
      }
    }));
  } catch (error) {
    console.error('GitHub search error:', error);
    return [];
  }
}

/**
 * Stage 2: Blog/changelog search implementation
 */
async function searchBlogPosts(_query: string, blogUrl?: string): Promise<MultiSourceResult[]> {
  if (!blogUrl) return [];

  try {
    // This is a placeholder - in a real implementation, you'd integrate with
    // the blog's search API or RSS feed
    // const searchUrl = `${blogUrl}/search?q=${encodeURIComponent(query)}`;
    
    // For now, return empty array - this would need to be implemented
    // based on the specific blog platform (WordPress, Ghost, etc.)
    return [];
  } catch (error) {
    console.error('Blog search error:', error);
    return [];
  }
}

async function searchChangelog(query: string, changelogUrl?: string): Promise<MultiSourceResult[]> {
  if (!changelogUrl) return [];

  try {
    // This is a placeholder - in a real implementation, you'd parse
    // the changelog file or API
    const response = await fetch(changelogUrl);
    const content = await response.text();
    
    // Simple keyword matching - in production, you'd use more sophisticated parsing
    const lines = content.split('\n');
    const relevantLines = lines.filter(line => 
      query.toLowerCase().split(' ').some(keyword => 
        line.toLowerCase().includes(keyword)
      )
    );

    if (relevantLines.length === 0) return [];

    return [{
      source: 'changelog' as const,
      title: 'Changelog',
      url: changelogUrl,
      content: relevantLines.join('\n'),
      metadata: {
        weight: DEFAULT_CONFIG.multiSource.sources.changelog.weight,
        timestamp: new Date().toISOString(),
        type: 'changelog'
      }
    }];
  } catch (error) {
    console.error('Changelog search error:', error);
    return [];
  }
}

/**
 * Stage 2: Intelligent result aggregation
 */
async function aggregateMultiSourceResults(
  query: string,
  documentationResults: any[],
  githubResults: MultiSourceResult[],
  blogResults: MultiSourceResult[],
  changelogResults: MultiSourceResult[],
  systemContext?: string
): Promise<AggregatedSearchResult> {
  
  // Combine all sources
  const allSources: MultiSourceResult[] = [
    ...documentationResults.map((doc: any) => ({
      source: 'documentation' as const,
      title: doc.title,
      url: doc.url,
      content: doc.content,
      metadata: {
        weight: DEFAULT_CONFIG.multiSource.sources.documentation.weight,
        timestamp: doc.timestamp,
        type: 'documentation'
      }
    })),
    ...githubResults,
    ...blogResults,
    ...changelogResults
  ];

  // Sort by relevance and weight
  const sortedSources = allSources.sort((a, b) => {
    const aScore = a.metadata.weight + (a.metadata.type === 'resolved' ? 0.1 : 0);
    const bScore = b.metadata.weight + (b.metadata.type === 'resolved' ? 0.1 : 0);
    return bScore - aScore;
  });

  // Prepare context for aggregation
  const aggregationContext = sortedSources
    .map((source, index) => 
      `## Source ${index + 1}: ${source.title} (${source.source})
URL: ${source.url}
Weight: ${source.metadata.weight}
${source.metadata.timestamp ? `Updated: ${source.metadata.timestamp}` : ''}

${source.content}`)
    .join('\n\n---\n\n');

  try {
    const response = await openai.chat.completions.create({
      model: DEFAULT_CONFIG.models.answer.model,
      messages: [
        { role: 'system', content: RESULT_AGGREGATION_PROMPT(systemContext) },
        { role: 'user', content: `Query: "${query}"

Sources to aggregate:
${aggregationContext}` }
      ],
      max_tokens: DEFAULT_CONFIG.models.answer.maxTokens,
      temperature: 0.2
    });

    const answer = response.choices[0]?.message?.content || 'Unable to aggregate results';
    
    // Calculate confidence score based on source quality
    const confidenceScore = Math.min(100, Math.round(
      (sortedSources.length * 10) + 
      (githubResults.filter(r => r.metadata.type === 'resolved').length * 15) +
      (sortedSources.filter(s => s.source === 'documentation').length * 20)
    ));

    return {
      answer,
      sources: sortedSources,
      aggregationMetrics: {
        totalSources: allSources.length,
        sourceBreakdown: {
          documentation: documentationResults.length,
          github: githubResults.length,
          blog: blogResults.length,
          changelog: changelogResults.length
        },
        confidenceScore
      }
    };
  } catch (error) {
    console.error('Aggregation error:', error);
    
    // Fallback to simple concatenation
    const fallbackAnswer = `Based on multiple sources:\n\n${allSources.map(s => 
      `**${s.title}** (${s.source}): ${s.content.substring(0, 200)}...`
    ).join('\n\n')}`;

    return {
      answer: fallbackAnswer,
      sources: sortedSources,
      aggregationMetrics: {
        totalSources: allSources.length,
        sourceBreakdown: {
          documentation: documentationResults.length,
          github: githubResults.length,
          blog: blogResults.length,
          changelog: changelogResults.length
        },
        confidenceScore: 50
      }
    };
  }
}

/**
 * Week 6: Conversational Memory and Follow-up Suggestions
 */

// In-memory session storage (in production, use Redis or similar)
interface ConversationTurn {
  query: string;
  answer: string;
  timestamp: Date;
  queryAnalysis?: QueryAnalysis;
  sources?: MultiSourceResult[];
  validation?: ValidationResult;
}

interface ConversationSession {
  sessionId: string;
  turns: ConversationTurn[];
  createdAt: Date;
  lastActiveAt: Date;
  context: string;
}

// Simple in-memory storage (use Redis in production)
const conversationSessions = new Map<string, ConversationSession>();

// Clean up old sessions (older than 1 hour)
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  for (const [sessionId, session] of conversationSessions.entries()) {
    if (session.lastActiveAt < oneHourAgo) {
      conversationSessions.delete(sessionId);
    }
  }
}, 10 * 60 * 1000); // Clean up every 10 minutes

/**
 * Generate follow-up questions based on conversation history
 */
async function generateFollowUpQuestions(
  currentQuery: string,
  answer: string,
  queryAnalysis: QueryAnalysis,
  conversationHistory: ConversationTurn[]
): Promise<string[]> {
  try {
    const recentHistory = conversationHistory.slice(-3); // Last 3 turns
    const historyContext = recentHistory.map(turn => 
      `Q: ${turn.query}\nA: ${turn.answer.substring(0, 200)}...`
    ).join('\n\n');

    const followUpPrompt = `Based on the current conversation about documentation, generate 3 relevant follow-up questions that would help the user explore related topics.

Current Query: "${currentQuery}"
Query Type: ${queryAnalysis.type}
Query Complexity: ${queryAnalysis.complexity}

Recent Conversation History:
${historyContext}

Current Answer: ${answer.substring(0, 500)}...

Generate 3 follow-up questions that are:
1. Related to the current topic but explore different aspects
2. Appropriate for the user's skill level (${queryAnalysis.complexity})
3. Likely to have answers in the documentation
4. Different from questions already asked

Return ONLY a JSON array of 3 question strings, nothing else.
Example: ["How do I configure X?", "What are the best practices for Y?", "Can I customize Z?"]`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: followUpPrompt },
        { role: 'user', content: `Generate follow-up questions for: "${currentQuery}"` }
      ],
      max_tokens: 300,
      temperature: 0.3
    });

    const content = response.choices[0]?.message?.content || '[]';
    const questions = JSON.parse(content);
    
    return Array.isArray(questions) ? questions.slice(0, 3) : [];
  } catch (error) {
    console.error('Follow-up generation failed:', error);
    
    // Fallback to topic-based questions
    const fallbackQuestions = [];
    
    switch (queryAnalysis.type) {
      case 'how-to':
        fallbackQuestions.push(
          "What are the best practices for this approach?",
          "Are there any common issues to avoid?",
          "How can I customize this further?"
        );
        break;
      case 'what-is':
        fallbackQuestions.push(
          "How do I get started with this?",
          "What are the main use cases?",
          "Are there any alternatives?"
        );
        break;
      case 'troubleshooting':
        fallbackQuestions.push(
          "How can I prevent this issue?",
          "Are there any related problems?",
          "What are the debugging steps?"
        );
        break;
      case 'configuration':
        fallbackQuestions.push(
          "What are the advanced configuration options?",
          "How do I validate my configuration?",
          "Can I automate this setup?"
        );
        break;
      default:
        fallbackQuestions.push(
          "What are the related topics?",
          "Are there any examples available?",
          "How does this integrate with other features?"
        );
    }
    
    return fallbackQuestions;
  }
}

/**
 * Session management endpoint
 */
app.post('/api/session/create', async (req, res) => {
  try {
    const { systemContext } = req.body;
    
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session: ConversationSession = {
      sessionId,
      turns: [],
      createdAt: new Date(),
      lastActiveAt: new Date(),
      context: systemContext || ''
    };
    
    conversationSessions.set(sessionId, session);
    
    return res.json({
      sessionId,
      createdAt: session.createdAt
    });
  } catch (error: any) {
    console.error('Session creation error:', error);
    return res.status(500).json({
      error: { message: 'Failed to create session' }
    });
  }
});

/**
 * Get conversation history
 */
app.get('/api/session/:sessionId/history', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = conversationSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({
        error: { message: 'Session not found' }
      });
    }
    
    // Update last active time
    session.lastActiveAt = new Date();
    
    return res.json({
      sessionId,
      turns: session.turns.map(turn => ({
        query: turn.query,
        answer: turn.answer,
        timestamp: turn.timestamp,
        queryAnalysis: turn.queryAnalysis
      })),
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt
    });
  } catch (error: any) {
    console.error('History retrieval error:', error);
    return res.status(500).json({
      error: { message: 'Failed to retrieve history' }
    });
  }
});

/**
 * Follow-up questions endpoint
 */
app.post('/api/follow-up-questions', async (req, res) => {
  try {
    const { 
      sessionId, 
      query, 
      answer, 
      queryAnalysis 
    } = req.body;

    if (!query || !answer) {
      return res.status(400).json({
        error: { message: 'Query and answer are required' }
      });
    }

    let conversationHistory: ConversationTurn[] = [];
    
    // Get conversation history if session exists
    if (sessionId) {
      const session = conversationSessions.get(sessionId);
      if (session) {
        conversationHistory = session.turns;
        session.lastActiveAt = new Date();
      }
    }

    // Generate follow-up questions
    const followUpQuestions = await generateFollowUpQuestions(
      query,
      answer,
      queryAnalysis || { type: 'general', intent: '', keywords: [], complexity: 'beginner' },
      conversationHistory
    );

    return res.json({
      followUpQuestions,
      sessionId
    });
  } catch (error: any) {
    console.error('Follow-up questions error:', error);
    return res.status(500).json({
      error: { message: 'Failed to generate follow-up questions' }
    });
  }
});

/**
 * Enhanced generate-answer endpoint with conversational memory
 */
app.post('/api/generate-answer-with-memory', async (req, res) => {
  try {
    const { 
      query, 
      documents, 
      systemContext,
      sessionId,
      model = DEFAULT_CONFIG.models.answer.model,
      maxTokens = DEFAULT_CONFIG.models.answer.maxTokens 
    } = req.body;

    // Basic validation
    if (!query || !documents || !Array.isArray(documents)) {
      return res.status(400).json({ 
        error: { message: 'Invalid request: query and documents array are required' } 
      });
    }

    // Get conversation history if session exists
    let conversationHistory: ConversationTurn[] = [];
    let session: ConversationSession | undefined;
    
    if (sessionId) {
      session = conversationSessions.get(sessionId);
      if (session) {
        conversationHistory = session.turns;
        session.lastActiveAt = new Date();
      }
    }

    // Analyze query type for intelligent processing
    const queryAnalysis = await analyzeQueryIntent(query);
    
    // Build context with conversation history
    const recentHistory = conversationHistory.slice(-2); // Last 2 turns for context
    const historyContext = recentHistory.length > 0 
      ? `\n\nRecent conversation context:\n${recentHistory.map(turn => 
          `Previous Q: ${turn.query}\nPrevious A: ${turn.answer.substring(0, 300)}...`
        ).join('\n\n')}`
      : '';
    
    // Select appropriate prompt based on query type
    const systemPrompt = QUERY_SPECIFIC_PROMPTS[queryAnalysis.type] 
      ? QUERY_SPECIFIC_PROMPTS[queryAnalysis.type](systemContext)
      : ANSWER_GENERATION_PROMPT(systemContext);
    
    const documentContext = documents
      .map((doc: any, index: number) => 
        `## Document ${index + 1}: ${doc.title}\nURL: ${doc.url}\n\n${doc.content}`
      )
      .join('\n\n---\n\n');

    // Enhanced user prompt with query analysis and conversation context
    const userPrompt = `Query Type: ${queryAnalysis.type}
Intent: ${queryAnalysis.intent}
Complexity Level: ${queryAnalysis.complexity}

Original Question: "${query}"
${historyContext}

Based on the following documentation, please provide a comprehensive answer:

${documentContext}`;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: maxTokens,
      temperature: DEFAULT_CONFIG.models.answer.temperature
    });

    const answer = response.choices[0]?.message?.content || 'Unable to generate answer';
    
    // Enhanced validation
    const validation = validateAIResponse(answer, documents);
    
    // Store conversation turn in session
    if (session) {
      const turn: ConversationTurn = {
        query,
        answer,
        timestamp: new Date(),
        queryAnalysis,
        sources: documents.map(doc => ({
          source: 'documentation' as const,
          title: doc.title,
          url: doc.url,
          content: doc.content,
          metadata: { weight: 0.5 }
        })),
        validation
      };
      
      session.turns.push(turn);
      
      // Keep only last 10 turns to avoid memory bloat
      if (session.turns.length > 10) {
        session.turns = session.turns.slice(-10);
      }
    }

    // Generate follow-up questions
    const followUpQuestions = await generateFollowUpQuestions(
      query,
      answer,
      queryAnalysis,
      conversationHistory
    );

    return res.json({
      answer,
      usage: response.usage,
      model,
      queryAnalysis: {
        type: queryAnalysis.type,
        intent: queryAnalysis.intent,
        complexity: queryAnalysis.complexity
      },
      validation: {
        confidence: validation.confidence,
        isNotFound: validation.isNotFound,
        hasSources: validation.hasCitation,
        score: validation.score,
        qualityMetrics: validation.qualityMetrics,
        warnings: validation.warnings
      },
      followUpQuestions,
      sessionId: session?.sessionId
    });
  } catch (error: any) {
    console.error('Answer generation with memory error:', error);
    
    const statusCode = error.status || 500;
    const message = error.message || 'Internal server error';
    
    return res.status(statusCode).json({
      error: { message, statusCode }
    });
  }
});

/**
 * Stage 2: Multi-source search endpoint
 */
app.post('/api/multi-source-search', async (req, res) => {
  try {
    const { 
      query, 
      documents = [], 
      systemContext,
      config = {}
    } = req.body;

    // Basic validation
    if (!query) {
      return res.status(400).json({ 
        error: { message: 'Invalid request: query is required' } 
      });
    }

    // Extract configuration
    const githubConfig = config.github || {};
    const blogConfig = config.blog || {};
    const changelogConfig = config.changelog || {};

    // Perform multi-source search in parallel
    const [githubResults, blogResults, changelogResults] = await Promise.all([
      searchGitHubIssues(query, githubConfig.repository),
      searchBlogPosts(query, blogConfig.url),
      searchChangelog(query, changelogConfig.url)
    ]);

    // Aggregate results
    const aggregatedResult = await aggregateMultiSourceResults(
      query,
      documents,
      githubResults,
      blogResults,
      changelogResults,
      systemContext
    );

    // Enhanced validation for multi-source results
    const validation = validateAIResponse(aggregatedResult.answer, documents);

    return res.json({
      answer: aggregatedResult.answer,
      sources: aggregatedResult.sources,
      aggregationMetrics: aggregatedResult.aggregationMetrics,
      validation: {
        confidence: validation.confidence,
        isNotFound: validation.isNotFound,
        hasSources: validation.hasCitation,
        score: validation.score,
        qualityMetrics: validation.qualityMetrics,
        warnings: validation.warnings
      }
    });
  } catch (error: any) {
    console.error('Multi-source search error:', error);
    
    const statusCode = error.status || 500;
    const message = error.message || 'Internal server error';
    
    return res.status(statusCode).json({
      error: { message, statusCode }
    });
  }
});

// Error handling middleware
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: { message: 'Internal server error' } 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed domains: ${allowedDomains.join(', ')}`);
}); 