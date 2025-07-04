#!/usr/bin/env node

/**
 * Test script for Discourse Integration
 * This script tests the new /api/discourse-response endpoint
 */

const https = require('https');
const http = require('http');

// Configuration
const config = {
  baseUrl: process.env.TEST_URL || 'http://localhost:3000',
  discourseApiKey: process.env.DISCOURSE_API_KEY || 'test-api-key',
  timeout: 30000
};

// Test data
const testCases = [
  {
    name: 'Basic How-To Question',
    payload: {
      post: {
        title: 'How to integrate Web3Auth with React',
        content: 'I am trying to integrate Web3Auth into my React application. Can someone help me with the basic setup steps?',
        url: 'https://community.web3auth.io/t/react-integration-help/12345',
        category: 'Integration Help',
        user: {
          username: 'developer123',
          trust_level: 1
        }
      },
      context: {
        tags: ['react', 'integration', 'web3auth'],
        urgency: 'medium'
      },
      config: {
        max_response_length: 1500,
        tone: 'helpful',
        include_code_examples: true
      }
    }
  },
  {
    name: 'Troubleshooting Question',
    payload: {
      post: {
        title: 'Error: Web3Auth not initializing properly',
        content: 'I am getting an error when trying to initialize Web3Auth. The error message says "Web3Auth not initialized". What am I doing wrong?',
        url: 'https://community.web3auth.io/t/initialization-error/12346',
        category: 'Troubleshooting',
        user: {
          username: 'newbie_dev',
          trust_level: 0
        }
      },
      context: {
        tags: ['error', 'initialization', 'troubleshooting'],
        urgency: 'high'
      }
    }
  },
  {
    name: 'Configuration Question',
    payload: {
      post: {
        title: 'Best practices for Web3Auth configuration',
        content: 'What are the recommended configuration settings for Web3Auth in a production environment?',
        url: 'https://community.web3auth.io/t/production-config/12347',
        category: 'Configuration',
        user: {
          username: 'senior_dev',
          trust_level: 4
        }
      },
      context: {
        tags: ['configuration', 'production', 'best-practices'],
        urgency: 'low'
      }
    }
  }
];

// Test runner
async function runTests() {
  console.log('🚀 Starting Discourse Integration Tests');
  console.log('=====================================');
  console.log(`Base URL: ${config.baseUrl}`);
  console.log(`API Key: ${config.discourseApiKey ? 'Set' : 'Not set'}`);
  console.log('');

  // Test 1: Health check
  console.log('1. Testing basic server health...');
  try {
    const healthResponse = await makeRequest('/health', 'GET');
    console.log('✅ Server is running');
  } catch (error) {
    console.log('❌ Server health check failed:', error.message);
    console.log('⚠️  Make sure the server is running on', config.baseUrl);
    return;
  }

  // Test 2: Discourse endpoint without authentication
  console.log('\n2. Testing Discourse endpoint without authentication...');
  try {
    const response = await makeRequest('/api/discourse-response', 'POST', testCases[0].payload);
    console.log('❌ Should have failed without authentication');
  } catch (error) {
    if (error.message.includes('401')) {
      console.log('✅ Authentication check working');
    } else {
      console.log('❌ Unexpected error:', error.message);
    }
  }

  // Test 3: Discourse endpoint with authentication
  console.log('\n3. Testing Discourse endpoint with authentication...');
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n   Test ${i + 1}: ${testCase.name}`);
    
    try {
      const startTime = Date.now();
      const response = await makeRequest('/api/discourse-response', 'POST', testCase.payload, {
        'Authorization': `Bearer ${config.discourseApiKey}`,
        'Content-Type': 'application/json'
      });
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      console.log(`   ✅ Response received in ${responseTime}ms`);
      console.log(`   📊 Confidence: ${response.response.confidence}`);
      console.log(`   📝 Should post: ${response.response.should_post}`);
      console.log(`   🔍 Keywords used: ${response.metadata.keywords_used.join(', ')}`);
      console.log(`   📚 Documents analyzed: ${response.metadata.documents_analyzed}`);
      console.log(`   🎯 Query type: ${response.metadata.query_type}`);
      
      if (response.response.confidence === 'LOW') {
        console.log(`   ⚠️  Low confidence response: ${response.response.reasoning}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Test failed: ${error.message}`);
    }
  }

  // Test 4: Discourse metrics endpoint
  console.log('\n4. Testing Discourse metrics endpoint...');
  try {
    const response = await makeRequest('/api/discourse-metrics', 'GET', null, {
      'Authorization': `Bearer ${config.discourseApiKey}`
    });
    
    console.log('✅ Metrics retrieved successfully');
    console.log('   📈 Total requests:', response.metrics.requests_total);
    console.log('   📊 Success rate:', response.metrics.requests_successful / response.metrics.requests_total);
    console.log('   ⏱️  Average processing time:', response.metrics.avg_processing_time.toFixed(2) + 'ms');
    console.log('   💾 Cache size:', response.cache_size);
    console.log('   ⏰ Server uptime:', Math.floor(response.uptime / 60) + ' minutes');
    
  } catch (error) {
    console.log('❌ Metrics test failed:', error.message);
  }

  // Test 5: Cache functionality
  console.log('\n5. Testing cache functionality...');
  try {
    const testPayload = testCases[0].payload;
    
    // First request
    const startTime1 = Date.now();
    const response1 = await makeRequest('/api/discourse-response', 'POST', testPayload, {
      'Authorization': `Bearer ${config.discourseApiKey}`,
      'Content-Type': 'application/json'
    });
    const responseTime1 = Date.now() - startTime1;
    
    // Second request (should be cached)
    const startTime2 = Date.now();
    const response2 = await makeRequest('/api/discourse-response', 'POST', testPayload, {
      'Authorization': `Bearer ${config.discourseApiKey}`,
      'Content-Type': 'application/json'
    });
    const responseTime2 = Date.now() - startTime2;
    
    console.log(`   ✅ First request: ${responseTime1}ms`);
    console.log(`   ✅ Second request: ${responseTime2}ms`);
    
    if (responseTime2 < responseTime1 * 0.5) {
      console.log('   🚀 Cache working - second request significantly faster');
    } else {
      console.log('   ⚠️  Cache may not be working as expected');
    }
    
  } catch (error) {
    console.log('❌ Cache test failed:', error.message);
  }

  console.log('\n🎉 Tests completed!');
  console.log('=====================================');
}

// HTTP request helper
function makeRequest(path, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.baseUrl + path);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: config.timeout
    };
    
    const req = lib.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = responseData ? JSON.parse(responseData) : {};
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsedData);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${parsedData.error || 'Unknown error'}`));
          }
        } catch (parseError) {
          reject(new Error(`Failed to parse response: ${parseError.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Run tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests }; 