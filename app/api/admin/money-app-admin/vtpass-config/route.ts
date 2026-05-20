import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MoneyAdminAuthError, requireMoneyTransferAdmin } from "@/lib/money-transfer-admin"
import { getVtpassConfig } from "@/lib/vtpass"

export async function GET(request: NextRequest) {
  try {
    await requireMoneyTransferAdmin(request)
    const config = await getVtpassConfig()
    return NextResponse.json({
      success: true,
      config: {
        sandbox: config.sandbox,
        isEnabled: config.isEnabled,
        hasApiKey: Boolean(config.apiKey),
        hasSecretKey: Boolean(config.secretKey),
        airtimeCommissionPct: config.airtimeCommissionPct,
        dataCommissionPct: config.dataCommissionPct,
        billsCommissionPct: config.billsCommissionPct,
      },
    })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireMoneyTransferAdmin(request)
    const body = await request.json()
    const data: Record<string, unknown> = {}
    if (body.apiKey) data.apiKey = body.apiKey
    if (body.secretKey) data.secretKey = body.secretKey
    if (body.sandbox !== undefined) data.sandbox = Boolean(body.sandbox)
    if (body.isEnabled !== undefined) data.isEnabled = Boolean(body.isEnabled)
    if (body.airtimeCommissionPct != null) data.airtimeCommissionPct = Number(body.airtimeCommissionPct)
    if (body.dataCommissionPct != null) data.dataCommissionPct = Number(body.dataCommissionPct)
    if (body.billsCommissionPct != null) data.billsCommissionPct = Number(body.billsCommissionPct)

    const config = await prisma.vtpassConfig.upsert({
      where: { id: "default" },
      create: { id: "default", ...data },
      update: data,
    })

    return NextResponse.json({ success: true, config })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
