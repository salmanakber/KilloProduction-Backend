import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const admin = await authenticateRequest();
    if (!admin?.id  ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search');
    const role = searchParams.get('role');
    const status = searchParams.get('status');
    const module = searchParams.get('module');
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (role && role !== 'ALL') {
      where.role = role;
    }

    if (status === 'ACTIVE') {
      where.isActive = true;
    } else if (status === 'INACTIVE') {
      where.isActive = false;
    }

    // Get users with related data
    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          userProfile: true,
          autoPartsStore: true,
          pharmacy: true,
          restaurant: true,
          groceryStore: true,
          riderProfile: true,
          _count: {
            select: {
              customerOrders: true,
              vendorOrders: true,
              riderDeliveries: true
            }
          }
        }
      }),
      prisma.user.count({ where })
    ]);

    // Get additional statistics for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        let moduleSpecific = {};

        // Get module-specific data
        if (user.role === 'VENDOR') {
          const [totalRevenue, totalCommission, rating] = await Promise.all([
            prisma.order.aggregate({
              where: {
                vendorId: user.id,
                status: 'DELIVERED'
              },
              _sum: { total: true }
            }),
            prisma.vendorCommission.aggregate({
              where: {
                vendorId: user.id,
                status: 'PAID'
              },
              _sum: { commissionAmount: true }
            }),
            prisma.review.aggregate({
              where: {
                targetId: user.id,
                targetType: 'VENDOR'
              },
              _avg: { rating: true }
            })
          ]);

          moduleSpecific = {
            totalRevenue: totalRevenue._sum.total || 0,
            totalCommission: totalCommission._sum.commissionAmount || 0,
            rating: rating._avg.rating || 0,
            businessName: user.autoPartsStore?.storeName || 
                         user.pharmacy?.pharmacyName || 
                         user.restaurant?.name || 
                         user.groceryStore?.storeName
          };
        } else if (user.role === 'RIDER') {
          const [totalEarnings, completionRate] = await Promise.all([
            prisma.riderEarning.aggregate({
              where: {
                riderId: user.id,
                status: 'PAID'
              },
              _sum: { netAmount: true }
            }),
            prisma.rideBooking.aggregate({
              where: {
                riderId: user.id
              },
              _avg: { 
                // Calculate completion rate
              }
            })
          ]);

          moduleSpecific = {
            totalEarnings: totalEarnings._sum.netAmount || 0,
            completionRate: user.riderProfile?.completionRate || 0,
            isOnline: user.riderProfile?.isOnline || false,
            vehicleType: user.riderProfile?.vehicleType
          };
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isActive: user.isActive,
          isVerified: user.isVerified,
          avatar: user.avatar,
          createdAt: user.createdAt,
          lastLoginAt: user.userProfile?.createdAt, // You might want to add lastLoginAt to User model
          orderCounts: {
            customer: user._count.customerOrders,
            vendor: user._count.vendorOrders,
            rider: user._count.riderDeliveries
          },
          ...moduleSpecific
        };
      })
    );

    // Log admin action
    await prisma.auditLog.create({
      data: {
        performedBy: admin.id,
        action: 'VIEW_USERS',
        entityType: 'User',
        entityId: admin.id,
        details: { 
          filters: { search, role, status, module },
          page, limit
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        users: usersWithStats,
        pagination: {
          page,
          limit,
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await authenticateRequest();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, action, data } = await request.json();

    if (!userId || !action) {
      return NextResponse.json(
        { error: 'User ID and action are required' },
        { status: 400 }
      );
    }

    let updateData: any = {};
    let auditAction = '';

    switch (action) {
      case 'ACTIVATE':
        updateData = { isActive: true };
        auditAction = 'ACTIVATE_USER';
        break;
      case 'DEACTIVATE':
        updateData = { isActive: false };
        auditAction = 'DEACTIVATE_USER';
        break;
      case 'VERIFY':
        updateData = { isVerified: true };
        auditAction = 'VERIFY_USER';
        break;
      case 'UNVERIFY':
        updateData = { isVerified: false };
        auditAction = 'UNVERIFY_USER';
        break;
      case 'UPDATE_PROFILE':
        updateData = data;
        auditAction = 'UPDATE_USER_PROFILE';
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: {
        userProfile: true
      }
    });

    // Log admin action
    await prisma.auditLog.create({
      data: {
        performedBy: admin.id,
        action: auditAction,
        entityType: 'User',
        entityId: userId,
        details: { changes: updateData }
      }
    });

    // Send notification to user if needed
    if (action === 'VERIFY' || action === 'ACTIVATE') {
      await prisma.notification.create({
        data: {
          userId: userId,
          title: action === 'VERIFY' ? 'Account Verified' : 'Account Activated',
          message: action === 'VERIFY' 
            ? 'Your account has been verified by our team.'
            : 'Your account has been activated.',
          type: 'SYSTEM'
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: `User ${action.toLowerCase()}d successfully`,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        isActive: updatedUser.isActive,
        isVerified: updatedUser.isVerified
      }
    });

  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
