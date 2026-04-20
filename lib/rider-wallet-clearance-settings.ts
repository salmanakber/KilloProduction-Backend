import { prisma } from "@/lib/prisma"

/** Calendar days before rider delivery credits become withdrawable (admin setting, clamped 1–14). */
export async function getRiderWalletClearanceDays(): Promise<number> {
  const row = await prisma.systemSettings.findFirst({
    select: { riderWalletClearanceDays: true },
  })
  const raw = row?.riderWalletClearanceDays ?? 4
  return Math.min(14, Math.max(1, Math.floor(Number(raw)) || 4))
}

export function computeWalletClearsAt(days: number): Date {
  const d = Math.min(14, Math.max(1, days))
  return new Date(Date.now() + d * 24 * 60 * 60 * 1000)
}
