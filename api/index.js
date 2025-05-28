const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ALLOWED_DOMAINS = process.env.ALLOWED_DOMAINS || '*';

// Parse allowed domains
const allowedDomains = ALLOWED_DOMAINS === '*' ? ['*'] : ALLOWED_DOMAINS.split(',').map(d => d.trim());

// CORS
app.use(cors({
  origin: true,
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT || '30'),
  message: 'Too many requests, please try again later.'
});

app.use('/api/', limiter);

// Initialize OpenAI
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasApiKey: !!OPENAI_API_KEY,
    allowedDomains: allowedDomains
  });
});

// Chat completion
app.post('/api/chat/completions', async (req, res) => {
  try {
    if (!openai) {
      return res.status(500).json({
        error: { message: 'OpenAI API key not configured' }
      });
    }

    const { model, messages, max_tokens, temperature, stream } = req.body;

    if (!model || !messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: { message: 'Invalid request: model and messages are required' }
      });
    }

    const response = await openai.chat.completions.create({
      model,
      messages,
      max_tokens: max_tokens || 2000,
      temperature: temperature || 0.5,
      stream: stream || false,
    });

    return res.json(response);
  } catch (error) {
    console.error('OpenAI API error:', error);
    const statusCode = error.status || 500;
    const message = error.message || 'Internal server error';
    return res.status(statusCode).json({
      error: { message, statusCode }
    });
  }
});

// Summarization
app.post('/api/summarize', async (req, res) => {
  try {
    if (!openai) {
      return res.status(500).json({
        error: { message: 'OpenAI API key not configured' }
      });
    }

    const { query, content, model, maxTokens, systemPrompt } = req.body;

    if (!query || !content || !Array.isArray(content)) {
      return res.status(400).json({
        error: { message: 'Invalid request: query and content array are required' }
      });
    }

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
  } catch (error) {
    console.error('Summarization error:', error);
    const statusCode = error.status || 500;
    const message = error.message || 'Internal server error';
    return res.status(statusCode).json({
      error: { message, statusCode }
    });
  }
});

module.exports = app; 