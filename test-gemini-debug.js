// Debug test for Google Gemini API
const fetch = require('node-fetch');

async function testGeminiDebug() {
  try {
    console.log('🔍 Debugging Google Gemini API...\n');
    
    // Test the API and get detailed response
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
      console.log('\n✅ Response Data:');
      console.log('Processing Info:', JSON.stringify(data.processing_info, null, 2));
      console.log('Diagnosis:', data.diagnosis);
      console.log('Recommended Medicines:', data.recommended_medicines.length);
      console.log('Notes:', data.notes.substring(0, 200) + '...');
    } else {
      const errorText = await response.text();
      console.log('❌ Error Response:', errorText.substring(0, 500) + '...');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testGeminiDebug();
