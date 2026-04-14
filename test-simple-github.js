// Simple test for GitHub AI integration
const fetch = require('node-fetch');

async function testSimpleGitHub() {
  try {
    console.log('🤖 Testing GitHub AI integration...\n');
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Test with a simple query
    const response = await fetch('http://localhost:3000/api/pharmacy/VirtualDoctor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        textInput: 'I need fever medicines'
      }),
      timeout: 30000 // 30 second timeout
    });
    
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Success!');
      console.log('Response:', JSON.stringify(data, null, 2));
    } else {
      const errorText = await response.text();
      console.log('❌ Error Response:', errorText);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSimpleGitHub();


