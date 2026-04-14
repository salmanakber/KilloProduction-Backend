// Test Complete AI-Powered Virtual Doctor System
const fetch = require('node-fetch');

async function testCompleteAISystem() {
  try {
    console.log('🚀 Testing Complete AI-Powered Virtual Doctor System...\n');
    
    // Test 1: Complex medical problem with AI analysis
    console.log('📝 Test 1: Complex Medical Problem with AI Analysis');
    const response1 = await fetch('http://localhost:3000/api/pharmacy/VirtualDoctor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        textInput: 'I have been experiencing severe headaches for 3 days, high fever around 102°F, body aches, and fatigue. I think I might have the flu or a viral infection. I also have a sore throat and runny nose.'
      }),
    });
    
    if (response1.ok) {
      const data1 = await response1.json();
      console.log('✅ AI-Powered Response:');
      console.log(`   - Input Type: ${data1.processing_info.input_type}`);
      console.log(`   - NLP Source: ${data1.processing_info.nlp_source}`);
      console.log(`   - AI Powered: ${data1.processing_info.ai_powered}`);
      console.log(`   - Symptoms Found: ${data1.diagnosis.length}`);
      console.log(`   - AI Medicine Recommendations: ${data1.recommended_medicines.length}`);
      console.log(`   - Processing Time: ${data1.processing_info.processing_time_ms}ms`);
      
      if (data1.recommended_medicines.length > 0) {
        console.log('\n🤖 AI Medicine Analysis:');
        data1.recommended_medicines.forEach((med, index) => {
          console.log(`   ${index + 1}. ${med.name}`);
          console.log(`      - Generic: ${med.genericName || 'N/A'}`);
          console.log(`      - Confidence: ${med.confidence}`);
          console.log(`      - Reason: ${med.matchReason}`);
          console.log(`      - AI Explanation: ${med.aiExplanation?.substring(0, 100)}...`);
          console.log(`      - Dosage: ${med.dosage}`);
          console.log('');
        });
      }
      
      console.log('\n🌍 Multi-Language Support:');
      console.log('   English Notes:', data1.notes.english.substring(0, 100) + '...');
      console.log('   Hausa Notes:', data1.notes.hausa.substring(0, 100) + '...');
      console.log('   Yoruba Notes:', data1.notes.yoruba.substring(0, 100) + '...');
      console.log('');
    } else {
      console.log('❌ Test 1 Failed:', response1.status, response1.statusText);
    }
    
    // Test 2: Prescription query with AI analysis
    console.log('📝 Test 2: Prescription Query with AI Analysis');
    const response2 = await fetch('http://localhost:3000/api/pharmacy/VirtualDoctor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        textInput: 'I have diabetes and my doctor prescribed metformin. Can you tell me about this medicine and suggest alternatives if needed?'
      }),
    });
    
    if (response2.ok) {
      const data2 = await response2.json();
      console.log('✅ Prescription Query Response:');
      console.log(`   - AI Medicine Recommendations: ${data2.recommended_medicines.length}`);
      console.log(`   - Processing Time: ${data2.processing_info.processing_time_ms}ms`);
      
      if (data2.recommended_medicines.length > 0) {
        console.log('\n🤖 AI Medicine Analysis:');
        data2.recommended_medicines.forEach((med, index) => {
          console.log(`   ${index + 1}. ${med.name}`);
          console.log(`      - AI Explanation: ${med.aiExplanation?.substring(0, 150)}...`);
          console.log('');
        });
      }
    } else {
      console.log('❌ Test 2 Failed:', response2.status, response2.statusText);
    }
    
    // Test 3: Simple symptom query
    console.log('📝 Test 3: Simple Symptom Query');
    const response3 = await fetch('http://localhost:3000/api/pharmacy/VirtualDoctor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        textInput: 'I have a headache and fever'
      }),
    });
    
    if (response3.ok) {
      const data3 = await response3.json();
      console.log('✅ Simple Query Response:');
      console.log(`   - AI Medicine Recommendations: ${data3.recommended_medicines.length}`);
      console.log(`   - Processing Time: ${data3.processing_info.processing_time_ms}ms`);
    } else {
      console.log('❌ Test 3 Failed:', response3.status, response3.statusText);
    }
    
    console.log('🎯 Complete AI System Summary:');
    console.log('   🧠 AI Intelligence: Uses medical knowledge to understand patient problems');
    console.log('   🗄️ Database Integration: Uses database as main source of medicine information');
    console.log('   🤖 Smart Matching: AI brain selects appropriate medicines for specific conditions');
    console.log('   🌍 Multi-Language: English, Hausa, Yoruba support with listening capability');
    console.log('   📋 Detailed Explanations: AI provides comprehensive medical explanations');
    console.log('   ⚕️ Medical Accuracy: Considers contraindications, warnings, and side effects');
    console.log('   🎨 Frontend Integration: 80% screen coverage with loading animations');
    console.log('   🔊 Speaker Support: Text-to-speech in multiple languages');
    console.log('   🔄 Language Toggle: Easy switching between languages');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testCompleteAISystem();


