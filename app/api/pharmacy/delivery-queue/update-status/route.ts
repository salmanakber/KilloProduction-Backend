import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

// PUT /api/pharmacy/delivery-queue/update-status - Update delivery status
export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const deliveryId = searchParams.get('id');

    if (!deliveryId) {
      return NextResponse.json({ error: 'Delivery ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const { status, notes, actualTime } = body;

    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    const deliveryEntry = await prisma.deliveryQueue.findUnique({
      where: { id: deliveryId },
      include: {
        order: {
          select: {
            customerId: true,
            orderNumber: true
          }
        },
        pharmacy: {
          select: {
            pharmacyName: true
          }
        }
      }
    });

    if (!deliveryEntry) {
      return NextResponse.json({ error: 'Delivery entry not found' }, { status: 404 });
    }

    const updateData: any = {
      status: status,
      notes: notes || deliveryEntry.notes
    };

    if (status === 'PICKED_UP') {
      updateData.pickedUpAt = new Date();
    } else if (status === 'DELIVERED') {
      updateData.deliveredAt = new Date();
    }

    if (actualTime) {
      updateData.actualTime = actualTime;
    }

    const updatedDelivery = await prisma.deliveryQueue.update({
      where: { id: deliveryId },
      data: updateData
    });

    // Create notification for customer based on status
    let notificationTitle = '';
    let notificationMessage = '';

    switch (status) {
      case 'PICKED_UP':
        notificationTitle = 'Order Picked Up';
        notificationMessage = `Your order #${deliveryEntry.order.orderNumber} has been picked up from ${deliveryEntry.pharmacy.pharmacyName} and is on its way.`;
        break;
      case 'IN_TRANSIT':
        notificationTitle = 'Order In Transit';
        notificationMessage = `Your order #${deliveryEntry.order.orderNumber} is currently being delivered.`;
        break;
      case 'DELIVERED':
        notificationTitle = 'Order Delivered';
        notificationMessage = `Your order #${deliveryEntry.order.orderNumber} has been delivered successfully.`;
        break;
      case 'FAILED':
        notificationTitle = 'Delivery Failed';
        notificationMessage = `There was an issue delivering your order #${deliveryEntry.order.orderNumber}. Please contact support.`;
        break;
    }

    if (notificationTitle) {
      await prisma.notification.create({
        data: {
          userId: deliveryEntry.order.customerId,
          title: notificationTitle,
          message: notificationMessage,
          type: 'DELIVERY_UPDATE',
          module: 'PHARMACY',
          data: {
            deliveryId: deliveryId,
            orderNumber: deliveryEntry.order.orderNumber,
            status: status
          }
        }
      });
    }

    return NextResponse.json({ deliveryEntry: updatedDelivery });
  } catch (error) {
    console.error('Error updating delivery status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
