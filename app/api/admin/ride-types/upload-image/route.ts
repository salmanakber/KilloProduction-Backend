import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { cloudinary } from "@/lib/cloudinary"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get("file")
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const mime = file.type || "image/jpeg"
    const dataUri = `data:${mime};base64,${buffer.toString("base64")}`

    const uploaded = await cloudinary.uploader.upload(dataUri, {
      folder: "ride-types",
      resource_type: "image",
      transformation: [{ quality: "auto", fetch_format: "auto" }],
    })

    return NextResponse.json({
      success: true,
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
    })
  } catch (error) {
    console.error("Ride type image upload failed:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
