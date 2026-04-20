import { prisma } from "@/lib/prisma"
import { calculateRating } from "@/lib/calculateRating"

export type PharmacyReviewStats = ReturnType<typeof calculateRating>

/**
 * Storefront reviews for a pharmacy: explicit `review.pharmacyId` or PHARMACY order tied to this pharmacy.
 */
export async function getPharmacyReviewStatsFromPrisma(pharmacyId: string): Promise<PharmacyReviewStats> {
  const rows = await prisma.review.findMany({
    where: {
      OR: [
        { pharmacyId },
        {
          order: {
            module: "PHARMACY",
            pharmacyId,
          },
        },
      ],
    },
    select: { rating: true },
  })
  return calculateRating(rows.map((r) => r.rating))
}

/**
 * Batch stats for many pharmacies (single query + in-memory grouping).
 */
export async function getPharmacyReviewStatsBatch(
  pharmacyIds: string[]
): Promise<Map<string, PharmacyReviewStats>> {
  const unique = [...new Set(pharmacyIds)].filter(Boolean)
  const empty = (): PharmacyReviewStats => ({
    averageRating: 0,
    roundedRating: 0,
    totalReviews: 0,
  })
  const out = new Map<string, PharmacyReviewStats>()
  for (const id of unique) {
    out.set(id, empty())
  }
  if (unique.length === 0) return out

  const rows = await prisma.review.findMany({
    where: {
      OR: [
        { pharmacyId: { in: unique } },
        {
          order: {
            module: "PHARMACY",
            pharmacyId: { in: unique },
          },
        },
      ],
    },
    select: {
      rating: true,
      pharmacyId: true,
      order: { select: { pharmacyId: true } },
    },
  })

  const buckets = new Map<string, number[]>()
  for (const id of unique) {
    buckets.set(id, [])
  }
  for (const r of rows) {
    const key = r.pharmacyId ?? r.order?.pharmacyId ?? null
    if (!key || !buckets.has(key)) continue
    buckets.get(key)!.push(r.rating)
  }
  for (const id of unique) {
    out.set(id, calculateRating(buckets.get(id) || []))
  }
  return out
}
