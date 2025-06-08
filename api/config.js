"use strict";
/**
 * Default configuration and prompts for the AI backend
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANSWER_USER_PROMPT = exports.KEYWORD_USER_PROMPT = exports.ANSWER_GENERATION_PROMPT = exports.KEYWORD_GENERATION_PROMPT = exports.DEFAULT_CONFIG = void 0;
exports.DEFAULT_CONFIG = {
    // Default model settings
    models: {
        keywords: {
            model: 'gpt-4.1',
            maxTokens: 200,
            temperature: 0.3,
        },
        answer: {
            model: 'gpt-4.1',
            maxTokens: 2000,
            temperature: 0.3,
        },
    },
    // Default limits
    maxKeywords: 5,
    maxDocuments: 10,
};
/**
 * Default system prompt for keyword generation
 */
const KEYWORD_GENERATION_PROMPT = (maxKeywords, systemContext) => `You are a search keyword generator for documentation search.
Your task is to analyze the user's question and generate up to ${maxKeywords} relevant search keywords/phrases that will help find the most relevant documentation.

${systemContext ? `Context about the product/documentation: ${systemContext}` : ''}

Rules:
1. Generate diverse keywords that cover different aspects of the query
2. Include both specific technical terms and general concepts
3. Consider synonyms and related terms
4. Return keywords that are likely to match documentation content
5. Return ONLY a JSON array of strings, nothing else

Examples:
- For "how to authenticate users", return: ["user authentication", "login", "auth setup", "authentication methods", "user login"]
- For "deploy to production", return: ["production deployment", "deploy", "deployment guide", "production setup", "deployment config"]
- For "error handling", return: ["error handling", "exception handling", "error management", "catch errors", "error types"]`;
exports.KEYWORD_GENERATION_PROMPT = KEYWORD_GENERATION_PROMPT;
/**
 * Default system prompt for answer generation
 */
const ANSWER_GENERATION_PROMPT = (systemContext) => `You are a helpful documentation assistant.
Your task is to answer the user's question based on the provided documentation content.

${systemContext ? `Context about the product: ${systemContext}` : ''}

Guidelines:
1. Base your answer strictly on the provided documentation
2. Be concise but comprehensive
3. Include relevant code examples if present in the documentation
4. If the documentation doesn't contain the answer, say so clearly
5. Use markdown formatting for better readability
6. Include links to relevant documentation pages when referencing them
7. Structure your answer with clear sections using markdown headers
8. Use bullet points or numbered lists when appropriate
9. Highlight important concepts using **bold** text
10. If there are multiple ways to achieve something, list them all`;
exports.ANSWER_GENERATION_PROMPT = ANSWER_GENERATION_PROMPT;
/**
 * Default user prompt template for keyword generation
 */
const KEYWORD_USER_PROMPT = (query) => `Generate search keywords for this query: "${query}"`;
exports.KEYWORD_USER_PROMPT = KEYWORD_USER_PROMPT;
/**
 * Default user prompt template for answer generation
 */
const ANSWER_USER_PROMPT = (query, documentContext) => `Question: "${query}"

Based on the following documentation, please provide a comprehensive answer:

${documentContext}`;
exports.ANSWER_USER_PROMPT = ANSWER_USER_PROMPT;
