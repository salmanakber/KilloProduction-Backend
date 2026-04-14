// Simple test to debug the API
const fetch = require('node-fetch');

async function testSimple() {
  try {
    console.log('🧪 Testing Simple API...\n');
    
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
    
    const data = await response.text();
    console.log('Response:', data);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testSimple();


