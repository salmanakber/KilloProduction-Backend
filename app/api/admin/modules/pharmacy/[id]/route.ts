import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { PharmacyStatus } from "@prisma/client"

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: params.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isVerified: true,
            isActive: true,
            status: true,
            createdAt: true,
            vendorProfile: {
              select: {
                id: true,
                businessName: true,
                businessType: true,
                address: true,
                city: true,
                state: true,
                taxId: true,
                businessLicense: true,
              },
            },
          },
        },
        specializations: {
          include: { medicineOrigin: { select: { id: true, name: true, displayName: true } } },
        },
        _count: {
          select: {
            medicines: true,
            pharmacyMedicines: true,
            supplierOrders: true,
            prescriptionQueues: true,
            consultations: true,
            pharmacyChats: true,
            pharmacyOrders: true,
          },
        },
        pharmacyOrders: {
          take: 15,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            createdAt: true,
            customer: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    })

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    const deliveredRevenue = await prisma.order.aggregate({
      where: { pharmacyId: pharmacy.id, status: "DELIVERED" },
      _sum: { total: true },
    })

    return NextResponse.json({
      pharmacy,
      summary: {
        deliveredRevenue: deliveredRevenue._sum.total ?? 0,
        recentOrders: pharmacy.pharmacyOrders,
      },
    })
  } catch (e) {
    console.error("Admin pharmacy detail GET:", e)
    return NextResponse.json({ error: "Failed to load pharmacy" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireAdmin()
  if (error) return error

  try {
    const body = await request.json()
    const {
      pharmacyName,
      licenseNumber,
      description,
      address,
      phone,
      email,
      website,
      status,
      isVerified,
      deliveryAvailable,
      is24Hours,
      responseTime,
      emergencyContact,
      pharmacistOnDuty,
      lat,
      lon,
      user: userPatch,
      /** Replace all pharmacy specializations when provided */
      specializations: specializationInput,
    } = body || {}

    const existing = await prisma.pharmacy.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    const pharmacyData: Record<string, unknown> = {}
    if (pharmacyName !== undefined) pharmacyData.pharmacyName = String(pharmacyName)
    if (licenseNumber !== undefined) pharmacyData.licenseNumber = String(licenseNumber)
    if (description !== undefined) pharmacyData.description = description
    if (address !== undefined) pharmacyData.address = String(address)
    if (phone !== undefined) pharmacyData.phone = String(phone)
    if (email !== undefined) pharmacyData.email = email
    if (website !== undefined) pharmacyData.website = website
    if (deliveryAvailable !== undefined) pharmacyData.deliveryAvailable = Boolean(deliveryAvailable)
    if (is24Hours !== undefined) pharmacyData.is24Hours = Boolean(is24Hours)
    if (responseTime !== undefined) pharmacyData.responseTime = Number(responseTime)
    if (emergencyContact !== undefined) pharmacyData.emergencyContact = emergencyContact
    if (pharmacistOnDuty !== undefined) pharmacyData.pharmacistOnDuty = pharmacistOnDuty
    if (lat !== undefined) pharmacyData.lat = lat === null ? null : Number(lat)
    if (lon !== undefined) pharmacyData.lon = lon === null ? null : Number(lon)
    if (status !== undefined) {
      if (!Object.values(PharmacyStatus).includes(status)) {
        return NextResponse.json({ error: "Invalid pharmacy status" }, { status: 400 })
      }
      pharmacyData.status = status as PharmacyStatus
    }
    if (isVerified !== undefined) pharmacyData.isVerified = Boolean(isVerified)

    await prisma.pharmacy.update({
      where: { id: params.id },
      data: pharmacyData as any,
    })

    if (userPatch && typeof userPatch === "object") {
      const u: Record<string, unknown> = {}
      if (userPatch.name !== undefined) u.name = userPatch.name
      if (userPatch.email !== undefined) u.email = userPatch.email
      if (userPatch.phone !== undefined) u.phone = userPatch.phone
      if (userPatch.isActive !== undefined) u.isActive = Boolean(userPatch.isActive)
      if (Object.keys(u).length > 0) {
        await prisma.user.update({ where: { id: existing.userId }, data: u as any })
      }
    }

    if (Array.isArray(specializationInput)) {
      const rows = specializationInput
        .map((row: { medicineOriginId?: string; illnessTypes?: unknown }) => ({
          medicineOriginId: String(row.medicineOriginId || "").trim(),
          illnessTypes: Array.isArray(row.illnessTypes)
            ? row.illnessTypes.map((x) => String(x).trim()).filter(Boolean)
            : [],
        }))
        .filter((r) => r.medicineOriginId)

      const uniqueOriginIds = Array.from(new Set(rows.map((r) => r.medicineOriginId)))
      if (uniqueOriginIds.length > 0) {
        const found = await prisma.medicineOrigin.count({ where: { id: { in: uniqueOriginIds } } })
        if (found !== uniqueOriginIds.length) {
          return NextResponse.json({ error: "One or more medicine origins are invalid" }, { status: 400 })
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.pharmacySpecialization.deleteMany({ where: { pharmacyId: params.id } })
        if (uniqueOriginIds.length > 0) {
          const illnessByOrigin = new Map<string, Set<string>>()
          for (const r of rows) {
            if (!illnessByOrigin.has(r.medicineOriginId)) {
              illnessByOrigin.set(r.medicineOriginId, new Set())
            }
            for (const t of r.illnessTypes) {
              illnessByOrigin.get(r.medicineOriginId)!.add(t)
            }
          }
          await tx.pharmacySpecialization.createMany({
            data: uniqueOriginIds.map((medicineOriginId) => {
              const ill = illnessByOrigin.get(medicineOriginId)
              const list = ill && ill.size > 0 ? Array.from(ill) : []
              return {
                pharmacyId: params.id,
                medicineOriginId,
                illnessTypes: list.length > 0 ? list : undefined,
              }
            }),
          })
        }
      })
    }

    await prisma.auditLog.create({
      data: {
        performedBy: session!.id,
        action: "ADMIN_UPDATE_PHARMACY",
        entityType: "Pharmacy",
        entityId: params.id,
        details: { body },
      },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Admin pharmacy detail PATCH:", e)
    return NextResponse.json({ error: "Failed to update pharmacy" }, { status: 500 })
  }
}
