import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';
import { cloudinary } from '@/lib/cloudinary';
import { analyzeMedicalImage } from '@/lib/virtual-doctor/github-ai';

// POST /api/pharmacy/upload-prescription - Upload and analyze prescription
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    console.log(user);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const imageFile = formData.get('imageFile') as File;
    const imageType = formData.get('imageType') as string || 'prescription';

    console.log(formData);

    if (!imageFile) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
    }

    // Upload image to Cloudinary
    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const uploadResult = await cloudinary.uploader.upload(
      `data:${imageFile.type};base64,${imageBuffer.toString('base64')}`,
      {
        folder: 'prescriptions',
        resource_type: 'auto',
        transformation: [
          { quality: 'auto' },
          { fetch_format: 'auto' }
        ]
      }
    );

    // Create prescription record
    const prescription = await prisma.prescription.create({
      data: {
        userId: user.id,
        images: [uploadResult.secure_url],
        status: 'UPLOADED',
        urgency: 'MEDIUM'
      }
    });

    // Analyze image with AI
    let analysisResult;
    try {
      analysisResult = await analyzeMedicalImage(
        imageBuffer,
        imageType as 'prescription' | 'medicine_label' | 'medical_report' | 'symptom_photo' | 'general'
      );
    } catch (aiError) {
      console.error('AI analysis failed:', aiError);
      // Continue with basic processing even if AI fails
      analysisResult = {
        text: 'Prescription uploaded successfully. AI analysis is temporarily unavailable.',
        confidence: 0.5,
        source: 'Fallback',
        extractedData: {
          medicines: [],
          dosages: [],
          symptoms: [],
          conditions: [],
          instructions: []
        }
      };
    }

    // Find medicines in database
    const extractedMedicines = analysisResult.extractedData?.medicines || [];
    const foundMedicines = [];

    for (const medicineName of extractedMedicines) {
      const medicines = await prisma.centralMedicine.findMany({
        where: {
          OR: [
            { name: { contains: medicineName, mode: 'insensitive' } },
            { genericName: { contains: medicineName, mode: 'insensitive' } }
          ],
          isActive: true
        },
        include: {
          pharmacyMedicines: {
            where: {
              isAvailable: true,
              stock: { gt: 0 }
            },
            include: {
              pharmacy: {
                select: {
                  id: true,
                  pharmacyName: true,
                  address: true,
                  lon: true as any,
                  lat: true as any,
                  rating: true,
                  deliveryAvailable: true
                } as any
              }
            }
          }
        }
      });

      (foundMedicines as any).push(...(medicines as any));
    }

    // Group medicines by pharmacy
    const pharmacyMedicines = new Map();
    foundMedicines.forEach(medicine => {
      (medicine as any).pharmacyMedicines.forEach(pharmacyMedicine => {
        const pharmacyId = pharmacyMedicine.pharmacy.id;
        if (!pharmacyMedicines.has(pharmacyId)) {
          pharmacyMedicines.set(pharmacyId, {
            pharmacy: pharmacyMedicine.pharmacy,
            medicines: []
          });
        }
        pharmacyMedicines.get(pharmacyId).medicines.push({
          centralMedicine: medicine,
          pharmacyMedicine: pharmacyMedicine
        });
      });
    });

    // Create prescription queue entries for each pharmacy
    const prescriptionQueues = [];
    for (const [pharmacyId, data] of pharmacyMedicines as any) {
      const queueEntry = await (prisma as any).prescriptionQueue.create({
        data: {
          customerId: user.id,
          prescriptionId: prescription.id,
          pharmacyId: pharmacyId,
          status: 'PENDING_PHARMACY_REVIEW',
          medicines: (data.medicines as any).map((item: any) => ({
            medicineId: item.centralMedicine.id,
            medicineName: item.centralMedicine.name,
            genericName: item.centralMedicine.genericName,
            dosage: item.pharmacyMedicine.price,
            quantity: 1, // Default quantity
            price: item.pharmacyMedicine.price,
            stock: item.pharmacyMedicine.stock
          })),
          totalCost: data.medicines.reduce((sum, item) => sum + item.pharmacyMedicine.price, 0)
        },
        include: {
          pharmacy: {
            select: {
              id: true,
              pharmacyName: true,
              address: true,
              phone: true,
              rating: true
            }
          }
        }
      });

      (prescriptionQueues as any).push(queueEntry);

      // Create notification for pharmacy
      await prisma.notification.create({
        data: {
          userId: data.pharmacy.userId, // Pharmacy owner's user ID
          title: 'New Prescription to Review',
          message: `New prescription uploaded by customer. ${data.medicines.length} medicines to review.`,
          type: 'PRESCRIPTION_REVIEW' as any,
          module: 'PHARMACY',
          data: {
            prescriptionId: prescription.id,
            queueId: queueEntry.id,
            customerId: user.id,
            medicineCount: data.medicines.length
          }
        }
      });
    }

    // Create notification for customer
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: 'Prescription Uploaded Successfully',
        message: `Your prescription has been uploaded and sent to ${prescriptionQueues.length} pharmacies for review.`,
        type: 'PRESCRIPTION_UPLOAD' as any,
        module: 'PHARMACY',
        data: {
          prescriptionId: prescription.id,
          queueCount: prescriptionQueues.length,
          analysisResult: analysisResult
        }
      }
    });

    return NextResponse.json({
      prescription,
      analysisResult,
      prescriptionQueues,
      foundMedicines: Array.from(pharmacyMedicines.values()),
      message: 'Prescription uploaded and analyzed successfully'
    });

  } catch (error) {
    console.error('Error uploading prescription:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}