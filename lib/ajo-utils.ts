import { AjoContributionFrequency } from "@prisma/client"
import { randomBytes } from "crypto"

export function generateAjoInviteCode(): string {
  return randomBytes(6).toString("hex").toUpperCase()
}

export function addContributionInterval(date: Date, frequency: AjoContributionFrequency): Date {
  const d = new Date(date.getTime())
  switch (frequency) {
    case "DAILY":
      d.setDate(d.getDate() + 1)
      return d
    case "WEEKLY":
      d.setDate(d.getDate() + 7)
      return d
    case "MONTHLY":
      d.setMonth(d.getMonth() + 1)
      return d
    default:
      return d
  }
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export type AjoGroupRules = {
  gracePeriodHours?: number
  collectionOrderStrategy?: "MANUAL" | "RANDOM" | "FIRST_JOIN"
  lateFeePercent?: number
  requirePinForContribute?: boolean
}

export function parseAjoGroupRules(rules: unknown): AjoGroupRules {
  if (!rules || typeof rules !== "object") {
    return {
      gracePeriodHours: 24,
      collectionOrderStrategy: "FIRST_JOIN",
      lateFeePercent: 0,
      requirePinForContribute: true,
    }
  }
  const r = rules as Record<string, unknown>
  const grace =
    typeof r.gracePeriodHours === "number" && r.gracePeriodHours >= 0
      ? Math.min(168, Math.floor(r.gracePeriodHours))
      : 24
  const lateFee =
    typeof r.lateFeePercent === "number" && r.lateFeePercent >= 0
      ? Math.min(25, r.lateFeePercent)
      : 0
  return {
    gracePeriodHours: grace,
    collectionOrderStrategy:
      r.collectionOrderStrategy === "MANUAL" ||
      r.collectionOrderStrategy === "RANDOM" ||
      r.collectionOrderStrategy === "FIRST_JOIN"
        ? r.collectionOrderStrategy
        : "FIRST_JOIN",
    lateFeePercent: lateFee,
    requirePinForContribute: r.requirePinForContribute !== false,
  }
}

export function computeAjoPayoutDate(args: {
  startedAt: Date | null
  frequency: AjoContributionFrequency
  slotPosition: number
  totalCycles: number
}): string | null {
  if (!args.startedAt || args.slotPosition < 0) return null
  if (args.totalCycles > 0 && args.slotPosition >= args.totalCycles) return null
  let d = new Date(args.startedAt.getTime())
  // Cycle 1 due = started + 1 interval; recipient of slot N gets payout after cycle N collection due
  for (let i = 0; i <= args.slotPosition; i++) {
    d = addContributionInterval(d, args.frequency)
  }
  return d.toISOString()
}

export function getContributionGraceInfo(args: {
  dueDate: Date
  status: string
  gracePeriodHours: number
  now?: Date
}): { graceEndsAt: string | null; graceRemainingMs: number | null; isInGrace: boolean } {
  if (args.status === "PAID" || args.status === "WAIVED") {
    return { graceEndsAt: null, graceRemainingMs: null, isInGrace: false }
  }
  const now = args.now ?? new Date()
  const graceEnds = new Date(args.dueDate.getTime() + args.gracePeriodHours * 60 * 60 * 1000)
  const remaining = graceEnds.getTime() - now.getTime()
  const pastDue = now.getTime() >= args.dueDate.getTime()
  return {
    graceEndsAt: graceEnds.toISOString(),
    graceRemainingMs: remaining > 0 ? remaining : 0,
    isInGrace: pastDue && remaining > 0 && (args.status === "FAILED" || args.status === "LATE" || args.status === "PENDING"),
  }
}

export function parseCollectionOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === "string" && id.length > 0)
}
