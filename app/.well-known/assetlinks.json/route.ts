import { NextResponse } from "next/server"
import { ANDROID_PACKAGE } from "@/lib/mobile-app-link"

/**
 * Android App Links verification.
 * Set ANDROID_SHA256_CERT_FINGERPRINT in .env (release keystore SHA-256 from Play Console or keytool).
 * Multiple fingerprints: comma-separated.
 */
export async function GET() {
  const raw = process.env.ANDROID_SHA256_CERT_FINGERPRINT || ""
  const fingerprints = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const body =
    fingerprints.length > 0
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: ANDROID_PACKAGE,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : []

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
