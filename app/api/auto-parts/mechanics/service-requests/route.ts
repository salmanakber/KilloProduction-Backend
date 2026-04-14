import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"
import { calculateRating } from "@/lib/calculateRating"

/** Shared include for list + single-id GET (keeps detail payloads consistent). */
const serviceRequestListInclude = {
  customer: {
    select: {
      name: true,
      phone: true,
      email: true,
    },
  },
  mechanic: {
    select: {
      id: true,
      userId: true,
      businessName: true,
      logo: true,
      rating: true,
      totalReviews: true,
      reviews: true,
    },
  },
  offers: {
    include: {
      mechanic: {
        select: {
          name: true,
          mechanicProfile: {
            select: {
              businessName: true,
              logo: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" as const },
  },
  _count: {
    select: {
      offers: true,
    },
  },
} as const

async function attachOrderDataForPickDelivery(requests: any[]) {
  for (const req of requests) {
    const reqType = (req as any).type
    if (reqType === "PICK_DELIVREY_AND_SERVICE") {
      const metadata = (req as any).metadata as any
      if (metadata?.orderId) {
        try {
          const order = await prisma.order.findUnique({
            where: { id: metadata.orderId },
            include: {
              vendor: {
                include: {
                  vendorProfile: {
                    select: {
                      businessName: true,
                      address: true,
                      city: true,
                      state: true,
                      latitude: true,
                      longitude: true,
                    },
                  },
                },
              },
              orderItems: {
                select: {
                  productName: true,
                  quantity: true,
                },
              },
            },
          })
          if (order) {
            const orderMetadata = (order as any).metadata as any
            ;(req as any).orderData = {
              id: order.id,
              orderNumber: order.orderNumber,
              vendor: order.vendor,
              orderItems: order.orderItems,
              handoverCode: orderMetadata?.handoverCode,
            }
          }
        } catch (error) {
          console.error("Error fetching order for service request:", error)
        }
      }
    }
  }
}

function mapRequestsWithMechanicRating(requests: any[]) {
  return requests.map((r) => ({
    ...r,
    mechanic: {
      ...r.mechanic,
      rating:
        r.mechanic?.rating ??
        ((r.mechanic?.reviews?.length && r.mechanic?.totalReviews && r.mechanic?.totalReviews > 0
          ? calculateRating(r.mechanic?.reviews.map((review: { rating: number }) => review.rating) || []).roundedRating
          : 0) as number),
    },
  }))
}

/** Mechanic access: assigned profile, invited (NEW_REQUEST), or owning MechanicQuote linked to this SR (handles mechanicId null on legacy rows). */
async function mechanicCanAccessServiceRequest(
  userId: string,
  mechanicProfileId: string,
  sr: { id: string; mechanicId: string | null }
): Promise<boolean> {
  if (sr.mechanicId != null && sr.mechanicId === mechanicProfileId) {
    return true
  }
  const invited = await prisma.mechanicNotification.findFirst({
    where: {
      mechanicId: userId,
      serviceRequestId: sr.id,
      notificationType: "NEW_REQUEST",
    },
  })
  if (invited) return true
  const ownsQuote = await prisma.mechanicQuote.findFirst({
    where: {
      serviceRequestId: sr.id,
      mechanicId: userId,
    },
    select: { id: true },
  })
  return !!ownsQuote
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const serviceRequestIdParam = searchParams.get("serviceRequestId")
    const role = user.role

    let mechanicProfile: { id: string } | null = null

    if (role === "MECHANIC") {
      mechanicProfile = await prisma.mechanicProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      })

      if (!mechanicProfile) {
        return NextResponse.json({
          error: "Mechanic profile not found",
          requests: [],
        })
      }
    }

    // Direct fetch by id (detail screens): same auth as list, but avoids missing the row when
    // the assigned job is not yet present in a merged list response.
    if (serviceRequestIdParam) {
      const sr = await prisma.mechanicServiceRequest.findUnique({
        where: { id: serviceRequestIdParam },
        include: serviceRequestListInclude as any,
      })
      if (!sr) {
        return NextResponse.json({ requests: [] })
      }

      if (role === "CUSTOMER" && sr.customerId !== user.id) {
        return NextResponse.json({ requests: [] })
      }

      if (role === "MECHANIC" && mechanicProfile) {
        const allowed = await mechanicCanAccessServiceRequest(user.id, mechanicProfile.id, sr)
        if (!allowed) {
          return NextResponse.json({ requests: [] })
        }
      }

      if (status && sr.status !== status) {
        return NextResponse.json({ requests: [] })
      }

      await attachOrderDataForPickDelivery([sr])
      return NextResponse.json({ requests: mapRequestsWithMechanicRating([sr]) })
    }

    const where: any = {}

    if (role === "CUSTOMER") {
      where.customerId = user.id
    } else if (role === "MECHANIC" && mechanicProfile) {
      where.mechanicId = mechanicProfile.id
    }

    if (status) {
      where.status = status
    }

    let requests = await prisma.mechanicServiceRequest.findMany({
      where,
      include: serviceRequestListInclude as any,
      orderBy: { createdAt: "desc" },
    })

    // If mechanic, merge invited NEW_REQUEST rows + jobs linked via MechanicQuote (e.g. quote accept with legacy mechanicId null)
    if (role === "MECHANIC" && mechanicProfile) {
      const requestMap = new Map<string, any>(requests.map((r) => [r.id, r]))

      const invitedRequests = await prisma.mechanicNotification.findMany({
        where: {
          mechanicId: user.id,
          notificationType: "NEW_REQUEST",
        },
        include: {
          serviceRequest: {
            include: {
              customer: {
                select: {
                  name: true,
                  phone: true,
                  email: true,
                },
              },
              mechanic: {
                select: {
                  id: true,
                  userId: true,
                  businessName: true,
                  logo: true,
                  rating: true,
                },
              },
              offers: {
                include: {
                  mechanic: {
                    select: {
                      name: true,
                      mechanicProfile: {
                        select: {
                          businessName: true,
                          logo: true,
                        },
                      },
                    },
                  },
                },
                orderBy: { createdAt: "desc" },
              },
              _count: {
                select: {
                  offers: true,
                },
              },
            },
          },
        },
      })

      const invitedServiceRequests = invitedRequests
        .map((n) => n.serviceRequest)
        .filter((sr) => sr && (!sr.mechanicId || sr.mechanicId !== mechanicProfile.id))

      invitedServiceRequests.forEach((r) => {
        if (r && !requestMap.has(r.id)) {
          requestMap.set(r.id, r)
        }
      })

      const quoteLinks = await prisma.mechanicQuote.findMany({
        where: {
          mechanicId: user.id,
          serviceRequestId: { not: null },
        },
        select: { serviceRequestId: true },
      })
      const needQuoteSrIds = quoteLinks
        .map((q) => q.serviceRequestId!)
        .filter((id) => id && !requestMap.has(id))

      if (needQuoteSrIds.length > 0) {
        const fromQuotes = await prisma.mechanicServiceRequest.findMany({
          where: { id: { in: needQuoteSrIds } },
          include: serviceRequestListInclude as any,
        })
        fromQuotes.forEach((r) => requestMap.set(r.id, r))
      }

      requests = Array.from(requestMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    }

    await attachOrderDataForPickDelivery(requests)

    return NextResponse.json({ requests: mapRequestsWithMechanicRating(requests) })
  } catch (error) {
    console.error("Service requests fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch service requests" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()

    // Validate required fields
    if (!data.vehicleMake || !data.vehicleModel || !data.issueDescription) {
      return NextResponse.json(
        { error: "vehicleMake, vehicleModel, and issueDescription are required" },
        { status: 400 }
      )
    }

    // Create service request
    // NOTE: This endpoint is for pure mechanic service quotes (ONLY_SERVICE type)
    // Part request flows use a different endpoint that sets type: PICK_DELIVREY_AND_SERVICE
    const serviceRequest = await prisma.mechanicServiceRequest.create({
      data: {
        customerId: user.id,
        mechanicId: data.mechanicId || null, // Can be assigned directly for direct hire
        vehicleMake: data.vehicleMake,
        vehicleModel: data.vehicleModel,
        vehicleYear: data.vehicleYear || null,
        vehicleVariant: data.vehicleVariant || null,
        mileage: data.mileage ? parseInt(data.mileage) : null,
        issueDescription: data.issueDescription,
        diagnosedIssues: data.diagnosedIssues || {},
        recommendedParts: data.recommendedParts || [],
        recommendedMechanicTypes: data.recommendedMechanicTypes || [],
        carHealthScore: data.carHealthScore || null,
        images: data.images || null,
        customerLatitude: data.customerLatitude ? parseFloat(data.customerLatitude) : null,
        customerLongitude: data.customerLongitude ? parseFloat(data.customerLongitude) : null,
        customerAddress: data.customerAddress || null,
        customerCity: data.customerCity || null,
        // @ts-ignore - type field exists in schema but Prisma client types may need regeneration
        type: "ONLY_SERVICE", // Explicitly set to ONLY_SERVICE for pure mechanic service quotes (not part requests)
        urgency: data.urgency || "MEDIUM",
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days default
        status: "PENDING",
      },
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
    })

    // If mechanic IDs are provided, send notifications to specific mechanics
    if (data.mechanicIds && Array.isArray(data.mechanicIds) && data.mechanicIds.length > 0) {
      const mechanics = await prisma.user.findMany({
        where: {
          id: { in: data.mechanicIds },
          role: 'MECHANIC',
        },
        include: {
          mechanicProfile: {
            select: {
              businessName: true,
            },
          },
        },
      })

      // Create notifications for selected mechanics
      const notifications = mechanics.map((mechanic) => ({
        mechanicId: mechanic.id,
        serviceRequestId: serviceRequest.id,
        notificationType: "NEW_REQUEST",
        title: "New Service Request",
        message: `Customer needs help with ${data.vehicleMake} ${data.vehicleModel}. ${data.issueDescription.substring(0, 50)}...`,
        isRead: false,
      }))

      await prisma.mechanicNotification.createMany({
        data: notifications,
      })

      // Send push notifications via NotificationBridge
      await NotificationBridge.sendBulkNotifications(
        mechanics.map(m => m.id),
        {
          title: "New Service Request",
          message: `New service request for ${data.vehicleMake} ${data.vehicleModel}`,
          type: "MECHANIC_SERVICE_REQUEST",
          module: "AUTO_PARTS",
          actionUrl: `/auto-parts/mechanics/service-requests/${serviceRequest.id}`,
          data: {
            actionType: "navigate",
            screen: 'MechanicServiceRequestDetails',
            params: [
              {
                name: 'requestId',
                value: serviceRequest.id,
              },
            ],
          },
        }
      )

      
    }
    console.log(`✅ Notified mechanics for service request ${serviceRequest.id } with mechanicIds ${serviceRequest}`)

    return NextResponse.json(serviceRequest, { status: 201 })
  } catch (error) {
    console.error("Service request creation error:", error)
    return NextResponse.json({ error: "Failed to create service request" }, { status: 500 })
  }
}


