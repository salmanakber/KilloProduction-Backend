import { ImageAnnotatorClient } from "@google-cloud/vision"
import sharp from "sharp"
import { cloudinary } from "@/lib/cloudinary"
import { extractTextFromImage } from "@/lib/virtual-doctor/ocr"

export type SelfieAngle = "front" | "left" | "right"

const FACE_VALIDATE_MAX_EDGE = 520
const CLOUDINARY_FACE_TIMEOUT_MS = 12_000

async function prepareSelfieValidationBuffer(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize(FACE_VALIDATE_MAX_EDGE, FACE_VALIDATE_MAX_EDGE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer()
}

function angleMatchesPose(panAngle: number | null | undefined, expected: SelfieAngle): boolean {
  const pan = panAngle ?? 0
  if (expected === "front") return Math.abs(pan) <= 22
  if (expected === "left") return pan <= -14
  if (expected === "right") return pan >= 14
  return true
}

function angleGuidanceMessage(expected: SelfieAngle): string {
  if (expected === "front") {
    return "Look straight at the camera with your full face in the oval."
  }
  if (expected === "left") {
    return "Turn your head slowly to your LEFT until your left profile is visible, then capture again."
  }
  return "Turn your head slowly to your RIGHT until your right profile is visible, then capture again."
}

const visionClient = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? new ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      projectId: process.env.GOOGLE_PROJECT_ID,
    })
  : null

function visionFaceBoxSize(face: {
  boundingPoly?: { vertices?: Array<{ x?: number | null; y?: number | null }> }
}): { w: number; h: number } {
  const verts = face.boundingPoly?.vertices || []
  if (verts.length < 2) return { w: 0, h: 0 }
  const xs = verts.map((v) => v.x ?? 0)
  const ys = verts.map((v) => v.y ?? 0)
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

async function detectFaceWithGoogleVision(
  buffer: Buffer,
  expectedAngle?: SelfieAngle
): Promise<{ faceDetected: boolean; angleOk: boolean; faceCount: number } | null> {
  if (!visionClient) return null
  try {
    const [result] = await visionClient.faceDetection({ image: { content: buffer } })
    const faces = result.faceAnnotations || []
    const primary = faces.find((face) => {
      const { w, h } = visionFaceBoxSize(face as { boundingPoly?: { vertices?: Array<{ x?: number | null; y?: number | null }> } })
      return w >= 56 && h >= 56
    })
    const faceDetected = Boolean(primary)
    const angleOk =
      !expectedAngle || !primary
        ? faceDetected
        : angleMatchesPose(primary.panAngle ?? null, expectedAngle)
    return { faceDetected, angleOk, faceCount: faces.length }
  } catch (e) {
    console.warn("Google Vision face detection skipped:", e)
    return null
  }
}

async function detectFaceWithCloudinary(
  buffer: Buffer,
  userId: string
): Promise<{ faceDetected: boolean; faceCount: number }> {
  const mime = "image/jpeg"
  const base64 = buffer.toString("base64")
  const uploadPromise = cloudinary.uploader.upload(`data:${mime};base64,${base64}`, {
    folder: `kilo/property/validate/${userId}`,
    resource_type: "image",
    faces: true,
    timeout: 10_000,
  })

  const uploadResult = await Promise.race([
    uploadPromise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Face check timed out")), CLOUDINARY_FACE_TIMEOUT_MS)
    ),
  ])

  const faces: number[][] = Array.isArray(uploadResult.faces) ? uploadResult.faces : []
  const imgW = uploadResult.width || 1
  const imgH = uploadResult.height || 1

  let faceDetected = false
  for (const face of faces) {
    if (!Array.isArray(face) || face.length < 4) continue
    const [, , w, h] = face
    if ((w * h) / (imgW * imgH) >= 0.012) {
      faceDetected = true
      break
    }
  }

  try {
    if (uploadResult.public_id) await cloudinary.uploader.destroy(uploadResult.public_id)
  } catch {
    // best-effort cleanup
  }

  return { faceDetected, faceCount: faces.length }
}

export type ParsedIdentityFields = {
  fullName: string | null
  documentNumber: string | null
  documentType: "passport" | "license" | null
  dateOfBirth: string | null
  expiryDate: string | null
  nationality: string | null
  rawText: string
  ocrSource: string
  confidence: number | null
}

const DATE_RE = /\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})\b/g
const NOISE_LINE_RE =
  /passport|republic|federal|national|identity|document|authority|ministry|immigration|driver|licen[cs]e|card|photo|signature|date of|place of|sex|male|female|country|code|type|valid|issue/i

async function prepareIdentityDocumentForOcr(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize(2200, 2200, { fit: "inside", withoutEnlargement: true })
    .grayscale()
    .normalize()
    .sharpen()
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
}

function normalizeOcrText(text: string): string {
  return text
    .replace(/[|]/g, "I")
    .replace(/[§]/g, "S")
    .replace(/\s+/g, " ")
    .trim()
}

function detectDocumentTypeFromText(
  text: string,
  requested: "passport" | "license"
): "passport" | "license" {
  const upper = text.toUpperCase()
  if (/\bPASSPORT\b|P</.test(upper) || /TRAVEL\s*DOCUMENT/.test(upper)) return "passport"
  if (
    /\b(ID\s*CARD|IDENTITY\s*CARD|NATIONAL\s*ID|DRIVER|DRIVING|LICEN[CS]E|RESIDEN[CT]E|BVN|NIN)\b/.test(
      upper
    )
  ) {
    return "license"
  }
  return requested
}

function extractMrzLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s/g, "").toUpperCase())
    .filter((l) => l.length >= 25 && /^[A-Z0-9<]+$/.test(l))
}

function parseMrzName(line1: string): string | null {
  const passportMrz = line1.match(/^P<[A-Z]{3}([A-Z<]+)<<([A-Z<]+)/)
  if (passportMrz) {
    const last = passportMrz[1].replace(/</g, " ").trim()
    const first = passportMrz[2].replace(/</g, " ").trim()
    const name = `${first} ${last}`.replace(/\s+/g, " ").trim()
    return name.length >= 3 ? name : null
  }
  const idMrz = line1.match(/^I<[A-Z]{3}([A-Z<]+)<<([A-Z<]+)/)
  if (idMrz) {
    const last = idMrz[1].replace(/</g, " ").trim()
    const first = idMrz[2].replace(/</g, " ").trim()
    const name = `${first} ${last}`.replace(/\s+/g, " ").trim()
    return name.length >= 3 ? name : null
  }
  return null
}

function parseMrzDocumentNumber(line2: string): string | null {
  const compact = line2.replace(/\s/g, "").toUpperCase()
  const primary = compact.slice(0, 9).replace(/</g, "").trim()
  if (primary.length >= 6 && /[A-Z0-9]/.test(primary)) return primary
  const fallback = compact.match(/[A-Z0-9]{6,12}/)
  return fallback?.[0] || null
}

function extractLabeledValue(lines: string[], labelPatterns: RegExp[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const pattern of labelPatterns) {
      if (!pattern.test(line)) continue
      const inline = line.replace(pattern, "").replace(/^[:\s-]+/, "").trim()
      if (inline.length >= 3 && inline.length <= 80 && !NOISE_LINE_RE.test(inline)) {
        return inline
      }
      const next = lines[i + 1]?.trim()
      if (next && next.length >= 3 && next.length <= 80 && !NOISE_LINE_RE.test(next)) {
        return next
      }
    }
  }
  return null
}

function extractDocumentNumberFromText(
  text: string,
  lines: string[],
  documentType: "passport" | "license"
): string | null {
  const mrzLines = extractMrzLines(text)
  if (mrzLines.length >= 2) {
    const fromMrz = parseMrzDocumentNumber(mrzLines[1])
    if (fromMrz) return fromMrz
  }

  const labeled = extractLabeledValue(lines, [
    /passport\s*(?:no|number|#)?/i,
    /document\s*(?:no|number|#)?/i,
    /id\s*(?:no|number|#)?/i,
    /licen[cs]e\s*(?:no|number|#)?/i,
    /card\s*(?:no|number|#)?/i,
    /nin\b/i,
    /bvn\b/i,
  ])
  if (labeled) {
    const cleaned = labeled.replace(/[^A-Z0-9]/gi, "").toUpperCase()
    if (cleaned.length >= 6 && cleaned.length <= 20) return cleaned
  }

  const patterns =
    documentType === "passport"
      ? [/\b([A-Z]{1,2}\d{6,9})\b/, /\b([A-Z0-9]{8,12})\b/]
      : [/\b(\d{9,12})\b/, /\b([A-Z]{1,3}\d{6,12})\b/, /\b([A-Z0-9]{8,16})\b/]

  for (const re of patterns) {
    const match = text.toUpperCase().match(re)
    if (match?.[1] && !/^(19|20)\d{2}$/.test(match[1])) return match[1]
  }
  return null
}

function extractFullNameFromText(text: string, lines: string[]): string | null {
  const mrzLines = extractMrzLines(text)
  if (mrzLines.length >= 1) {
    const fromMrz = parseMrzName(mrzLines[0])
    if (fromMrz) return fromMrz
  }

  const labeled = extractLabeledValue(lines, [
    /^(?:full\s*)?name\b/i,
    /^surname\b/i,
    /^given\s*names?\b/i,
    /^forename\b/i,
    /^last\s*name\b/i,
    /^first\s*name\b/i,
    /^holder\b/i,
  ])
  if (labeled && /^[A-Za-z][A-Za-z\s'.-]{2,59}$/.test(labeled)) return labeled

  for (const line of lines.slice(0, 14)) {
    if (line.length < 4 || line.length > 60) continue
    if (NOISE_LINE_RE.test(line)) continue
    if (/^\d+$/.test(line)) continue
    if (/^[A-Z][a-z]+(\s+[A-Z][a-z'.-]+){1,4}$/.test(line)) return line
    if (/^[A-Z][A-Z\s'.-]{3,50}$/.test(line) && line.includes(" ")) return line.replace(/\s+/g, " ").trim()
  }
  return null
}

export function parseIdentityFieldsFromOcr(
  text: string,
  idType: "passport" | "license" | string
): ParsedIdentityFields {
  const rawText = normalizeOcrText(text)
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const requested = idType === "passport" ? "passport" : "license"
  const documentType = detectDocumentTypeFromText(rawText, requested)
  const fullName = extractFullNameFromText(rawText, lines)
  const documentNumber = extractDocumentNumberFromText(rawText, lines, documentType)

  const dateMatches = Array.from(rawText.matchAll(DATE_RE), (m) => m[1])

  return {
    fullName,
    documentNumber,
    documentType,
    dateOfBirth: dateMatches[0] || null,
    expiryDate: dateMatches.length > 1 ? dateMatches[dateMatches.length - 1] : null,
    nationality:
      documentType === "passport"
        ? lines.find((l) => /^[A-Z]{2,3}$/.test(l.replace(/\s/g, ""))) || null
        : null,
    rawText,
    ocrSource: "ocr",
    confidence: null,
  }
}

export async function validateSelfieFaceInImage(
  buffer: Buffer,
  _mime: string,
  userId: string,
  expectedAngle?: SelfieAngle
): Promise<{ faceDetected: boolean; angleOk: boolean; faceCount: number; message?: string }> {
  const prepared = await prepareSelfieValidationBuffer(buffer)

  const visionResult = await detectFaceWithGoogleVision(prepared, expectedAngle)
  if (visionResult) {
    const ok = visionResult.faceDetected && visionResult.angleOk
    return {
      faceDetected: visionResult.faceDetected,
      angleOk: visionResult.angleOk,
      faceCount: visionResult.faceCount,
      message: ok
        ? undefined
        : !visionResult.faceDetected
          ? visionResult.faceCount === 0
            ? "No face detected. Position your face clearly inside the oval and try again."
            : "Face too small or unclear. Move closer and look at the camera."
          : expectedAngle
            ? angleGuidanceMessage(expectedAngle)
            : "Adjust your head position and try again.",
    }
  }

  try {
    const cloudResult = await detectFaceWithCloudinary(prepared, userId)
    return {
      faceDetected: cloudResult.faceDetected,
      angleOk: cloudResult.faceDetected,
      faceCount: cloudResult.faceCount,
      message: cloudResult.faceDetected
        ? undefined
        : cloudResult.faceCount === 0
          ? "No face detected. Position your face clearly inside the oval and try again."
          : "Face too small or unclear. Move closer and look at the camera.",
    }
  } catch (e) {
    const timedOut = e instanceof Error && e.message.includes("timed out")
    return {
      faceDetected: false,
      angleOk: false,
      faceCount: 0,
      message: timedOut
        ? "Face check timed out. Move closer to Wi‑Fi or try again in better lighting."
        : "Could not verify your face right now. Please try again.",
    }
  }
}

export async function uploadIdentityImageToCloudinary(
  buffer: Buffer,
  mime: string,
  userId: string
): Promise<string> {
  const base64 = buffer.toString("base64")
  const uploadResult = await cloudinary.uploader.upload(`data:${mime};base64,${base64}`, {
    folder: `kilo/property/identity/${userId}`,
    resource_type: "image",
    transformation: [{ quality: "auto", fetch_format: "auto" }, { width: 2000, crop: "limit" }],
  })
  if (!uploadResult.secure_url) throw new Error("Cloudinary upload failed")
  return uploadResult.secure_url
}

export async function ocrIdentityDocument(
  buffer: Buffer,
  idType: "passport" | "license"
): Promise<{ ocr: ParsedIdentityFields; confidence: number | null; source: string }> {
  const prepared = await prepareIdentityDocumentForOcr(buffer)
  const result = await extractTextFromImage(prepared)
  const parsed = parseIdentityFieldsFromOcr(result.text, idType)

  return {
    ocr: {
      ...parsed,
      ocrSource: result.source,
      confidence: result.confidence ?? null,
      rawText: result.text,
    },
    confidence: result.confidence ?? null,
    source: result.source,
  }
}
