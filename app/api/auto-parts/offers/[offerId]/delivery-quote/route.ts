import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

function clampFeeAmount(
  amount: number,
  setting: { minAmount?: number | null; maxAmount?: number | null } | null | undefined
): number {
  let a = amount
  if (setting?.minAmount != null && a < setting.minAmount) a = setting.minAmount
  if (setting?.maxAmount != null && a > setting.maxAmount) a = setting.maxAmount
  return Math.round(a * 100) / 100
}

/** Pre-payment: estimated courier fare + platform fee + total for address (customer). */
export async function GET(
  request: NextRequest,
  { params }: { params: { offerId: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { offerId } = params
    const addressId = new URL(request.url).searchParams.get("addressId")
    if (!addressId) {
      return NextResponse.json({ error: "addressId required" }, { status: 400 })
    }

    const offer = await prisma.partOffer.findUnique({
      where: { id: offerId },
      include: {
        request: true,
        vendor: {
          include: {
            vendorProfile: {
              select: {
                latitude: true,
                longitude: true,
                address: true,
              },
            },
          },
        },
      },
    })

    if (!offer || offer.request.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const address = await prisma.address.findUnique({
      where: { id: addressId, userId: user.id },
    })
    if (!address) {
      return NextResponse.json({ error: "Invalid address" }, { status: 404 })
    }

    const vp = offer.vendor.vendorProfile
    if (!vp?.latitude || !vp?.longitude) {
      return NextResponse.json({ error: "Vendor location unavailable" }, { status: 400 })
    }

    const courierRideType = await prisma.rideType.findFirst({
      where: { category: "COURIER", isActive: true },
      orderBy: { basePrice: "asc" },
    })
    if (!courierRideType) {
      return NextResponse.json({ error: "No courier pricing" }, { status: 500 })
    }

    const R = 6371
    const dLat = ((address.latitude - vp.latitude) * Math.PI) / 180
    const dLon = ((address.longitude - vp.longitude) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((vp.latitude * Math.PI) / 180) *
        Math.cos((address.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const distance = R * c
    const estimatedTime = Math.ceil(distance * 3)
    let fare = courierRideType.basePrice + distance * courierRideType.pricePerKm
    if (courierRideType.pricePerMinute > 0) {
      fare += estimatedTime * courierRideType.pricePerMinute
    }
    fare = Math.round(fare * 100) / 100

    const partPrice = offer.price
    const commissionSettings = await prisma.commissionSetting.findMany({
      where: { module: "AUTO_PARTS" },
    })
    const platformFeeSetting = commissionSettings.find((s) => s.commissionType === "PLATFORM_FEE")
    const vendorCommissionSetting = commissionSettings.find((s) => s.commissionType === "VENDOR_COMMISSION")

    let platformFee = (partPrice * (platformFeeSetting?.rate ?? 0)) / 100
    platformFee = clampFeeAmount(platformFee, platformFeeSetting)
    const vendorCommissionRate = vendorCommissionSetting?.rate ?? 0
    const vendorCommission = Math.round(((partPrice * vendorCommissionRate) / 100) * 100) / 100
    const total = Math.round((partPrice + fare + platformFee) * 100) / 100

    return NextResponse.json({
      partPrice,
      deliveryFee: fare,
      platformFee,
      vendorCommission,
      total,
      distanceKm: Math.round(distance * 100) / 100,
      rideTypeId: courierRideType.id,
    })
  } catch (e: any) {
    console.error("delivery-quote", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
