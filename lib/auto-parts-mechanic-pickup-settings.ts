import { prisma } from "@/lib/prisma"

/**
 * Price per km for AUTO_PARTS mechanic pickup route (vendor → customer), configurable in
 * /admin/modules/mechanic. Row is upserted on first read.
 */
export async function getAutoPartsMechanicPickupPricePerKm(): Promise<number> {
  const row = await prisma.autoPartsMechanicPickupSettings.upsert({
    where: { id: 1 },
    create: { id: 1, pricePerKm: 2 },
    update: {},
  })
  const v = Number(row.pricePerKm)
  return Number.isFinite(v) && v > 0 ? v : 2
}
