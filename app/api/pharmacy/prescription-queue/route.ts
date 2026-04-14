import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

// GET /api/pharmacy/prescription-queue - Get prescription queue entries
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const pharmacyId = searchParams.get('pharmacyId');
    const customerId = searchParams.get('customerId');

    const whereClause: any = {};

    // Default: only show the current user's queue entries (customer or pharmacy)
    // unless a specific customerId is provided
    if (customerId) {
      whereClause.customerId = customerId;
    } else {
      // Check if user is a pharmacy owner — show their pharmacy's queues
      const pharmacy = await prisma.pharmacy.findFirst({
        where: { userId: user.id },
        select: { id: true }
      });
      if (pharmacy) {
        whereClause.pharmacyId = pharmacy.id;
      } else {
        whereClause.customerId = user.id;
      }
    }

    if (status) {
      whereClause.status = status;
    }

    if (pharmacyId) {
      whereClause.pharmacyId = pharmacyId;
    }

    const queueEntries = await prisma.prescriptionQueue.findMany({
      where: whereClause,
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
        },
        prescription: {
          select: {
            id: true,
            images: true,
            prescriptionDate: true,
            notes: true
          }
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    

    return NextResponse.json({ queueEntries });
  } catch (error) {
    console.error('Error fetching prescription queue:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}