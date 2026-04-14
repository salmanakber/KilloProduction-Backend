import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

// PUT /api/pharmacy/prescription-queue/customer-approve
// Customer confirms the pharmacist-approved prescription and sends items to the PHARMACY cart
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

    const body = await request.json().catch(() => ({}));
    const { customerNotes } = body ?? {};

    const queueEntry = await prisma.prescriptionQueue.findUnique({
      where: { id: queueId },
      include: {
        pharmacy: {
          select: {
            id: true,
            pharmacyName: true,
          }
        }
      }
    });

    if (!queueEntry) {
      return NextResponse.json({ error: 'Queue entry not found' }, { status: 404 });
    }

    if (queueEntry.customerId !== user.id) {
      return NextResponse.json({ error: 'Cannot approve prescriptions for other customers' }, { status: 403 });
    }

    if (queueEntry.status !== 'PHARMACY_APPROVED') {
      return NextResponse.json({ error: 'Prescription must be approved by pharmacy first' }, { status: 400 });
    }

    // Mark as customer-approved (queue will be completed once cart checkout is done)
    const updatedQueue = await prisma.prescriptionQueue.update({
      where: { id: queueId },
      data: {
        status: 'CUSTOMER_APPROVED',
        customerNotes: customerNotes ?? null,
        customerApprovedAt: new Date()
      }
    });

    // Find or create an active PHARMACY cart for this customer + pharmacy
    let cart = await prisma.cart.findFirst({
      where: {
        userId: user.id,
        module: 'PHARMACY',
        vendorId: queueEntry.pharmacyId,
        isActive: true,
      }
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: {
          userId: user.id,
          module: 'PHARMACY',
          vendorId: queueEntry.pharmacyId,
        }
      });
    }

    const medicines = Array.isArray(queueEntry.medicines) ? queueEntry.medicines : [];
    const prescriptionMeta = queueEntry.prescriptionData as any | null;
    const pdfUrl = prescriptionMeta?.pdfUrl ?? null;
    const htmlUrl = prescriptionMeta?.htmlUrl ?? null;

    // Add each medicine to the cart with prescription metadata in customizations
    for (const med of medicines as any[]) {
      if (!med) continue;
      const unitPrice  = Number(med.price)    || 0;
      const qty        = Number(med.quantity) || 1;

      await prisma.cartItem.create({
        data: {
          cartId:      cart.id,
          productId:   med.medicineId   ?? med.id   ?? 'unknown',
          productType: 'MEDICINE',
          quantity:    qty,
          price:       unitPrice,
          notes:       med.medicineName ?? med.name ?? 'Medicine',
          customizations: {
            source: 'AI_PRESCRIPTION',
            queueId,
            pharmacyId: queueEntry.pharmacyId,
            pharmacyName: queueEntry.pharmacy?.pharmacyName ?? null,
            prescriptionPdfUrl: pdfUrl,
            prescriptionHtmlUrl: htmlUrl,
            pharmacyNotes: queueEntry.pharmacyNotes ?? null,
            customerNotes: customerNotes ?? null,
          },
        }
      });
    }

    return NextResponse.json({
      queueEntry: updatedQueue,
      cartId: cart.id,
      itemsAdded: medicines.length,
      message: 'Medicines added to your cart successfully.'
    });
  } catch (error) {
    console.error('Error approving prescription (customer):', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
