import type { VehicleType } from "@prisma/client"

/** Vendor-originated module deliveries (food/grocery/pharmacy/auto checkout flows). */
export const VENDOR_DELIVERY_MODULES = new Set(["FOOD", "GROCERY", "PHARMACY", "AUTO_PARTS"])

export function parseJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === "string")
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []
    } catch {
      return []
    }
  }
  return []
}

export function isVendorModuleCourier(module: string | null | undefined): boolean {
  if (!module) return false
  return VENDOR_DELIVERY_MODULES.has(module)
}

/** Peer / customer courier (not from vendor modules). */
export function isExternalCourierBooking(module: string | null | undefined): boolean {
  return !isVendorModuleCourier(module)
}

export type RiderServiceFilter = {
  wantsExternal: boolean
  wantsModuleDelivery: boolean
  riderModules: string[]
  vehicleType: VehicleType
}

export function buildRiderServiceFilter(
  serviceTypesJson: unknown,
  modulesJson: unknown,
  vehicleType: VehicleType
): RiderServiceFilter {
  const serviceTypes = parseJsonStringArray(serviceTypesJson)
  const riderModules = parseJsonStringArray(modulesJson)

  if (serviceTypes.length === 0) {
    return {
      wantsExternal: true,
      wantsModuleDelivery: true,
      riderModules,
      vehicleType,
    }
  }

  return {
    wantsExternal: serviceTypes.includes("EXTERNAL"),
    wantsModuleDelivery: serviceTypes.includes("MODULE_DELIVERY"),
    riderModules,
    vehicleType,
  }
}

export function courierMatchesRider(
  filter: RiderServiceFilter,
  module: string | null | undefined,
  rideTypeVehicle: VehicleType
): boolean {
  if (rideTypeVehicle !== filter.vehicleType) return false

  const vendor = isVendorModuleCourier(module)

  if (vendor) {
    if (!filter.wantsModuleDelivery) return false
    if (filter.riderModules.length === 0) return true
    return !!(module && filter.riderModules.includes(module))
  }

  return filter.wantsExternal
}

export function rideBookingMatchesRider(filter: RiderServiceFilter, rideTypeVehicle: VehicleType): boolean {
  if (!filter.wantsExternal) return false
  return rideTypeVehicle === filter.vehicleType
}
