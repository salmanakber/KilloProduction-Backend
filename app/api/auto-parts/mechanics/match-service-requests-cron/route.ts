import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { NotificationBridge } from "@/lib/notification-bridge"

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Cron job endpoint to match new service requests with nearby mechanics
 * This should be called periodically (e.g., every 1-2 minutes)
 * 
 * How to schedule:
 * - Vercel Cron: Add to vercel.json
 * - External cron service: Call this endpoint periodically
 * - GitHub Actions: Schedule workflow to call this endpoint
 */
export async function GET(request: NextRequest) {
  try {
    // Optional: Add authorization header check for cron job security
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Find new PENDING service requests created in the last 5 minutes
    // This prevents processing very old requests
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const now = new Date()

    const newServiceRequests = await prisma.mechanicServiceRequest.findMany({
      where: {
        status: "PENDING",
        createdAt: {
          gte: fiveMinutesAgo,
        },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      include: {
        customer: {
          select: {
            name: true,
          },
        },
      },
    })

    console.log(`🔍 Found ${newServiceRequests.length} new service requests to match`)

    let totalMatches = 0
    let totalNotificationsSent = 0

    for (const serviceRequest of newServiceRequests) {
      // Skip if request already has a mechanic assigned
      if (serviceRequest.mechanicId) {
        continue
      }

      // Get customer location
      const customerLat = serviceRequest.customerLatitude
      const customerLon = serviceRequest.customerLongitude
      const customerCity = serviceRequest.customerCity

      if (!customerLat || !customerLon) {
        // Skip requests without location - they can't be matched
        console.log(`⏭️ Skipping service request ${serviceRequest.id} - no customer location`)
        continue
      }

      // Find all active mechanics with location data
      const mechanics = await prisma.mechanicProfile.findMany({
        where: {
          isActive: true,
          latitude: { not: null },
          longitude: { not: null },
          user: {
            role: "MECHANIC",
            isActive: true,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      const matchingMechanics: Array<{ mechanicId: string; distance: number }> = []

      // Calculate distance and filter mechanics within service radius
      for (const mechanicProfile of mechanics) {
        if (!mechanicProfile.latitude || !mechanicProfile.longitude) {
          continue
        }

        const distance = calculateDistance(
          customerLat,
          customerLon,
          mechanicProfile.latitude,
          mechanicProfile.longitude
        )

        // Check if mechanic is within their service radius (or default 50km)
        const serviceRadius = mechanicProfile.serviceRadius || 50
        if (distance <= serviceRadius) {
          matchingMechanics.push({
            mechanicId: mechanicProfile.userId, // Use User.id for notifications
            distance,
          })
        }
      }

      // Sort by distance (closest first)
      matchingMechanics.sort((a, b) => a.distance - b.distance)

      console.log(
        `📍 Service request ${serviceRequest.id}: Found ${matchingMechanics.length} nearby mechanics`
      )

      // For each matching mechanic, check if notification already exists
      const mechanicsToNotify: string[] = []

      for (const { mechanicId } of matchingMechanics) {
        // Check if notification already exists for this mechanic + service request
        const existingNotification = await prisma.mechanicNotification.findFirst({
          where: {
            mechanicId: mechanicId,
            serviceRequestId: serviceRequest.id,
            notificationType: "NEW_REQUEST",
          },
        })

        if (!existingNotification) {
          mechanicsToNotify.push(mechanicId)
        }
      }

      if (mechanicsToNotify.length === 0) {
        console.log(`⏭️ All mechanics already notified for service request ${serviceRequest.id}`)
        continue
      }

      // Get mechanic user details for notifications
      const mechanicUsers = await prisma.user.findMany({
        where: {
          id: { in: mechanicsToNotify },
        },
        select: {
          id: true,
        },
      })

      // Create MechanicNotification records
      const notifications = mechanicUsers.map((mechanic) => ({
        mechanicId: mechanic.id,
        serviceRequestId: serviceRequest.id,
        notificationType: "NEW_REQUEST",
        title: "New Service Request Nearby",
        message: `New service request for ${serviceRequest.vehicleMake} ${serviceRequest.vehicleModel}. ${serviceRequest.issueDescription.substring(0, 50)}...`,
        isRead: false,
      }))

      await prisma.mechanicNotification.createMany({
        data: notifications,
      })

      // Send push notifications via NotificationBridge
      await NotificationBridge.sendBulkNotifications(
        mechanicsToNotify,
        {
          title: "New Service Request Nearby",
          message: `New service request for ${serviceRequest.vehicleMake} ${serviceRequest.vehicleModel}`,
          type: "MECHANIC_SERVICE_REQUEST",
          module: "AUTO_PARTS",
          actionUrl: `/auto-parts/mechanics/service-requests/${serviceRequest.id}`,
          data: {
            actionType: "navigate",
            screen: "MechanicServiceRequestDetails",
            params: [
              {
                name: "requestId",
                value: serviceRequest.id,
              },
            ],
          },
        }
      )

      totalMatches++
      totalNotificationsSent += mechanicsToNotify.length

      console.log(
        `✅ Notified ${mechanicsToNotify.length} mechanics for service request ${serviceRequest.id}`
      )
    }

    return NextResponse.json({
      success: true,
      message: "Cron job completed successfully",
      stats: {
        serviceRequestsProcessed: newServiceRequests.length,
        requestsMatched: totalMatches,
        notificationsSent: totalNotificationsSent,
      },
    })
  } catch (error: any) {
    console.error("❌ Cron job error:", error)
    return NextResponse.json(
      {
        error: error.message || "Internal server error",
      },
      { status: 500 }
    )
  }
}