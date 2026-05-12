import { NextRequest, NextResponse } from 'next/server';
import { AIUseCase, PrismaClient } from '@prisma/client';
import { authenticateRequest } from '@/lib/auth';
import { findMedicinesFromNearbyPharmacies } from '@/lib/virtual-doctor/pharmacy-matcher';
import { cloudinary } from '@/lib/cloudinary';
import { analyzeWithAI } from '@/lib/ai/queue';
import {
  AdvancedPrescriptionData,
  generatePrescriptionHTML,
  generatePrescriptionPdfBuffer,
} from '@/lib/prescription-pdf';

const prisma = new PrismaClient();

interface RecommendedMedicine {
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
  aiExplanation?: string;
}

function sanitizePrioritizedMedicine(med: any, fallback?: any, index: number = 0) {
  const autofilledFields: string[] = [];
  if (!med?.name && !fallback?.name) autofilledFields.push('name');
  if (!med?.priority) autofilledFields.push('priority');
  if (!med?.dosage && !fallback?.dosage) autofilledFields.push('dosage');
  if (!med?.reason && !fallback?.matchReason) autofilledFields.push('reason');
  if (!med?.urgency) autofilledFields.push('urgency');
  if (!med?.instructions) autofilledFields.push('instructions');
  if (!med?.quantity) autofilledFields.push('quantity');
  if (!med?.totalQuantity && !med?.quantity) autofilledFields.push('totalQuantity');
  if (!med?.quantityType) autofilledFields.push('quantityType');
  if (!med?.durationDays) autofilledFields.push('durationDays');
  const rawQuantity = Number(med?.totalQuantity ?? med?.quantity ?? fallback?.quantity ?? 0);
  const quantitySafe = Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : 1;
  return {
    name: String(med?.name || fallback?.name || `Medicine ${index + 1}`),
    priority: String(med?.priority || (index === 0 ? 'HIGH' : index === 1 ? 'MEDIUM' : 'LOW')),
    dosage: String(med?.dosage || fallback?.dosage || 'As directed'),
    reason: String(med?.reason || fallback?.matchReason || 'Recommended based on symptom analysis'),
    urgency: String(med?.urgency || (index === 0 ? 'HIGH' : 'MEDIUM')),
    instructions: String(med?.instructions || 'Take only after pharmacist confirmation'),
    quantity: String(med?.quantity || quantitySafe),
    totalQuantity: quantitySafe,
    quantityType: String(med?.quantityType || 'TAB'),
    durationDays: Number(med?.durationDays || 1),
    __autofilledFields: autofilledFields,
  };
}

interface SuperPharmaShortlistRequest {
  medicines: RecommendedMedicine[];
  symptoms: string[];
  consultationContext?: any;
  userLocation?: {
    latitude: number;
    longitude: number;
  };
}

interface SuperPharmaShortlistResponse {
  prescription: {
    id: string;
    title: string;
    date: string;
    pdfUrl?: string;
    htmlUrl?: string;
    prioritizedMedicines: Array<{
      name: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      dosage: string;
      reason: string;
      urgency: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
    usageNotes: string;
    contraindications: string;
    followUp: string;
  };
  nearbyPharmacies: Array<{
    id: string;
    name: string;
    distance: number;
    totalPrice: number;
    availabilityCount: number;
    totalMedicines: number;
    rating?: number;
    availableMedicines: Array<{
      id?: string;
      pharmacyMedicineId?: string;
      name: string;
      price: number;
      stock: number;
      available: boolean;
    }>;
    unavailableMedicines: Array<{
      name: string;
      reason: string;
    }>;
  }>;
  match_plan?: any;
  ai_autofill_report?: Array<{ medicine: string; autofilledFields: string[] }>;
}

// buildSimpleSchedule, escapePdfText, generatePrescriptionHTML,
// generatePrescriptionPdfBuffer are now imported from '@/lib/prescription-pdf'


function extractFirstJsonObject(text: string): any | null {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}


export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: SuperPharmaShortlistRequest = await request.json();
    const { medicines, symptoms, userLocation, consultationContext } = body;

    if (!medicines || medicines.length === 0) {
      return NextResponse.json({ error: 'No medicines provided' }, { status: 400 });
    }

    // Load user profile early to get patient info for AI analysis
    const profileForAI = await prisma.userProfile.findUnique({
      where: { userId: session.id },
    }) as any;

    // Step 1: Use the NEW AI config system (admin-configured models + systemPrompt in DB)
    // We intentionally do NOT call the old GitHub Models setup (`callGitHubAI`).
    let aiText = "";
    try {
      // Calculate age from date of birth
      let age: number | null = null;
      if (profileForAI?.dateOfBirth) {
        const diff = Date.now() - profileForAI.dateOfBirth.getTime();
        const ageDate = new Date(diff);
        age = Math.abs(ageDate.getUTCFullYear() - 1970);
      }

      const aiResponse = await analyzeWithAI(
        AIUseCase.GENERAL_ANALYSIS,
        {
          task: "SuperKillo Prescription Assistant",
          instructions:
            "Return ONLY valid JSON. No markdown. No extra text. Output MUST match the schema exactly. Calculate totalQuantity as: dosage per application × number of applications per day × durationDays. For creams or ointments, assume standard tube size of 15g per tube if not specified. Do NOT just repeat durationDays as totalQuantity. Consider patient demographics and vital signs when making recommendations. ",
          schema: {
            title: "string",
            prioritizedMedicines: [
              {
                name: "string",
                priority: "HIGH|MEDIUM|LOW",
                dosage: "string",
                reason: "string",
                urgency: "URGENT|HIGH|MEDIUM|LOW",
                instructions: "string", // tabletUsage
                quantity: "string", // totalQuantity
                totalQuantity: "number", // totalQuantity
                quantityType: "TAB|CAP|OINT|INJ|SYR|CRM|OTC", // quantityType
                durationDays: "number", // durationDays
              },
            ],
            usageNotes: "string",
            contraindications: "string",
            followUp: "string",
            allergies: "string",
            diagnosis: "string",
            diagnosisFull: "string",
            followUpDays: "number",
          },
          symptoms,
          patientInfo: {
            age: age,
            gender: profileForAI?.gender || null,
            bodyTemperature: profileForAI?.bodyTemp || null,
            bloodPressure: profileForAI?.bodyBp || null,
          },
          medicines: medicines.map((m) => ({
            name: m.name,
            genericName: m.genericName,
            dosage: m.dosage,
            strength: m.strength,
            category: m.category,
            confidence: m.confidence,
            matchReason: m.matchReason,
            aiExplanation: m.aiExplanation,
            warnings: m.warnings,
          })),
        },
        {
          category: "TEXT_TO_TEXT",
          maxTokens: 4096,
          disableTools: true,
        }
      );
      aiText = aiResponse.content || "";
    } catch (e) {
      console.error("SuperKillo Prescription Assistant AI (ai-config) failed, using fallback:", e);
    }

    let prescriptionData;
    try {
      prescriptionData = extractFirstJsonObject(aiText);
      if (!prescriptionData) throw new Error("No JSON object found in AI response");
    } catch (parseError) {
      if (aiText) console.error('Failed to parse AI response:', aiText);
      // Fallback prescription data
      prescriptionData = {
        title: `Treatment for ${symptoms.join(', ')}`,
        prioritizedMedicines: medicines.slice(0, 3).map((med, index) => ({
          name: med.name,
          priority: index === 0 ? 'HIGH' : index === 1 ? 'MEDIUM' : 'LOW',
          dosage: med.dosage,
          reason: med.matchReason,
          urgency: index === 0 ? 'HIGH' : 'MEDIUM',
          instructions: 'Take only after pharmacist confirmation',
          quantity: '1',
          totalQuantity: 1,
          quantityType: 'TAB',
          durationDays: 1,
        })),
        usageNotes: 'Follow the prescribed dosages and consult a pharmacist if you have any questions.',
        contraindications: 'Please inform your pharmacist of any allergies or existing medical conditions.',
        followUp: 'Monitor your symptoms and seek medical attention if they worsen or persist.'
      };
    }

    const normalizedPrioritizedMedicines = (prescriptionData.prioritizedMedicines || []).map((m: any, i: number) =>
      sanitizePrioritizedMedicine(m, medicines?.[i], i)
    );
    const autofillReport = normalizedPrioritizedMedicines.map((m: any) => ({
      medicine: String(m?.name || ''),
      autofilledFields: Array.isArray(m?.__autofilledFields) ? m.__autofilledFields : [],
    }));
    prescriptionData.prioritizedMedicines = normalizedPrioritizedMedicines.map(({ __autofilledFields, ...rest }: any) => rest);

    // Step 2: Save prescription to database
    const prescription = await prisma.prescription.create({
      data: {
        userId: session.id,
        doctorName: 'SuperPharma AI',
        hospitalName: 'AI Health Assistant',
        prescriptionDate: new Date(),
        status: 'UPLOADED',
        urgency: prescriptionData.prioritizedMedicines.some((med: any) => med.urgency === 'URGENT') ? 'URGENT' : 
                 prescriptionData.prioritizedMedicines.some((med: any) => med.urgency === 'HIGH') ? 'HIGH' : 'MEDIUM',
        notes: JSON.stringify({
          title: prescriptionData.title,
          prioritizedMedicines: prescriptionData.prioritizedMedicines,
          usageNotes: prescriptionData.usageNotes,
          contraindications: prescriptionData.contraindications,
          followUp: prescriptionData.followUp,
          originalMedicines: medicines,
          symptoms: symptoms,
          consultationContext: consultationContext || null,
          autofillReport,
        })
      }
    });

    // Step 2.5: Generate a downloadable prescription document (PDF + HTML) and upload to Cloudinary.
    let htmlUrl: string | undefined;
    let pdfUrl: string | undefined;

    // Load user and default address for patient block (profile already loaded above)
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, name: true, phone: true },
    });
    const profile = profileForAI; // Reuse profile loaded above
    const address = await prisma.address.findFirst({
      where: { userId: session.id, isDefault: true },
    }) ?? await prisma.address.findFirst({
      where: { userId: session.id },
      orderBy: { createdAt: 'asc' },
    });

    const genderCode: 'MALE' | 'FEMALE' | 'OTHER' =
      profile?.gender === 'MALE' ? 'MALE' :
      profile?.gender === 'FEMALE' ? 'FEMALE' :
      'OTHER';

    let ageLabel = '';
    if (profile?.dateOfBirth) {
      const diff = Date.now() - profile.dateOfBirth.getTime();
      const ageDate = new Date(diff);
      const years = Math.abs(ageDate.getUTCFullYear() - 1970);
      ageLabel = `${years} Yrs`;
    }

    const addressLine = address
      ? `${address.street}, ${address.city}, ${address.state}, ${address.country} ${address.postalCode}`
      : 'Not provided';

    const adviceList: string[] = [];
    if (prescriptionData.usageNotes) adviceList.push(String(prescriptionData.usageNotes));
    if (prescriptionData.contraindications) adviceList.push(String(prescriptionData.contraindications));
    if (prescriptionData.followUp) adviceList.push(String(prescriptionData.followUp));


    
    const medicinesForDoc = prescriptionData.prioritizedMedicines.map((m: any) => {
      // Very simple parsing; keep as-is to avoid over-complication
      return {
        type: m.quantityType || 'TAB',
        name: m.name || '',
        dosageTiming: m.dosage || 'As directed',
        instructions: m.instructions || 'Take only after pharmacist confirmation',
        durationDays: m.durationDays || 1,
        totalQuantity: Number(m.totalQuantity) || 1,
        quantityType: m.quantityType || 'TAB',
      } as AdvancedPrescriptionData['medicines'][number];
    });


   
    const now = new Date();
    const advData: AdvancedPrescriptionData = {
      doctor: {
        name: 'SuperKillo AI',
        designation: 'Virtual Prescription Assistant',
        mobile: '',
      },
      clinic: {
        logoText: 'SuperKillo',
      },
      patient: {
        id: user?.id ?? prescription.userId,
        name: user?.name ?? 'Customer',
        gender: genderCode,
        address: addressLine,
        phone: user?.phone ?? '',
        age: ageLabel || 'N/A',
        temp: profile?.bodyTemp || undefined,
        bp: profile?.bodyBp || undefined,
        adv: prescriptionData.title || (symptoms && symptoms.length ? symptoms.join(', ') : ''),
        allergies: prescriptionData.allergies,
      },
      details: {
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        adviceGiven: adviceList,
        diagnosis: prescriptionData.diagnosis,
        diagnosisFull: prescriptionData.diagnosisFull,
        followUpDays: prescriptionData.followUpDays,
        
      },
      medicines: medicinesForDoc,
    };

    // try {
    //   const html = generatePrescriptionHTML(advData);
    //   const htmlBase64 = Buffer.from(html).toString('base64');
    //   const uploadResult = await cloudinary.uploader.upload(`data:text/html;base64,${htmlBase64}`, {
    //     folder: 'prescriptions/ai',
    //     resource_type: 'raw',
    //     public_id: `prescription_${prescription.id}_${Date.now()}`,
    //   });
    //   htmlUrl = uploadResult.secure_url;
    // } catch (e) {
    //   // non-blocking
    //   console.error('Prescription HTML upload failed:', e);
    // }

    try {
      const pdfBuffer = await generatePrescriptionPdfBuffer(advData);

      const uploadResult = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {

            folder: 'prescriptions/ai',
        resource_type: 'raw',
        public_id: `prescription_${prescription.id}_${Date.now()}`,
            format: 'pdf',
          },
          (error, result) => {
            if (error || !result) {
              return reject(error);
            }
            resolve(result);
          }
        );

        stream.end(pdfBuffer);
      });

      pdfUrl = uploadResult.secure_url;
    } catch (e) {
      // non-blocking
      console.error('Prescription PDF upload failed:', e);
    }

    // Step 3: Find nearby pharmacies with prescribed medicines
    let nearbyPharmacies: Array<{
      id: string;
      name: string;
      distance: number;
      totalPrice: number;
      availabilityCount: number;
      totalMedicines: number;
      rating?: number;
      availableMedicines: Array<{
        name: string;
        price: number;
        stock: number;
        available: boolean;
      }>;
      unavailableMedicines: Array<{
        name: string;
        reason: string;
      }>;
    }> = [];
    let matchPlan: any | undefined = undefined;
    
    if (userLocation) {
      const medicineNames: string[] = Array.from(
        new Set((prescriptionData.prioritizedMedicines || []).map((m: any) => m.name).filter(Boolean))
      );

      matchPlan = await findMedicinesFromNearbyPharmacies(
        medicineNames,
        userLocation.latitude,
        userLocation.longitude,
        50
      );

      const pharmacyIds = Array.from(
        new Set([
          ...(matchPlan.singlePharmacyMatch ? [matchPlan.singlePharmacyMatch.pharmacyId] : []),
          ...matchPlan.multiPharmacyMatch.map((m: any) => m.pharmacyId),
        ])
      );

      const pharmacyMeta = pharmacyIds.length
        ? await prisma.pharmacy.findMany({
            where: { id: { in: pharmacyIds } },
            select: { id: true, rating: true, pharmacyName: true },
          })
        : [];
      const ratingMap = new Map(pharmacyMeta.map((p) => [p.id, { rating: p.rating, name: p.pharmacyName }]));

      const toEntry = (m: any) => {
        const totalPrice = m.medicines.reduce((sum: number, x: any) => sum + (x.price || 0), 0);
        return {
          id: m.pharmacyId,
          name: ratingMap.get(m.pharmacyId)?.name || m.pharmacyName,
          distance: Math.round((m.distance || 0) * 10) / 10,
          totalPrice: Math.round(totalPrice * 100) / 100,
          availabilityCount: m.medicines.length,
          totalMedicines: medicineNames.length,
          rating: ratingMap.get(m.pharmacyId)?.rating,
          availableMedicines: m.medicines.map((x: any) => ({
            id: x.pharmacyMedicineId,
            pharmacyMedicineId: x.pharmacyMedicineId,
            name: x.medicineName,
            price: x.price,
            stock: x.stock,
            available: x.isAvailable,
          })),
          unavailableMedicines: [],
        };
      };

      const entries: any[] = [];
      if (matchPlan.singlePharmacyMatch) {
        entries.push(toEntry(matchPlan.singlePharmacyMatch));
      }
      for (const m of matchPlan.multiPharmacyMatch) {
        entries.push(toEntry(m));
      }

      // Sort: closest first, then higher rating, then cheaper
      entries.sort((a, b) => {
        if (Math.abs(a.distance - b.distance) > 0.1) return a.distance - b.distance;
        const ra = a.rating ?? 0;
        const rb = b.rating ?? 0;
        if (rb !== ra) return rb - ra;
        return a.totalPrice - b.totalPrice;
      });

      nearbyPharmacies = entries.slice(0, 10);
    }

    const response: SuperPharmaShortlistResponse = {
      prescription: {
        id: prescription.id,
        title: prescriptionData.title,
        date: prescription.prescriptionDate?.toISOString() || new Date().toISOString(),
        pdfUrl: pdfUrl || htmlUrl,
        htmlUrl,
        prioritizedMedicines: prescriptionData.prioritizedMedicines,
        usageNotes: prescriptionData.usageNotes,
        contraindications: prescriptionData.contraindications,
        followUp: prescriptionData.followUp
      },
      nearbyPharmacies,
      match_plan: matchPlan,
      ai_autofill_report: autofillReport,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('SuperPharma shortlist error:', error);
    return NextResponse.json(
      { error: 'Failed to create SuperPharma shortlist' },
      { status: 500 }
    );
  }
}

// Haversine formula to calculate distance between two points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return distance;
}
