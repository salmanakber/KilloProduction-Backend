// Example usage of the enhanced image analysis
// This demonstrates how to use the new GitHub AI multimodal models for medical image understanding

const fs = require('fs');
const path = require('path');

// Example function to test image analysis
async function testImageAnalysis() {
  try {
    // Example image buffer (you would load an actual image file)
    const imageBuffer = fs.readFileSync('./sample-prescription.jpg'); // Replace with actual image path
    
    // Import the analyzeMedicalImage function
    const { analyzeMedicalImage } = require('./lib/virtual-doctor/github-ai');
    
    console.log('🖼️ Testing enhanced medical image analysis...');
    
    // Test different image types
    const imageTypes = ['prescription', 'medicine_label', 'medical_report', 'symptom_photo', 'general'];
    
    for (const imageType of imageTypes) {
      try {
        console.log(`\n📋 Testing ${imageType} analysis...`);
        
        const result = await analyzeMedicalImage(imageBuffer, imageType);
        
        console.log(`✅ ${imageType} analysis successful:`);
        console.log(`   Confidence: ${Math.round(result.confidence * 100)}%`);
        console.log(`   Source: ${result.source}`);
        console.log(`   Extracted medicines: ${result.extractedData.medicines?.length || 0}`);
        console.log(`   Extracted symptoms: ${result.extractedData.symptoms?.length || 0}`);
        console.log(`   Extracted conditions: ${result.extractedData.conditions?.length || 0}`);
        console.log(`   Text preview: ${result.text.substring(0, 100)}...`);
        
      } catch (error) {
        console.log(`❌ ${imageType} analysis failed:`, error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Example API endpoint usage
async function testAPIEndpoint() {
  try {
    const FormData = require('form-data');
    const fetch = require('node-fetch');
    
    const formData = new FormData();
    formData.append('imageFile', fs.createReadStream('./sample-prescription.jpg'));
    formData.append('imageType', 'prescription');
    
    console.log('🌐 Testing API endpoint...');
    
    const response = await fetch('http://localhost:3000/api/pharmacy/analyze-image', {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ API endpoint test successful:');
      console.log(`   Processing time: ${result.analysis.processingTime}ms`);
      console.log(`   Confidence: ${Math.round(result.analysis.confidence * 100)}%`);
      console.log(`   Image type: ${result.analysis.imageType}`);
      console.log(`   Extracted data:`, result.analysis.extractedData);
    } else {
      console.log('❌ API endpoint test failed:', result.error);
    }
    
  } catch (error) {
    console.error('❌ API test failed:', error);
  }
}

// Example frontend integration
function exampleFrontendIntegration() {
  console.log(`
📱 Frontend Integration Example:

1. Image Type Selection:
   - User selects image type (prescription, medicine_label, etc.)
   - UI shows appropriate icons and labels
   - Type is sent to backend for specialized analysis

2. Enhanced Image Processing:
   - Image is sent to /api/pharmacy/analyze-image endpoint
   - Backend uses LLaVA model for medical image understanding
   - Extracted data is used for medicine matching

3. Results Display:
   - Image analysis results shown in dedicated section
   - Extracted medicines, symptoms, conditions displayed
   - Confidence score and source information shown
   - Full analysis text available for review

4. Fallback Handling:
   - If enhanced analysis fails, falls back to standard OCR
   - Error messages guide user to try again
   - Multiple image types supported for different use cases
  `);
}

// Run examples if this file is executed directly
if (require.main === module) {
  console.log('🚀 Enhanced Medical Image Analysis Examples');
  console.log('==========================================');
  
  exampleFrontendIntegration();
  
  // Uncomment to test actual functionality (requires image files and API keys)
  // testImageAnalysis();
  // testAPIEndpoint();
}

module.exports = {
  testImageAnalysis,
  testAPIEndpoint,
  exampleFrontendIntegration
};
