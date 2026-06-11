import { analyzeWithAI } from "@/lib/ai/queue"
import { AIUseCase } from "@prisma/client"

export type PropertyListingCopyInput = {
  tone: string
  propertyType: string
  city?: string
  address?: string
  state?: string
  country?: string
  amenities?: string[]
  amenityLabels?: string[]
  title?: string
  tagline?: string
  description?: string
  hasGatedCommunity?: boolean
  hasOceanfront?: boolean
  hasClifftop?: boolean
  hasJungleView?: boolean
  zip?: string
  nightlyRate?: number
  discountPercent?: number
  cleaningFee?: number
  securityDeposit?: number
  hasVideo?: boolean
  hasTour?: boolean
  imageCount?: number
}

export type PropertyListingCopyResult = {
  title: string
  tagline: string
  description: string
  summary: string
  highlights: string[]
}

/** Build stored listing description: summary paragraph + labeled bullet sections. */
export function composePropertyListingDescription(
  summary: string,
  highlights: string[],
  features?: string[]
): string {
  const parts: string[] = []
  const summaryText = String(summary || "").trim()
  if (summaryText) parts.push(summaryText)

  const highlightItems = (highlights || [])
    .map((h) => String(h).trim().replace(/^[•\-\*]\s*/, ""))
    .filter(Boolean)
  if (highlightItems.length > 0) {
    parts.push(
      ["Highlights", ...highlightItems.map((h) => `• ${h}`)].join("\n")
    )
  }

  const featureItems = (features || [])
    .map((f) => String(f).trim().replace(/^[•\-\*]\s*/, ""))
    .filter(Boolean)
  if (featureItems.length > 0) {
    parts.push(
      ["Features & amenities", ...featureItems.map((f) => `• ${f}`)].join("\n")
    )
  }

  return parts.join("\n\n").trim()
}

function stripMarkdownFence(raw: string): string {
  let s = raw.trim()
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)```$/im)
  if (fenced) return fenced[1].trim()
  const inline = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (inline) return inline[1].trim()
  return s
}

function normalizeBulletList(value: unknown, max = 10): string[] {
  if (!Array.isArray(value)) return []
  return value.map((h) => String(h).trim()).filter(Boolean).slice(0, max)
}

function buildCopyResult(
  parsed: Record<string, unknown>,
  fallback: PropertyListingCopyInput
): PropertyListingCopyResult {
  const title = String(parsed.title || fallback.title || "").trim()
  const tagline = String(parsed.tagline || "").trim()
  const highlights = normalizeBulletList(parsed.highlights, 8)
  const features = normalizeBulletList(parsed.features, 8)
  const summary = String(parsed.summary || "").trim()
  const legacyDescription = String(parsed.description || "").trim()

  let description = ""
  if (summary || highlights.length > 0 || features.length > 0) {
    description = composePropertyListingDescription(summary, highlights, features)
  } else if (legacyDescription) {
    description = legacyDescription
  }

  return {
    title,
    tagline,
    summary: summary || legacyDescription.split(/\n\n/)[0]?.trim() || "",
    description,
    highlights: [...highlights, ...features],
  }
}

function parseCopyJson(content: string, fallback: PropertyListingCopyInput): PropertyListingCopyResult {
  const cleaned = stripMarkdownFence(content)
  try {
    const parsed = JSON.parse(cleaned)
    if (parsed && typeof parsed === "object") {
      return buildCopyResult(parsed as Record<string, unknown>, fallback)
    }
  } catch {
    /* fall through */
  }
  const bracket = cleaned.match(/\{[\s\S]*\}/)
  if (bracket) {
    try {
      const parsed = JSON.parse(bracket[0])
      if (parsed && typeof parsed === "object") {
        return buildCopyResult(parsed as Record<string, unknown>, fallback)
      }
    } catch {
      /* fall through */
    }
  }
  const title = fallback.title || `${fallback.propertyType} in ${fallback.city || "your area"}`
  const description = cleaned.slice(0, 2000)
  return {
    title,
    tagline: "",
    summary: description.split(/\n\n/)[0]?.trim() || "",
    description,
    highlights: [],
  }
}

export async function generatePropertyListingCopy(
  input: PropertyListingCopyInput
): Promise<PropertyListingCopyResult> {
  const location = [input.address, input.city, input.state, input.country].filter(Boolean).join(", ")
  const features = [
    input.hasGatedCommunity ? "gated community" : null,
    input.hasOceanfront ? "oceanfront" : null,
    input.hasClifftop ? "clifftop" : null,
    input.hasJungleView ? "jungle view" : null,
    ...(input.amenityLabels?.length ? input.amenityLabels : input.amenities || []),
  ].filter(Boolean)

  const userDraft = [
    input.title ? `Host title draft: ${input.title}` : null,
    input.tagline ? `Host tagline draft: ${input.tagline}` : null,
    input.description ? `Host description draft: ${input.description}` : null,
  ]
    .filter(Boolean)
    .join("\n")

  const systemPrompt =
    "You are a luxury short-term rental copywriter for the Killo property marketplace in Pakistan, Nigeria, and emerging markets. " +
    "Write rich, scannable listing copy based ONLY on facts the host provided. Do not invent amenities, views, or locations not given. " +
    "Always produce a substantive summary paragraph plus specific bullet highlights guests can scan quickly."

  const pricingBits = [
    input.nightlyRate != null && input.nightlyRate > 0
      ? `Nightly rate: ${input.nightlyRate}`
      : null,
    input.discountPercent != null && input.discountPercent > 0
      ? `First-week promotional discount: ${input.discountPercent}%`
      : null,
    input.cleaningFee != null && input.cleaningFee > 0
      ? `Cleaning fee: ${input.cleaningFee}`
      : null,
    input.hasVideo ? "Has cinematic video tour" : null,
    input.hasTour ? "Has 360° virtual walkthrough" : null,
    input.imageCount != null && input.imageCount > 0
      ? `Photo gallery: ${input.imageCount} images`
      : null,
  ].filter(Boolean)

  const userPrompt = `Tone: ${input.tone}
Property type: ${input.propertyType}
Location: ${location || "unspecified"}
Features & amenities: ${features.length > 0 ? features.join(", ") : "none listed"}
${pricingBits.length > 0 ? `Pricing & media: ${pricingBits.join("; ")}\n` : ""}
${userDraft ? `\nHost notes:\n${userDraft}\n` : ""}

Return ONLY valid JSON (no markdown fences):
{
  "title": "catchy listing title, max 12 words",
  "tagline": "short marketing hook, max 12 words",
  "summary": "REQUIRED: 2-3 complete sentences (100-140 words) as one flowing paragraph. Describe the space, location vibe, and ideal guest. No bullet characters in summary.",
  "highlights": ["REQUIRED: 5-7 bullets — location perks, standout amenities, views, access, or experience (each 8-18 words, no • prefix)"],
  "features": ["REQUIRED: 4-6 bullets — practical amenities from the host list (WiFi, pool, parking, chef, etc.; no • prefix)"]
}
Use ${input.tone} voice. Mention city/area when known. Bullets must be specific, not generic filler.`

  const response = await analyzeWithAI("SMART_SHOP" as AIUseCase, input, {
    category: "TEXT_TO_TEXT",
    customPrompt: `${systemPrompt}\n\n${userPrompt}`,
    maxTokens: 2800,
    disableTools: true,
  })

  const parsed = parseCopyJson(response.content || "", input)
  if (!parsed.title) {
    parsed.title = input.title || `${input.propertyType} in ${input.city || "your area"}`
  }
  if (!parsed.description && input.description) {
    parsed.description = input.description
    parsed.summary = input.description.split(/\n\n/)[0]?.trim() || input.description
  }
  if (!parsed.description && parsed.summary) {
    parsed.description = composePropertyListingDescription(
      parsed.summary,
      parsed.highlights,
      []
    )
  }
  return parsed
}
