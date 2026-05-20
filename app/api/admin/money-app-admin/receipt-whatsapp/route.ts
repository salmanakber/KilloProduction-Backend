import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import {
  getMoneyReceiptWhatsappConfigPublic,
  saveMoneyReceiptWhatsappConfig,
} from "@/lib/money-receipt-whatsapp-config"

export async function GET() {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const config = await getMoneyReceiptWhatsappConfigPublic()
    return NextResponse.json({ success: true, config })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const config = await saveMoneyReceiptWhatsappConfig({
      enabled: body.enabled !== undefined ? Boolean(body.enabled) : undefined,
      phoneNumberId:
        body.phoneNumberId != null ? String(body.phoneNumberId).trim() : undefined,
      accessToken:
        body.accessToken != null && String(body.accessToken).trim()
          ? String(body.accessToken).trim()
          : body.accessToken === ""
            ? null
            : undefined,
      apiVersion: body.apiVersion != null ? String(body.apiVersion).trim() : undefined,
      wabaId: body.wabaId != null ? String(body.wabaId).trim() || null : undefined,
      messageTemplate:
        body.messageTemplate != null ? String(body.messageTemplate) : undefined,
      templateName:
        body.templateName !== undefined
          ? body.templateName
            ? String(body.templateName).trim()
            : null
          : undefined,
      templateLanguage:
        body.templateLanguage != null ? String(body.templateLanguage).trim() : undefined,
    })

    return NextResponse.json({ success: true, config })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
