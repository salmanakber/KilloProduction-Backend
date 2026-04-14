import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

// GET /api/pharmacy/delivery-queue - Get delivery queue entries
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const pharmacyId = searchParams.get('pharmacyId');
    const courierId = searchParams.get('courierId');

    const whereClause: any = {};

    if (status) {
      whereClause.status = status;
    }

    if (pharmacyId) {
      whereClause.pharmacyId = pharmacyId;
    }

    if (courierId) {
      whereClause.courierBooking = {
        riderId: courierId
      };
    }

    const deliveryEntries = await prisma.deliveryQueue.findMany({
      where: whereClause,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true
              }
            }
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
        },
        courierBooking: {
          select: {
            id: true,
            bookingNumber: true,
            status: true,
            rider: {
              select: {
                id: true,
                name: true,
                phone: true
              }
            }
          }
        }
      },
      orderBy: {
        sequence: 'asc'
      }
    });

    return NextResponse.json({ deliveryEntries });
  } catch (error) {
    console.error('Error fetching delivery queue:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/pharmacy/delivery-queue - Create delivery queue entry
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      orderId,
      pharmacyId,
      pickupAddress,
      pickupLatitude,
      pickupLongitude,
      dropAddress,
      dropLatitude,
      dropLongitude,
      sequence,
      medicines,
      notes
    } = body;

    // Validate required fields
    if (!orderId || !pharmacyId || !pickupAddress || !dropAddress) {
      return NextResponse.json({ 
        error: 'Missing required fields: orderId, pharmacyId, pickupAddress, dropAddress' 
      }, { status: 400 });
    }

    const deliveryEntry = await prisma.deliveryQueue.create({
      data: {
        orderId,
        pharmacyId,
        pickupAddress,
        pickupLatitude: pickupLatitude || 0,
        pickupLongitude: pickupLongitude || 0,
        dropAddress,
        dropLatitude: dropLatitude || 0,
        dropLongitude: dropLongitude || 0,
        sequence: sequence || 1,
        medicines: medicines || [],
        notes: notes || null
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true
          }
        },
        pharmacy: {
          select: {
            id: true,
            pharmacyName: true,
            address: true,
            phone: true
          }
        }
      }
    });

    return NextResponse.json({ deliveryEntry });
  } catch (error) {
    console.error('Error creating delivery queue entry:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}