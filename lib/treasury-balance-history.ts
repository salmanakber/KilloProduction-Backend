import { prisma } from "@/lib/prisma"
import type { TreasurySnapshotPoint } from "@/lib/treasury-balance-history-types"

export type { TreasurySnapshotPoint } from "@/lib/treasury-balance-history-types"
export { treasuryTrendPercent } from "@/lib/treasury-balance-history-types"

const MAX_POINTS = 90

type HistoryMeta = {
  points: TreasurySnapshotPoint[]
}

async function readHistory(): Promise<TreasurySnapshotPoint[]> {
  const config = await prisma.moneyTransferConfig.findFirst()
  const meta = (config?.metadata as Record<string, unknown>) || {}
  const history = meta.treasuryHistory as HistoryMeta | undefined
  return Array.isArray(history?.points) ? history.points : []
}

export async function getTreasuryBalanceHistory(): Promise<TreasurySnapshotPoint[]> {
  return readHistory()
}

/** Append a snapshot when treasury balances are fetched (for trend charts). */
export async function recordTreasuryBalanceSnapshot(args: {
  paystack?: Array<{ currency: string; balanceMajor: number }> | null
  stripe?: Array<{ currency: string; available: number }> | null
  vtpassBalance?: number | null
}): Promise<void> {
  const at = new Date().toISOString()
  const paystackNgn = args.paystack?.find((b) => b.currency === "NGN")?.balanceMajor
  const stripeUsd = args.stripe?.find((b) => b.currency === "USD")?.available
  const stripeNgn = args.stripe?.find((b) => b.currency === "NGN")?.available

  const point: TreasurySnapshotPoint = {
    at,
    ...(paystackNgn != null ? { paystackNgn } : {}),
    ...(stripeUsd != null ? { stripeUsd } : {}),
    ...(stripeNgn != null ? { stripeNgn } : {}),
    ...(args.vtpassBalance != null ? { vtpassNgn: args.vtpassBalance } : {}),
  }

  const hasValue =
    point.paystackNgn != null ||
    point.stripeUsd != null ||
    point.stripeNgn != null ||
    point.vtpassNgn != null
  if (!hasValue) return

  const prev = await readHistory()
  const last = prev[prev.length - 1]
  if (
    last &&
    last.paystackNgn === point.paystackNgn &&
    last.stripeUsd === point.stripeUsd &&
    last.stripeNgn === point.stripeNgn &&
    last.vtpassNgn === point.vtpassNgn
  ) {
    return
  }

  const points = [...prev, point].slice(-MAX_POINTS)
  const existing = await prisma.moneyTransferConfig.findFirst()
  const meta = ((existing?.metadata as Record<string, unknown>) || {}) as Record<
    string,
    unknown
  >
  meta.treasuryHistory = { points }

  if (existing) {
    await prisma.moneyTransferConfig.update({
      where: { id: existing.id },
      data: { metadata: meta },
    })
  } else {
    await prisma.moneyTransferConfig.create({ data: { metadata: meta } })
  }
}
