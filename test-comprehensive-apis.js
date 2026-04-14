// Test script for Comprehensive Virtual Doctor APIs with Google Gemini
const fetch = require('node-fetch');

async function testComprehensiveAPIs() {
  try {
    console.log('🧪 Testing Comprehensive Virtual Doctor APIs with Google Gemini...\n');
    
    // Test 1: Text Input
    console.log('📝 Test 1: Text Input with Comprehensive API Failover');
    const textResponse = await fetch('http://localhost:3000/api/pharmacy/VirtualDoctor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        textInput: 'I have a severe headache, high fever, and body aches. I think I might have the flu.'
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
      console.log(`   - Processing Time: ${textData.processing_info.processing_time_ms}ms`);
      console.log(`   - Notes: ${textData.notes.substring(0, 150)}...\n`);
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
        textInput: 'I need help with my prescription for metformin 500mg twice daily for diabetes'
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
    
    console.log('🎯 Comprehensive API Summary:');
    console.log('   📋 API Order: 1. Infermedica → 2. EndlessMedical → 3. Azure Health → 4. Google Gemini → 5. OpenAI GPT');
    console.log('   🔄 Failover Strategy: Each API tries in sequence, falls back to next if failed');
    console.log('   🛡️ Fallback: Simple implementation if all comprehensive APIs fail');
    console.log('   🗄️ Database: Always queries CentralMedicine database for medicine matching');
    console.log('   💡 Intelligence: Provides contextual advice even when no medicines found');
    
    console.log('\n🔧 To Enable All APIs, add these to your .env file:');
    console.log('   INFERMEDICA_API_KEY=your_key_here');
    console.log('   ENDLESSMEDICAL_API_KEY=your_key_here');
    console.log('   AZURE_HEALTH_API_KEY=your_key_here');
    console.log('   GOOGLE_GEMINI_API_KEY=your_key_here');
    console.log('   OPENAI_API_KEY=your_key_here');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testComprehensiveAPIs();


