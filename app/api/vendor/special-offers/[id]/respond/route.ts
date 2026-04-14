import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const offer = await prisma.specialOffer.findUnique({ where: { id: params.id } })
    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 })

    const body = await request.json()
    const action: "ACCEPT" | "DECLINE" = body?.action
    if (action !== "ACCEPT" && action !== "DECLINE") {
      return NextResponse.json({ error: "action must be ACCEPT or DECLINE" }, { status: 400 })
    }

    const vendorRow = await prisma.specialOfferVendor.findUnique({
      where: { offerId_vendorId: { offerId: offer.id, vendorId: user.id } },
    })
    if (!vendorRow) return NextResponse.json({ error: "You are not invited to this offer" }, { status: 403 })

    const updated = await prisma.specialOfferVendor.update({
      where: { id: vendorRow.id },
      data: {
        status: action === "ACCEPT" ? "ACCEPTED" : "DECLINED",
        respondedAt: new Date(),
      },
    })

    return NextResponse.json({ success: true, vendor: updated })
  } catch (error) {
    console.error("Offer respond error:", error)
    return NextResponse.json({ error: "Failed to respond" }, { status: 500 })
  }
}

