/**
 * Upsert PROPERTY module commission rows (platform fee + vendor commission).
 * Run: npx tsx scripts/seed-property-commission.ts
 */
import { PrismaClient, CommissionType, Module } from "@prisma/client"

const prisma = new PrismaClient()

const PROPERTY_SETTINGS = [
  {
    module: Module.PROPERTY,
    commissionType: CommissionType.PLATFORM_FEE,
    rate: 5,
    minAmount: 50,
    maxAmount: 5000,
    description: "Customer platform fee for property bookings",
    isActive: true,
  },
  {
    module: Module.PROPERTY,
    commissionType: CommissionType.VENDOR_COMMISSION,
    rate: 10,
    minAmount: 100,
    maxAmount: 50000,
    description: "Host commission on completed property stays",
    isActive: true,
  },
]

async function main() {
  for (const setting of PROPERTY_SETTINGS) {
    const existing = await prisma.commissionSetting.findFirst({
      where: {
        module: setting.module,
        commissionType: setting.commissionType,
      },
    })
    if (existing) {
      await prisma.commissionSetting.update({
        where: { id: existing.id },
        data: setting,
      })
      console.log(`Updated ${setting.commissionType} for PROPERTY`)
    } else {
      await prisma.commissionSetting.create({ data: setting })
      console.log(`Created ${setting.commissionType} for PROPERTY`)
    }
  }
  console.log("PROPERTY commission settings ready.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
