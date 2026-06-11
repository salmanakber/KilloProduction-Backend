import { cloudinary } from "@/lib/cloudinary"

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
const MAX_BYTES = 5 * 1024 * 1024

export async function uploadPropertyHostImage(
  file: File,
  kind: "avatar" | "cover"
): Promise<string | null> {
  if (!file?.size || !ALLOWED_TYPES.includes(file.type) || file.size > MAX_BYTES) return null
  const imageBuffer = Buffer.from(await file.arrayBuffer())
  const imageBase64 = imageBuffer.toString("base64")
  const folder = kind === "avatar" ? "kilo/property/host/avatars" : "kilo/property/host/covers"
  const transform =
    kind === "avatar"
      ? [{ quality: "auto", fetch_format: "auto" }, { width: 400, height: 400, crop: "fill" }]
      : [{ quality: "auto", fetch_format: "auto" }, { width: 1200, height: 600, crop: "limit" }]

  const uploadResult = await cloudinary.uploader.upload(
    `data:${file.type};base64,${imageBase64}`,
    { folder, resource_type: "image", transformation: transform }
  )
  return uploadResult.secure_url || null
}
