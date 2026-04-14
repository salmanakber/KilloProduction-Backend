import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch user with all store profiles to get store IDs
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        autoPartsStore: true,
        pharmacy: true,
        restaurant: true,
        groceryStore: true,
        riderProfile: true,
      },
    })

    if (!fullUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Collect all entity IDs based on user's stores
    const entityIds: string[] = []
    const entityTypes: string[] = []

    if (fullUser.autoPartsStore) {
      entityIds.push(fullUser.autoPartsStore.id)
      entityTypes.push("AUTO_PARTS")
    }
    if (fullUser.pharmacy) {
      entityIds.push(fullUser.pharmacy.id)
      entityTypes.push("PHARMACY")
    }
    if (fullUser.restaurant) {
      entityIds.push(fullUser.restaurant.id)
      entityTypes.push("FOOD")
    }
    if (fullUser.groceryStore) {
      entityIds.push(fullUser.groceryStore.id)
      entityTypes.push("GROCERY")
    }
    // For riders, entityId is the user.id
    if (fullUser.riderProfile) {
      entityIds.push(fullUser.id)
      entityTypes.push("RIDER")
    }

    // Fetch all KYC rejections for this user's stores
    // Build OR conditions for each entityId-entityType pair
    const orConditions = entityIds.map((entityId, index) => ({
      AND: [
        { entityId },
        { entityType: entityTypes[index] },
      ],
    }))

    // Only fetch unresolved rejections
    const rejections = entityIds.length > 0 ? await prisma.kycRejection.findMany({
      where: {
        OR: orConditions,
        isResolved: false, // Only get unresolved rejections
      },
      include: {
        rejectedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { rejectedAt: "desc" },
    }) : []

    // Format rejections
    const formattedRejections = rejections.map((r) => ({
      id: r.id,
      rejectionReason: r.rejectionReason,
      rejectedFields: r.rejectedFields,
      rejectedBy: r.rejectedByUser?.name || "Unknown Admin",
      rejectedAt: r.rejectedAt.toISOString(),
      isResolved: r.isResolved,
      entityType: r.entityType,
      entityId: r.entityId,
    }))

    // Get user's store information for display
    const storeInfo = {
      vendorName: fullUser.name || "Unknown",
      status: fullUser.status,
      submittedDate: fullUser.createdAt.toISOString(),
      submittedInfo: {
        businessName: fullUser.autoPartsStore?.storeName || 
                     fullUser.pharmacy?.pharmacyName || 
                     fullUser.restaurant?.name || 
                     fullUser.groceryStore?.storeName || 
                     fullUser.name || "Unknown",
        registrationNumber: fullUser.autoPartsStore?.taxId || 
                           fullUser.pharmacy?.licenseNumber || 
                           fullUser.restaurant?.businessRegistration || 
                           fullUser.groceryStore?.businessRegistration || 
                           "N/A",
        address: fullUser.autoPartsStore?.address || 
                fullUser.pharmacy?.address || 
                fullUser.restaurant?.address || 
                fullUser.groceryStore?.address || 
                "N/A",
        contactEmail: fullUser.email || "N/A",
        contactPhone: fullUser.phone || "N/A",
      },
      // Include full store data for editing
      currentStoreData: {
        autoPartsStore: fullUser.autoPartsStore,
        pharmacy: fullUser.pharmacy,
        restaurant: fullUser.restaurant,
        groceryStore: fullUser.groceryStore,
        riderProfile: fullUser.riderProfile,
      },
    }

    return NextResponse.json({
      rejectionHistory: formattedRejections,
      storeInfo,
    })
  } catch (error) {
    console.error("Error fetching KYC rejections:", error)
    return NextResponse.json({ error: "Failed to fetch KYC rejections" }, { status: 500 })
  }
}
