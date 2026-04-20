import type { Module } from "@prisma/client"

export type FeedbackCardTarget = "rider" | "vendor" | "mechanic" | "wholesaler" | "customer"

export interface FeedbackCardDef {
  key: string
  target: FeedbackCardTarget
  title: string
  subtitle?: string
  /** User id to rate (rider user, vendor user, mechanic user, wholesaler owner user) */
  userId: string
  displayName: string
  /** When mechanic and rider are same user, only one card is emitted with combined title */
  combinedDeliveryAndMechanic?: boolean
}

export interface FeedbackPlanInput {
  /** Courier or ride booking id */
  bookingId: string
  /** Booking kind resolved by API */
  bookingKind: "COURIER" | "RIDE"
  courierModule: string | null
  order: null | {
    id: string
    module: Module
    riderId: string | null
    vendorId: string | null
    pharmacy: { id: string; pharmacyName: string | null } | null
    food: { id: string; name: string | null } | null
    grocery: { id: string; storeName: string | null } | null
    autoPart: {
      id: string
      store: { id: string; storeName: string | null } | null
    } | null
    partRequest: {
      needsMechanic: boolean
      offers: {
        mechanicId: string | null
        mechanic: { id: string; name: string | null } | null
        status?: string
      }[]
    } | null
  }
  rider: { id: string; name: string | null } | null
  supplierOrders: Array<{
    wholesaler: { id: string; companyName: string; userId: string }
  }>
}

/**
 * Pharmacy vendor rating supplier deliveries (rider + wholesaler). Used from vendor app, not RiderFeedbackScreen.
 */
export function buildPharmacySupplierVendorFeedbackPlan(input: {
  rider: { id: string; name: string | null } | null
  supplierOrders: Array<{
    wholesaler: { id: string; companyName: string; userId: string }
  }>
}): FeedbackCardDef[] {
  const cards: FeedbackCardDef[] = []
  const so = input.supplierOrders[0]
  if (input.rider) {
    cards.push({
      key: "rider",
      target: "rider",
      title: "How was the delivery?",
      userId: input.rider.id,
      displayName: input.rider.name || "Driver",
    })
  }
  if (so) {
    cards.push({
      key: "wholesaler",
      target: "wholesaler",
      title: "How was the supplier?",
      subtitle: so.wholesaler.companyName,
      userId: so.wholesaler.userId,
      displayName: so.wholesaler.companyName,
    })
  }
  return cards
}

/**
 * Retail store vendor (food / grocery / pharmacy / auto parts) rates the rider after courier delivery.
 */
export function buildVendorStoreCourierFeedbackPlan(input: {
  rider: { id: string; name: string | null } | null
}): FeedbackCardDef[] {
  const cards: FeedbackCardDef[] = []
  if (input.rider) {
    cards.push({
      key: "rider",
      target: "rider",
      title: "How was the delivery partner?",
      userId: input.rider.id,
      displayName: input.rider.name || "Driver",
    })
  }
  return cards
}

/** Wholesaler rates the pharmacy (buyer) only after supplier-order courier delivery. */
export function buildWholesalerSupplierFeedbackPlan(input: {
  rider: { id: string; name: string | null } | null
  pharmacy: { pharmacyName: string | null; userId: string } | null
}): FeedbackCardDef[] {
  const cards: FeedbackCardDef[] = []
  void input.rider
  if (input.pharmacy) {
    cards.push({
      key: "pharmacy_vendor",
      target: "vendor",
      title: "How was the pharmacy?",
      subtitle: input.pharmacy.pharmacyName || undefined,
      userId: input.pharmacy.userId,
      displayName: input.pharmacy.pharmacyName || "Pharmacy",
    })
  }
  return cards
}

/**
 * Build which rating cards to show for a customer after delivery.
 * Rules (customer app):
 * - Pure ride / courier with no order: rider only.
 * - Food / Grocery / Pharmacy (customer order): vendor + rider when rider exists.
 * - Courier linked only to supplier (wholesale) legs: customer rates the rider only (pharmacy rates wholesaler separately via vendor flow).
 * - Auto parts: store vendor + optional mechanic; if mechanic is same user as rider, one combined "Delivery & mechanic" card.
 */
export function buildCustomerFeedbackPlan(input: FeedbackPlanInput): FeedbackCardDef[] {
  const cards: FeedbackCardDef[] = []
  const rider = input.rider
  const order = input.order

  // No order → only rider (ride-hailing / courier move)
  if (!order) {
    if (rider) {
      cards.push({
        key: "rider",
        target: "rider",
        title: "How was your driver?",
        userId: rider.id,
        displayName: rider.name || "Driver",
      })
    }
    return cards
  }

  const module = order.module

  // Supplier-only courier legs: end-customer only rates delivery; wholesaler is rated by pharmacy (vendor app).
  if (input.supplierOrders.length > 0 && !order) {
    if (rider) {
      cards.push({
        key: "rider",
        target: "rider",
        title: "How was the delivery?",
        userId: rider.id,
        displayName: rider.name || "Driver",
      })
    }
    return cards
  }

  // AUTO_PARTS: vendor store + optional mechanic; dedupe if mechanic is the rider
  if (module === "AUTO_PARTS") {
    const storeName = order.autoPart?.store?.storeName || "Auto parts store"
    const vendorUid = order.vendorId
    if (vendorUid) {
      cards.push({
        key: "vendor",
        target: "vendor",
        title: "How was the parts vendor?",
        userId: vendorUid,
        displayName: storeName,
      })
    }

    const offers = order.partRequest?.offers || []
    const offerWithMechanic =
      offers.find((o) => o.mechanicId && o.mechanic && o.status === "ACCEPTED") ||
      offers.find((o) => o.mechanicId && o.mechanic)
    const mechanicUser = offerWithMechanic?.mechanic
    const mechanicUserId = offerWithMechanic?.mechanicId || null

    if (mechanicUserId && mechanicUser) {
      const sameAsRider = rider && mechanicUserId === rider.id
      if (sameAsRider) {
        cards.push({
          key: "rider_mechanic",
          target: "rider",
          title: "Delivery & mechanic service",
          subtitle: "Same person handled delivery and service",
          userId: rider!.id,
          displayName: mechanicUser.name || rider!.name || "Technician",
          combinedDeliveryAndMechanic: true,
        })
      } else {
        if (rider) {
          cards.push({
            key: "rider",
            target: "rider",
            title: "How was the delivery?",
            userId: rider.id,
            displayName: rider.name || "Driver",
          })
        }
        cards.push({
          key: "mechanic",
          target: "mechanic",
          title: "How was the mechanic?",
          userId: mechanicUserId,
          displayName: mechanicUser.name || "Mechanic",
        })
      }
    } else if (rider) {
      cards.push({
        key: "rider",
        target: "rider",
        title: "How was the delivery?",
        userId: rider.id,
        displayName: rider.name || "Driver",
      })
    }
    return cards
  }

  // FOOD, GROCERY, PHARMACY: vendor + rider
  if (module === "FOOD" || module === "GROCERY" || module === "PHARMACY") {
    let vendorName = "Vendor"
    let vendorUserId = order.vendorId
    if (module === "PHARMACY" && order.pharmacy) {
      vendorName = order.pharmacy.pharmacyName || vendorName
    } else if (module === "FOOD" && order.food) {
      vendorName = order.food.name || vendorName
    } else if (module === "GROCERY" && order.grocery) {
      vendorName = order.grocery.storeName || vendorName
    }
    if (vendorUserId) {
      cards.push({
        key: "vendor",
        target: "vendor",
        title: module === "PHARMACY" ? "How was the pharmacy?" : module === "FOOD" ? "How was the restaurant?" : "How was the store?",
        userId: vendorUserId,
        displayName: vendorName,
      })
    }
    if (rider) {
      cards.push({
        key: "rider",
        target: "rider",
        title: "How was the delivery?",
        userId: rider.id,
        displayName: rider.name || "Driver",
      })
    }
    return cards
  }

  // Default: rider only
  if (rider) {
    cards.push({
      key: "rider",
      target: "rider",
      title: "How was your driver?",
      userId: rider.id,
      displayName: rider.name || "Driver",
    })
  }
  return cards
}

/**
 * After a trip, the rider rates the customer and (when applicable) vendor / mechanic / supplier.
 */
export function buildRiderFeedbackPlan(
  input: FeedbackPlanInput & { customer: { id: string; name: string | null } }
): FeedbackCardDef[] {
  const cards: FeedbackCardDef[] = []
  const order = input.order

  cards.push({
    key: "customer",
    target: "customer",
    title: "How was the customer?",
    userId: input.customer.id,
    displayName: input.customer.name || "Customer",
  })

  if (!order) {
    for (const so of input.supplierOrders) {
      cards.push({
        key: `wholesaler-${so.wholesaler.id}`,
        target: "wholesaler",
        title: "How was the supplier?",
        subtitle: so.wholesaler.companyName,
        userId: so.wholesaler.userId,
        displayName: so.wholesaler.companyName,
      })
    }
    return cards
  }

  const module = order.module

  if (module === "AUTO_PARTS") {
    const storeName = order.autoPart?.store?.storeName || "Auto parts store"
    const vendorUid = order.vendorId
    if (vendorUid) {
      cards.push({
        key: "vendor",
        target: "vendor",
        title: "How was the parts vendor?",
        userId: vendorUid,
        displayName: storeName,
      })
    }
    const offers = order.partRequest?.offers || []
    const offerWithMechanic =
      offers.find((o) => o.mechanicId && o.mechanic && o.status === "ACCEPTED") ||
      offers.find((o) => o.mechanicId && o.mechanic)
    const mechanicUserId = offerWithMechanic?.mechanicId || null
    const mechanicUser = offerWithMechanic?.mechanic
    if (mechanicUserId && mechanicUser) {
      cards.push({
        key: "mechanic",
        target: "mechanic",
        title: "How was the mechanic?",
        userId: mechanicUserId,
        displayName: mechanicUser.name || "Mechanic",
      })
    }
    return cards
  }

  if (module === "FOOD" || module === "GROCERY" || module === "PHARMACY") {
    let vendorName = "Vendor"
    const vendorUserId = order.vendorId
    if (module === "PHARMACY" && order.pharmacy) {
      vendorName = order.pharmacy.pharmacyName || vendorName
    } else if (module === "FOOD" && order.food) {
      vendorName = order.food.name || vendorName
    } else if (module === "GROCERY" && order.grocery) {
      vendorName = order.grocery.storeName || vendorName
    }
    if (vendorUserId) {
      cards.push({
        key: "vendor",
        target: "vendor",
        title:
          module === "PHARMACY"
            ? "How was the pharmacy?"
            : module === "FOOD"
              ? "How was the restaurant?"
              : "How was the store?",
        userId: vendorUserId,
        displayName: vendorName,
      })
    }
    return cards
  }

  return cards
}
