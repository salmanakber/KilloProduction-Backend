import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const data = await request.json()
    const { wholesalerId, approvedMedicineCategories, deliveryZones, paymentTerms } = data

    if (!wholesalerId || !approvedMedicineCategories || approvedMedicineCategories.length === 0) {
      return NextResponse.json(
        {
          error: "Wholesaler ID and approved medicine categories are required",
        },
        { status: 400 },
      )
    }

    // Update wholesaler with approved categories
    const wholesaler = await prisma.wholesaler.update({
      where: { id: wholesalerId },
      data: {
        isVerified: true,
        specialties: approvedMedicineCategories,
        deliveryZones: deliveryZones || [],
        paymentTerms: paymentTerms || "Net 30",
      },
    })

    // Create notification for wholesaler
    await prisma.notification.create({
      data: {
        userId: wholesaler.userId,
        title: "Wholesaler Account Approved",
        message: `Your wholesaler account has been approved. You can now supply medicines in categories: ${approvedMedicineCategories.join(", ")}`,
        type: "SYSTEM",
        module: "PHARMACY",
      },
    })

    return NextResponse.json({
      message: "Wholesaler approved successfully",
      wholesaler,
    })
  } catch (error) {
    console.error("Wholesaler approval error:", error)
    return NextResponse.json({ error: "Failed to approve wholesaler" }, { status: 500 })
  }
}
