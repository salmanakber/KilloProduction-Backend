import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateFromCookie } from "@/lib/auth"
import { sendEmail } from "@/lib/email"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateFromCookie(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { isVerified, reason } = body

    // Check if wholesaler exists
    const existingWholesaler = await prisma.wholesaler.findUnique({
      where: { id: params.id },
      include: { user: true },
    })

    if (!existingWholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    // Update verification status
    const updatedWholesaler = await prisma.wholesaler.update({
      where: { id: params.id },
      data: { isVerified },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            wholesalerProducts: true,
            supplierOrders: true,
          },
        },
      },
    })

    // Send appropriate email notification
    try {
      if (isVerified) {
        // Send approval email
        await sendEmail(existingWholesaler.email, "wholesalerApproved", {
          companyName: existingWholesaler.companyName,
          email: existingWholesaler.email,
          loginUrl: `${process.env.NEXT_PUBLIC_APP_URL}/wholesaler/login`,
          adminContact: process.env.ADMIN_EMAIL || "admin@killo.com"
        })
      } else {
        // Send rejection email
        await sendEmail(existingWholesaler.email, "wholesalerRejected", {
          companyName: existingWholesaler.companyName,
          email: existingWholesaler.email,
          reason: reason || "Your application did not meet our current requirements. Please review your information and resubmit if needed.",
          adminContact: process.env.ADMIN_EMAIL || "admin@killo.com"
        })
      }
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError)
      // Don't fail the request if email fails
    }

    return NextResponse.json({
      message: `Wholesaler ${isVerified ? "approved" : "rejected"} successfully`,
      wholesaler: updatedWholesaler,
    })
  } catch (error) {
    console.error("Wholesaler verification error:", error)
    return NextResponse.json(
      { error: "Failed to update verification status" },
      { status: 500 }
    )
  }
}
