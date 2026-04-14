import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    // Get the first wholesaler for testing
    const wholesaler = await prisma.wholesaler.findFirst({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true
          }
        }
      }
    })

    if (!wholesaler) {
      return NextResponse.json({ error: "No wholesaler found" }, { status: 404 })
    }

    return NextResponse.json({
      wholesaler: {
        id: wholesaler.id,
        companyName: wholesaler.companyName,
        phone: wholesaler.phone,
        email: wholesaler.email,
        address: wholesaler.address,
        description: wholesaler.description,
        website: wholesaler.website,
        licenseNumber: wholesaler.licenseNumber,
        isVerified: wholesaler.isVerified,
        specialties: wholesaler.specialties,
        deliveryZones: wholesaler.deliveryZones,
        paymentTerms: wholesaler.paymentTerms,
        user: wholesaler.user
      }
    })
  } catch (error) {
    console.error("Wholesaler profile fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch wholesaler profile", details: error },
      { status: 500 }
    )
  }
}
