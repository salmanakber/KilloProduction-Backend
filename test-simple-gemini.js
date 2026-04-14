// Simple test to check if Google Gemini import works
const { GoogleGenerativeAI } = require('@google/generative-ai');

console.log('✅ Google Gemini package imported successfully');
console.log('GoogleGenerativeAI:', typeof GoogleGenerativeAI);

// Test if we can create an instance (without API key)
try {
  const genAI = new GoogleGenerativeAI('test-key');
  console.log('✅ GoogleGenerativeAI instance created successfully');
} catch (error) {
  console.log('❌ Error creating GoogleGenerativeAI instance:', error.message);
}


