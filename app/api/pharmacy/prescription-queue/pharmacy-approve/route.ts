import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';
import { NotificationBridge } from '@/lib/notification-bridge';
import { AdvancedPrescriptionData, generatePrescriptionPdfBuffer } from '@/lib/prescription-pdf';
import { cloudinary } from '@/lib/cloudinary';

// PUT /api/pharmacy/prescription-queue/pharmacy-approve - Pharmacy approves prescription
export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queueId = searchParams.get('id');

    if (!queueId) {
      return NextResponse.json({ error: 'Queue ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const { pharmacyNotes, medicines, totalCost, prescriptionEdits } = body;

    // Check if user has permission to approve (pharmacy owner)
    const userProfile = await prisma.userProfile.findUnique({
      where: { userId: user.id },
      include: {
        user: {
          include: {
            pharmacy: true
          }
        }
      }
    });

    if (!userProfile?.user?.pharmacy) {
      return NextResponse.json({ error: 'Only pharmacy owners can approve prescriptions' }, { status: 403 });
    }

    const queueEntry = await prisma.prescriptionQueue.findUnique({
      where: { id: queueId },
      include: { pharmacy: true }
    });

    if (!queueEntry) {
      return NextResponse.json({ error: 'Queue entry not found' }, { status: 404 });
    }

    if (queueEntry.pharmacyId !== userProfile.user?.pharmacy.id) {
      return NextResponse.json({ error: 'Cannot approve prescriptions for other pharmacies' }, { status: 403 });
    }

    if (queueEntry.status !== 'PENDING_PHARMACY_REVIEW') {
      return NextResponse.json({ error: 'Prescription is not pending pharmacy review' }, { status: 400 });
    }

    // If pharmacy edited the medicines, also update prescriptionData to reflect the changes
    const finalMedicines = medicines || queueEntry.medicines;
    let updatedPrescriptionData = queueEntry.prescriptionData as any;
    if (updatedPrescriptionData && typeof updatedPrescriptionData === 'object') {
      if (medicines) {
        // Merge pharmacy-edited medicines into the prescription object
        updatedPrescriptionData = {
          ...updatedPrescriptionData,
          prioritizedMedicines: medicines.map((m: any) => ({
            name: m.medicineName ?? m.name ?? '',
            dosage: m.dosage ?? '',
            quantity: m.quantity ?? 1,
            price: m.price ?? 0,
            frequency: m.frequency ?? '',
            duration: m.duration ?? '',
            instructions: m.instructions ?? '',
            priority: m.priority ?? 'NORMAL',
            urgency: m.urgency ?? 'NORMAL',
          })),
        };
      }

      if (prescriptionEdits && typeof prescriptionEdits === 'object') {
        updatedPrescriptionData = {
          ...updatedPrescriptionData,
          ...(prescriptionEdits.title ? { title: prescriptionEdits.title } : {}),
          ...(prescriptionEdits.usageNotes ? { usageNotes: prescriptionEdits.usageNotes } : {}),
          ...(prescriptionEdits.contraindications ? { contraindications: prescriptionEdits.contraindications } : {}),
          ...(prescriptionEdits.followUp ? { followUp: prescriptionEdits.followUp } : {}),
        };
      }

      updatedPrescriptionData = {
        ...updatedPrescriptionData,
        pharmacyVerified: true,
        pharmacyNotes: pharmacyNotes || null,
        verifiedAt: new Date().toISOString(),
      };
    }

    // Regenerate prescription PDF (only) with pharmacy edits
    let newPdfUrl: string | undefined;
    try {
      // Load customer, profile & address for patient block
      const customer = await prisma.user.findUnique({
        where: { id: queueEntry.customerId },
        select: { id: true, name: true, phone: true },
      });
      const customerProfile = await prisma.userProfile.findUnique({
        where: { userId: queueEntry.customerId },
        select: { dateOfBirth: true, gender: true },
      });
      const customerAddress = await prisma.address.findFirst({
        where: { userId: queueEntry.customerId, isDefault: true },
      }) ?? await prisma.address.findFirst({
        where: { userId: queueEntry.customerId },
        orderBy: { createdAt: 'asc' },
      });

      const genderCode: 'M' | 'F' | 'O' =
        customerProfile?.gender === 'MALE' ? 'M' :
        customerProfile?.gender === 'FEMALE' ? 'F' :
        'O';

      let ageLabel = '';
      if (customerProfile?.dateOfBirth) {
        const diff = Date.now() - customerProfile.dateOfBirth.getTime();
        const ageDate = new Date(diff);
        const years = Math.abs(ageDate.getUTCFullYear() - 1970);
        ageLabel = `${years} Yrs`;
      }

      const addressLine = customerAddress
        ? `${customerAddress.street}, ${customerAddress.city}, ${customerAddress.state}, ${customerAddress.country} ${customerAddress.postalCode}`
        : 'Not provided';

      const adviceList: string[] = [];
      if (updatedPrescriptionData?.usageNotes) adviceList.push(String(updatedPrescriptionData.usageNotes));
      if (updatedPrescriptionData?.contraindications) adviceList.push(String(updatedPrescriptionData.contraindications));
      if (updatedPrescriptionData?.followUp) adviceList.push(String(updatedPrescriptionData.followUp));

      const medicinesForDoc = (updatedPrescriptionData?.prioritizedMedicines || []).map((m: any) => {
        return {
          type: 'TAB.',
          name: m.name || '',
          dosageTiming: m.dosage || '',
          instructions: m.instructions || '',
          durationDays: 0,
          totalQuantity: Number(m.quantity) || 0,
          quantityType: 'TAB',
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
          timingLabel: 'Available',
          timingValue: '24/7',
          closedOn: '-',
        },
        patient: {
          id: customer?.id ?? queueEntry.customerId,
          name: customer?.name ?? 'Customer',
          gender: genderCode,
          address: addressLine,
          phone: customer?.phone ?? '',
          age: ageLabel,
          adv: updatedPrescriptionData?.title || '',
        },
        details: {
          date: now.toLocaleDateString(),
          time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          adviceGiven: adviceList,
        },
        medicines: medicinesForDoc,
      };

      // Generate & upload PDF only using upload_stream to avoid very long data URLs
      try {
        const pdfBuffer = await generatePrescriptionPdfBuffer(advData);

        const uploadResult = await new Promise<any>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: 'prescriptions/ai',
              resource_type: 'raw',
              public_id: `prescription_verified_${queueId}_${Date.now()}_pdf`,
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

        newPdfUrl = uploadResult.secure_url;
      } catch (e) {
        console.error('Verified prescription PDF upload failed:', e);
      }
    
      // Merge new PDF URL into prescriptionData
      if (updatedPrescriptionData && newPdfUrl) {
        updatedPrescriptionData = {
          ...updatedPrescriptionData,
          pdfUrl: newPdfUrl,
        };
      }
    } catch (e) {
      console.error('Prescription document regeneration failed:', e);
    }

    const updatedQueue = await prisma.prescriptionQueue.update({
      where: { id: queueId },
      data: {
        status: 'PHARMACY_APPROVED',
        pharmacyNotes: pharmacyNotes || null,
        medicines: finalMedicines,
        prescriptionData: updatedPrescriptionData ?? queueEntry.prescriptionData,
        totalCost: totalCost || queueEntry.totalCost,
        pharmacyApprovedAt: new Date()
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true
          }
        },
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

    // Find the chat between customer and this pharmacy
    const chat = await prisma.pharmacyChat.findFirst({
      where: {
        userId:    queueEntry.customerId,
        pharmacyId: userProfile.user?.pharmacy.id,
      },
      select: { id: true }
    });

    // Use NotificationBridge for DB notification + real-time socket
    await NotificationBridge.notifyCustomerPrescriptionApproved({
      customerId: queueEntry.customerId,
      pharmacyId: userProfile.user?.pharmacy.id,
      pharmacyName: userProfile.user?.pharmacy.pharmacyName,
      chatId: chat?.id ?? '',
      queueId,
      totalCost: updatedQueue.totalCost ?? undefined,
      prescriptionData: updatedPrescriptionData,
      pharmacyNotes: pharmacyNotes,
    });

    return NextResponse.json({ queueEntry: updatedQueue });
  } catch (error) {
    console.error('Error approving prescription:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
