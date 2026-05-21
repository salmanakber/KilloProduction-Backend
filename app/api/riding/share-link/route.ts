import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { createTripShareLink } from "@/lib/ride-trip-share"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const bookingId = String(body?.bookingId || "").trim()
    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 })
    }

    const link = await createTripShareLink(user.id, bookingId)
    return NextResponse.json({ success: true, data: link })
  } catch (error: any) {
    const code = String(error?.message || "")
    if (code === "BOOKING_NOT_FOUND") {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }
    if (code === "BOOKING_NOT_ACTIVE") {
      return NextResponse.json({ error: "Trip is no longer active" }, { status: 400 })
    }
    console.error("share-link error:", error)
    return NextResponse.json({ error: "Failed to create share link" }, { status: 500 })
  }
}
