import { cloudinary } from "./cloudinary"

const IMAGE_OPTS = {
  resource_type: "image" as const,
  transformation: [{ quality: "auto" as const, fetch_format: "auto" as const }],
}

/**
 * Upload a multipart File/Blob (from Next.js formData) to Cloudinary.
 */
export async function uploadRiderFileToCloudinary(file: File, folder: string): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: `riders/registration/${folder}`,
          ...IMAGE_OPTS,
        },
        (err, result) => {
          if (err || !result?.secure_url) return reject(err || new Error("Upload failed"))
          resolve(result.secure_url)
        }
      )
      .end(buffer)
  })
}

/**
 * Upload a data URL, raw base64, or return existing https URL.
 */
export async function uploadRiderImageString(input: string, folder: string): Promise<string> {
  const s = input.trim()
  if (!s) throw new Error("Empty image input")
  if (/^https?:\/\//i.test(s)) return s

  const dataUri = s.startsWith("data:") ? s : `data:image/jpeg;base64,${s}`
  const uploaded = await cloudinary.uploader.upload(dataUri, {
    folder: `riders/registration/${folder}`,
    ...IMAGE_OPTS,
  })
  return uploaded.secure_url
}
