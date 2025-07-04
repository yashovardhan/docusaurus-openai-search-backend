#!/usr/bin/env node

/**
 * End-to-End Zapier Integration Test Suite
 * Tests the complete workflow: Discourse -> Zapier -> AI Backend -> Response Validation
 */

const https = require('https');
const http = require('http');

// Configuration
const config = {
  baseUrl: process.env.TEST_URL || 'http://localhost:3000',
  discourseApiKey: process.env.DISCOURSE_API_KEY || 'test-api-key',
  zapierWebhookUrl: process.env.ZAPIER_WEBHOOK_URL || '',
  discourseUrl: process.env.DISCOURSE_URL || 'https://community.example.com',
  timeout: 45000
};

// Mock Discourse webhook payloads for testing
const mockDiscoursePayloads = [
  {
    name: 'React Integration Question',
    payload: {
      topic: {
        id: 12345,
        title: 'How to integrate Web3Auth with React',
        category: { name: 'Integration Help' },
        tags: ['react', 'integration', 'web3auth'],
        posts_count: 1
      },
      post: {
        id: 67890,
        username: 'developer123',
        trust_level: 1,
        raw: 'I am trying to integrate Web3Auth into my React application. Can someone help me with the basic setup steps? I have followed the documentation but I am getting some errors.',
        cooked: '<p>I am trying to integrate Web3Auth into my React application. Can someone help me with the basic setup steps? I have followed the documentation but I am getting some errors.</p>'
      },
      site_url: config.discourseUrl
    }
  },
  {
    name: 'Troubleshooting Error',
    payload: {
      topic: {
        id: 12346,
        title: 'Error: Web3Auth not initializing properly',
        category: { name: 'Troubleshooting' },
        tags: ['error', 'initialization', 'troubleshooting'],
        posts_count: 1
      },
      post: {
        id: 67891,
        username: 'frustrated_dev',
        trust_level: 2,
        raw: 'I am getting an error when trying to initialize Web3Auth. The error message says "Web3Auth not initialized". What am I doing wrong? This is urgent as it\'s blocking our production deployment.',
        cooked: '<p>I am getting an error when trying to initialize Web3Auth. The error message says "Web3Auth not initialized". What am I doing wrong? This is urgent as it\'s blocking our production deployment.</p>'
      },
      site_url: config.discourseUrl
    }
  },
  {
    name: 'Configuration Best Practices',
    payload: {
      topic: {
        id: 12347,
        title: 'Best practices for Web3Auth configuration in production',
        category: { name: 'Configuration' },
        tags: ['configuration', 'production', 'best-practices'],
        posts_count: 3
      },
      post: {
        id: 67892,
        username: 'senior_dev',
        trust_level: 4,
        raw: 'What are the recommended configuration settings for Web3Auth in a production environment? I\'m particularly interested in security considerations and performance optimization.',
        cooked: '<p>What are the recommended configuration settings for Web3Auth in a production environment? I\'m particularly interested in security considerations and performance optimization.</p>'
      },
      site_url: config.discourseUrl
    }
  },
  {
    name: 'Low Quality Post (should not trigger response)',
    payload: {
      topic: {
        id: 12348,
        title: 'hi',
        category: { name: 'General Discussion' },
        tags: [],
        posts_count: 1
      },
      post: {
        id: 67893,
        username: 'newbie',
        trust_level: 0,
        raw: 'hi everyone',
        cooked: '<p>hi everyone</p>'
      },
      site_url: config.discourseUrl
    }
  }
];

// Zapier workflow simulation
class ZapierWorkflowSimulator {
  constructor() {
    this.results = [];
  }

  // Step 1: Transform Discourse data (simulates Code by Zapier step)
  transformDiscourseData(webhookPayload) {
    console.log('   🔄 Step 1: Transforming Discourse data...');
    
    const inputData = webhookPayload;
    
    // Extract post information
    const post = {
      title: inputData.topic?.title || 'Untitled Post',
      content: inputData.post?.raw || inputData.post?.cooked || '',
      url: `${inputData.site_url}/t/${inputData.topic?.id}/${inputData.post?.id}`,
      category: inputData.topic?.category?.name || 'General',
      user: {
        username: inputData.post?.username || 'unknown',
        trust_level: inputData.post?.trust_level || 0
      }
    };

    // Additional context
    const context = {
      tags: inputData.topic?.tags || [],
      previous_replies_count: inputData.topic?.posts_count || 0,
      urgency: this.determineUrgency(post.content)
    };

    // Configuration
    const config = {
      max_response_length: 1500,
      tone: 'helpful',
      include_code_examples: true
    };

    const transformed = {
      post: post,
      context: context,
      config: config,
      original_topic_id: inputData.topic?.id,
      original_post_id: inputData.post?.id,
      site_url: inputData.site_url
    };

    console.log('   ✅ Data transformed successfully');
    console.log(`      Post: "${post.title}" by ${post.user.username}`);
    console.log(`      Category: ${post.category}, Trust Level: ${post.user.trust_level}`);
    console.log(`      Urgency: ${context.urgency}`);

    return transformed;
  }

  // Helper function to determine urgency
  determineUrgency(content) {
    const urgentKeywords = ['urgent', 'asap', 'critical', 'emergency', 'help!', 'production'];
    const lowPriorityKeywords = ['question', 'wondering', 'curious', 'hi everyone'];
    
    const contentLower = content.toLowerCase();
    
    if (urgentKeywords.some(keyword => contentLower.includes(keyword))) {
      return 'high';
    } else if (lowPriorityKeywords.some(keyword => contentLower.includes(keyword))) {
      return 'low';
    }
    return 'medium';
  }

  // Step 2: Send to AI Backend (simulates Webhooks by Zapier step)
  async sendToAIBackend(transformedData) {
    console.log('   🔄 Step 2: Sending to AI backend...');
    
    try {
      const response = await makeRequest('/api/discourse-response', 'POST', transformedData, {
        'Authorization': `Bearer ${config.discourseApiKey}`,
        'Content-Type': 'application/json'
      });

      console.log('   ✅ AI backend response received');
      console.log(`      Confidence: ${response.response.confidence}`);
      console.log(`      Should post: ${response.response.should_post}`);
      console.log(`      Processing time: ${response.metadata.processing_time_ms}ms`);

      return response;
    } catch (error) {
      console.log('   ❌ AI backend request failed:', error.message);
      throw error;
    }
  }

  // Step 3: Process AI response (simulates Code by Zapier step)
  processAIResponse(aiResponse, originalData) {
    console.log('   🔄 Step 3: Processing AI response...');

    // Quality checks
    const shouldPost = aiResponse.success && 
                       aiResponse.response.should_post && 
                       aiResponse.response.confidence !== 'LOW';

    // Format the response for Discourse
    let discourseContent = '';

    if (shouldPost) {
      discourseContent = this.formatForDiscourse(aiResponse.response.content, aiResponse.sources);
      console.log('   ✅ Response approved for posting');
    } else {
      console.log('   ⚠️  Response flagged for manual review:', aiResponse.response.reasoning);
    }

    const processed = {
      should_post: shouldPost,
      content: discourseContent,
      confidence: aiResponse.response.confidence,
      reasoning: aiResponse.response.reasoning,
      topic_id: originalData.original_topic_id,
      original_post_id: originalData.original_post_id,
      site_url: originalData.site_url,
      processing_time: aiResponse.metadata.processing_time_ms,
      word_count: discourseContent.split(' ').length,
      source_count: aiResponse.sources.length
    };

    return processed;
  }

  // Format response for Discourse posting
  formatForDiscourse(content, sources) {
    let formatted = content;
    
    // Add source references
    if (sources && sources.length > 0) {
      formatted += '\n\n---\n**References:**\n';
      sources.forEach((source, index) => {
        formatted += `${index + 1}. [${source.title}](${source.url})\n`;
      });
    }
    
    // Add bot signature
    formatted += '\n\n*This response was generated by AI assistant. Please let me know if you need clarification on any part!*';
    
    return formatted;
  }

  // Step 4: Simulate posting to Discourse
  simulateDiscoursePost(processedData) {
    console.log('   🔄 Step 4: Simulating Discourse post...');

    if (!processedData.should_post) {
      console.log('   ⏭️  Skipping post due to quality check');
      return { posted: false, reason: 'Quality check failed' };
    }

    // Simulate API call to Discourse
    console.log('   ✅ Would post to Discourse:');
    console.log(`      Topic ID: ${processedData.topic_id}`);
    console.log(`      Content length: ${processedData.word_count} words`);
    console.log(`      Sources included: ${processedData.source_count}`);

    return { 
      posted: true, 
      post_id: Math.floor(Math.random() * 100000),
      url: `${processedData.site_url}/t/${processedData.topic_id}/${Math.floor(Math.random() * 100000)}`
    };
  }

  // Complete workflow test
  async runWorkflow(testCase) {
    console.log(`\n📋 Testing: ${testCase.name}`);
    console.log('='.repeat(50));

    const startTime = Date.now();
    
    try {
      // Step 1: Transform data
      const transformed = this.transformDiscourseData(testCase.payload);
      
      // Step 2: Send to AI backend
      const aiResponse = await this.sendToAIBackend(transformed);
      
      // Step 3: Process response
      const processed = this.processAIResponse(aiResponse, transformed);
      
      // Step 4: Simulate posting
      const postResult = this.simulateDiscoursePost(processed);
      
      const totalTime = Date.now() - startTime;
      
      const result = {
        testCase: testCase.name,
        success: true,
        totalTime,
        confidence: processed.confidence,
        shouldPost: processed.should_post,
        posted: postResult.posted,
        reasoning: processed.reasoning,
        wordCount: processed.word_count,
        sourceCount: processed.source_count
      };

      console.log(`\n   🎉 Workflow completed successfully in ${totalTime}ms`);
      
      this.results.push(result);
      return result;

    } catch (error) {
      console.log(`\n   💥 Workflow failed: ${error.message}`);
      
      const result = {
        testCase: testCase.name,
        success: false,
        error: error.message,
        totalTime: Date.now() - startTime
      };

      this.results.push(result);
      return result;
    }
  }
}

// Performance testing
async function performanceTest() {
  console.log('\n🚀 Performance Testing');
  console.log('='.repeat(30));

  const simulator = new ZapierWorkflowSimulator();
  const testPayload = mockDiscoursePayloads[0]; // Use React integration question

  console.log('Running 5 concurrent workflow tests...');
  
  const startTime = Date.now();
  const promises = Array(5).fill().map((_, index) => {
    const modifiedPayload = {
      ...testPayload,
      name: `Concurrent Test ${index + 1}`,
      payload: {
        ...testPayload.payload,
        topic: { ...testPayload.payload.topic, id: 12345 + index },
        post: { ...testPayload.payload.post, id: 67890 + index }
      }
    };
    return simulator.runWorkflow(modifiedPayload);
  });

  try {
    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;
    
    console.log(`\n✅ All 5 workflows completed in ${totalTime}ms`);
    console.log(`📊 Average time per workflow: ${totalTime / 5}ms`);
    
    const successful = results.filter(r => r.success).length;
    console.log(`📈 Success rate: ${successful}/5 (${(successful/5*100).toFixed(1)}%)`);

  } catch (error) {
    console.log('❌ Performance test failed:', error.message);
  }
}

// Quality analysis
function analyzeResults(results) {
  console.log('\n📊 Quality Analysis');
  console.log('='.repeat(20));

  const successful = results.filter(r => r.success);
  const posted = successful.filter(r => r.posted);
  
  console.log(`Total tests: ${results.length}`);
  console.log(`Successful: ${successful.length} (${(successful.length/results.length*100).toFixed(1)}%)`);
  console.log(`Posted: ${posted.length} (${(posted.length/successful.length*100).toFixed(1)}%)`);

  if (successful.length > 0) {
    const avgTime = successful.reduce((sum, r) => sum + r.totalTime, 0) / successful.length;
    console.log(`Average processing time: ${avgTime.toFixed(0)}ms`);

    const confidenceDistribution = successful.reduce((acc, r) => {
      acc[r.confidence] = (acc[r.confidence] || 0) + 1;
      return acc;
    }, {});

    console.log('\nConfidence distribution:');
    Object.entries(confidenceDistribution).forEach(([confidence, count]) => {
      console.log(`  ${confidence}: ${count} (${(count/successful.length*100).toFixed(1)}%)`);
    });

    if (posted.length > 0) {
      const avgWordCount = posted.reduce((sum, r) => sum + r.wordCount, 0) / posted.length;
      const avgSourceCount = posted.reduce((sum, r) => sum + r.sourceCount, 0) / posted.length;
      
      console.log(`\nAverage response length: ${avgWordCount.toFixed(0)} words`);
      console.log(`Average sources per response: ${avgSourceCount.toFixed(1)}`);
    }
  }
}

// Main test runner
async function runZapierIntegrationTests() {
  console.log('🎯 Zapier Integration End-to-End Test Suite');
  console.log('='.repeat(50));
  console.log(`Backend URL: ${config.baseUrl}`);
  console.log(`API Key: ${config.discourseApiKey ? 'Set' : 'Not set'}`);

  // Test server availability
  try {
    await makeRequest('/health', 'GET');
    console.log('✅ Backend server is available\n');
  } catch (error) {
    console.log('❌ Backend server is not available:', error.message);
    console.log('⚠️  Make sure the server is running and accessible\n');
    return;
  }

  const simulator = new ZapierWorkflowSimulator();
  
  // Run workflow tests for each mock payload
  for (const testCase of mockDiscoursePayloads) {
    await simulator.runWorkflow(testCase);
  }

  // Run performance test
  await performanceTest();

  // Analyze results
  analyzeResults(simulator.results);

  console.log('\n🏁 Zapier Integration Testing Complete');
  console.log('='.repeat(40));
}

// HTTP request helper (reused from previous test file)
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
  runZapierIntegrationTests().catch(console.error);
}

module.exports = { ZapierWorkflowSimulator, runZapierIntegrationTests }; 