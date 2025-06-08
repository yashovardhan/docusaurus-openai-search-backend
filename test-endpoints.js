/**
 * Test script for the new backend endpoints
 * Run with: node test-endpoints.js
 */

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3000';

async function testKeywordsEndpoint() {
  console.log('\n🔍 Testing /api/keywords endpoint...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/keywords`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'How do I implement authentication in React?',
        systemContext: 'Documentation for a React component library',
        maxKeywords: 5
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Keywords generated successfully:');
      console.log('Keywords:', data.keywords);
      console.log('Token usage:', data.usage);
    } else {
      console.error('❌ Error:', data.error);
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
}

async function testAnswerEndpoint() {
  console.log('\n📝 Testing /api/generate-answer endpoint...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/generate-answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'How do I implement authentication?',
        documents: [
          {
            title: 'Authentication Guide',
            url: 'https://docs.example.com/auth',
            content: 'To implement authentication, you need to: 1. Set up an auth provider, 2. Create login forms, 3. Handle tokens securely.'
          },
          {
            title: 'Security Best Practices',
            url: 'https://docs.example.com/security',
            content: 'Always use HTTPS, implement CSRF protection, and validate all inputs.'
          }
        ],
        systemContext: 'Documentation for a React component library',
        model: 'gpt-4o-mini',
        maxTokens: 1000
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Answer generated successfully:');
      console.log('Answer:', data.answer.substring(0, 200) + '...');
      console.log('Model used:', data.model);
      console.log('Token usage:', data.usage);
    } else {
      console.error('❌ Error:', data.error);
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
}

async function testHealthEndpoint() {
  console.log('\n💚 Testing /health endpoint...');
  
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Server is healthy:', data);
    } else {
      console.error('❌ Health check failed');
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
}

// Run all tests
async function runTests() {
  console.log(`🚀 Testing backend at: ${BASE_URL}`);
  console.log('Make sure you have set OPENAI_API_KEY in your .env file\n');
  
  await testHealthEndpoint();
  await testKeywordsEndpoint();
  await testAnswerEndpoint();
  
  console.log('\n✨ Tests complete!');
}

runTests(); 