import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

function parseMaybeJson(value: any) {
  if (value == null) return null
  if (typeof value === "string") {
    if (!value.trim()) return null
    return JSON.parse(value)
  }
  if (typeof value === "object") return value
  return null
}

// GET /api/admin/special-offers/[id] - Get specific special offer
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const offer = await prisma.specialOffer.findUnique({
      where: { id: params.id },
      include: {
        pharmacy: {
          select: {
            id: true,
            pharmacyName: true
          }
        }
      }
    })

    if (!offer) {
      return NextResponse.json({ error: "Special offer not found" }, { status: 404 })
    }

    return NextResponse.json(offer)
  } catch (error: any) {
    console.error("Error fetching special offer:", error)
    return NextResponse.json(
      { error: "Failed to fetch special offer" },
      { status: 500 }
    )
  }
}

// PUT /api/admin/special-offers/[id] - Update special offer
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest()
    if (!user || user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      title,
      subtitle,
      description,
      discountType,
      discountValue,
      discountFundedBy,
      validFrom,
      validUntil,
      imageUrl,
      bannerImageUrl,
      isActive,
      maxUses,
      pharmacyId,
      conditions,
      targetAudience,
      module,
      locationState,
      locationLatitude,
      locationLongitude,
      locationRadiusKm,
      maxVendors,
      enableInvitations,
      enablePaidSlots,
      slotPrice,
      maxPaidSlots,
      enableAiSelection
    } = body

    const enabled = [!!enableInvitations, !!enablePaidSlots, !!enableAiSelection].filter(Boolean).length
    if (enabled > 1) {
      return NextResponse.json(
        { error: "Only one participation mode can be enabled at a time (invitations OR paid slots OR AI selection)" },
        { status: 400 }
      )
    }

    if (enablePaidSlots) {
      if (slotPrice == null || Number(slotPrice) <= 0) {
        return NextResponse.json({ error: "slotPrice is required when paid slots are enabled" }, { status: 400 })
      }
    }

    // Check if offer exists
    const existingOffer = await prisma.specialOffer.findUnique({
      where: { id: params.id }
    })

    if (!existingOffer) {
      return NextResponse.json({ error: "Special offer not found" }, { status: 404 })
    }

    // Validate dates if provided
    if (validFrom && validUntil) {
      const fromDate = new Date(validFrom)
      const untilDate = new Date(validUntil)
      
      if (fromDate >= untilDate) {
        return NextResponse.json(
          { error: "Valid until date must be after valid from date" },
          { status: 400 }
        )
      }
    }

    // Validate discount value if provided
    if (discountValue !== undefined) {
      if (discountType === "PERCENTAGE" && (discountValue < 0 || discountValue > 100)) {
        return NextResponse.json(
          { error: "Percentage discount must be between 0 and 100" },
          { status: 400 }
        )
      }

      if ((discountType === "FIXED_AMOUNT" || discountType === "BUY_ONE_GET_ONE" || discountType === "FREE_DELIVERY") && discountValue < 0) {
        return NextResponse.json(
          { error: "Fixed discount must be positive" },
          { status: 400 }
        )
      }
    }

    const updateData: any = {}
    
    if (title !== undefined) updateData.title = title
    if (subtitle !== undefined) updateData.subtitle = subtitle
    if (description !== undefined) updateData.description = description
    if (discountType !== undefined) updateData.discountType = discountType
    if (discountValue !== undefined) updateData.discountValue = discountValue
    if (discountFundedBy !== undefined) updateData.discountFundedBy = discountFundedBy
    if (validFrom !== undefined) updateData.validFrom = new Date(validFrom)
    if (validUntil !== undefined) updateData.validUntil = new Date(validUntil)
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl
    if (bannerImageUrl !== undefined) updateData.bannerImageUrl = bannerImageUrl
    if (isActive !== undefined) updateData.isActive = isActive
    if (maxUses !== undefined) updateData.maxUses = maxUses
    if (pharmacyId !== undefined) updateData.pharmacyId = pharmacyId || null
    if (module !== undefined) updateData.module = module
    if (locationState !== undefined) updateData.locationState = locationState || null
    if (locationLatitude !== undefined) updateData.locationLatitude = locationLatitude != null ? Number(locationLatitude) : null
    if (locationLongitude !== undefined) updateData.locationLongitude = locationLongitude != null ? Number(locationLongitude) : null
    if (locationRadiusKm !== undefined) updateData.locationRadiusKm = locationRadiusKm != null ? Number(locationRadiusKm) : null
    if (maxVendors !== undefined) updateData.maxVendors = maxVendors != null ? Number(maxVendors) : null
    if (enableInvitations !== undefined) updateData.enableInvitations = enableInvitations
    if (enablePaidSlots !== undefined) updateData.enablePaidSlots = enablePaidSlots
    if (slotPrice !== undefined) updateData.slotPrice = slotPrice != null ? Number(slotPrice) : null
    if (maxPaidSlots !== undefined) updateData.maxPaidSlots = maxPaidSlots != null ? Number(maxPaidSlots) : null
    if (enableAiSelection !== undefined) updateData.enableAiSelection = enableAiSelection
    if (conditions !== undefined) updateData.conditions = parseMaybeJson(conditions)
    if (targetAudience !== undefined) updateData.targetAudience = parseMaybeJson(targetAudience)

    const offer = await prisma.specialOffer.update({
      where: { id: params.id },
      data: updateData,
      include: {
        pharmacy: {
          select: {
            id: true,
            pharmacyName: true
          }
        }
      }
    })

    return NextResponse.json(offer)
  } catch (error: any) {
    console.error("Error updating special offer:", error)
    return NextResponse.json(
      { error: "Failed to update special offer" },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/special-offers/[id] - Delete special offer
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest()
    if (!user || user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if offer exists
    const existingOffer = await prisma.specialOffer.findUnique({
      where: { id: params.id }
    })

    if (!existingOffer) {
      return NextResponse.json({ error: "Special offer not found" }, { status: 404 })
    }

    await prisma.specialOffer.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ message: "Special offer deleted successfully" })
  } catch (error: any) {
    console.error("Error deleting special offer:", error)
    return NextResponse.json(
      { error: "Failed to delete special offer" },
      { status: 500 }
    )
  }
}
