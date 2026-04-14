// Test GitHub AI switch functionality
const fetch = require('node-fetch');

async function testGitHubSwitch() {
  try {
    console.log('🤖 Testing GitHub AI Switch Functionality...\n');
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 1: With GitHub AI enabled (default)
    console.log('Test 1: Testing with GitHub AI enabled...');
    const response1 = await fetch('http://localhost:3000/api/pharmacy/VirtualDoctor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        textInput: 'I have a severe headache and fever'
      }),
      timeout: 30000
    });
    
    if (response1.ok) {
      const data1 = await response1.json();
      console.log('✅ Response with GitHub AI enabled:');
      console.log(`   AI Source: ${data1.processing_info.ai_source}`);
      console.log(`   GitHub AI Enabled: ${data1.processing_info.github_ai_enabled}`);
      console.log(`   AI Powered: ${data1.processing_info.ai_powered}`);
      console.log(`   Medicines Found: ${data1.processing_info.medicines_found}`);
      console.log(`   Processing Time: ${data1.processing_info.processing_time_ms}ms\n`);
    } else {
      console.log('❌ Test 1 failed:', response1.status, response1.statusText);
    }
    
    // Test 2: Disable GitHub AI and test again
    console.log('Test 2: Testing with GitHub AI disabled...');
    
    // Note: In a real scenario, you would need to restart the server or use a different endpoint
    // For this test, we'll just show what the response structure looks like
    console.log('ℹ️  To test GitHub AI disabled, you would need to:');
    console.log('   1. Set USE_GITHUB_AI=false in .env');
    console.log('   2. Restart the server');
    console.log('   3. Make the same API call');
    console.log('   4. Observe ai_source changes from "github" to "primary" or "keyword"\n');
    
    console.log('✅ GitHub AI Switch test completed!');
    
  } catch (error) {
    console.error('❌ GitHub AI Switch test failed:', error.message);
  }
}

testGitHubSwitch();




