export type TreasurySnapshotPoint = {
  at: string
  paystackNgn?: number
  stripeUsd?: number
  stripeNgn?: number
  vtpassNgn?: number
}

export function treasuryTrendPercent(
  points: TreasurySnapshotPoint[],
  key: keyof Omit<TreasurySnapshotPoint, "at">,
): number | null {
  const values = points
    .map((p) => p[key])
    .filter((v): v is number => typeof v === "number" && !Number.isNaN(v))
  if (values.length < 2) return null
  const prev = values[values.length - 2]
  const curr = values[values.length - 1]
  if (prev === 0) return curr > 0 ? 100 : 0
  return ((curr - prev) / Math.abs(prev)) * 100
}
