import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import type { Prisma } from "@prisma/client"

/**
 * Customer, assigned rider, or store vendor linked to the booking's order (parent or child row).
 */
async function canUserViewCourierBooking(params: {
  userId: string
  courierBooking: { customerId: string; riderId: string | null; orderId: string | null }
}): Promise<boolean> {
  const { userId, courierBooking: cb } = params
  if (cb.customerId === userId) return true
  if (cb.riderId && cb.riderId === userId) return true
  if (!cb.orderId) return false

  const vendorOrStoreOwner: Prisma.OrderWhereInput = {
    OR: [
      { vendorId: userId },
      { pharmacy: { userId } },
      { food: { userId } },
      { grocery: { userId } },
      { autoPart: { store: { userId } } },
    ],
  }

  const linkedToBooking = await prisma.order.findFirst({
    where: {
      AND: [
        {
          OR: [{ id: cb.orderId }, { childId: cb.orderId }],
        },
        {
          OR: [{ customerId: userId }, vendorOrStoreOwner],
        },
      ],
    },
    select: { id: true },
  })
  return !!linkedToBooking
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const bookingId = params.id

    // Get the courier booking with bids
    const courierBooking = await prisma.courierBooking.findUnique({
      where: { id: bookingId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatar: true,
          },
        },
        rider: {
          select: {
            id: true,
            name: true,
            phone: true,
            riderProfile: {
              select: {
                vehicleType: true,
                vehicleBrand: true,
                vehicleModel: true,
                vehicleColor: true,
                licensePlate: true,
                rating: true,
                totalRides: true,
                currentLocation: true,
              },
            },
          },
        },
        rideType: {
          select: {
            id: true,
            name: true,
            basePrice: true,
            pricePerKm: true,
            pricePerMinute: true,
            icon: true,
            description: true,
          },
        },
        bids: {
          include: {
            rider: {
              select: {
                id: true,
                name: true,
                phone: true,
                riderProfile: {
                  select: {
                    vehicleType: true,
                    vehicleBrand: true,
                    vehicleModel: true,
                    vehicleColor: true,
                    licensePlate: true,
                    rating: true,
                    totalRides: true,
                    currentLocation: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        trackingUpdates: {
          orderBy: { timestamp: "desc" },
          take: 10,
        },
      },
    })

    if (!courierBooking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }

    const allowed = await canUserViewCourierBooking({
      userId: user.id,
      courierBooking: {
        customerId: courierBooking.customerId,
        riderId: courierBooking.riderId,
        orderId: courierBooking.orderId,
      },
    })
    if (!allowed) {
      return NextResponse.json({ error: "Not authorized to view this booking" }, { status: 403 })
    }

    // Fetch order with vendor information if orderId exists
    let orderWithVendor: any = null
    if (courierBooking.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: courierBooking.orderId },
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              avatar: true,
            },
          },
          food: {
            select: {
              id: true,
              name: true,
              logo: true,
              coverImage: true,
            },
          },
          pharmacy: {
            select: {
              id: true,
              pharmacyName: true,
              logo: true,
            },
          },
          grocery: {
            select: {
              id: true,
              storeName: true,
              logo: true,
            },
          },
          autoPart: {
            include: {
              store: {
                select: {
                  id: true,
                  storeName: true,
                  logo: true,
                },
              },
            },
          },
        },
      })
      
      

      if (order) {
        // Build vendor info from order
        let vendorInfo: any = null
        
        if (order.vendorId) {
          vendorInfo = {
            id: order.vendorId,
            vendorId: order.vendorId,
            name: order.vendor?.name || 'Vendor',
            avatar: order.vendor?.avatar || null,
          }

          // Add module-specific vendor details
          if (order.module === 'FOOD' && order.food) {
            vendorInfo = {
              ...vendorInfo,
              id: order.food.id || order.vendorId,
              name: order.food.name || vendorInfo.name,
              avatar: order.food.logo || order.food.coverImage || vendorInfo.avatar,
              type: 'restaurant',
            }
          } else if (order.module === 'PHARMACY' && order.pharmacy) {
            vendorInfo = {
              ...vendorInfo,
              id: order.pharmacy.id || order.vendorId,
              name: order.pharmacy.pharmacyName || vendorInfo.name,
              avatar: order.pharmacy.logo || vendorInfo.avatar,
              type: 'pharmacy',
            }
          } else if (order.module === 'GROCERY' && order.grocery) {
            vendorInfo = {
              ...vendorInfo,
              id: order.grocery.id || order.vendorId,
              name: order.grocery.storeName || vendorInfo.name,
              avatar: order.grocery.logo || vendorInfo.avatar,
              type: 'grocery',
            }
          } else if (order.module === 'AUTO_PARTS' && order.autoPart?.store) {
            vendorInfo = {
              ...vendorInfo,
              id: order.autoPart.store.id || order.vendorId,
              name: order.autoPart.store.storeName || vendorInfo.name,
              avatar: order.autoPart.store.logo || vendorInfo.avatar,
              type: 'autoparts',
            }
          }
        }

        orderWithVendor = {
          ...order,
          vendor: vendorInfo,
        }
      }
    }
    return NextResponse.json({
      success: true,
      booking: {
        ...courierBooking,
        order: orderWithVendor,
        vendor: orderWithVendor?.vendor || null,
      },
    })
  } catch (error) {
    console.error("Error fetching courier booking:", error)
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to fetch booking",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}

