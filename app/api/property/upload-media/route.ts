import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { uploadPropertyMediaFile } from "@/lib/property-media-upload"
import {
  assertCanManagePropertyListings,
  listingsAccessDenied,
} from "@/lib/property-host-resolve"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { denied } = await assertCanManagePropertyListings(user.id)
    if (denied) {
      return NextResponse.json(listingsAccessDenied(), { status: 403 })
    }

    const formData = await request.formData()
    const kindRaw = String(formData.get("kind") || "video")
    const kind: "video" | "tour" = kindRaw === "tour" ? "tour" : "video"
    const file = formData.get("file") as File | null

    if (!file?.size) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const url = await uploadPropertyMediaFile(file, kind)
    if (!url) {
      return NextResponse.json({ error: "Failed to upload media" }, { status: 400 })
    }

    return NextResponse.json({ success: true, url, kind })
  } catch (error) {
    console.error("Property media upload error:", error)
    return NextResponse.json({ error: "Failed to upload media" }, { status: 500 })
  }
}
