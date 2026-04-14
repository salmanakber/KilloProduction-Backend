// Test AI medicine matcher in isolation
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testAIMatcherIsolated() {
  try {
    console.log('🔍 Testing AI Medicine Matcher in isolation...\n');
    
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      console.log('❌ GOOGLE_GEMINI_API_KEY not found');
      return;
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    // Simulate a simple medicine database
    const medicineContext = [
      {
        name: "Paracetamol",
        genericName: "Acetaminophen",
        description: "Pain reliever and fever reducer",
        illnessTypes: ["headache", "fever", "pain"],
        activeIngredients: ["Acetaminophen"],
        dosageInfo: "500mg every 6 hours",
        warnings: "Do not exceed 4g per day",
        sideEffects: ["Nausea", "Liver damage if overdosed"],
        category: "Analgesic",
        strength: "500mg",
        manufacturer: "Various"
      },
      {
        name: "Ibuprofen",
        genericName: "Ibuprofen",
        description: "Anti-inflammatory pain reliever",
        illnessTypes: ["headache", "fever", "inflammation", "pain"],
        activeIngredients: ["Ibuprofen"],
        dosageInfo: "400mg every 6-8 hours",
        warnings: "May cause stomach irritation",
        sideEffects: ["Stomach upset", "Dizziness"],
        category: "NSAID",
        strength: "400mg",
        manufacturer: "Various"
      }
    ];
    
    const prompt = `
You are a medical AI assistant with access to a comprehensive medicine database. Your task is to analyze a patient's problem and recommend the most appropriate medicines from the available database.

PATIENT INFORMATION:
- Problem Description: "I have a severe headache and high fever"
- Symptoms: ["headache", "fever"]
- Possible Illnesses: ["flu", "viral infection"]
- Mentioned Medicines: []

AVAILABLE MEDICINES DATABASE:
${JSON.stringify(medicineContext, null, 2)}

INSTRUCTIONS:
1. Analyze the patient's problem using your medical knowledge
2. From the database, select the most appropriate medicines for this specific problem
3. Consider the patient's symptoms, possible illnesses, and medical context
4. Prioritize medicines that are most suitable for the specific condition
5. Consider contraindications, warnings, and side effects
6. Select up to 5 most relevant medicines
7. Provide clear explanations for each recommendation

Return a JSON response with this structure:
{
  "recommendations": [
    {
      "medicineName": "exact name from database",
      "confidence": 0.9,
      "reason": "Why this medicine is suitable for this specific problem",
      "aiExplanation": "Detailed medical explanation of why this medicine is appropriate"
    }
  ]
}

Be thorough in your analysis and provide medically sound recommendations based on the patient's specific problem.
`;

    console.log('🔄 Sending request to AI...');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();
    
    console.log('✅ Raw AI Response:');
    console.log(responseText);
    
    // Clean the response text
    let cleanText = responseText.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    console.log('\n🧹 Cleaned text:', cleanText);
    
    try {
      const aiResponse = JSON.parse(cleanText);
      console.log('\n✅ AI Medicine Recommendations:');
      console.log(JSON.stringify(aiResponse, null, 2));
    } catch (parseError) {
      console.log('❌ JSON parsing failed:', parseError.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testAIMatcherIsolated();


