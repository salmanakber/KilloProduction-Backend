import { launchMarketingCampaign } from "@/lib/marketing-campaign-launch"

export async function processMarketingScheduledJob(data: { campaignId: string }): Promise<void> {
  const { campaignId } = data
  const result = await launchMarketingCampaign(campaignId)
  if (!result.ok) {
    if (result.reason === "bad_status" || result.reason === "not_found") {
      return
    }
    if (result.reason === "no_audience") {
      console.warn(`[marketing-scheduled] launch skipped (no audience): ${campaignId}`)
      return
    }
    throw new Error(result.detail || `launch failed: ${result.reason}`)
  }
}
