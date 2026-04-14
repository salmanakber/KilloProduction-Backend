import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { cloudinary } from "@/lib/cloudinary"

/**
 * POST multipart form: file = image → Cloudinary secure URL for central medicine catalog.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user) {
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

    const buf = Buffer.from(await file.arrayBuffer())
    const mime = file.type || "image/jpeg"
    const dataUri = `data:${mime};base64,${buf.toString("base64")}`

    const uploaded = await cloudinary.uploader.upload(dataUri, {
      folder: "central-medicines",
      resource_type: "image",
      transformation: [{ quality: "auto", fetch_format: "auto" }],
    })

    return NextResponse.json({
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
    })
  } catch (e) {
    console.error("Medicine image upload:", e)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
