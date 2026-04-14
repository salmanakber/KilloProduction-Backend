import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"

const PROMO_KINDS = ["MYSTERY", "FLASH"] as const
const STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"])

type ModuleFilter = "FOOD" | "GROCERY" | "all"
type OfferModule = "FOOD" | "GROCERY"

type RestaurantOfferRow = Prisma.RestaurantOfferGetPayload<{
  include: {
    restaurant: { select: { id: true; name: true; logo: true; coverImage: true } }
  }
}>

type GroceryOfferRow = Prisma.GroceryOfferGetPayload<{
  include: {
    store: { select: { id: true; storeName: true; logo: true; coverImage: true } }
  }
}>

type UnifiedOffer = {
  id: string
  module: OfferModule
  vendorName: string
  vendorLogo: string | null
  title: string
  description: string | null
  promoKind: string | null
  mysteryTeaser: string | null
  discountType: string
  discountValue: number
  itemName: string | null
  itemPrice: number | null
  images: Prisma.JsonValue | null
  approvalStatus: string | null
  rejectionNote: string | null
  startsAt: string
  expiresAt: string
  createdAt: string
}

function mapRestaurantOffer(o: RestaurantOfferRow): UnifiedOffer {
  return {
    id: o.id,
    module: "FOOD",
    vendorName: o.restaurant.name,
    vendorLogo: o.restaurant.logo ?? null,
    title: o.title,
    description: o.description ?? null,
    promoKind: o.promoKind ?? null,
    mysteryTeaser: o.mysteryTeaser ?? null,
    discountType: o.discountType,
    discountValue: o.discountValue,
    itemName: o.itemName ?? null,
    itemPrice: o.itemPrice ?? null,
    images: o.images ?? null,
    approvalStatus: o.approvalStatus ?? null,
    rejectionNote: o.rejectionNote ?? null,
    startsAt: o.startsAt.toISOString(),
    expiresAt: o.expiresAt.toISOString(),
    createdAt: o.createdAt.toISOString(),
  }
}

function mapGroceryOffer(o: GroceryOfferRow): UnifiedOffer {
  return {
    id: o.id,
    module: "GROCERY",
    vendorName: o.store.storeName,
    vendorLogo: o.store.logo ?? null,
    title: o.title,
    description: o.description ?? null,
    promoKind: o.promoKind ?? null,
    mysteryTeaser: o.mysteryTeaser ?? null,
    discountType: o.discountType,
    discountValue: o.discountValue,
    itemName: o.itemName ?? null,
    itemPrice: o.itemPrice ?? null,
    images: o.images ?? null,
    approvalStatus: o.approvalStatus ?? null,
    rejectionNote: o.rejectionNote ?? null,
    startsAt: o.startsAt.toISOString(),
    expiresAt: o.expiresAt.toISOString(),
    createdAt: o.createdAt.toISOString(),
  }
}

async function requireAdmin(request: NextRequest) {
  const session = await authenticateRequest(request)
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  const user = await prisma.user.findUnique({ where: { id: session.id } })
  if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { session, user }
}

const offerListWhere = (status: string) =>
  ({
    promoKind: { in: [...PROMO_KINDS] },
    approvalStatus: status,
  }) satisfies Prisma.RestaurantOfferWhereInput

async function fetchOrderedOfferKeys(
  moduleFilter: ModuleFilter,
  status: string,
  limit: number,
): Promise<{ id: string; module: OfferModule }[]> {
  if (moduleFilter === "FOOD") {
    return prisma.$queryRaw<{ id: string; module: OfferModule }[]>(Prisma.sql`
      SELECT id, 'FOOD'::text AS module
      FROM "restaurant_offers"
      WHERE "promoKind" IN ('MYSTERY', 'FLASH') AND "approvalStatus" = ${status}
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    `)
  }
  if (moduleFilter === "GROCERY") {
    return prisma.$queryRaw<{ id: string; module: OfferModule }[]>(Prisma.sql`
      SELECT id, 'GROCERY'::text AS module
      FROM "grocery_offers"
      WHERE "promoKind" IN ('MYSTERY', 'FLASH') AND "approvalStatus" = ${status}
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    `)
  }
  return prisma.$queryRaw<{ id: string; module: OfferModule }[]>(Prisma.sql`
    SELECT id, module FROM (
      SELECT id, 'FOOD'::text AS module, "createdAt"
      FROM "restaurant_offers"
      WHERE "promoKind" IN ('MYSTERY', 'FLASH') AND "approvalStatus" = ${status}
      UNION ALL
      SELECT id, 'GROCERY'::text AS module, "createdAt"
      FROM "grocery_offers"
      WHERE "promoKind" IN ('MYSTERY', 'FLASH') AND "approvalStatus" = ${status}
    ) sub
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `)
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ("error" in gate && gate.error) return gate.error

  try {
    const { searchParams } = new URL(request.url)
    const statusRaw = (searchParams.get("status") || "PENDING").toUpperCase()
    const status = STATUSES.has(statusRaw) ? statusRaw : "PENDING"

    const moduleRaw = (searchParams.get("module") || "all").toUpperCase()
    const moduleFilter: ModuleFilter =
      moduleRaw === "FOOD" || moduleRaw === "GROCERY" ? moduleRaw : "all"

    const limit = Math.min(200, Math.max(1, Number.parseInt(searchParams.get("limit") || "50", 10) || 50))

    const where = offerListWhere(status)

    const [keys, foodTotal, groceryTotal] = await Promise.all([
      fetchOrderedOfferKeys(moduleFilter, status, limit),
      moduleFilter !== "GROCERY" ? prisma.restaurantOffer.count({ where }) : Promise.resolve(0),
      moduleFilter !== "FOOD" ? prisma.groceryOffer.count({ where }) : Promise.resolve(0),
    ])

    const total = foodTotal + groceryTotal

    const foodIds = keys.filter((k) => k.module === "FOOD").map((k) => k.id)
    const groceryIds = keys.filter((k) => k.module === "GROCERY").map((k) => k.id)

    const [foodRows, groceryRows] = await Promise.all([
      foodIds.length
        ? prisma.restaurantOffer.findMany({
            where: { id: { in: foodIds } },
            include: {
              restaurant: { select: { id: true, name: true, logo: true, coverImage: true } },
            },
          })
        : [],
      groceryIds.length
        ? prisma.groceryOffer.findMany({
            where: { id: { in: groceryIds } },
            include: {
              store: { select: { id: true, storeName: true, logo: true, coverImage: true } },
            },
          })
        : [],
    ])

    const foodMap = new Map(foodRows.map((o) => [o.id, o]))
    const groceryMap = new Map(groceryRows.map((o) => [o.id, o]))

    const offers: UnifiedOffer[] = []
    for (const k of keys) {
      if (k.module === "FOOD") {
        const row = foodMap.get(k.id)
        if (row) offers.push(mapRestaurantOffer(row))
      } else {
        const row = groceryMap.get(k.id)
        if (row) offers.push(mapGroceryOffer(row))
      }
    }

    return NextResponse.json({ offers, total })
  } catch (e) {
    console.error("admin vendor-offers GET:", e)
    return NextResponse.json({ error: "Failed to load vendor offers" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ("error" in gate && gate.error) return gate.error

  try {
    const body = await request.json()
    const { offerId, module, action, rejectionNote } = body as {
      offerId?: string
      module?: string
      action?: string
      rejectionNote?: string | null
    }

    if (!offerId || typeof offerId !== "string") {
      return NextResponse.json({ error: "offerId is required" }, { status: 400 })
    }
    const mod = String(module || "").toUpperCase()
    if (mod !== "FOOD" && mod !== "GROCERY") {
      return NextResponse.json({ error: "module must be FOOD or GROCERY" }, { status: 400 })
    }
    const act = String(action || "").toUpperCase()
    if (act !== "APPROVE" && act !== "REJECT") {
      return NextResponse.json({ error: "action must be APPROVE or REJECT" }, { status: 400 })
    }

    const note =
      typeof rejectionNote === "string" && rejectionNote.trim().length > 0 ? rejectionNote.trim() : null

    if (mod === "FOOD") {
      const existing = await prisma.restaurantOffer.findUnique({
        where: { id: offerId },
        include: {
          restaurant: { select: { userId: true, name: true, logo: true, coverImage: true } },
        },
      })
      if (!existing) {
        return NextResponse.json({ error: "Offer not found" }, { status: 404 })
      }

      const updated = await prisma.restaurantOffer.update({
        where: { id: offerId },
        data:
          act === "APPROVE"
            ? {
                approvalStatus: "APPROVED",
                isActive: true,
                rejectionNote: null,
              }
            : {
                approvalStatus: "REJECTED",
                isActive: false,
                rejectionNote: note,
              },
        include: {
          restaurant: { select: { id: true, name: true, logo: true, coverImage: true } },
        },
      })

      const vendorUserId = existing.restaurant.userId
      const titleLabel = act === "APPROVE" ? "Approved" : "Rejected"
      const messageBase =
        act === "APPROVE"
          ? `${existing.title} has been approved by admin`
          : `${existing.title} has been rejected by admin`
      const message = act === "REJECT" && note ? `${messageBase}. ${note}` : messageBase

      try {
        await NotificationBridge.sendNotification({
          userId: vendorUserId,
          title: `Offer ${titleLabel}`,
          message,
          type: "SYSTEM",
          module: "FOOD",
          data: {
            actionType: "navigate",
            screen: "RestaurantOffers",
            offerId: updated.id,
          },
        })
      } catch (notifyErr) {
        console.error("admin vendor-offers notify (food):", notifyErr)
      }

      return NextResponse.json({ offer: mapRestaurantOffer(updated) })
    }

    const existing = await prisma.groceryOffer.findUnique({
      where: { id: offerId },
      include: {
        store: { select: { userId: true, storeName: true, logo: true, coverImage: true } },
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    }

    const updated = await prisma.groceryOffer.update({
      where: { id: offerId },
      data:
        act === "APPROVE"
          ? {
              approvalStatus: "APPROVED",
              isActive: true,
              rejectionNote: null,
            }
          : {
              approvalStatus: "REJECTED",
              isActive: false,
              rejectionNote: note,
            },
      include: {
        store: { select: { id: true, storeName: true, logo: true, coverImage: true } },
      },
    })

    const vendorUserId = existing.store.userId
    const titleLabel = act === "APPROVE" ? "Approved" : "Rejected"
    const messageBase =
      act === "APPROVE"
        ? `${existing.title} has been approved by admin`
        : `${existing.title} has been rejected by admin`
    const message = act === "REJECT" && note ? `${messageBase}. ${note}` : messageBase

    try {
      await NotificationBridge.sendNotification({
        userId: vendorUserId,
        title: `Offer ${titleLabel}`,
        message,
        type: "SYSTEM",
        module: "GROCERY",
        data: {
          actionType: "navigate",
          screen: "GroceryOffers",
          offerId: updated.id,
        },
      })
    } catch (notifyErr) {
      console.error("admin vendor-offers notify (grocery):", notifyErr)
    }

    return NextResponse.json({ offer: mapGroceryOffer(updated) })
  } catch (e) {
    console.error("admin vendor-offers PUT:", e)
    return NextResponse.json({ error: "Failed to update vendor offer" }, { status: 500 })
  }
}
