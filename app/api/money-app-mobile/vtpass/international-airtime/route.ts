import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import {
  fetchVtpassInternationalCountries,
  fetchVtpassInternationalOperators,
  fetchVtpassInternationalProductTypes,
} from "@/lib/vtpass"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const step = request.nextUrl.searchParams.get("step") || "countries"
    const countryCode = request.nextUrl.searchParams.get("countryCode")
    const productTypeId = request.nextUrl.searchParams.get("productTypeId")

    if (step === "countries") {
      const countries = await fetchVtpassInternationalCountries()
      return NextResponse.json({ success: true, countries })
    }

    if (step === "productTypes") {
      if (!countryCode) {
        return NextResponse.json({ error: "countryCode required" }, { status: 400 })
      }
      const productTypes = await fetchVtpassInternationalProductTypes(countryCode)
      return NextResponse.json({ success: true, productTypes })
    }

    if (step === "operators") {
      if (!countryCode || !productTypeId) {
        return NextResponse.json({ error: "countryCode and productTypeId required" }, { status: 400 })
      }
      const operators = await fetchVtpassInternationalOperators(countryCode, productTypeId)
      return NextResponse.json({ success: true, operators })
    }

    return NextResponse.json({ error: "Invalid step" }, { status: 400 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
