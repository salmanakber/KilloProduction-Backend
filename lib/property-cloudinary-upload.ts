import { cloudinary } from "@/lib/cloudinary"

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
const MAX_BYTES = 5 * 1024 * 1024

export type PropertyImageFolder = "reviews" | "listings"

export async function uploadPropertyImageFiles(
  imageFiles: File[],
  folder: PropertyImageFolder
): Promise<string[]> {
  const uploaded: string[] = []
  const cloudFolder = `kilo/property/${folder}`

  for (const imageFile of imageFiles) {
    if (!imageFile?.size) continue
    if (!ALLOWED_TYPES.includes(imageFile.type)) continue
    if (imageFile.size > MAX_BYTES) continue

    try {
      const imageBuffer = Buffer.from(await imageFile.arrayBuffer())
      const imageBase64 = imageBuffer.toString("base64")
      const uploadResult = await cloudinary.uploader.upload(
        `data:${imageFile.type};base64,${imageBase64}`,
        {
          folder: cloudFolder,
          resource_type: "image",
          transformation: [
            { quality: "auto", fetch_format: "auto" },
            { width: 1600, height: 1600, crop: "limit" },
          ],
        }
      )
      if (uploadResult.secure_url) uploaded.push(uploadResult.secure_url)
    } catch (e) {
      console.error("[property-cloudinary-upload]", e)
    }
  }

  return uploaded
}
