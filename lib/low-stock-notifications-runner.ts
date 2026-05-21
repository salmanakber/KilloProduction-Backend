import { prisma } from "@/lib/prisma"
import { NotificationBridge } from "@/lib/notification-bridge"

const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD || 10)
const DEDUPE_MS = 24 * 60 * 60 * 1000

export type LowStockRunResult = {
  checked: number
  notificationsSent: number
  byModule: Record<string, number>
}

type LowStockItem = {
  vendorUserId: string
  module: string
  productName: string
  quantity: number
  dedupeKey: string
  screen: string
  productId: string
}

async function recentlyNotified(vendorUserId: string, dedupeKey: string): Promise<boolean> {
  const since = new Date(Date.now() - DEDUPE_MS)
  const row = await prisma.notification.findFirst({
    where: {
      userId: vendorUserId,
      createdAt: { gte: since },
      data: { path: ["lowStockDedupeKey"], equals: dedupeKey },
    },
    select: { id: true },
  })
  return !!row
}

async function notifyLowStock(item: LowStockItem): Promise<boolean> {
  if (await recentlyNotified(item.vendorUserId, item.dedupeKey)) return false

  await NotificationBridge.sendNotification({
    userId: item.vendorUserId,
    title: "⚠️ Low Stock Alert",
    message: `"${item.productName}" is down to ${item.quantity} units. Restock soon to avoid missed sales.`,
    type: "SYSTEM" as any,
    module: item.module as any,
    data: {
      actionType: "navigate",
      screen: item.screen,
      params: [{ name: "productId", value: item.productId }],
      lowStockDedupeKey: item.dedupeKey,
      productId: item.productId,
      quantity: item.quantity,
    },
  })
  return true
}

/**
 * Scan vendor inventory tables and notify sellers when quantity falls below threshold.
 */
export async function runLowStockNotificationsJob(): Promise<LowStockRunResult> {
  const result: LowStockRunResult = {
    checked: 0,
    notificationsSent: 0,
    byModule: {},
  }

  const items: LowStockItem[] = []

  const [products, pharmacyMedicines, groceryProducts, wholesalerProducts] = await Promise.all([
    prisma.product.findMany({
      where: {
        isActive: true,
        stockQuantity: { lt: LOW_STOCK_THRESHOLD, gte: 0 },
      },
      select: { id: true, name: true, stockQuantity: true, vendorId: true, type: true },
      take: 500,
    }),
    prisma.pharmacyMedicine.findMany({
      where: {
        isAvailable: true,
        stock: { lt: LOW_STOCK_THRESHOLD, gte: 0 },
      },
      select: {
        id: true,
        stock: true,
        pharmacy: { select: { userId: true } },
        centralMedicine: { select: { name: true } },
      },
      take: 500,
    }),
    prisma.groceryProduct.findMany({
      where: {
        isActive: true,
        stock: { lt: LOW_STOCK_THRESHOLD, gte: 0 },
      },
      select: {
        id: true,
        name: true,
        stock: true,
        store: { select: { userId: true } },
      },
      take: 500,
    }),
    prisma.wholesalerProduct.findMany({
      where: {
        isActive: true,
        stock: { lt: LOW_STOCK_THRESHOLD, gte: 0 },
      },
      select: {
        id: true,
        name: true,
        stock: true,
        wholesaler: { select: { userId: true } },
      },
      take: 500,
    }),
  ])

  for (const p of products) {
    const module =
      p.type === "AUTO_PART"
        ? "AUTO_PARTS"
        : p.type === "GROCERY_PRODUCT"
          ? "GROCERY"
          : p.type === "MEDICINE"
            ? "PHARMACY"
            : "GENERAL"
    items.push({
      vendorUserId: p.vendorId,
      module,
      productName: p.name,
      quantity: p.stockQuantity,
      dedupeKey: `product:${p.id}`,
      screen: p.type === "AUTO_PART" ? "AutoPartsVendorProducts" : "GroceryVendorProducts",
      productId: p.id,
    })
  }

  for (const m of pharmacyMedicines) {
    const name = m.centralMedicine?.name || "Medicine"
    items.push({
      vendorUserId: m.pharmacy.userId,
      module: "PHARMACY",
      productName: name,
      quantity: m.stock,
      dedupeKey: `pharmacy-medicine:${m.id}`,
      screen: "AddMedicine",
      productId: m.id,
    })
  }

  for (const g of groceryProducts) {
    items.push({
      vendorUserId: g.store.userId,
      module: "GROCERY",
      productName: g.name,
      quantity: g.stock,
      dedupeKey: `grocery-product:${g.id}`,
      screen: "GroceryVendorProducts",
      productId: g.id,
    })
  }

  for (const w of wholesalerProducts) {
    items.push({
      vendorUserId: w.wholesaler.userId,
      module: "PHARMACY",
      productName: w.name,
      quantity: w.stock,
      dedupeKey: `wholesaler-product:${w.id}`,
      screen: "WholesalerProducts",
      productId: w.id,
    })
  }

  result.checked = items.length

  for (const item of items) {
    try {
      if (await notifyLowStock(item)) {
        result.notificationsSent++
        result.byModule[item.module] = (result.byModule[item.module] || 0) + 1
      }
    } catch (err) {
      console.error(`[low-stock] notify failed ${item.dedupeKey}:`, err)
    }
  }

  return result
}
