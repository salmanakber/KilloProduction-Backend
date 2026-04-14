// Simple test for AI medicine matching
const fetch = require('node-fetch');

async function testSimpleAI() {
  try {
    console.log('🔍 Testing Simple AI System...\n');
    
    const response = await fetch('http://localhost:3000/api/pharmacy/VirtualDoctor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        textInput: 'I have a headache'
      }),
    });
    
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Response received');
      console.log('Processing Info:', JSON.stringify(data.processing_info, null, 2));
    } else {
      const errorText = await response.text();
      console.log('❌ Error Response:', errorText.substring(0, 1000) + '...');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSimpleAI();


