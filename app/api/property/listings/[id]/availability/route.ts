import { type NextRequest, NextResponse } from "next/server"
import { getPropertyListingAvailability } from "@/lib/property-listing-availability"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const fromParam = searchParams.get("from")
    const toParam = searchParams.get("to")

    const from = fromParam ? new Date(fromParam) : undefined
    const to = toParam ? new Date(toParam) : undefined

    if (from && Number.isNaN(from.getTime())) {
      return NextResponse.json({ error: "Invalid from date" }, { status: 400 })
    }
    if (to && Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: "Invalid to date" }, { status: 400 })
    }

    const excludeBookingId = searchParams.get("excludeBookingId") || undefined
    const availability = await getPropertyListingAvailability(
      params.id,
      from,
      to,
      excludeBookingId
    )
    return NextResponse.json({ success: true, availability })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load availability" },
      { status: 500 }
    )
  }
}
