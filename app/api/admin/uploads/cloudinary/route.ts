import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { cloudinary } from "@/lib/cloudinary"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const folder = (formData.get("folder") as string | null) || "special-offers"

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const result: any = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: "image",
          overwrite: true,
        },
        (error, uploadResult) => {
          if (error) return reject(error)
          resolve(uploadResult)
        }
      )
      stream.end(buffer)
    })

    return NextResponse.json({
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
    })
  } catch (error: any) {
    console.error("Cloudinary upload error:", error)
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 })
  }
}

