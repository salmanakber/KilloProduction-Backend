import { type NextRequest, NextResponse } from "next/server"
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
    const status = searchParams.get("status") || "ALL"
    const search = searchParams.get("search") || ""
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const skip = (page - 1) * limit

    const where: any = {}
    if (search.trim()) {
      where.OR = [
        { companyName: { contains: search, mode: "insensitive" } },
        { licenseNumber: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ]
    }

    if (status !== "ALL") {
      if (status === "PENDING") where.isVerified = false
      if (status === "APPROVED") where.isVerified = true
    }

    const wholesalers = await prisma.wholesaler.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isVerified: true,
            status: true,
            isActive: true,
            vendorProfile: {
              select: { id: true, businessName: true, businessType: true, city: true, state: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    })

    const wholesalerIds = wholesalers.map((w) => w.id)
    const kycRejections =
      wholesalerIds.length > 0
        ? await prisma.kycRejection.findMany({
            where: {
              entityType: "WHOLESALER",
              entityId: { in: wholesalerIds },
            },
            include: {
              rejectedByUser: { select: { id: true, name: true, email: true } },
            },
            orderBy: { rejectedAt: "desc" },
          })
        : []

    const rejectionMap = new Map<string, typeof kycRejections>()
    kycRejections.forEach((rejection) => {
      if (!rejectionMap.has(rejection.entityId)) rejectionMap.set(rejection.entityId, [])
      rejectionMap.get(rejection.entityId)!.push(rejection)
    })

    const formatted = wholesalers.map((w) => {
      const rejections = rejectionMap.get(w.id) || []
      return {
        id: w.id,
        userId: w.userId,
        name: w.companyName,
        email: w.user?.email || w.email || "",
        phone: w.user?.phone || w.phone || "",
        address: w.address,
        licenseNumber: w.licenseNumber,
        status: w.isVerified ? "APPROVED" : "PENDING",
        isVerified: w.isVerified,
        createdAt: w.createdAt.toISOString(),
        registrationDate: w.createdAt.toISOString(),
        vendorProfile: w.user?.vendorProfile ?? null,
        documents: {
          licenseNumber: w.licenseNumber,
          logo: w.logo || null,
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

    return NextResponse.json({
      wholesalers: formatted,
      pagination: { page, limit },
    })
  } catch (error) {
    console.error("Error fetching wholesalers:", error)
    return NextResponse.json({ error: "Failed to fetch wholesalers" }, { status: 500 })
  }
}

