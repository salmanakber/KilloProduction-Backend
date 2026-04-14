// Test script for Virtual Doctor API
const fetch = require('node-fetch');
const FormData = require('form-data');

async function testVirtualDoctor() {
  try {
    console.log('Testing Virtual Doctor API...');
    
    const formData = new FormData();
    formData.append('textInput', 'I have a headache and feel nauseous. I think I might have a fever.');
    
    const response = await fetch('http://localhost:3000/api/pharmacy/VirtualDoctor', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Virtual Doctor Response:');
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testVirtualDoctor();


