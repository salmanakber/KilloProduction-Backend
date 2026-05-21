import { NextResponse } from "next/server"
import { getRidingEmergencyContacts } from "@/lib/ride-trip-share"

export async function GET() {
  try {
    const contacts = await getRidingEmergencyContacts()
    return NextResponse.json({ success: true, data: { contacts } })
  } catch (error) {
    console.error("emergency-contacts error:", error)
    return NextResponse.json({ error: "Failed to load emergency contacts" }, { status: 500 })
  }
}
