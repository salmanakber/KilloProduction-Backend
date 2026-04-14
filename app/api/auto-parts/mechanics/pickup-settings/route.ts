import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { getAutoPartsMechanicPickupPricePerKm } from "@/lib/auto-parts-mechanic-pickup-settings"

/** GET — price per km for mechanic pickup (vendor → customer), for display on quotes. */
export async function GET(_request: NextRequest) {
  try {
    const user = await authenticateRequest(_request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const pricePerKm = await getAutoPartsMechanicPickupPricePerKm()
    return NextResponse.json({ pricePerKm })
  } catch (e: any) {
    console.error("pickup-settings GET:", e)
    return NextResponse.json({ error: "Failed to load pickup settings" }, { status: 500 })
  }
}
