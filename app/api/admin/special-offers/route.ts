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

// GET /api/admin/special-offers - List all special offers
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const offers = await prisma.specialOffer.findMany({
      include: {
        pharmacy: {
          select: {
            id: true,
            pharmacyName: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    })

    return NextResponse.json(offers)
  } catch (error: any) {
    console.error("Error fetching special offers:", error)
    return NextResponse.json(
      { error: "Failed to fetch special offers" },
      { status: 500 }
    )
  }
}

// POST /api/admin/special-offers - Create new special offer
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
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

    // Validate required fields
    if (!title || discountValue == null || !validFrom || !validUntil) {
      return NextResponse.json(
        { error: "Title, discount value, valid from, and valid until are required" },
        { status: 400 }
      )
    }

    // Validate dates
    const fromDate = new Date(validFrom)
    const untilDate = new Date(validUntil)
    
    if (fromDate >= untilDate) {
      return NextResponse.json(
        { error: "Valid until date must be after valid from date" },
        { status: 400 }
      )
    }

    // Validate discount value
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

    const offer = await prisma.specialOffer.create({
      data: ({
        title,
        subtitle,
        description,
        discountType,
        discountValue,
        discountFundedBy: discountFundedBy || "PLATFORM",
        validFrom: fromDate,
        validUntil: untilDate,
        imageUrl,
        bannerImageUrl,
        isActive: isActive ?? true,
        maxUses,
        pharmacyId: pharmacyId || null,
        module: module || "PHARMACY",
        locationState: locationState || null,
        locationLatitude: locationLatitude != null ? Number(locationLatitude) : null,
        locationLongitude: locationLongitude != null ? Number(locationLongitude) : null,
        locationRadiusKm: locationRadiusKm != null ? Number(locationRadiusKm) : null,
        maxVendors: maxVendors != null ? Number(maxVendors) : null,
        enableInvitations: enableInvitations ?? true,
        enablePaidSlots: enablePaidSlots ?? false,
        slotPrice: slotPrice != null ? Number(slotPrice) : null,
        maxPaidSlots: maxPaidSlots != null ? Number(maxPaidSlots) : null,
        enableAiSelection: enableAiSelection ?? false,
        conditions: parseMaybeJson(conditions),
        targetAudience: parseMaybeJson(targetAudience),
      }) as any,
      include: {
        pharmacy: {
          select: {
            id: true,
            pharmacyName: true
          }
        }
      }
    })

    return NextResponse.json(offer, { status: 201 })
  } catch (error: any) {
    console.error("Error creating special offer:", error)
    return NextResponse.json(
      { error: "Failed to create special offer" },
      { status: 500 }
    )
  }
}
