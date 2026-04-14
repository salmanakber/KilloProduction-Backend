import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

// PUT /api/pharmacy/delivery-queue/assign-courier - Assign courier to delivery
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
    const { courierBookingId } = body;

    if (!courierBookingId) {
      return NextResponse.json({ error: 'Courier booking ID is required' }, { status: 400 });
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

    if (deliveryEntry.status !== 'PENDING') {
      return NextResponse.json({ error: 'Delivery is not pending assignment' }, { status: 400 });
    }

    const updatedDelivery = await prisma.deliveryQueue.update({
      where: { id: deliveryId },
      data: {
        courierBookingId: courierBookingId,
        status: 'ASSIGNED'
      },
      include: {
        courierBooking: {
          select: {
            id: true,
            bookingNumber: true,
            rider: {
              select: {
                id: true,
                name: true,
                phone: true
              }
            }
          }
        }
      }
    });

    // Create notification for customer
    await prisma.notification.create({
      data: {
        userId: deliveryEntry.order.customerId,
        title: 'Courier Assigned',
        message: `A courier has been assigned to your order #${deliveryEntry.order.orderNumber}. You will be notified when pickup begins.`,
        type: 'DELIVERY_UPDATE',
        module: 'PHARMACY',
        data: {
          deliveryId: deliveryId,
          orderNumber: deliveryEntry.order.orderNumber,
          courierBookingId: courierBookingId
        }
      }
    });

    return NextResponse.json({ deliveryEntry: updatedDelivery });
  } catch (error) {
    console.error('Error assigning courier:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
