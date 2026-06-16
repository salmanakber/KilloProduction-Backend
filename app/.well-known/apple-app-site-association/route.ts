import { NextResponse } from "next/server"
import { DEEP_LINK_PATH_PREFIXES, IOS_BUNDLE_ID } from "@/lib/mobile-app-link"

/** iOS Universal Links — set APPLE_TEAM_ID in .env (10-char Apple Developer team id). */
export async function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim()
  const bundleId = IOS_BUNDLE_ID

  const paths = [
    ...DEEP_LINK_PATH_PREFIXES,
    "/vendor/*",
    "/riding/*",
    "/customer/*",
  ]

  const body =
    teamId
      ? {
          applinks: {
            apps: [],
            details: [
              {
                appID: `${teamId}.${bundleId}`,
                paths,
              },
            ],
          },
        }
      : { applinks: { apps: [], details: [] } }

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
