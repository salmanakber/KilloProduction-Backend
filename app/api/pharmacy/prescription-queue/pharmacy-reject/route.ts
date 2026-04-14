import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

// PUT /api/pharmacy/prescription-queue/pharmacy-reject - Pharmacy rejects prescription
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
    const { rejectionReason } = body;

    if (!rejectionReason) {
      return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 });
    }

    // Check if user has permission to reject (pharmacy owner)
    const userProfile = await prisma.userProfile.findUnique({
      where: { userId: user.id },
      include: { pharmacy: true }
    });

    if (!userProfile?.pharmacy) {
      return NextResponse.json({ error: 'Only pharmacy owners can reject prescriptions' }, { status: 403 });
    }

    const queueEntry = await prisma.prescriptionQueue.findUnique({
      where: { id: queueId }
    });

    if (!queueEntry) {
      return NextResponse.json({ error: 'Queue entry not found' }, { status: 404 });
    }

    if (queueEntry.pharmacyId !== userProfile.pharmacy.id) {
      return NextResponse.json({ error: 'Cannot reject prescriptions for other pharmacies' }, { status: 403 });
    }

    if (queueEntry.status !== 'PENDING_PHARMACY_REVIEW') {
      return NextResponse.json({ error: 'Prescription is not pending pharmacy review' }, { status: 400 });
    }

    const updatedQueue = await prisma.prescriptionQueue.update({
      where: { id: queueId },
      data: {
        status: 'PHARMACY_REJECTED',
        rejectionReason: rejectionReason,
        rejectedAt: new Date()
      }
    });

    // Create notification for customer
    await prisma.notification.create({
      data: {
        userId: queueEntry.customerId,
        title: 'Prescription Rejected by Pharmacy',
        message: `Your prescription was rejected by ${userProfile.pharmacy.pharmacyName}. Reason: ${rejectionReason}`,
        type: 'PRESCRIPTION_REJECTED',
        module: 'PHARMACY',
        data: {
          queueId: queueId,
          pharmacyId: userProfile.pharmacy.id,
          pharmacyName: userProfile.pharmacy.pharmacyName,
          rejectionReason: rejectionReason
        }
      }
    });

    return NextResponse.json({ queueEntry: updatedQueue });
  } catch (error) {
    console.error('Error rejecting prescription:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
