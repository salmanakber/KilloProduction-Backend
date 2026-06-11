import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { uploadPropertyImageFiles, type PropertyImageFolder } from "@/lib/property-cloudinary-upload"
import {
  assertCanManagePropertyListings,
  listingsAccessDenied,
} from "@/lib/property-host-resolve"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const folderRaw = String(formData.get("folder") || "listings")
    const folder: PropertyImageFolder =
      folderRaw === "reviews" ? "reviews" : "listings"

    if (folder === "reviews" && user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Only guests can upload review photos" }, { status: 403 })
    }
    if (folder === "listings" && user.role !== "VENDOR") {
      return NextResponse.json({ error: "Only hosts can upload listing photos" }, { status: 403 })
    }
    if (folder === "listings") {
      const { denied } = await assertCanManagePropertyListings(user.id)
      if (denied) {
        return NextResponse.json(listingsAccessDenied(), { status: 403 })
      }
    }

    const imageFiles = formData.getAll("images") as File[]
    if (imageFiles.length === 0) {
      return NextResponse.json({ error: "No images provided" }, { status: 400 })
    }

    const images = await uploadPropertyImageFiles(imageFiles, folder)
    if (images.length === 0) {
      return NextResponse.json({ error: "Failed to upload any images" }, { status: 400 })
    }

    return NextResponse.json({ success: true, images })
  } catch (error) {
    console.error("Property image upload error:", error)
    return NextResponse.json({ error: "Failed to upload images" }, { status: 500 })
  }
}
