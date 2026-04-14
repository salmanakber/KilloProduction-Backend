import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { analyzePrescription } from '@/lib/virtual-doctor/prescription-analyzer';
import { cloudinary } from '@/lib/cloudinary';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const imageFile = formData.get('imageFile') as File | null;
    const textInput = formData.get('textInput') as string | null;
    const latitude = formData.get('latitude') ? parseFloat(formData.get('latitude') as string) : null;
    const longitude = formData.get('longitude') ? parseFloat(formData.get('longitude') as string) : null;

    if (!imageFile && !textInput) {
      return NextResponse.json({ error: 'Image or text input is required' }, { status: 400 });
    }

    let cloudinaryImageUrl: string | undefined;
    let imageBase64: string | undefined;

    // Step 1: Upload image to Cloudinary first
    if (imageFile) {
      try {
        console.log('📤 Uploading prescription image to Cloudinary...');
        const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
        const base64 = imageBuffer.toString('base64');

        const uploadResult = await cloudinary.uploader.upload(
          `data:${imageFile.type || 'image/jpeg'};base64,${base64}`,
          {
            folder: 'prescription_analysis',
            resource_type: 'image',
            transformation: [
              { quality: 'auto' },
              { fetch_format: 'auto' },
            ],
          }
        );

        cloudinaryImageUrl = uploadResult.secure_url;
        console.log('✅ Prescription image uploaded to Cloudinary:', cloudinaryImageUrl);
      } catch (uploadError) {
        console.error('❌ Cloudinary upload failed, falling back to base64:', uploadError);
        // Fallback to base64 if Cloudinary upload fails
        const arrayBuffer = await imageFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        imageBase64 = buffer.toString('base64');
      }
    }

    // Step 2: Analyze prescription using AI (IMAGE_TO_TEXT) with Cloudinary URL
    console.log('🧠 Analyzing prescription with AI...');
    const analysis = await analyzePrescription(
      undefined,
      imageBase64,
      textInput || undefined,
      latitude,
      longitude,
      cloudinaryImageUrl, // Pass Cloudinary URL
    );

    // Step 3: Track user activity
    try {
      await prisma.userActivity.create({
        data: {
          userId: user.id,
          activityType: 'PRESCRIPTION_UPLOAD',
          module: 'PHARMACY',
          metadata: {
            source: 'analyze-prescription',
            medicinesFound: analysis.medicines.length,
            matchedMedicines: analysis.matchedMedicines.length,
            hasPharmacyMatch: !!analysis.pharmacyMatch,
            imageUrl: cloudinaryImageUrl || null,
          },
        },
      });
    } catch (activityError) {
      console.error('Failed to track activity:', activityError);
    }

    // Step 4: Build VirtualDoctorResponse-compatible response
    // Transform matchedMedicines to recommended_medicines format
    const recommendedMedicines = analysis.matchedMedicines
      .filter(m => m.centralMedicineId) // Only include medicines that have DB matches
      .map(m => ({
        name: m.centralMedicineName || m.medicineName,
        genericName: m.genericName,
        dosage: m.dosageInfo || m.dosage || 'Consult pharmacist for dosage',
        fromDB: !!m.centralMedicineId,
        warnings: m.warnings || undefined,
        sideEffects: m.sideEffects || undefined,
        category: m.category,
        strength: m.strength,
        manufacturer: m.manufacturer,
        confidence: m.confidence,
        matchReason: m.matchReason,
        isExactMatch: m.isExactMatch,
        isAlternative: m.isAlternative,
        alternativeNote: m.alternativeNote,
        originalPrescribedName: m.medicineName,
        frequency: m.frequency,
        duration: m.duration,
        quantity: m.quantity,
        instructions: m.instructions,
      }));

    // Build notes about alternatives
    const alternativeNotes = analysis.matchedMedicines
      .filter(m => m.alternativeNote)
      .map(m => m.alternativeNote)
      .join('\n');

    const prescriptionNotes = [
      analysis.notes,
      analysis.recommendations,
      alternativeNotes ? `\n⚠️ Medicine Alternatives:\n${alternativeNotes}` : '',
    ].filter(Boolean).join('\n\n');

    // Build pharmacy match info for PharmacySelectionScreen
    const pharmacyMatchData = analysis.pharmacyMatch;
    let nearbyPharmacies: any[] = [];
    const totalPrescribedMedicines = analysis.medicines.length;

    // Helper: determine which medicines are NOT available at a pharmacy
    const allMedicineNames = analysis.medicines.map((m: any) => (m.medicineName || '').toLowerCase());
    
    const buildPharmacyEntry = (pharmacyData: any, pharmacyMedicines: any[], isSingle: boolean) => {
      const availableMedicines = pharmacyMedicines.map((m: any) => ({
        id: m.centralMedicineId,
        pharmacyMedicineId: m.pharmacyMedicineId,
        name: m.medicineName,
        genericName: m.genericName,
        price: m.price,
        stock: m.stock,
        available: m.isAvailable,
      }));
      
      const availableNames = new Set(pharmacyMedicines.map((m: any) => (m.medicineName || '').toLowerCase()));
      const unavailableMedicines = allMedicineNames
        .filter((name: string) => !availableNames.has(name))
        .map((name: string) => ({ name, reason: 'Not in stock' }));

      const totalPrice = availableMedicines.reduce((sum: number, m: any) => sum + (m.price || 0), 0);

      return {
        id: pharmacyData.pharmacyId || pharmacyData.id,
        name: pharmacyData.pharmacyName || pharmacyData.name,
        address: pharmacyData.pharmacyAddress || pharmacyData.address || '',
        lat: pharmacyData.pharmacyLat || pharmacyData.lat,
        lon: pharmacyData.pharmacyLon || pharmacyData.lon,
        distance: pharmacyData.distance || 0,
        availableMedicines,
        unavailableMedicines,
        totalPrice,
        availabilityCount: availableMedicines.length,
        totalMedicines: totalPrescribedMedicines,
        matchScore: isSingle ? 100 : Math.round((pharmacyMedicines.length / Math.max(totalPrescribedMedicines, 1)) * 100),
        allMedicinesAvailable: isSingle,
      };
    };

    if (pharmacyMatchData) {
      if (pharmacyMatchData.singlePharmacyMatch) {
        nearbyPharmacies = [buildPharmacyEntry(
          pharmacyMatchData.singlePharmacyMatch,
          pharmacyMatchData.singlePharmacyMatch.medicines,
          true,
        )];
      } else if (pharmacyMatchData.multiPharmacyMatch.length > 0) {
        nearbyPharmacies = pharmacyMatchData.multiPharmacyMatch.map((pm: any) =>
          buildPharmacyEntry(pm, pm.medicines, false)
        );
      }
    }

    // Return combined response
    return NextResponse.json({
      success: true,
      analysis: {
        ...analysis,
        // VirtualDoctorResponse-compatible fields
        diagnosis: [analysis.notes || 'Prescription Analysis'].filter(Boolean),
        recommended_medicines: recommendedMedicines,
        notes: { english: prescriptionNotes || 'Prescription analyzed successfully.' },
        disclaimer: { english: 'This analysis is AI-assisted. Please consult your pharmacist or doctor for medical advice.' },
        processing_info: {
          input_type: cloudinaryImageUrl ? 'image' : 'text',
          image_type: cloudinaryImageUrl ? 'prescription' : null,
          medicines_found: recommendedMedicines.length,
          ai_powered: true,
          ai_source: 'prescription_analysis',
          language: 'english',
        },
        // Keep original pharmacy match structure
        pharmacyMatch: analysis.pharmacyMatch,
        // Image URL
        imageUrl: cloudinaryImageUrl,
        // Enriched data for alternatives
        matchedMedicines: analysis.matchedMedicines,
      },
      // Pre-formatted for PharmacySelectionScreen
      nearbyPharmacies,
      message: analysis.pharmacyMatch?.allMedicinesFound
        ? 'All medicines found in nearby pharmacy'
        : nearbyPharmacies.length > 0
        ? `Medicines found in ${nearbyPharmacies.length} pharmacies`
        : 'Please contact a pharmacy to check medicine availability',
    });
  } catch (error: any) {
    console.error('Error analyzing prescription:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze prescription' },
      { status: 500 }
    );
  }
}
