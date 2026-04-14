import { prisma } from "@/lib/prisma"

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

export type NearbyGroceryRow = {
  id: string
  name: string
  category: string
  price: number
  unit: string
  storeId: string
  storeName: string
  distanceKm: number
}

export type NearbyFoodRow = {
  id: string
  name: string
  description: string | null
  price: number
  restaurantId: string
  restaurantName: string
  distanceKm: number
}

export async function getNearbyGroceryCatalog(
  latitude: number,
  longitude: number,
  maxKm: number,
  maxItems: number
): Promise<NearbyGroceryRow[]> {
  const stores = await prisma.groceryStore.findMany({
    where: { isOpen: true, latitude: { not: null }, longitude: { not: null } },
    select: {
      id: true,
      storeName: true,
      latitude: true,
      longitude: true,
    },
  })

  const nearStoreIds: { id: string; name: string; d: number }[] = []
  for (const s of stores) {
    if (s.latitude == null || s.longitude == null) continue
    const d = distanceKm(latitude, longitude, s.latitude, s.longitude)
    if (d <= maxKm) nearStoreIds.push({ id: s.id, name: s.storeName, d })
  }
  if (nearStoreIds.length === 0) return []

  const ids = nearStoreIds.map((x) => x.id)
  const products = await prisma.groceryProduct.findMany({
    where: { storeId: { in: ids }, isActive: true, stock: { gt: 0 } },
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      unit: true,
      storeId: true,
    },
    take: Math.max(maxItems * 3, 400),
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
  })

  const distByStore = new Map(nearStoreIds.map((x) => [x.id, x]))
  const rows: NearbyGroceryRow[] = []
  for (const p of products) {
    const st = distByStore.get(p.storeId)
    if (!st) continue
    rows.push({
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      unit: p.unit,
      storeId: p.storeId,
      storeName: st.name,
      distanceKm: st.d,
    })
  }
  rows.sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name))
  return rows.slice(0, maxItems)
}

export async function getNearbyFoodCatalog(
  latitude: number,
  longitude: number,
  maxKm: number,
  maxItems: number
): Promise<NearbyFoodRow[]> {
  const rests = await prisma.restaurant.findMany({
    where: { isOpen: true, latitude: { not: null }, longitude: { not: null } },
    select: { id: true, name: true, latitude: true, longitude: true },
  })

  const near: { id: string; name: string; d: number }[] = []
  for (const r of rests) {
    if (r.latitude == null || r.longitude == null) continue
    const d = distanceKm(latitude, longitude, r.latitude, r.longitude)
    if (d <= maxKm) near.push({ id: r.id, name: r.name, d })
  }
  if (near.length === 0) return []

  const ids = near.map((x) => x.id)
  const items = await prisma.menuItem.findMany({
    where: { restaurantId: { in: ids }, isAvailable: true },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      restaurantId: true,
    },
    take: Math.max(maxItems * 3, 400),
    orderBy: [{ isFeatured: "desc" }, { isPopular: "desc" }],
  })

  const distMap = new Map(near.map((x) => [x.id, x]))
  const rows: NearbyFoodRow[] = []
  for (const m of items) {
    const r = distMap.get(m.restaurantId)
    if (!r) continue
    rows.push({
      id: m.id,
      name: m.name,
      description: m.description,
      price: m.price,
      restaurantId: m.restaurantId,
      restaurantName: r.name,
      distanceKm: r.d,
    })
  }
  rows.sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name))
  return rows.slice(0, maxItems)
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function matchGroceryLineToProduct(
  line: string,
  catalog: NearbyGroceryRow[]
): NearbyGroceryRow | null {
  const n = norm(line)
  if (!n) return null
  let best: NearbyGroceryRow | null = null
  let score = 0
  for (const p of catalog) {
    const pn = norm(p.name)
    if (pn === n) return p
    if (pn.includes(n) || n.includes(pn)) {
      const s = Math.min(pn.length, n.length) / Math.max(pn.length, n.length)
      if (s > score) {
        score = s
        best = p
      }
    }
  }
  if (best && score >= 0.35) return best
  // token overlap
  const nt = new Set(n.split(" ").filter((t) => t.length > 2))
  for (const p of catalog) {
    const pt = new Set(norm(p.name).split(" ").filter((t) => t.length > 2))
    let overlap = 0
    for (const t of nt) if (pt.has(t)) overlap++
    if (overlap > 0 && overlap >= Math.min(1, nt.size)) {
      const s = overlap / Math.max(nt.size, pt.size)
      if (s > score) {
        score = s
        best = p
      }
    }
  }
  return best && score >= 0.25 ? best : null
}

export function matchFoodLineToItem(line: string, catalog: NearbyFoodRow[]): NearbyFoodRow | null {
  const n = norm(line)
  if (!n) return null
  let best: NearbyFoodRow | null = null
  let score = 0
  for (const p of catalog) {
    const pn = norm(p.name)
    if (pn === n) return p
    if (pn.includes(n) || n.includes(pn)) {
      const s = Math.min(pn.length, n.length) / Math.max(pn.length, n.length)
      if (s > score) {
        score = s
        best = p
      }
    }
  }
  if (best && score >= 0.35) return best
  const nt = new Set(n.split(" ").filter((t) => t.length > 2))
  for (const p of catalog) {
    const pt = new Set(norm(p.name).split(" ").filter((t) => t.length > 2))
    let overlap = 0
    for (const t of nt) if (pt.has(t)) overlap++
    if (overlap > 0) {
      const s = overlap / Math.max(nt.size, pt.size)
      if (s > score) {
        score = s
        best = p
      }
    }
  }
  return best && score >= 0.2 ? best : null
}
