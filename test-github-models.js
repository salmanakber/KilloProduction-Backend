// Test GitHub Models API integration
const { testGitHubAIConnection, githubAINLP } = require('./lib/virtual-doctor/github-ai.ts');

async function testGitHubModels() {
  try {
    console.log('🤖 Testing GitHub Models API Integration...\n');
    
    // Test 1: Connection test
    console.log('Test 1: Testing GitHub Models connection...');
    const connectionTest = await testGitHubAIConnection();
    console.log('Connection test result:', connectionTest);
    
    if (!connectionTest) {
      console.log('❌ GitHub Models connection failed, skipping other tests');
      return;
    }
    
    // Test 2: NLP processing with medical text
    console.log('\nTest 2: Testing GitHub Models NLP processing...');
    const nlpResult = await githubAINLP('I have a fever and headache');
    console.log('NLP Result:', JSON.stringify(nlpResult, null, 2));
    
    // Test 3: Different medical text
    console.log('\nTest 3: Testing with different medical text...');
    const nlpResult2 = await githubAINLP('I need cough medicine and pain relief');
    console.log('NLP Result 2:', JSON.stringify(nlpResult2, null, 2));
    
    console.log('\n✅ GitHub Models API tests completed successfully!');
    
  } catch (error) {
    console.error('❌ GitHub Models API test failed:', error);
  }
}

testGitHubModels();




