// Test multiple GitHub AI providers
const fetch = require('node-fetch');

async function testMultiProvider() {
  try {
    console.log('🤖 Testing Multiple GitHub AI Providers...\n');
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const providers = ['azure', 'openai', 'fetch'];
    const testCases = [
      {
        name: 'Medical Query',
        textInput: 'I have a fever and headache, what medicine should I take?'
      },
      {
        name: 'Symptom Analysis',
        textInput: 'I feel nauseous and have stomach pain'
      }
    ];
    
    for (const provider of providers) {
      console.log(`\n🔄 Testing ${provider.toUpperCase()} Provider:`);
      console.log('=' .repeat(50));
      
      // Test each provider with different queries
      for (const testCase of testCases) {
        try {
          console.log(`\n📝 Test: ${testCase.name}`);
          
          const startTime = Date.now();
          const response = await fetch('http://localhost:3000/api/pharmacy/VirtualDoctor', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-GitHub-AI-Provider': provider // Custom header to specify provider
            },
            body: JSON.stringify({
              textInput: testCase.textInput
            }),
            timeout: 30000
          });
          
          const processingTime = Date.now() - startTime;
          
          if (response.ok) {
            const data = await response.json();
            console.log(`✅ ${provider} - Status: ${response.status}`);
            console.log(`   Processing Time: ${processingTime}ms`);
            console.log(`   AI Source: ${data.processing_info.ai_source}`);
            console.log(`   AI Powered: ${data.processing_info.ai_powered}`);
            console.log(`   Medicines Found: ${data.processing_info.medicines_found}`);
            
            if (data.recommended_medicines.length > 0) {
              console.log(`   First Medicine: ${data.recommended_medicines[0].name}`);
            }
          } else {
            console.log(`❌ ${provider} - Status: ${response.status}`);
            const errorText = await response.text();
            console.log(`   Error: ${errorText.substring(0, 200)}...`);
          }
          
        } catch (error) {
          console.log(`❌ ${provider} - ${testCase.name} failed: ${error.message}`);
        }
      }
    }
    
    // Test provider switching via environment
    console.log('\n\n🔄 Testing Provider Switching via Environment:');
    console.log('=' .repeat(60));
    
    const envProviders = ['azure', 'openai', 'fetch'];
    for (const provider of envProviders) {
      console.log(`\n📝 Testing with GITHUB_AI_PROVIDER=${provider}`);
      
      // Note: In a real scenario, you would restart the server with different env vars
      // For this demo, we'll just show the expected behavior
      console.log(`   Expected: API calls should use ${provider} client`);
      console.log(`   Note: Restart server with GITHUB_AI_PROVIDER=${provider} to test`);
    }
    
    console.log('\n\n✅ Multi-Provider Testing Completed!');
    console.log('\n📋 Provider Summary:');
    console.log('   - azure: Azure REST client (recommended)');
    console.log('   - openai: OpenAI client (compatible)');
    console.log('   - fetch: Direct fetch (fallback)');
    
  } catch (error) {
    console.error('❌ Multi-provider test failed:', error.message);
  }
}

testMultiProvider();




