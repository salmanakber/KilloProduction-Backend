import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { action, reason } = await request.json()
    const listing = await prisma.propertyListing.findUnique({
      where: { id: params.id },
      select: { id: true, vendorId: true, status: true },
    })
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 })
    }

    if (action === "approve") {
      await prisma.$transaction([
        prisma.propertyListing.update({
          where: { id: listing.id },
          data: { status: "ACTIVE", requiresApproval: false },
        }),
        prisma.user.update({
          where: { id: listing.vendorId },
          data: { isVerified: true, isActive: true },
        }),
      ])
      return NextResponse.json({ success: true, status: "APPROVED" })
    }

    if (action === "reject") {
      await prisma.$transaction([
        prisma.propertyListing.update({
          where: { id: listing.id },
          data: { status: "INACTIVE" },
        }),
        prisma.user.update({
          where: { id: listing.vendorId },
          data: { isVerified: false },
        }),
      ])
      return NextResponse.json({ success: true, status: "REJECTED", reason: reason || null })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Admin booking property KYC error:", error)
    return NextResponse.json({ error: "Failed to process KYC action" }, { status: 500 })
  }
}
