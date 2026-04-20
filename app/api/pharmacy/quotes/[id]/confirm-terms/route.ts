import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"

/**
 * Pharmacy confirms supplier terms (after supplier accepted or sent a counter-offer).
 * Moves status QUOTE_RECEIVED → QUOTE_ACCEPTED so pharmacy can proceed to delivery & payment.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== ("VENDOR" as any)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
    })

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    const supplierOrder = await prisma.supplierOrder.findUnique({
      where: {
        id: params.id,
        pharmacyId: pharmacy.id,
      },
    })

    if (!supplierOrder) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 })
    }

    if (supplierOrder.status !== "QUOTE_RECEIVED") {
      return NextResponse.json(
        {
          error: "Nothing to confirm",
          details:
            supplierOrder.status === "QUOTE_ACCEPTED"
              ? "Terms are already confirmed."
              : `Current status is ${supplierOrder.status}.`,
        },
        { status: 400 }
      )
    }

    const sr = supplierOrder.supplierResponse as Record<string, unknown> | null
    const resp = sr && typeof sr === "object" ? String((sr as any).response || "") : ""
    if (resp !== "ACCEPT" && resp !== "COUNTER_OFFER") {
      return NextResponse.json(
        { error: "Supplier response is missing or invalid." },
        { status: 400 }
      )
    }

    const prevSr =
      supplierOrder.supplierResponse &&
      typeof supplierOrder.supplierResponse === "object" &&
      supplierOrder.supplierResponse !== null
        ? (supplierOrder.supplierResponse as Record<string, unknown>)
        : {}

    const updated = await prisma.supplierOrder.update({
      where: { id: params.id },
      data: {
        status: "QUOTE_ACCEPTED",
        pharmacyAcceptance: false,
        supplierResponse: {
          ...prevSr,
          pharmacyConfirmedTermsAt: new Date().toISOString(),
        },
      },
      include: {
        wholesaler: { select: { companyName: true, userId: true } },
      },
    })

    try {
      await NotificationBridge.sendNotification({
        userId: updated.wholesaler.userId,
        title: "Pharmacy confirmed quote terms",
        message: `${pharmacy.pharmacyName} confirmed your quote terms. They may proceed to arrange delivery.`,
        type: "ORDER_UPDATE",
        module: "PHARMACY",
        actionUrl: `/wholesaler/quotes/${supplierOrder.id}`,
        data: {
          actionType: "navigate",
          screen: "WholesalerQuoteDetails",
          params: [{ name: "quoteId", value: supplierOrder.id }],
          orderId: supplierOrder.id,
        },
      })
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({
      success: true,
      message: "Terms confirmed. You can now arrange delivery and payment.",
      order: {
        id: updated.id,
        status: updated.status,
      },
    })
  } catch (error) {
    console.error("confirm-terms error:", error)
    return NextResponse.json({ error: "Failed to confirm terms" }, { status: 500 })
  }
}
