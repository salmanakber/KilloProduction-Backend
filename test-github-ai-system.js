// Test complete system with GitHub AI integration
const fetch = require('node-fetch');

async function testGitHubAISystem() {
  try {
    console.log('🤖 Testing Complete System with GitHub AI...\n');
    
    // Test 1: Fever medicines query
    console.log('Test 1: Testing fever medicines query with GitHub AI...');
    const response1 = await fetch('http://localhost:3000/api/pharmacy/VirtualDoctor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        textInput: 'I need fever medicines'
      }),
    });
    
    if (response1.ok) {
      const data1 = await response1.json();
      console.log('✅ Fever medicines test successful');
      console.log('Processing Info:', JSON.stringify(data1.processing_info, null, 2));
      console.log('Medicines Found:', data1.recommended_medicines?.length || 0);
      
      if (data1.recommended_medicines && data1.recommended_medicines.length > 0) {
        console.log('\n💊 Recommended Medicines:');
        data1.recommended_medicines.forEach((med, index) => {
          console.log(`   ${index + 1}. ${med.name}`);
          console.log(`      - Generic: ${med.genericName || 'N/A'}`);
          console.log(`      - Dosage: ${med.dosage}`);
          console.log(`      - Confidence: ${med.confidence}`);
          console.log(`      - Reason: ${med.matchReason}`);
          if (med.aiExplanation) {
            console.log(`      - AI Explanation: ${med.aiExplanation}`);
          }
          console.log('');
        });
      }
    } else {
      console.log('❌ Fever medicines test failed:', response1.status, response1.statusText);
    }
    
    // Test 2: Headache query
    console.log('\nTest 2: Testing headache query with GitHub AI...');
    const response2 = await fetch('http://localhost:3000/api/pharmacy/VirtualDoctor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        textInput: 'I have a severe headache and feel dizzy'
      }),
    });
    
    if (response2.ok) {
      const data2 = await response2.json();
      console.log('✅ Headache test successful');
      console.log('Processing Info:', JSON.stringify(data2.processing_info, null, 2));
      console.log('Medicines Found:', data2.recommended_medicines?.length || 0);
    } else {
      console.log('❌ Headache test failed:', response2.status, response2.statusText);
    }
    
    // Test 3: Complex medical query
    console.log('\nTest 3: Testing complex medical query with GitHub AI...');
    const response3 = await fetch('http://localhost:3000/api/pharmacy/VirtualDoctor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        textInput: 'I have been experiencing fever, cough, and body aches for 3 days. I think I might have the flu.'
      }),
    });
    
    if (response3.ok) {
      const data3 = await response3.json();
      console.log('✅ Complex medical test successful');
      console.log('Processing Info:', JSON.stringify(data3.processing_info, null, 2));
      console.log('Medicines Found:', data3.recommended_medicines?.length || 0);
    } else {
      console.log('❌ Complex medical test failed:', response3.status, response3.statusText);
    }
    
    console.log('\n🎉 All GitHub AI system tests completed!');
    
  } catch (error) {
    console.error('❌ GitHub AI system test failed:', error);
  }
}

testGitHubAISystem();


