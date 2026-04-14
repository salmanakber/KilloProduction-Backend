import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

function normalizeSubmissionStatus(raw: string): "APPROVED" | "REJECTED" | "PENDING" {
  const s = String(raw || "PENDING").toUpperCase()
  if (s === "APPROVED" || s === "REJECTED") return s
  return "PENDING"
}

/**
 * Returns the current vendor's latest submission for this offer (or null).
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateRequest(_request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const offer = await prisma.specialOffer.findUnique({ where: { id: params.id } })
    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 })

    const vendorRow = await prisma.specialOfferVendor.findUnique({
      where: { offerId_vendorId: { offerId: offer.id, vendorId: user.id } },
    })

    const latest = await prisma.specialOfferSubmission.findFirst({
      where: { offerId: offer.id, vendorId: user.id },
      orderBy: { createdAt: "desc" },
    })

    if (!vendorRow && !latest) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (!latest) {
      return NextResponse.json({ submission: null })
    }

    return NextResponse.json({
      submission: {
        productId: latest.productId,
        status: normalizeSubmissionStatus(latest.status),
        createdAt: latest.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error("Offer submission GET error:", error)
    return NextResponse.json({ error: "Failed to load submission" }, { status: 500 })
  }
}
