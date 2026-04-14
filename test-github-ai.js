// Test GitHub AI integration
const { testGitHubAIConnection, githubAINLP } = require('./lib/virtual-doctor/github-ai.ts');

async function testGitHubAI() {
  try {
    console.log('🤖 Testing GitHub AI Integration...\n');
    
    // Test 1: Connection test
    console.log('Test 1: Testing GitHub AI connection...');
    const connectionTest = await testGitHubAIConnection();
    console.log('Connection test result:', connectionTest);
    
    if (!connectionTest) {
      console.log('❌ GitHub AI connection failed, skipping other tests');
      return;
    }
    
    // Test 2: NLP processing
    console.log('\nTest 2: Testing GitHub AI NLP processing...');
    const nlpResult = await githubAINLP('I need fever medicines');
    console.log('NLP Result:', JSON.stringify(nlpResult, null, 2));
    
    // Test 3: Different medical text
    console.log('\nTest 3: Testing with different medical text...');
    const nlpResult2 = await githubAINLP('I have a headache and feel nauseous');
    console.log('NLP Result 2:', JSON.stringify(nlpResult2, null, 2));
    
    console.log('\n✅ GitHub AI tests completed successfully!');
    
  } catch (error) {
    console.error('❌ GitHub AI test failed:', error);
  }
}

testGitHubAI();


