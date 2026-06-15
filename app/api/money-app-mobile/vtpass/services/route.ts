import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import {
  VTPASS_AIRTIME_SERVICES,
  VTPASS_CABLE_SERVICES,
  VTPASS_DATA_SERVICES,
  VTPASS_EDUCATION_SERVICES,
  VTPASS_ELECTRICITY_SERVICES,
  VTPASS_INSURANCE_SERVICES,
  getVtpassConfig,
} from "@/lib/vtpass"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const type = request.nextUrl.searchParams.get("type") || "airtime"
    const config = await getVtpassConfig()

    const services =
      type === "data"
        ? VTPASS_DATA_SERVICES
        : type === "electricity"
          ? VTPASS_ELECTRICITY_SERVICES
          : type === "cable"
            ? VTPASS_CABLE_SERVICES
            : type === "education"
              ? VTPASS_EDUCATION_SERVICES
              : type === "insurance"
                ? VTPASS_INSURANCE_SERVICES
                : VTPASS_AIRTIME_SERVICES

    return NextResponse.json({
      success: true,
      enabled: config.isEnabled,
      services,
      commission: {
        airtime: config.airtimeCommissionPct,
        data: config.dataCommissionPct,
        bills: config.billsCommissionPct,
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
