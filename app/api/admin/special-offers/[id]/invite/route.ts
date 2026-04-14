import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const offer = await prisma.specialOffer.findUnique({ where: { id: params.id } })
    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 })

    const body = await request.json()
    const vendorIds: string[] = Array.isArray(body?.vendorIds) ? body.vendorIds : []
    if (vendorIds.length === 0) {
      return NextResponse.json({ error: "vendorIds is required" }, { status: 400 })
    }

    const created = await prisma.$transaction(async (tx) => {
      const rows = []
      for (const vendorId of vendorIds) {
        const row = await tx.specialOfferVendor.upsert({
          where: { offerId_vendorId: { offerId: offer.id, vendorId } },
          update: {
            status: "INVITED",
            source: "INVITED",
            module: offer.module as any,
            respondedAt: null,
          },
          create: {
            offerId: offer.id,
            vendorId,
            module: offer.module as any,
            source: "INVITED",
            status: "INVITED",
          },
        })
        rows.push(row)
      }
      return rows
    })

    // Notify invited vendors
    await Promise.allSettled(
      vendorIds.map((vendorId) =>
        NotificationBridge.sendNotification({
          userId: vendorId,
          title: "Special Offer Invitation",
          message: `You have been invited to participate in: ${offer.title}`,
          type: "SYSTEM",
          module: offer.module as any,
          data: {
            offerId: offer.id,
            actionType: "navigate",
            screen: "VendorSpecialOffers",
            params: [{ name: "offerId", value: offer.id }],
          },
          actionUrl: `/vendor/special-offers/${offer.id}`,
        })
      )
    )

    return NextResponse.json({ success: true, invited: created.length })
  } catch (error: any) {
    console.error("Invite vendors error:", error)
    return NextResponse.json({ error: "Failed to invite vendors" }, { status: 500 })
  }
}

