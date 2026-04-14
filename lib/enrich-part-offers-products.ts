import { prisma } from "@/lib/prisma"

export type LinkedProductSummary = {
  id: string
  name: string
  sku: string | null
  images: unknown
  price: number
}

export async function enrichOffersWithLinkedProducts<
  T extends { id: string; partId: string | null },
>(offers: T[]): Promise<(T & { linkedProduct: LinkedProductSummary | null })[]> {
  if (!offers.length) {
    return offers.map((o) => ({ ...o, linkedProduct: null }))
  }
  const partIds = [...new Set(offers.map((o) => o.partId).filter(Boolean) as string[])]
  if (partIds.length === 0) {
    return offers.map((o) => ({ ...o, linkedProduct: null }))
  }
  const products = await prisma.product.findMany({
    where: { id: { in: partIds } },
    select: { id: true, name: true, sku: true, images: true, price: true },
  })
  const map = Object.fromEntries(products.map((p) => [p.id, p]))
  return offers.map((o) => ({
    ...o,
    linkedProduct: o.partId ? (map[o.partId] as LinkedProductSummary) ?? null : null,
  }))
}
