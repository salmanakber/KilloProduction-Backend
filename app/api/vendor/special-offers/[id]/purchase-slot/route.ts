import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { WalletService } from "@/lib/wallet-service"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const offer = await prisma.specialOffer.findUnique({ where: { id: params.id } })
    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    if (!offer.enablePaidSlots) return NextResponse.json({ error: "Paid slots not enabled" }, { status: 400 })
    if (!offer.slotPrice || offer.slotPrice <= 0) return NextResponse.json({ error: "slotPrice not configured" }, { status: 400 })

    // Enforce maxPaidSlots
    if (offer.maxPaidSlots != null) {
      const purchasedCount = await prisma.specialOfferVendor.count({
        where: { offerId: offer.id, source: "PAID_SLOT", status: { in: ["PURCHASED_SLOT", "SUBMITTED_PRODUCT", "APPROVED"] } },
      })
      if (purchasedCount >= offer.maxPaidSlots) {
        return NextResponse.json({ error: "No paid slots available" }, { status: 400 })
      }
    }

    // Debit wallet
    await WalletService.processWalletTransaction({
      userId: user.id,
      amount: offer.slotPrice,
      type: "DEBIT",
      description: `Special offer slot purchase: ${offer.title}`,
      reference: `OFFER_SLOT_${offer.id}_${Date.now()}`,
      metadata: { offerId: offer.id, module: offer.module, type: "SPECIAL_OFFER_SLOT" },
    })

    const vendorRow = await prisma.specialOfferVendor.upsert({
      where: { offerId_vendorId: { offerId: offer.id, vendorId: user.id } },
      update: {
        module: offer.module as any,
        source: "PAID_SLOT",
        status: "PURCHASED_SLOT",
        respondedAt: new Date(),
      },
      create: {
        offerId: offer.id,
        vendorId: user.id,
        module: offer.module as any,
        source: "PAID_SLOT",
        status: "PURCHASED_SLOT",
      },
    })

    return NextResponse.json({ success: true, vendor: vendorRow })
  } catch (error: any) {
    console.error("Purchase slot error:", error)
    const msg = error?.message === "Insufficient wallet balance" ? "Insufficient wallet balance" : "Failed to purchase slot"
    return NextResponse.json({ error: msg }, { status: error?.message === "Insufficient wallet balance" ? 400 : 500 })
  }
}

