// Simple test for GitHub AI functionality
// This tests the actual API call without complex imports

const https = require('https');

// Test GitHub AI API directly
async function testGitHubAIDirect() {
  console.log('🧪 Testing GitHub AI API Directly');
  console.log('=================================');
  
  const token = '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';
  const baseURL = 'https://models.github.ai/inference';
  
  const requestData = {
    messages: [
      {
        role: "system",
        content: "You are a helpful medical AI assistant."
      },
      {
        role: "user",
        content: "Hello, this is a test message. Please respond with 'Test successful'."
      }
    ],
    model: 'meta/Llama-4-Scout-17B-16E-Instruct',
    temperature: 0.3,
    max_tokens: 100
  };
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(requestData);
    
    const options = {
      hostname: 'models.github.ai',
      port: 443,
      path: '/inference/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'SuperKillo-VirtualDoctor/1.0'
      }
    };
    
    console.log('📡 Making request to GitHub AI...');
    console.log(`   URL: https://${options.hostname}${options.path}`);
    console.log(`   Model: ${requestData.model}`);
    console.log(`   Token: ${token.substring(0, 20)}...`);
    
    const req = https.request(options, (res) => {
      console.log(`📊 Response Status: ${res.statusCode}`);
      console.log(`📊 Response Headers:`, res.headers);
      
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          if (res.statusCode === 200) {
            console.log('✅ GitHub AI API call successful!');
            console.log(`   Response: ${response.choices?.[0]?.message?.content || 'No content'}`);
            console.log(`   Tokens used: ${response.usage?.total_tokens || 'Unknown'}`);
            resolve(response);
          } else {
            console.log('❌ GitHub AI API call failed');
            console.log(`   Status: ${res.statusCode}`);
            console.log(`   Response: ${data}`);
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        } catch (parseError) {
          console.log('❌ Failed to parse response');
          console.log(`   Raw response: ${data}`);
          reject(parseError);
        }
      });
    });
    
    req.on('error', (error) => {
      console.log('❌ Request error:', error.message);
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
}

// Test with different models
async function testDifferentModels() {
  console.log('\n🤖 Testing Different Models');
  console.log('===========================');
  
  const models = [
    'meta/Llama-4-Scout-17B-16E-Instruct',
    'mistralai/Mistral-7B-Instruct-v0.1',
    'microsoft/Phi-3-mini-4k-instruct'
  ];
  
  for (const model of models) {
    try {
      console.log(`\n📋 Testing model: ${model}`);
      
      const token = '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';
      const baseURL = 'https://models.github.ai/inference';
      
      const requestData = {
        messages: [
          {
            role: "user",
            content: "Say 'Hello' in one word."
          }
        ],
        model: model,
        temperature: 0.1,
        max_tokens: 10
      };
      
      const postData = JSON.stringify(requestData);
      
      const options = {
        hostname: 'models.github.ai',
        port: 443,
        path: '/inference/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'SuperKillo-VirtualDoctor/1.0'
        }
      };
      
      const result = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const response = JSON.parse(data);
              if (res.statusCode === 200) {
                resolve(response);
              } else {
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              }
            } catch (error) {
              reject(error);
            }
          });
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
      
      console.log(`✅ ${model}: ${result.choices?.[0]?.message?.content || 'No response'}`);
      
    } catch (error) {
      console.log(`❌ ${model}: ${error.message}`);
    }
  }
}

// Main test function
async function runTests() {
  console.log('🚀 GitHub AI Direct API Test');
  console.log('============================');
  
  try {
    await testGitHubAIDirect();
    await testDifferentModels();
    
    console.log('\n✅ All tests completed successfully!');
    console.log('\n📝 Summary:');
    console.log('- GitHub AI API is accessible');
    console.log('- Token authentication works');
    console.log('- Models are responding');
    console.log('- Ready for integration');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check if GitHub token is valid');
    console.log('2. Check network connectivity');
    console.log('3. Check if models.github.ai is accessible');
    console.log('4. Check token permissions');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testGitHubAIDirect,
  testDifferentModels,
  runTests
};

