#!/usr/bin/env node

/**
 * Test script to verify the proxy is working
 * Usage: node test-proxy.js <proxy-url>
 */

const proxyUrl = process.argv[2];

if (!proxyUrl) {
  console.error('Usage: node test-proxy.js <proxy-url>');
  console.error('Example: node test-proxy.js https://your-proxy.vercel.app');
  process.exit(1);
}

async function test() {
  console.log(`Testing proxy at: ${proxyUrl}\n`);

  // Test health check
  try {
    const res = await fetch(`${proxyUrl}/health`);
    const data = await res.json();
    console.log('✅ Health check:', data);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
  }

  // Test chat completion
  try {
    const res = await fetch(`${proxyUrl}/api/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Say "Hello!"' }],
        max_tokens: 10
      })
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    console.log('✅ Chat completion works!');
    console.log('   Response:', data.choices[0].message.content);
  } catch (error) {
    console.error('❌ Chat completion failed:', error.message);
  }

  console.log('\nDone!');
}

test().catch(console.error); 