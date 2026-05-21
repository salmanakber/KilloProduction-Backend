import { type NextRequest, NextResponse } from "next/server"
import { getTripShareSnapshotByToken } from "@/lib/ride-trip-share"

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const token = String(params?.token || "").trim()
    if (!token) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 })
    }

    const snapshot = await getTripShareSnapshotByToken(token)
    if (!snapshot) {
      return NextResponse.json({ error: "Link expired or invalid" }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: snapshot })
  } catch (error) {
    console.error("share token GET error:", error)
    return NextResponse.json({ error: "Failed to load trip" }, { status: 500 })
  }
}
