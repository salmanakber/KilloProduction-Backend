import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = (searchParams.get("status") || "PENDING").toUpperCase()
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || 50)))

    const where: any = {
      role: "VENDOR",
      vendorProfile: {
        is: {
          OR: [
            { businessType: { contains: "Property", mode: "insensitive" } },
            { registrationDocuments: { not: null } },
          ],
        },
      },
    }
    if (status === "PENDING") {
      where.isVerified = false
      where.status = "PENDING"
    } else if (status === "APPROVED") {
      where.isVerified = true
    }

    const hosts = await prisma.user.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        vendorProfile: true,
        propertyListings: { take: 1, select: { id: true, title: true, city: true } },
      },
    })

    return NextResponse.json({
      success: true,
      hosts: hosts.map((h) => ({
        id: h.id,
        name: h.name,
        email: h.email,
        phone: h.phone,
        status: h.isVerified ? "APPROVED" : "PENDING",
        createdAt: h.createdAt.toISOString(),
        registrationDate: h.createdAt.toISOString(),
        businessName: h.vendorProfile?.businessName,
        businessType: h.vendorProfile?.businessType,
        address: h.vendorProfile?.address,
        city: h.vendorProfile?.city,
        state: h.vendorProfile?.state,
        registrationDocuments: h.vendorProfile?.registrationDocuments,
        listing: h.propertyListings[0] || null,
      })),
    })
  } catch (error) {
    console.error("Booking hosts list error:", error)
    return NextResponse.json({ error: "Failed to load hosts" }, { status: 500 })
  }
}
