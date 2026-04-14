import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { cloudinary } from "@/lib/cloudinary"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const imageFiles = formData.getAll("images") as File[]

    if (imageFiles.length === 0) {
      return NextResponse.json({ error: "No images provided" }, { status: 400 })
    }

    const uploadedImages: string[] = []

    for (const imageFile of imageFiles) {
      if (imageFile && imageFile.size > 0) {
        try {
          // Validate file type
          const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
          if (!allowedTypes.includes(imageFile.type)) {
            console.warn(`Skipping invalid file type: ${imageFile.type}`)
            continue
          }

          // Validate file size (max 5MB)
          const maxSize = 5 * 1024 * 1024 // 5MB
          if (imageFile.size > maxSize) {
            console.warn(`Skipping file too large: ${imageFile.size} bytes`)
            continue
          }

          // Convert to buffer and upload
          const imageBuffer = Buffer.from(await imageFile.arrayBuffer())
          const imageBase64 = imageBuffer.toString('base64')
          
          const uploadResult = await cloudinary.uploader.upload(
            `data:${imageFile.type};base64,${imageBase64}`,
            {
              folder: 'auto-parts/offers',
              resource_type: 'image',
              transformation: [
                { quality: 'auto', fetch_format: 'auto' },
                { width: 1200, height: 1200, crop: 'limit' }
              ]
            }
          )
          
          uploadedImages.push(uploadResult.secure_url)
          console.log(`✅ Uploaded offer image: ${uploadResult.secure_url}`)
        } catch (uploadError) {
          console.error('Image upload error:', uploadError)
          // Continue with other images even if one fails
        }
      }
    }

    if (uploadedImages.length === 0) {
      return NextResponse.json({ error: "Failed to upload any images" }, { status: 400 })
    }

    return NextResponse.json({ images: uploadedImages })
  } catch (error) {
    console.error("Image upload error:", error)
    return NextResponse.json({ error: "Failed to upload images" }, { status: 500 })
  }
}


