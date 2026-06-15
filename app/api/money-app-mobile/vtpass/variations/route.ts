import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { fetchVtpassVariations } from "@/lib/vtpass"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const serviceId = request.nextUrl.searchParams.get("serviceId")
    if (!serviceId) {
      return NextResponse.json({ error: "serviceId required" }, { status: 400 })
    }

    const operatorId = request.nextUrl.searchParams.get("operatorId") || undefined
    const productTypeId = request.nextUrl.searchParams.get("productTypeId") || undefined

    const variations = await fetchVtpassVariations(serviceId, {
      operatorId,
      productTypeId,
    })
    return NextResponse.json({ success: true, variations })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load plans"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
