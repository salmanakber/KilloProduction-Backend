import { analyzeWithAI } from '../ai/queue';
import { findMedicinesFromNearbyPharmacies } from './pharmacy-matcher';
import { AIUseCase } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export interface PrescriptionMedicine {
  medicineName: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  quantity?: string;
  instructions?: string;
}

export interface MatchedMedicine extends PrescriptionMedicine {
  centralMedicineId?: string;
  centralMedicineName?: string;
  genericName?: string;
  category?: string;
  strength?: string;
  manufacturer?: string;
  dosageInfo?: string;
  warnings?: string | null;
  sideEffects?: string | null;
  isExactMatch: boolean;
  isAlternative: boolean;
  alternativeNote?: string;
  confidence: number;
  matchReason: string;
}

export interface PrescriptionAnalysis {
  medicines: PrescriptionMedicine[];
  matchedMedicines: MatchedMedicine[];
  doctorName?: string;
  patientName?: string;
  date?: string;
  notes?: string;
  recommendations?: string;
  imageUrl?: string;
  pharmacyMatch?: {
    singlePharmacyMatch: any;
    multiPharmacyMatch: any[];
    allMedicinesFound: boolean;
  };
}

function extractJsonObject(text: string): string | null {
  const t = (text || "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return t.slice(first, last + 1);
}

function tryParseJsonLenient(raw: string): any | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Fast path
  try {
    return JSON.parse(trimmed);
  } catch {}

  let candidate = trimmed;
  candidate = candidate.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  candidate = candidate.replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  const extracted = extractJsonObject(candidate);
  if (extracted) candidate = extracted;

  // Common fixes:
  // - smart quotes
  candidate = candidate
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
  // - trailing commas before } or ]
  candidate = candidate.replace(/,\s*([}\]])/g, "$1");
  // - stray control chars
  candidate = candidate.replace(/\u0000/g, "");

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function fallbackExtractMedicinesFromText(text: string): PrescriptionMedicine[] {
  // Very small heuristic fallback (when JSON is broken):
  // Look for bullet-like lines and extract probable medicine names.
  const lines = (text || "")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const meds: PrescriptionMedicine[] = [];
  for (const line of lines) {
    // Skip obvious non-medicine lines
    if (line.toLowerCase().startsWith("doctor") || line.toLowerCase().startsWith("patient")) continue;
    // bullet / numbered / dash
    const m = line.match(/^(\*|-|\d+[\).\s])\s*(.+)$/);
    const content = m ? m[2] : null;
    const candidate = (content || "").trim();
    if (!candidate) continue;
    // Take first chunk before commas/parentheses as name
    const name = candidate.split(/[,(]/)[0]?.trim();
    if (!name || name.length < 3) continue;
    // Avoid capturing sentences
    if (name.split(" ").length > 6) continue;
    meds.push({ medicineName: name });
  }
  // Deduplicate by name
  const unique = Array.from(new Map(meds.map(x => [x.medicineName.toLowerCase(), x])).values());
  return unique.slice(0, 20);
}

/**
 * Match a single medicine name against CentralMedicine database
 * Returns exact match or alternatives
 */
async function matchMedicineInDatabase(medicineName: string): Promise<{
  exactMatch: any | null;
  alternatives: any[];
}> {
  // Try exact match first (name or generic name)
  const exactMatch = await prisma.centralMedicine.findFirst({
    where: {
      isActive: true,
      OR: [
        { name: { equals: medicineName, mode: 'insensitive' } },
        { genericName: { equals: medicineName, mode: 'insensitive' } },
      ],
    },
  });

  if (exactMatch) {
    return { exactMatch, alternatives: [] };
  }

  // Try partial match (contains)
  const partialMatches = await prisma.centralMedicine.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: medicineName, mode: 'insensitive' } },
        { genericName: { contains: medicineName, mode: 'insensitive' } },
      ],
    },
    take: 3,
  });

  if (partialMatches.length > 0) {
    return { exactMatch: partialMatches[0], alternatives: partialMatches.slice(1) };
  }

  // Try matching by individual words in the medicine name
  const words = medicineName.split(/\s+/).filter(w => w.length > 2);
  const wordMatches: any[] = [];
  
  for (const word of words) {
    const matches = await prisma.centralMedicine.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: word, mode: 'insensitive' } },
          { genericName: { contains: word, mode: 'insensitive' } },
          { description: { contains: word, mode: 'insensitive' } },
        ],
      },
      take: 3,
    });
    wordMatches.push(...matches);
  }

  // Deduplicate
  const uniqueAlternatives = Array.from(
    new Map(wordMatches.map(m => [m.id, m])).values()
  ).slice(0, 5);

  return { exactMatch: null, alternatives: uniqueAlternatives };
}

/**
 * Analyze prescription image/text using AI and match medicines
 */
export async function analyzePrescription(
  imageBuffer?: Buffer,
  imageBase64?: string,
  textInput?: string,
  userLat?: number | null,
  userLon?: number | null,
  imageUrl?: string, // Cloudinary URL
): Promise<PrescriptionAnalysis> {
  try {
    // Prepare data for AI
    const prescriptionData: any = {};
    
    // Prefer Cloudinary URL over base64
    const effectiveImageUrl = imageUrl || (imageBase64 ? `data:image/jpeg;base64,${imageBase64}` : undefined);
    
    if (effectiveImageUrl) {
      prescriptionData.image = effectiveImageUrl;
    }
    if (textInput) {
      prescriptionData.text = textInput;
    }

    const hasImage = !!effectiveImageUrl;

    // Call AI with PRESCRIPTION_ANALYSIS use case
    console.log(`📋 Analyzing prescription with ${hasImage ? 'IMAGE_TO_TEXT' : 'TEXT_TO_TEXT'} model...`);
    const aiResponse = await analyzeWithAI('PRESCRIPTION_ANALYSIS' as AIUseCase, prescriptionData, {
      category: hasImage ? 'IMAGE_TO_TEXT' : 'TEXT_TO_TEXT',
      imageUrl: effectiveImageUrl,
      providerPreference: hasImage ? 'huggingface' : 'auto',
      customPrompt: `Analyze this prescription image/text and extract all prescribed medicines with their details. Return a JSON object with this structure:
{
  "medicines": [
    {
      "medicineName": "exact medicine name",
      "dosage": "dosage info",
      "frequency": "how often to take",
      "duration": "for how long",
      "quantity": "number of units",
      "instructions": "usage instructions"
    }
  ],
  "doctorName": "doctor name if visible",
  "patientName": "patient name if visible",
  "date": "prescription date if visible",
  "notes": "any additional notes or recommendations",
  "recommendations": "general health recommendations from the prescription"
}
Return ONLY valid JSON. Extract ALL medicines mentioned.`,
    });

    if (!aiResponse.content) {
      throw new Error('No response from PRESCRIPTION_ANALYSIS AI');
    }

    // Parse AI response
    const parsedResponse = tryParseJsonLenient(aiResponse.content);
    if (!parsedResponse) {
      console.error('Error parsing prescription analysis response (lenient parse failed)');
      // Fallback: attempt to extract medicine-like lines from the raw AI output
      const fallbackMeds = fallbackExtractMedicinesFromText(aiResponse.content);
      console.warn(`⚠️ Falling back to heuristic extraction: ${fallbackMeds.length} medicines`);

      // Continue pipeline with fallback medicines (no doctor/patient/date extraction)
      const rawMedicines: PrescriptionMedicine[] = fallbackMeds;

      // Match each medicine against CentralMedicine database
      const matchedMedicines: MatchedMedicine[] = [];
      const medicineNamesForPharmacy: string[] = [];

      for (const med of rawMedicines) {
        const { exactMatch, alternatives } = await matchMedicineInDatabase(med.medicineName);
        if (exactMatch) {
          const isExact =
            exactMatch.name.toLowerCase() === med.medicineName.toLowerCase() ||
            exactMatch.genericName?.toLowerCase() === med.medicineName.toLowerCase();
          matchedMedicines.push({
            ...med,
            centralMedicineId: exactMatch.id,
            centralMedicineName: exactMatch.name,
            genericName: exactMatch.genericName || undefined,
            category: exactMatch.category || undefined,
            strength: exactMatch.strength || undefined,
            manufacturer: exactMatch.manufacturer || undefined,
            dosageInfo: exactMatch.dosageInfo || undefined,
            warnings: exactMatch.warnings,
            sideEffects: exactMatch.sideEffects,
            isExactMatch: isExact,
            isAlternative: false,
            confidence: isExact ? 0.9 : 0.75,
            matchReason: 'Fallback extracted medicine matched in database',
          });
          medicineNamesForPharmacy.push(exactMatch.name);
        } else if (alternatives.length > 0) {
          const bestAlt = alternatives[0];
          matchedMedicines.push({
            ...med,
            centralMedicineId: bestAlt.id,
            centralMedicineName: bestAlt.name,
            genericName: bestAlt.genericName || undefined,
            category: bestAlt.category || undefined,
            strength: bestAlt.strength || undefined,
            manufacturer: bestAlt.manufacturer || undefined,
            dosageInfo: bestAlt.dosageInfo || undefined,
            warnings: bestAlt.warnings,
            sideEffects: bestAlt.sideEffects,
            isExactMatch: false,
            isAlternative: true,
            alternativeNote: `\"${med.medicineName}\" not found in database. Suggested alternative: \"${bestAlt.name}\". Please confirm with your pharmacist.`,
            confidence: 0.5,
            matchReason: 'Fallback extracted medicine got alternative suggestion',
          });
          medicineNamesForPharmacy.push(bestAlt.name);
        } else {
          matchedMedicines.push({
            ...med,
            isExactMatch: false,
            isAlternative: false,
            alternativeNote: `\"${med.medicineName}\" was not found in our database. Please consult your pharmacist.`,
            confidence: 0.25,
            matchReason: 'Fallback extracted medicine not found in database',
          });
          medicineNamesForPharmacy.push(med.medicineName);
        }
      }

      let pharmacyMatch: PrescriptionAnalysis['pharmacyMatch'] = undefined;
      if (medicineNamesForPharmacy.length > 0) {
        const matchResult = await findMedicinesFromNearbyPharmacies(
          medicineNamesForPharmacy,
          userLat ?? null,
          userLon ?? null,
        );
        pharmacyMatch = matchResult;
      }

      return {
        medicines: rawMedicines,
        matchedMedicines,
        notes: 'AI response JSON was invalid; used fallback extraction.',
        imageUrl,
        pharmacyMatch,
      };
    }

    // Extract medicines from AI response
    const rawMedicines: PrescriptionMedicine[] = parsedResponse.medicines || [];
    console.log(`📦 AI extracted ${rawMedicines.length} medicines from prescription`);

    // Match each medicine against CentralMedicine database
    const matchedMedicines: MatchedMedicine[] = [];
    const medicineNamesForPharmacy: string[] = [];

    for (const med of rawMedicines) {
      const { exactMatch, alternatives } = await matchMedicineInDatabase(med.medicineName);

      if (exactMatch) {
        // Exact or close match found
        const isExact = exactMatch.name.toLowerCase() === med.medicineName.toLowerCase() ||
                        exactMatch.genericName?.toLowerCase() === med.medicineName.toLowerCase();
        
        matchedMedicines.push({
          ...med,
          centralMedicineId: exactMatch.id,
          centralMedicineName: exactMatch.name,
          genericName: exactMatch.genericName || undefined,
          category: exactMatch.category || undefined,
          strength: exactMatch.strength || undefined,
          manufacturer: exactMatch.manufacturer || undefined,
          dosageInfo: exactMatch.dosageInfo || undefined,
          warnings: exactMatch.warnings,
          sideEffects: exactMatch.sideEffects,
          isExactMatch: isExact,
          isAlternative: false,
          confidence: isExact ? 0.98 : 0.85,
          matchReason: isExact ? 'Exact match in database' : `Partial match: "${exactMatch.name}"`,
        });
        medicineNamesForPharmacy.push(exactMatch.name);

        console.log(`✅ ${isExact ? 'Exact' : 'Partial'} match: "${med.medicineName}" → "${exactMatch.name}"`);
      } else if (alternatives.length > 0) {
        // No exact match, suggest alternatives
        const bestAlt = alternatives[0];
        matchedMedicines.push({
          ...med,
          centralMedicineId: bestAlt.id,
          centralMedicineName: bestAlt.name,
          genericName: bestAlt.genericName || undefined,
          category: bestAlt.category || undefined,
          strength: bestAlt.strength || undefined,
          manufacturer: bestAlt.manufacturer || undefined,
          dosageInfo: bestAlt.dosageInfo || undefined,
          warnings: bestAlt.warnings,
          sideEffects: bestAlt.sideEffects,
          isExactMatch: false,
          isAlternative: true,
          alternativeNote: `"${med.medicineName}" not found in database. Suggested alternative: "${bestAlt.name}"${bestAlt.genericName ? ` (${bestAlt.genericName})` : ''}. Please confirm with your pharmacist.`,
          confidence: 0.6,
          matchReason: `Alternative suggestion for "${med.medicineName}"`,
        });
        medicineNamesForPharmacy.push(bestAlt.name);

        console.log(`⚠️ Alternative for "${med.medicineName}" → "${bestAlt.name}"`);

        // Add other alternatives as additional entries
        for (let i = 1; i < Math.min(alternatives.length, 3); i++) {
          const alt = alternatives[i];
          matchedMedicines.push({
            medicineName: alt.name,
            dosage: alt.dosageInfo || med.dosage,
            frequency: med.frequency,
            duration: med.duration,
            quantity: med.quantity,
            instructions: med.instructions,
            centralMedicineId: alt.id,
            centralMedicineName: alt.name,
            genericName: alt.genericName || undefined,
            category: alt.category || undefined,
            strength: alt.strength || undefined,
            manufacturer: alt.manufacturer || undefined,
            dosageInfo: alt.dosageInfo || undefined,
            warnings: alt.warnings,
            sideEffects: alt.sideEffects,
            isExactMatch: false,
            isAlternative: true,
            alternativeNote: `Additional alternative for "${med.medicineName}". Consult pharmacist before use.`,
            confidence: 0.5,
            matchReason: `Additional alternative for "${med.medicineName}"`,
          });
        }
      } else {
        // No match at all
        matchedMedicines.push({
          ...med,
          isExactMatch: false,
          isAlternative: false,
          alternativeNote: `"${med.medicineName}" was not found in our database. Please consult your pharmacist for availability.`,
          confidence: 0.3,
          matchReason: 'No match found in database',
        });
        // Still try with the original name for pharmacy matching
        medicineNamesForPharmacy.push(med.medicineName);

        console.log(`❌ No match found for "${med.medicineName}"`);
      }
    }

    // Find pharmacies with matched medicines
    let pharmacyMatch: PrescriptionAnalysis['pharmacyMatch'] = undefined;
    if (medicineNamesForPharmacy.length > 0) {
      console.log(`🔍 Searching pharmacies for ${medicineNamesForPharmacy.length} medicines...`);
      const matchResult = await findMedicinesFromNearbyPharmacies(
        medicineNamesForPharmacy,
        userLat ?? null,
        userLon ?? null,
      );
      pharmacyMatch = matchResult;
    }

    return {
      medicines: rawMedicines,
      matchedMedicines,
      doctorName: parsedResponse.doctorName,
      patientName: parsedResponse.patientName,
      date: parsedResponse.date,
      notes: parsedResponse.notes,
      recommendations: parsedResponse.recommendations,
      imageUrl,
      pharmacyMatch,
    };
  } catch (error) {
    console.error('Error analyzing prescription:', error);
    throw error;
  }
}
