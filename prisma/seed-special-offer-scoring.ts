import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const SEED_TAG = "[special-offer-scoring-seed]"
const ORDER_PREFIX = "SOSCORE"
const MAX_VENDORS_PER_MODULE = 5
const ORDER_COUNTS = [24, 18, 12, 7, 3]
const REVIEW_COUNTS = [6, 5, 4, 3, 2]
const BASE_RATINGS = [5, 4, 4, 3, 3]

type ModuleKey = "PHARMACY" | "GROCERY" | "FOOD" | "AUTO_PARTS"

type SeedCustomer = {
  id: string
  name: string | null
  email: string | null
}

type SeedVendor = {
  storeId: string
  userId: string
  name: string
}

function pickCount(pattern: number[], index: number) {
  return pattern[Math.min(index, pattern.length - 1)]
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function buildOrderNumber(module: ModuleKey, vendorIndex: number, orderIndex: number) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  return `${ORDER_PREFIX}-${module.slice(0, 3)}-${vendorIndex + 1}-${orderIndex + 1}-${stamp}`
}

async function ensureSeedCustomers(minimum: number): Promise<SeedCustomer[]> {
  const existing = await prisma.user.findMany({
    where: { role: "CUSTOMER" as any, isActive: true },
    select: { id: true, name: true, email: true },
    take: minimum,
    orderBy: { createdAt: "asc" },
  })

  const customers: SeedCustomer[] = [...existing]

  for (let i = customers.length; i < minimum; i += 1) {
    const email = `special-offer-seed-customer-${i + 1}@example.com`
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name: `Special Offer Seed Customer ${i + 1}`,
        role: "CUSTOMER" as any,
        isActive: true,
        isVerified: true,
      },
      create: {
        email,
        name: `Special Offer Seed Customer ${i + 1}`,
        role: "CUSTOMER" as any,
        isActive: true,
        isVerified: true,
      },
      select: { id: true, name: true, email: true },
    })
    customers.push(user)
  }

  return customers
}

async function getVendors(module: ModuleKey): Promise<SeedVendor[]> {
  if (module === "PHARMACY") {
    const rows = await prisma.pharmacy.findMany({
      where: { status: "APPROVED" },
      select: { id: true, userId: true, pharmacyName: true },
      take: MAX_VENDORS_PER_MODULE,
      orderBy: { createdAt: "asc" },
    })
    return rows.map((row) => ({ storeId: row.id, userId: row.userId, name: row.pharmacyName }))
  }

  if (module === "GROCERY") {
    const rows = await prisma.groceryStore.findMany({
      where: { isOpen: true },
      select: { id: true, userId: true, storeName: true },
      take: MAX_VENDORS_PER_MODULE,
      orderBy: { createdAt: "asc" },
    })
    return rows.map((row) => ({ storeId: row.id, userId: row.userId, name: row.storeName }))
  }

  if (module === "FOOD") {
    const rows = await prisma.restaurant.findMany({
      where: { isOpen: true },
      select: { id: true, userId: true, name: true },
      take: MAX_VENDORS_PER_MODULE,
      orderBy: { createdAt: "asc" },
    })
    return rows.map((row) => ({ storeId: row.id, userId: row.userId, name: row.name }))
  }

  const rows = await prisma.autoPartsStore.findMany({
    where: { isActive: true },
    select: { id: true, userId: true, storeName: true },
    take: MAX_VENDORS_PER_MODULE,
    orderBy: { createdAt: "asc" },
  })
  return rows.map((row) => ({ storeId: row.id, userId: row.userId, name: row.storeName }))
}

async function cleanupSeedData() {
  await prisma.review.deleteMany({
    where: {
      OR: [
        { title: { contains: SEED_TAG } },
        { comment: { contains: SEED_TAG } },
      ],
    },
  })

  await prisma.order.deleteMany({
    where: {
      OR: [
        { orderNumber: { startsWith: ORDER_PREFIX } },
        { notes: { contains: SEED_TAG } },
      ],
    },
  })
}

async function syncVendorStats(module: ModuleKey, vendor: SeedVendor) {
  const [orderCount, ratingAgg] = await Promise.all([
    prisma.order.count({
      where: {
        vendorId: vendor.userId,
        module: module as any,
        status: "DELIVERED" as any,
      },
    }),
    prisma.review.aggregate({
      where: {
        targetId: vendor.userId,
        targetType: "VENDOR" as any,
      },
      _avg: { rating: true },
    }),
  ])

  const data: Record<string, any> = { totalOrders: orderCount }
  if (ratingAgg._avg.rating != null) {
    data.rating = Number(ratingAgg._avg.rating)
  }

  if (module === "PHARMACY") {
    await prisma.pharmacy.update({ where: { id: vendor.storeId }, data })
    return
  }

  if (module === "GROCERY") {
    await prisma.groceryStore.update({ where: { id: vendor.storeId }, data })
    return
  }

  if (module === "FOOD") {
    await prisma.restaurant.update({ where: { id: vendor.storeId }, data })
    return
  }

  await prisma.autoPartsStore.update({ where: { id: vendor.storeId }, data })
}

async function seedModule(module: ModuleKey, customers: SeedCustomer[]) {
  const vendors = await getVendors(module)

  if (vendors.length === 0) {
    console.log(`- ${module}: no vendors found, skipped`)
    return []
  }

  const summary: Array<{ module: ModuleKey; vendorName: string; orders: number; reviews: number }> = []
  let customerCursor = 0

  for (let vendorIndex = 0; vendorIndex < vendors.length; vendorIndex += 1) {
    const vendor = vendors[vendorIndex]
    const orderCount = pickCount(ORDER_COUNTS, vendorIndex)
    const reviewCount = pickCount(REVIEW_COUNTS, vendorIndex)
    const baseRating = pickCount(BASE_RATINGS, vendorIndex)

    for (let orderIndex = 0; orderIndex < orderCount; orderIndex += 1) {
      const customer = customers[(customerCursor + orderIndex) % customers.length]
      const createdAt = daysAgo((orderIndex % 28) + 1)
      const subtotal = 1800 + vendorIndex * 600 + orderIndex * 125
      const deliveryFee = module === "FOOD" || module === "GROCERY" ? 250 : 100
      const total = subtotal + deliveryFee

      await prisma.order.create({
        data: {
          orderNumber: buildOrderNumber(module, vendorIndex, orderIndex),
          customerId: customer.id,
          vendorId: vendor.userId,
          module: module as any,
          status: "DELIVERED" as any,
          subtotal,
          deliveryFee,
          serviceFee: 0,
          tax: 0,
          discount: 0,
          total,
          paymentStatus: "PAID" as any,
          paymentMethod: "CARD" as any,
          notes: `${SEED_TAG} ${module} ${vendor.name}`,
          createdAt,
          updatedAt: createdAt,
        } as any,
      })
    }

    for (let reviewIndex = 0; reviewIndex < reviewCount; reviewIndex += 1) {
      const customer = customers[(customerCursor + orderCount + reviewIndex) % customers.length]
      const rating = Math.max(1, Math.min(5, baseRating - (reviewIndex > 2 ? 1 : 0)))
      const createdAt = daysAgo((reviewIndex % 20) + 2)

      await prisma.review.create({
        data: {
          userId: customer.id,
          targetId: vendor.userId,
          targetType: "VENDOR" as any,
          rating,
          title: `${SEED_TAG} ${module} review`,
          comment: `${SEED_TAG} ${vendor.name} review ${reviewIndex + 1}`,
          createdAt,
          updatedAt: createdAt,
        } as any,
      })
    }

    await syncVendorStats(module, vendor)
    customerCursor += orderCount + reviewCount

    summary.push({
      module,
      vendorName: vendor.name,
      orders: orderCount,
      reviews: reviewCount,
    })
  }

  return summary
}

async function main() {
  console.log("🌱 Seeding vendor orders and reviews for special-offer scoring...")
  console.log(`🧹 Removing previous seed data tagged with ${SEED_TAG}`)

  await cleanupSeedData()

  const customers = await ensureSeedCustomers(24)
  console.log(`👥 Using ${customers.length} customers for seeded orders/reviews`)

  const modules: ModuleKey[] = ["PHARMACY", "GROCERY", "FOOD", "AUTO_PARTS"]
  const results = []

  for (const module of modules) {
    const summary = await seedModule(module, customers)
    results.push(...summary)
  }

  if (results.length === 0) {
    console.log("⚠️ No vendor data was seeded because no eligible vendors were found")
    return
  }

  console.log("✅ Special-offer scoring seed completed")
  for (const row of results) {
    console.log(`- ${row.module}: ${row.vendorName} -> ${row.orders} delivered orders, ${row.reviews} reviews`)
  }
}

main()
  .catch((error) => {
    console.error("❌ Failed to seed special-offer scoring data:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
