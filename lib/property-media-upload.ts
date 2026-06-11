import { cloudinary } from "@/lib/cloudinary"

const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/mpeg"]
const TOUR_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  ...VIDEO_TYPES,
]
const MAX_VIDEO_BYTES = 80 * 1024 * 1024
const MAX_TOUR_BYTES = 50 * 1024 * 1024

export async function uploadPropertyMediaFile(
  file: File,
  kind: "video" | "tour"
): Promise<string | null> {
  if (!file?.size) return null

  const allowed = kind === "video" ? VIDEO_TYPES : TOUR_TYPES
  const maxBytes = kind === "video" ? MAX_VIDEO_BYTES : MAX_TOUR_BYTES
  if (!allowed.includes(file.type) || file.size > maxBytes) return null

  const buffer = Buffer.from(await file.arrayBuffer())
  const base64 = buffer.toString("base64")
  const folder = kind === "video" ? "kilo/property/listings/video" : "kilo/property/listings/tour"
  const isVideo = VIDEO_TYPES.includes(file.type)

  try {
    const uploadResult = await cloudinary.uploader.upload(
      `data:${file.type};base64,${base64}`,
      {
        folder,
        resource_type: isVideo ? "video" : "image",
        ...(isVideo
          ? {}
          : {
              transformation: [
                { quality: "auto", fetch_format: "auto" },
                { width: 4096, height: 2048, crop: "limit" },
              ],
            }),
      }
    )
    return uploadResult.secure_url || null
  } catch (e) {
    console.error("[property-media-upload]", e)
    return null
  }
}
