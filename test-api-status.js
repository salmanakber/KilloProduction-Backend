// Test API status without making actual requests
const fetch = require('node-fetch');

async function testAPIStatus() {
  try {
    console.log('🧪 Testing API Status...\n');
    
    // Test the API status endpoint (if it exists) or just test the main endpoint
    const response = await fetch('http://localhost:3000/api/pharmacy/VirtualDoctor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        textInput: 'test'
      }),
    });
    
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    
    if (response.status === 500) {
      const errorText = await response.text();
      console.log('Error Response:', errorText.substring(0, 500) + '...');
    } else {
      const data = await response.json();
      console.log('Success Response:', JSON.stringify(data, null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testAPIStatus();


