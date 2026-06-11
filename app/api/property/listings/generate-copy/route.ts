import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { generatePropertyListingCopy } from "@/lib/property-listing-ai"
import {
  assertCanManagePropertyListings,
  listingsAccessDenied,
} from "@/lib/property-host-resolve"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { denied } = await assertCanManagePropertyListings(user.id)
    if (denied) {
      return NextResponse.json(listingsAccessDenied(), { status: 403 })
    }

    const body = await request.json()
    const tone = String(body.tone || "Sophisticated")
    const propertyType = String(body.type || body.propertyType || "Villa")

    const result = await generatePropertyListingCopy({
      tone,
      propertyType,
      city: body.city,
      address: body.address,
      state: body.state,
      country: body.country,
      amenities: Array.isArray(body.amenities) ? body.amenities : [],
      amenityLabels: Array.isArray(body.amenityLabels) ? body.amenityLabels : undefined,
      title: body.title,
      tagline: body.tagline,
      description: body.description,
      hasGatedCommunity: Boolean(body.hasGatedCommunity),
      hasOceanfront: Boolean(body.hasOceanfront),
      hasClifftop: Boolean(body.hasClifftop),
      hasJungleView: Boolean(body.hasJungleView),
      zip: body.zip,
      nightlyRate: body.nightlyRate != null ? Number(body.nightlyRate) : undefined,
      discountPercent:
        body.discountPercent != null ? Number(body.discountPercent) : undefined,
      cleaningFee: body.cleaningFee != null ? Number(body.cleaningFee) : undefined,
      securityDeposit:
        body.securityDeposit != null ? Number(body.securityDeposit) : undefined,
      hasVideo: Boolean(body.hasVideo),
      hasTour: Boolean(body.hasTour),
      imageCount: body.imageCount != null ? Number(body.imageCount) : undefined,
    })

    return NextResponse.json({
      success: true,
      copy: {
        title: result.title,
        tagline: result.tagline,
        description: result.description,
        summary: result.summary,
        highlights: result.highlights,
        aiGeneratedTitle: result.title,
        aiGeneratedTagline: result.tagline,
        aiGeneratedDescription: result.description,
        aiKeywords: result.highlights,
      },
    })
  } catch (error: any) {
    console.error("Property generate-copy error:", error)
    return NextResponse.json(
      { error: error?.message || "AI copy generation failed" },
      { status: 500 }
    )
  }
}
