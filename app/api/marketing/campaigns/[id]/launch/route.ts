import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { launchMarketingCampaign } from "@/lib/marketing-campaign-launch"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const campaignId = (await Promise.resolve(params)).id

    const result = await launchMarketingCampaign(campaignId)

    if (!result.ok) {
      if (result.reason === "not_found") {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
      }
      if (result.reason === "bad_status") {
        return NextResponse.json({ error: "Campaign cannot be launched from this status" }, { status: 400 })
      }
      if (result.reason === "no_audience") {
        return NextResponse.json(
          {
            error:
              "No audience: link at least one customer segment to this campaign (or add segment IDs under target audience) before launch.",
          },
          { status: 400 }
        )
      }
      return NextResponse.json({ error: result.detail || "Internal server error" }, { status: 500 })
    }

    return NextResponse.json({
      message: "Campaign launched successfully",
      participantCount: result.participantCount,
    })
  } catch (error) {
    console.error("Error launching campaign:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
