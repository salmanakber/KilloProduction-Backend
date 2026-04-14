import { NextResponse } from "next/server"
import { VehicleType } from "@prisma/client"

const LABELS: Record<VehicleType, { name: string; icon: string }> = {
  BICYCLE: { name: "Bicycle", icon: "🚲" },
  MOTORCYCLE: { name: "Motorcycle", icon: "🏍️" },
  SCOOTER: { name: "Scooter", icon: "🛵" },
  CAR: { name: "Car", icon: "🚗" },
  VAN: { name: "Van", icon: "🚐" },
  TRUCK: { name: "Truck", icon: "🚚" },
}

export async function GET() {
  const vehicleTypes = (Object.values(VehicleType) as VehicleType[]).map((id) => {
    const meta = LABELS[id]
    return {
      id,
      name: meta?.name ?? id,
      icon: meta?.icon ?? "🚗",
    }
  })
  return NextResponse.json({ vehicleTypes })
}
