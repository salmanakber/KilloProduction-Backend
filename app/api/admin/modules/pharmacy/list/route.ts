import { type NextRequest, NextResponse  } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const search = searchParams.get("search") || ""
    const status = searchParams.get("status") || "ALL"
    const limit = 20

    const where: Record<string, unknown> = {}

    if (search.trim()) {
      where.OR = [
        { pharmacyName: { contains: search, mode: "insensitive" } },
        { licenseNumber: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { user: { phone: { contains: search, mode: "insensitive" } } },
      ]
    }

    if (status !== "ALL") {
      where.status = status
    }

    const pharmacies = await prisma.pharmacy.findMany({
      where,
      select: {
        id: true,
        userId: true,
        pharmacyName: true,
        email: true,
        phone: true,
        address: true,
        licenseNumber: true,
        status: true,
        licenseDocument: true,
        storeFrontImage: true,
        ownerPhoto: true,
        createdAt: true,
        medicineOrigins: true,
        isVerified: true,
        totalOrders: true,
        rating: true,
        totalReviews: true,
        specializations: {
          select: {
            id: true,
            medicineOriginId: true,
            illnessTypes: true,
            medicineOrigin: {
              select: { id: true, name: true, displayName: true },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isVerified: true,
            createdAt: true,
            status: true,
            isActive: true,
            vendorProfile: {
              select: {
                id: true,
                businessName: true,
                businessType: true,
                city: true,
                state: true,
              },
            },
          },
        },
        pharmacyOrders: {
          select: {
            id: true,
            total: true,
            status: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            medicines: true,
            pharmacyMedicines: true,
            supplierOrders: true,
            prescriptionQueues: true,
            consultations: true,
            pharmacyChats: true,
          },
        },
        reviews: {
          select: {
            id: true,
            rating: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    })

    // Fetch all KycRejections for the fetched pharmacies
    const pharmacyIds = pharmacies.map(p => p.id)
    const kycRejections = pharmacyIds.length > 0 ? await prisma.kycRejection.findMany({
      where: {
        entityType: "PHARMACY",
        entityId: { in: pharmacyIds },
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
    
    // Create a map of entityId to rejections
    const rejectionMap = new Map<string, typeof kycRejections>()
    kycRejections.forEach(rejection => {
      if (!rejectionMap.has(rejection.entityId)) {
        rejectionMap.set(rejection.entityId, [])
      }
      rejectionMap.get(rejection.entityId)!.push(rejection)
    })
    

    const formattedPharmacies = pharmacies.map((pharmacy) => {
      const rejections = rejectionMap.get(pharmacy.id) || []

      const originLabels = new Set<string>()
      for (const s of pharmacy.specializations) {
        const label = s.medicineOrigin?.displayName || s.medicineOrigin?.name
        if (label) originLabels.add(label)
      }
      const mo = pharmacy.medicineOrigins
      if (Array.isArray(mo)) {
        for (const entry of mo) {
          if (typeof entry === "string" && entry.trim()) originLabels.add(entry)
          else if (entry && typeof entry === "object" && "displayName" in entry && String((entry as { displayName?: string }).displayName || "").trim()) {
            originLabels.add(String((entry as { displayName: string }).displayName))
          }
        }
      }

      const specializationLabels = pharmacy.specializations.map(
        (s) => s.medicineOrigin?.displayName || s.medicineOrigin?.name || s.medicineOriginId,
      )

      const deliveredTotal = pharmacy.pharmacyOrders
        .filter((o) => o.status === "DELIVERED")
        .reduce((sum, o) => sum + (o.total || 0), 0)

      const avgReviewRating =
        pharmacy.reviews.length > 0
          ? pharmacy.reviews.reduce((sum, review) => sum + review.rating, 0) / pharmacy.reviews.length
          : pharmacy.rating || 0

      return {
        id: pharmacy.id,
        userId: pharmacy.userId,
        name: pharmacy.pharmacyName,
        ownerName: pharmacy.user?.name || pharmacy.pharmacyName,
        email: pharmacy.user?.email || pharmacy.email,
        phone: pharmacy.user?.phone || pharmacy.phone,
        address: pharmacy.address,
        licenseNumber: pharmacy.licenseNumber,
        status: pharmacy.status,
        isVerified: pharmacy.isVerified || pharmacy.user?.isVerified || false,
        userStatus: pharmacy.user?.status,
        isUserActive: pharmacy.user?.isActive ?? true,
        registrationDate: pharmacy.createdAt.toISOString(),
        totalOrders: pharmacy.pharmacyOrders.length,
        totalRevenue: deliveredTotal,
        rating: avgReviewRating,
        specializations: specializationLabels,
        medicineOrigins: Array.from(originLabels),
        counts: {
          medicines: pharmacy._count.medicines,
          pharmacyMedicines: pharmacy._count.pharmacyMedicines,
          supplierOrders: pharmacy._count.supplierOrders,
          prescriptionQueues: pharmacy._count.prescriptionQueues,
          consultations: pharmacy._count.consultations,
          pharmacyChats: pharmacy._count.pharmacyChats,
        },
        vendorProfile: pharmacy.user?.vendorProfile ?? null,
        documents: {
          businessLicense: pharmacy.licenseDocument || "",
          pharmacyLicense: pharmacy.licenseNumber || "",
          storeFrontImage: pharmacy.storeFrontImage || "",
          ownerPhoto: pharmacy.ownerPhoto || "",
        },
        rejectionHistory: rejections.map((r) => ({
          id: r.id,
          rejectionReason: r.rejectionReason,
          rejectedFields: r.rejectedFields,
          rejectedBy: r.rejectedByUser?.name || "Unknown Admin",
          rejectedAt: r.rejectedAt.toISOString(),
          isResolved: r.isResolved,
        })),
      }
    })

    return NextResponse.json({ pharmacies: formattedPharmacies })
  } catch (error) {
    console.error("Error fetching pharmacies:", error)
    return NextResponse.json({ error: "Failed to fetch pharmacies" }, { status: 500 })
  }
}
