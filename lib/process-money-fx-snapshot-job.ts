import { prisma } from "@/lib/prisma"
import { getMoneyTransferFxRate, recordFxSnapshotWhenChanged } from "@/lib/money-fx-rate"

/**
 * Currency pairs to poll for snapshots.
 * Override with env e.g. `MONEY_FX_SNAPSHOT_PAIRS=USD:NGN,GBP:NGN,EUR:NGN,USD:EUR`
 */
export async function getFxSnapshotWatchPairs(): Promise<{ from: string; to: string }[]> {
  const raw = process.env.MONEY_FX_SNAPSHOT_PAIRS?.trim()
  if (raw) {
    const pairs: { from: string; to: string }[] = []
    for (const part of raw.split(",")) {
      const [a, b] = part.split(":").map((x) => x.trim().toUpperCase())
      if (a && b && a !== b) pairs.push({ from: a, to: b })
    }
    return dedupePairs(pairs)
  }

  const config = await prisma.moneyTransferConfig.findFirst()
  const currencies = config?.supportedCurrencies?.length
    ? [...config.supportedCurrencies]
    : ["USD", "NGN", "GBP", "EUR"]

  const set = new Set(currencies.map((c) => c.toUpperCase()))
  const majors = [...set].filter(Boolean)

  const pairs: { from: string; to: string }[] = []

  if (set.has("NGN")) {
    for (const f of majors) {
      if (f !== "NGN") pairs.push({ from: f, to: "NGN" })
    }
  }

  pairs.push(
    { from: "USD", to: "EUR" },
    { from: "EUR", to: "USD" },
    { from: "GBP", to: "EUR" },
    { from: "EUR", to: "GBP" }
  )

  const filtered = dedupePairs(pairs.filter((p) => set.has(p.from) && set.has(p.to)))
  if (filtered.length > 0) return filtered

  return [
    { from: "USD", to: "NGN" },
    { from: "GBP", to: "NGN" },
    { from: "EUR", to: "NGN" },
  ]
}

function dedupePairs(pairs: { from: string; to: string }[]) {
  const seen = new Set<string>()
  const out: { from: string; to: string }[] = []
  for (const p of pairs) {
    const k = `${p.from}-${p.to}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ from: p.from.toUpperCase(), to: p.to.toUpperCase() })
  }
  return out
}

export async function runMoneyFxSnapshotTick(): Promise<{
  pairs: number
  inserted: number
  unchanged: number
  errors: number
}> {
  const watch = await getFxSnapshotWatchPairs()
  let inserted = 0
  let unchanged = 0
  let errors = 0

  for (const { from, to } of watch) {
    try {
      const rate = await getMoneyTransferFxRate(from, to)
      if (rate == null) {
        errors += 1
        continue
      }
      const result = await recordFxSnapshotWhenChanged(from, to, rate)
      if (result === "inserted") inserted += 1
      else unchanged += 1
    } catch (e) {
      console.error(`[money-fx-snapshot] ${from}/${to}`, e)
      errors += 1
    }
  }

  return { pairs: watch.length, inserted, unchanged, errors }
}
