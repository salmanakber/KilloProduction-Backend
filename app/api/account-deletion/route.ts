import { NextResponse } from "next/server"
import { getAccountDeletionPolicy } from "@/lib/account-deletion-policy"

/**
 * Public account-deletion info for Play Store / App Store listings and documentation.
 * GET /api/account-deletion
 */
export async function GET() {
  return NextResponse.json(getAccountDeletionPolicy(), {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  })
}
