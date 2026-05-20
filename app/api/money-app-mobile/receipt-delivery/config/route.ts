import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import {
  getMoneyReceiptWhatsappConfigPublic,
  isMoneyReceiptDeliveryAvailable,
} from "@/lib/money-receipt-whatsapp-config"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const cfg = await getMoneyReceiptWhatsappConfigPublic()
    const ready = await isMoneyReceiptDeliveryAvailable()

    const full = await prisma.user.findUnique({
      where: { id: user.id },
      select: { phone: true },
    })

    return NextResponse.json({
      success: true,
      provider: "meta_cloud",
      whatsappEnabled: ready,
      metaConfigured: cfg.hasAccessToken && Boolean(cfg.phoneNumberId),
      hasPhone: Boolean(full?.phone?.trim()),
      phoneMasked: full?.phone
        ? `${full.phone.slice(0, 4)}****${full.phone.slice(-2)}`
        : null,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
