import { prisma } from "@/lib/prisma"

function collectRawStrings(raw: unknown): string[] {
  const out: string[] = []
  if (raw == null) return out
  let arr: unknown[] = []
  if (Array.isArray(raw)) arr = raw
  else if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw)
      arr = Array.isArray(p) ? p : []
    } catch {
      arr = [raw]
    }
  }
  for (const x of arr) {
    if (typeof x === "string") out.push(x.trim())
    else if (x && typeof x === "object" && "name" in x && typeof (x as any).name === "string") {
      out.push((x as any).name.trim())
    }
  }
  return out.filter(Boolean)
}

/** Resolves template IDs to category names so they match GroceryProduct.category strings. */
export async function resolveAllowedGroceryCategoryNames(
  store: { productCategories?: unknown; storeType?: unknown }
): Promise<string[]> {
  const raw = [
    ...new Set([...collectRawStrings(store.productCategories), ...collectRawStrings(store.storeType)]),
  ]
  const labels = new Set<string>()
  if (raw.length === 0) return []

  const cats = await prisma.category.findMany({
    where: { id: { in: raw }, module: "GROCERY" },
    select: { id: true, name: true },
  })
  const idToName = new Map(cats.map((c) => [c.id, c.name]))

  for (const item of raw) {
    const name = idToName.get(item)
    if (name) labels.add(name.trim().toLowerCase())
    else labels.add(item.trim().toLowerCase())
  }
  return [...labels]
}

export async function isGroceryCategoryAllowed(
  store: { productCategories?: unknown; storeType?: unknown },
  categoryName: string
): Promise<boolean> {
  const allowed = await resolveAllowedGroceryCategoryNames(store)
  if (allowed.length === 0) return false
  return allowed.includes(categoryName.trim().toLowerCase())
}
