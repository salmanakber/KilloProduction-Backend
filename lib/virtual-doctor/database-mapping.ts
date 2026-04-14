import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface RecommendedMedicine {
  name: string;
  genericName?: string;
  dosage: string;
  fromDB: boolean;
  warnings?: string;
  sideEffects?: any;
  category?: string;
  strength?: string;
  manufacturer?: string;
  confidence: number;
  matchReason: string;
}

export interface VirtualDoctorResponse {
  diagnosis: string[];
  recommended_medicines: RecommendedMedicine[];
  notes: string;
  disclaimer: string;
  processing_info: {
    input_type: 'voice' | 'image';
    text_extracted: string;
    nlp_source: string;
    medicines_found: number;
    processing_time_ms: number;
  };
}

/**
 * Find matching medicines from CentralMedicine database based on illnesses
 */
export async function findMedicinesByIllnesses(illnesses: string[]): Promise<RecommendedMedicine[]> {
  if (illnesses.length === 0) return [];

  const medicines: RecommendedMedicine[] = [];

  for (const illness of illnesses) {
    try {
      const results = await prisma.centralMedicine.findMany({
        where: {
          AND: [
            { isActive: true },
            {
              OR: [
                {
                  description: {
                    contains: illness,
                    mode: 'insensitive'
                  }
                },
                {
                  name: {
                    contains: illness,
                    mode: 'insensitive'
                  }
                },
                {
                  genericName: {
                    contains: illness,
                    mode: 'insensitive'
                  }
                }
              ]
            }
          ]
        },
        take: 5 // Limit results per illness
      });

      for (const med of results) {
        medicines.push({
          name: med.name,
          genericName: med.genericName || undefined,
          dosage: med.dosageInfo || 'Consult pharmacist for dosage',
          fromDB: true,
          warnings: med.warnings || undefined,
          sideEffects: med.sideEffects || undefined,
          category: med.category,
          strength: med.strength || undefined,
          manufacturer: med.manufacturer || undefined,
          confidence: 0.9,
          matchReason: `Matched illness: ${illness}`
        });
      }
    } catch (error) {
      console.error(`Error finding medicines for illness ${illness}:`, error);
    }
  }

  return medicines;
}

/**
 * Find matching medicines from CentralMedicine database based on medicine names
 */
export async function findMedicinesByNames(medicineNames: string[]): Promise<RecommendedMedicine[]> {
  if (medicineNames.length === 0) return [];

  const medicines: RecommendedMedicine[] = [];

  for (const medicineName of medicineNames) {
    try {
      const results = await prisma.centralMedicine.findMany({
        where: {
          AND: [
            { isActive: true },
            {
              OR: [
                {
                  name: {
                    contains: medicineName,
                    mode: 'insensitive'
                  }
                },
                {
                  genericName: {
                    contains: medicineName,
                    mode: 'insensitive'
                  }
                },
                {
                  activeIngredients: {
                    path: ['$'],
                    array_contains: [medicineName.toLowerCase()]
                  }
                },
                {
                  activeIngredients: {
                    path: ['$'],
                    array_contains: [medicineName]
                  }
                }
              ]
            }
          ]
        },
        take: 3 // Limit results per medicine name
      });

      for (const med of results) {
        medicines.push({
          name: med.name,
          genericName: med.genericName || undefined,
          dosage: med.dosageInfo || 'Consult pharmacist for dosage',
          fromDB: true,
          warnings: med.warnings || undefined,
          sideEffects: med.sideEffects || undefined,
          category: med.category,
          strength: med.strength || undefined,
          manufacturer: med.manufacturer || undefined,
          confidence: 0.95,
          matchReason: `Matched medicine name: ${medicineName}`
        });
      }
    } catch (error) {
      console.error(`Error finding medicines for name ${medicineName}:`, error);
    }
  }

  return medicines;
}

/**
 * Find medicines by symptoms (using illness categories)
 */
export async function findMedicinesBySymptoms(symptoms: string[]): Promise<RecommendedMedicine[]> {
  if (symptoms.length === 0) return [];

  const medicines: RecommendedMedicine[] = [];

  // Map common symptoms to illness categories
  const symptomToIllnessMap: { [key: string]: string[] } = {
    'fever': ['fever', 'infection', 'viral', 'bacterial'],
    'headache': ['headache', 'migraine', 'tension'],
    'cough': ['cough', 'cold', 'respiratory', 'bronchitis'],
    'nausea': ['nausea', 'stomach', 'digestive', 'gastrointestinal'],
    'pain': ['pain', 'inflammation', 'analgesic'],
    'diarrhea': ['diarrhea', 'digestive', 'gastrointestinal'],
    'rash': ['rash', 'skin', 'dermatitis', 'allergic'],
    'fatigue': ['fatigue', 'energy', 'vitamin', 'anemia']
  };

  for (const symptom of symptoms) {
    const relatedIllnesses = symptomToIllnessMap[symptom.toLowerCase()] || [symptom];
    
    for (const illness of relatedIllnesses) {
      try {
        const results = await prisma.centralMedicine.findMany({
          where: {
            AND: [
              { isActive: true },
              {
                OR: [
                  {
                    description: {
                      contains: illness,
                      mode: 'insensitive'
                    }
                  },
                  {
                    name: {
                      contains: illness,
                      mode: 'insensitive'
                    }
                  },
                  {
                    genericName: {
                      contains: illness,
                      mode: 'insensitive'
                    }
                  }
                ]
              }
            ]
          },
          take: 2 // Limit results per symptom
        });

        for (const med of results) {
          medicines.push({
            name: med.name,
            genericName: med.genericName || undefined,
            dosage: med.dosageInfo || 'Consult pharmacist for dosage',
            fromDB: true,
            warnings: med.warnings || undefined,
            sideEffects: med.sideEffects || undefined,
            category: med.category,
            strength: med.strength || undefined,
            manufacturer: med.manufacturer || undefined,
            confidence: 0.8,
            matchReason: `Matched symptom: ${symptom}`
          });
        }
      } catch (error) {
        console.error(`Error finding medicines for symptom ${symptom}:`, error);
      }
    }
  }

  return medicines;
}

/**
 * Remove duplicate medicines and rank by confidence
 */
export function deduplicateAndRankMedicines(medicines: RecommendedMedicine[]): RecommendedMedicine[] {
  const medicineMap = new Map<string, RecommendedMedicine>();

  for (const medicine of medicines) {
    const key = medicine.name.toLowerCase();
    const existing = medicineMap.get(key);

    if (!existing || medicine.confidence > existing.confidence) {
      medicineMap.set(key, medicine);
    }
  }

  return Array.from(medicineMap.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10); // Limit to top 10 recommendations
}

/**
 * Main function to find matching medicines from database
 */
export async function findMatchingMedicines(
  illnesses: string[],
  medicines: string[],
  symptoms: string[]
): Promise<RecommendedMedicine[]> {
  console.log('Searching database for:', { illnesses, medicines, symptoms });

  const allMedicines: RecommendedMedicine[] = [];

  // Find medicines by illnesses
  if (illnesses.length > 0) {
    const illnessMedicines = await findMedicinesByIllnesses(illnesses);
    allMedicines.push(...illnessMedicines);
  }

  // Find medicines by medicine names
  if (medicines.length > 0) {
    const nameMedicines = await findMedicinesByNames(medicines);
    allMedicines.push(...nameMedicines);
  }

  // Find medicines by symptoms
  if (symptoms.length > 0) {
    const symptomMedicines = await findMedicinesBySymptoms(symptoms);
    allMedicines.push(...symptomMedicines);
  }

  // If no medicines found, try a general search
  if (allMedicines.length === 0) {
    console.log('No specific matches found, trying general search...');
    const generalSearch = [...illnesses, ...medicines, ...symptoms].slice(0, 3);
    if (generalSearch.length > 0) {
      const generalMedicines = await findMedicinesByNames(generalSearch);
      allMedicines.push(...generalMedicines);
    }
  }

  return deduplicateAndRankMedicines(allMedicines);
}

/**
 * Generate appropriate notes based on diagnosis and medicines
 */
export function generateNotes(diagnosis: string[], medicines: RecommendedMedicine[], originalText: string = ''): string {
  const notes: string[] = [];

  if (diagnosis.length > 0) {
    notes.push(`Based on the symptoms described, possible conditions include: ${diagnosis.join(', ')}.`);
  }

  if (medicines.length > 0) {
    notes.push(`${medicines.length} medicine(s) found in our database that may be relevant.`);
  } else {
    // Provide helpful explanation when no medicines are found
    notes.push('No specific medicines were found in our database for your symptoms.');
    
    // Generate contextual advice based on the input
    const lowerText = originalText.toLowerCase();
    
    if (lowerText.includes('headache') || lowerText.includes('head pain')) {
      notes.push('For headaches, consider rest, hydration, and over-the-counter pain relievers like acetaminophen or ibuprofen.');
    }
    
    if (lowerText.includes('fever') || lowerText.includes('temperature')) {
      notes.push('For fever, ensure adequate rest, stay hydrated, and monitor your temperature. Consider fever reducers if needed.');
    }
    
    if (lowerText.includes('cough') || lowerText.includes('cold')) {
      notes.push('For cough and cold symptoms, stay hydrated, get plenty of rest, and consider cough suppressants or expectorants.');
    }
    
    if (lowerText.includes('nausea') || lowerText.includes('vomit')) {
      notes.push('For nausea, try small, frequent meals, avoid strong odors, and consider anti-nausea medications if severe.');
    }
    
    if (lowerText.includes('pain') && !lowerText.includes('headache')) {
      notes.push('For general pain, consider rest, ice/heat therapy, and over-the-counter pain relievers appropriate for your condition.');
    }
    
    if (lowerText.includes('allergy') || lowerText.includes('allergic')) {
      notes.push('For allergic reactions, avoid known triggers and consider antihistamines. Seek immediate help for severe reactions.');
    }
    
    if (lowerText.includes('sleep') || lowerText.includes('insomnia')) {
      notes.push('For sleep issues, maintain a regular sleep schedule, avoid caffeine before bed, and create a comfortable sleep environment.');
    }
    
    // General advice if no specific symptoms detected
    if (notes.length === 1) {
      notes.push('Consider general wellness practices: stay hydrated, get adequate rest, maintain a balanced diet, and practice stress management.');
    }
  }

  notes.push('Always consult with a healthcare professional before taking any medication.');
  notes.push('Follow the recommended dosage and read all warnings carefully.');
  notes.push('If symptoms persist or worsen, seek immediate medical attention.');

  return notes.join(' ');
}
