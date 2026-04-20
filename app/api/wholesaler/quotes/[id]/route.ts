import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "WHOLESALER" as any) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wholesaler = await prisma.wholesaler.findUnique({
      where: { userId: user.id },
    })

    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    const quoteId = params.id

    // Get quote details
    const quote = await prisma.supplierOrder.findUnique({
      where: {
        id: quoteId,
        wholesalerId: wholesaler.id,
      },
      include: {
        pharmacy: {
          select: {
            id: true,
            pharmacyName: true,
            phone: true,
            email: true,
            address: true,
            lat: true,
            lon: true,
            description: true,
            website: true,
            is24Hours: true,
            deliveryAvailable: true,
            openingHours: true,
            deliveryZones: true,
          }
        },
        items: {
          select: {
            id: true,
            productName: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
          }
        }
      }
    })

    if (!quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 })
    }

    return NextResponse.json({ quote })
  } catch (error) {
    console.error("Wholesaler quote details fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch quote details" }, { status: 500 })
  }
}

