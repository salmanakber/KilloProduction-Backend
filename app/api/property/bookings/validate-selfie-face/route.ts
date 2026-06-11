import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { validateSelfieFaceInImage, type SelfieAngle } from "@/lib/property-identity-ocr"

export const maxDuration = 20

const ANGLES = new Set<SelfieAngle>(["front", "left", "right"])

const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
const MAX_BYTES = 12 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file?.size) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File exceeds 12 MB limit" }, { status: 400 })
    }

    const selfieStep = formData.get("selfieStep")
    const expectedAngle =
      selfieStep && ANGLES.has(String(selfieStep) as SelfieAngle)
        ? (String(selfieStep) as SelfieAngle)
        : undefined

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await validateSelfieFaceInImage(buffer, file.type, user.id, expectedAngle)
    const accepted = result.faceDetected && result.angleOk

    return NextResponse.json({
      success: true,
      faceDetected: accepted,
      angleOk: result.angleOk,
      faceCount: result.faceCount,
      message: result.message,
      expectedAngle: expectedAngle ?? null,
    })
  } catch (error) {
    console.error("Selfie face validation error:", error)
    return NextResponse.json({ error: "Failed to validate selfie" }, { status: 500 })
  }
}
