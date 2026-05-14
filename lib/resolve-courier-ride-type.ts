import type { RideType, VehicleType } from "@prisma/client"
import { prisma } from "@/lib/prisma"

/**
 * **Tier 1 — always try first:** food, pharmacy, grocery, small parcels (low weight).
 * Order within tier: motorcycle → scooter → bicycle (then cheapest `basePrice` per type).
 */
const LIGHT_COURIER_VEHICLE_PRIORITY: VehicleType[] = [
  "MOTORCYCLE",
  "SCOOTER",
  "BICYCLE",
]

/** Tier 2 — only if no light courier ride type exists in DB. */
const HEAVIER_COURIER_VEHICLE_FALLBACK: VehicleType[] = ["CAR", "VAN", "TRUCK"]

const COURIER_VEHICLE_FALLBACK_ORDER: VehicleType[] = [
  ...LIGHT_COURIER_VEHICLE_PRIORITY,
  ...HEAVIER_COURIER_VEHICLE_FALLBACK,
]

/**
 * Resolve an active COURIER {@link RideType} for marketplace checkout.
 * Prefers {@link LIGHT_COURIER_VEHICLE_PRIORITY} before cars/vans/trucks.
 */
export async function resolveCourierRideTypeForCheckout(): Promise<RideType | null> {
  for (const vehicleType of COURIER_VEHICLE_FALLBACK_ORDER) {
    const rt = await prisma.rideType.findFirst({
      where: {
        category: "COURIER",
        vehicleType,
        isActive: true,
      },
      orderBy: { basePrice: "asc" },
    })
    if (rt) return rt
  }

  return prisma.rideType.findFirst({
    where: { category: "COURIER", isActive: true },
    orderBy: { basePrice: "asc" },
  })
}
