import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const rider = await prisma.user.findFirst({
      where: {
        id: params.id,
        role: "RIDER",
        riderProfile: { isNot: null },
      },
      include: {
        riderProfile: true,
        riderEarnings: { select: { amount: true } },
        customerRideBookings: { select: { id: true, status: true } },
      },
    })

    if (!rider || !rider.riderProfile) {
      return NextResponse.json({ error: "Rider not found" }, { status: 404 })
    }

    const rejections = await prisma.kycRejection.findMany({
      where: { entityType: "RIDER", entityId: rider.id },
      include: {
        rejectedByUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { rejectedAt: "desc" },
    })

    const formatted = {
      id: rider.id,
      name: rider.name || "Unknown",
      email: rider.email || "",
      phone: rider.phone || "",
      vehicleType: rider.riderProfile.vehicleType || "Unknown",
      status: rider.riderProfile.isApproved
        ? "APPROVED"
        : rider.riderProfile.isVerified
          ? "PENDING"
          : "REJECTED",
      rating: rider.riderProfile.rating || 0,
      totalRides: rider.customerRideBookings?.length || 0,
      totalEarnings: rider.riderEarnings?.reduce((sum, earning) => sum + earning.amount, 0) || 0,
      documentsVerified: rider.riderProfile.documentsVerified || false,
      createdAt: rider.createdAt.toISOString(),
      lastActive: rider.riderProfile.isOnline?.toISOString() || rider.createdAt.toISOString(),
      vehicleBrand: rider.riderProfile.vehicleBrand,
      vehicleModel: rider.riderProfile.vehicleModel,
      vehicleYear: rider.riderProfile.vehicleYear,
      vehicleColor: rider.riderProfile.vehicleColor,
      licensePlate: rider.riderProfile.licensePlate,
      licenseNumber: rider.riderProfile.licenseNumber,
      licenseExpiry: rider.riderProfile.licenseExpiry?.toISOString(),
      insurance: rider.riderProfile.insurance,
      insuranceExpiry: rider.riderProfile.insuranceExpiry?.toISOString(),
      nationalId: rider.riderProfile.nationalId,
      maxDeliveryDistance: rider.riderProfile.maxDeliveryDistance,
      modules: (rider.riderProfile.modules as string[]) || [],
      rideType: (rider.riderProfile.serviceTypes as { rideType?: string } | null)?.rideType || null,
      serviceTypes: (rider.riderProfile.serviceTypes as Record<string, unknown>) || {},
      rejectionHistory: rejections.map((r) => ({
        id: r.id,
        rejectionReason: r.rejectionReason,
        rejectedFields: r.rejectedFields,
        rejectedBy: r.rejectedByUser?.name || "Unknown Admin",
        rejectedAt: r.rejectedAt.toISOString(),
        isResolved: r.isResolved,
      })),
    }

    return NextResponse.json({ rider: formatted })
  } catch (e) {
    console.error("Admin rider GET:", e)
    return NextResponse.json({ error: "Failed to load rider" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const exists = await prisma.user.findFirst({
      where: { id: params.id, role: "RIDER" },
      select: { id: true },
    })
    if (!exists) {
      return NextResponse.json({ error: "Rider not found" }, { status: 404 })
    }

    const body = await request.json()

    const userUpdateData: Record<string, unknown> = {}
    if (body.name !== undefined) userUpdateData.name = body.name
    if (body.email !== undefined) userUpdateData.email = body.email
    if (body.phone !== undefined) userUpdateData.phone = body.phone

    if (Object.keys(userUpdateData).length > 0) {
      await prisma.user.update({
        where: { id: params.id },
        data: userUpdateData as any,
      })
    }

    const profileUpdateData: Record<string, unknown> = {}

    if (body.vehicleType !== undefined) profileUpdateData.vehicleType = body.vehicleType
    if (body.vehicleBrand !== undefined) profileUpdateData.vehicleBrand = body.vehicleBrand
    if (body.vehicleModel !== undefined) profileUpdateData.vehicleModel = body.vehicleModel
    if (body.vehicleYear !== undefined) profileUpdateData.vehicleYear = body.vehicleYear
    if (body.vehicleColor !== undefined) profileUpdateData.vehicleColor = body.vehicleColor
    if (body.licensePlate !== undefined) profileUpdateData.licensePlate = body.licensePlate
    if (body.licenseNumber !== undefined) profileUpdateData.licenseNumber = body.licenseNumber
    if (body.licenseExpiry !== undefined) profileUpdateData.licenseExpiry = new Date(body.licenseExpiry)
    if (body.insurance !== undefined) profileUpdateData.insurance = body.insurance
    if (body.insuranceExpiry !== undefined) profileUpdateData.insuranceExpiry = new Date(body.insuranceExpiry)
    if (body.nationalId !== undefined) profileUpdateData.nationalId = body.nationalId
    if (body.maxDeliveryDistance !== undefined) profileUpdateData.maxDeliveryDistance = body.maxDeliveryDistance
    if (body.modules !== undefined) profileUpdateData.modules = body.modules

    if (body.rideType !== undefined) {
      profileUpdateData.serviceTypes = { rideType: body.rideType }
      if (body.vehicleType !== undefined) {
        profileUpdateData.vehicleType = body.vehicleType
      }
    }

    if (body.serviceTypes !== undefined) {
      profileUpdateData.serviceTypes = body.serviceTypes
    }

    if (Object.keys(profileUpdateData).length > 0) {
      await prisma.riderProfile.updateMany({
        where: { userId: params.id },
        data: profileUpdateData as any,
      })
    }

    return NextResponse.json({
      success: true,
      message: "Rider information updated successfully",
    })
  } catch (error) {
    console.error("Error updating rider:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update rider information",
      },
      { status: 500 },
    )
  }
}
