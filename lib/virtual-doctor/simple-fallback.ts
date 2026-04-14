// Simple fallback implementation for Virtual Doctor
// This version works without external API dependencies for testing

export interface SimpleMedicalData {
  symptoms: string[];
  illnesses: string[];
  medicines: string[];
  confidence: number;
  source: string;
}

export interface SimpleOCRResult {
  text: string;
  confidence: number;
  source: string;
}

export interface SimpleSpeechResult {
  text: string;
  confidence: number;
  source: string;
}

/**
 * Simple text extraction from image (mock implementation)
 */
export async function simpleOCR(imageBuffer: Buffer): Promise<SimpleOCRResult> {
  // Mock implementation - in real scenario, this would use actual OCR
  return {
    text: "Prescription: Paracetamol 500mg twice daily for 5 days. Doctor's note: Take with food.",
    confidence: 0.85,
    source: 'Mock OCR'
  };
}

/**
 * Simple speech-to-text (mock implementation)
 */
export async function simpleSpeechToText(audioBuffer: Buffer): Promise<SimpleSpeechResult> {
  // Mock implementation - in real scenario, this would use actual speech-to-text
  return {
    text: "I have a headache and feel nauseous. I think I might have a fever.",
    confidence: 0.90,
    source: 'Mock Speech-to-Text'
  };
}

/**
 * Simple NLP processing (mock implementation)
 */
export async function simpleNLP(text: string): Promise<SimpleMedicalData> {
  // Simple keyword-based extraction
  const lowerText = text.toLowerCase();
  
  console.log('🔍 Simple NLP Debug:');
  console.log('  Input text:', text);
  console.log('  Lower text:', lowerText);
  
  const symptoms: string[] = [];
  const illnesses: string[] = [];
  const medicines: string[] = [];

  // Extract symptoms
  const symptomKeywords = [
    'headache', 'head pain', 'fever', 'temperature', 'cough', 'nausea', 'vomiting', 'diarrhea', 'pain',
    'fatigue', 'tired', 'dizziness', 'rash', 'sore throat', 'runny nose', 'congestion',
    'chest pain', 'back pain', 'joint pain', 'muscle pain', 'abdominal pain', 'stomach pain',
    'allergy', 'allergic', 'sleep', 'insomnia', 'anxiety', 'depression', 'stress',
    'cold', 'flu', 'sick', 'illness', 'symptoms', 'ache', 'aches'
  ];

  symptomKeywords.forEach(symptom => {
    if (lowerText.includes(symptom)) {
      symptoms.push(symptom);
      console.log(`  ✅ Found symptom: ${symptom}`);
    }
  });

  // Extract possible illnesses
  const illnessKeywords = [
    'flu', 'cold', 'fever', 'migraine', 'infection', 'allergy', 'asthma',
    'diabetes', 'hypertension', 'anxiety', 'depression', 'insomnia',
    'gastroenteritis', 'bronchitis', 'pneumonia', 'sinusitis', 'conjunctivitis',
    'arthritis', 'fibromyalgia', 'chronic fatigue', 'ibs', 'acid reflux'
  ];

  illnessKeywords.forEach(illness => {
    if (lowerText.includes(illness)) {
      illnesses.push(illness);
      console.log(`  ✅ Found illness: ${illness}`);
    }
  });

  // Extract medicines
  const medicineKeywords = [
    'paracetamol', 'acetaminophen', 'ibuprofen', 'aspirin', 'amoxicillin',
    'penicillin', 'vitamin', 'supplement', 'tablet', 'capsule', 'syrup'
  ];

  medicineKeywords.forEach(medicine => {
    if (lowerText.includes(medicine)) {
      medicines.push(medicine);
      console.log(`  ✅ Found medicine: ${medicine}`);
    }
  });

  // If no specific symptoms found, add generic ones based on common patterns
  if (symptoms.length === 0) {
    if (lowerText.includes('feel') || lowerText.includes('sick')) {
      symptoms.push('general malaise');
    }
  }

  return {
    symptoms,
    illnesses,
    medicines,
    confidence: 0.75,
    source: 'Simple NLP Fallback'
  };
}

/**
 * Main processing function with simple fallback
 */
export async function processInput(inputType: 'text' | 'audio' | 'image', data: any): Promise<{ text: string; source: string }> {
  switch (inputType) {
    case 'text':
      return { text: data, source: 'Direct text input' };
    case 'audio':
      return await simpleSpeechToText(data);
    case 'image':
      return await simpleOCR(data);
    default:
      throw new Error('Invalid input type');
  }
}
