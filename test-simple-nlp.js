// Test simple NLP directly
const text = 'I need fever medicines';
const lowerText = text.toLowerCase();

console.log('🔍 Testing Simple NLP Logic:');
console.log('  Input text:', text);
console.log('  Lower text:', lowerText);

const symptoms = [];
const illnesses = [];
const medicines = [];

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

console.log('\n📊 Results:');
console.log('  Symptoms:', symptoms);
console.log('  Illnesses:', illnesses);
console.log('  Medicines:', medicines);
