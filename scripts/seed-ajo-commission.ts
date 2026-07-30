/**
 * Additive seed: Ajo platform fee for Kilo Money.
 * Run: npx tsx scripts/seed-ajo-commission.ts
 */
import "dotenv/config"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const setting = await prisma.commissionSetting.upsert({
    where: {
      module_commissionType: {
        module: "MONEY_TRANSFER",
        commissionType: "AJO_PLATFORM_FEE",
      },
    },
    create: {
      module: "MONEY_TRANSFER",
      commissionType: "AJO_PLATFORM_FEE",
      rate: 1.5,
      minAmount: 10,
      maxAmount: 500,
      description: "Platform fee on each Ajo/Esusu contribution",
      isActive: true,
    },
    update: {},
  })
  console.log("Ajo commission setting ready:", setting.id, `${setting.rate}%`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
