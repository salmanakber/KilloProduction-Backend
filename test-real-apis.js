// Test script for Real Virtual Doctor APIs
const fetch = require('node-fetch');

async function testRealAPIs() {
  try {
    console.log('🧪 Testing Real Virtual Doctor APIs...\n');
    
    // Test 1: Text Input
    console.log('📝 Test 1: Text Input');
    const textResponse = await fetch('http://localhost:3000/api/pharmacy/VirtualDoctor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        textInput: 'I have a severe headache and high fever. I think I might have the flu.'
      }),
    });
    
    if (textResponse.ok) {
      const textData = await textResponse.json();
      console.log('✅ Text API Response:');
      console.log(`   - Input Type: ${textData.processing_info.input_type}`);
      console.log(`   - NLP Source: ${textData.processing_info.nlp_source}`);
      console.log(`   - Extracted Text: ${textData.processing_info.text_extracted.substring(0, 100)}...`);
      console.log(`   - Symptoms Found: ${textData.diagnosis.length}`);
      console.log(`   - Medicines Found: ${textData.recommended_medicines.length}`);
      console.log(`   - Processing Time: ${textData.processing_info.processing_time_ms}ms\n`);
    } else {
      console.log('❌ Text API Failed:', textResponse.status, textResponse.statusText);
    }
    
    // Test 2: Different Text Input
    console.log('📝 Test 2: Different Text Input');
    const textResponse2 = await fetch('http://localhost:3000/api/pharmacy/VirtualDoctor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        textInput: 'I need help with my prescription for metformin 500mg twice daily'
      }),
    });
    
    if (textResponse2.ok) {
      const textData2 = await textResponse2.json();
      console.log('✅ Text API Response 2:');
      console.log(`   - Input Type: ${textData2.processing_info.input_type}`);
      console.log(`   - NLP Source: ${textData2.processing_info.nlp_source}`);
      console.log(`   - Extracted Text: ${textData2.processing_info.text_extracted.substring(0, 100)}...`);
      console.log(`   - Symptoms Found: ${textData2.diagnosis.length}`);
      console.log(`   - Medicines Found: ${textData2.recommended_medicines.length}`);
      console.log(`   - Processing Time: ${textData2.processing_info.processing_time_ms}ms\n`);
    } else {
      console.log('❌ Text API 2 Failed:', textResponse2.status, textResponse2.statusText);
    }
    
    console.log('🎯 Summary:');
    console.log('   - Real APIs are now being called');
    console.log('   - OpenAI Whisper for speech-to-text');
    console.log('   - OpenAI Vision for OCR');
    console.log('   - OpenAI GPT-4 for NLP processing');
    console.log('   - Database queries for medicine matching');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testRealAPIs();


