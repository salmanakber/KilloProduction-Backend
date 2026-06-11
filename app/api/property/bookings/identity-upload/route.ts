import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import {
  ocrIdentityDocument,
  uploadIdentityImageToCloudinary,
} from "@/lib/property-identity-ocr"

const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]
const MAX_BYTES = 12 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const kind = String(formData.get("kind") || "document")
    const idType = String(formData.get("idType") || "passport") as "passport" | "license"
    const selfieStep = formData.get("selfieStep")
      ? String(formData.get("selfieStep"))
      : null

    if (!file?.size) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File exceeds 12 MB limit" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const url = await uploadIdentityImageToCloudinary(buffer, file.type, user.id)

    let ocr = null
    if (kind === "document" && file.type.startsWith("image/")) {
      try {
        const ocrResult = await ocrIdentityDocument(buffer, idType)
        ocr = ocrResult.ocr
      } catch (e) {
        console.warn("Identity OCR skipped:", e)
      }
    }

    return NextResponse.json({
      success: true,
      url,
      kind,
      selfieStep,
      ocr,
    })
  } catch (error) {
    console.error("Identity upload error:", error)
    return NextResponse.json({ error: "Failed to upload identity file" }, { status: 500 })
  }
}
