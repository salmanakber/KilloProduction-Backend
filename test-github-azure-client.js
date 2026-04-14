// Test GitHub AI with Azure REST client
const { testGitHubAIConnection, githubAINLP, callGitHubAI, GITHUB_MODELS } = require('./lib/virtual-doctor/github-ai.ts');

async function testGitHubAzureClient() {
  try {
    console.log('🤖 Testing GitHub AI with Azure REST Client...\n');
    
    // Test 1: Connection test
    console.log('Test 1: Testing GitHub AI connection...');
    const connectionTest = await testGitHubAIConnection();
    console.log('Connection test result:', connectionTest);
    
    if (!connectionTest) {
      console.log('❌ GitHub AI connection failed, skipping other tests');
      return;
    }
    
    // Test 2: Test different models
    console.log('\nTest 2: Testing different models...');
    
    const models = [
      { name: 'DeepSeek V3', model: GITHUB_MODELS.ADVANCED.DEEPSEEK_V3 },
      { name: 'GPT-5', model: GITHUB_MODELS.ADVANCED.GPT_5 },
      { name: 'Llama 4 Scout', model: GITHUB_MODELS.ADVANCED.LLAMA_4_SCOUT }
    ];
    
    for (const { name, model } of models) {
      try {
        console.log(`\nTesting ${name}...`);
        const result = await callGitHubAI("What is a fever?", {
          model: model,
          temperature: 0.3,
          max_tokens: 100
        });
        console.log(`✅ ${name} response: ${result.substring(0, 100)}...`);
      } catch (error) {
        console.log(`❌ ${name} failed: ${error.message}`);
      }
    }
    
    // Test 3: Medical NLP processing
    console.log('\nTest 3: Testing GitHub AI medical NLP...');
    const nlpResult = await githubAINLP('I have a fever and headache');
    console.log('NLP Result:', JSON.stringify(nlpResult, null, 2));
    
    console.log('\n✅ GitHub AI Azure client tests completed successfully!');
    
  } catch (error) {
    console.error('❌ GitHub AI Azure client test failed:', error);
  }
}

testGitHubAzureClient();




