import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * Public module flags for mobile / web clients (no auth).
 * Used to hide disabled product modules from customer home and navigation.
 */
export async function GET(_request: NextRequest) {
  try {
    const systemSettings = await prisma.systemSettings.findFirst({
      select: {
        pharmacyEnabled: true,
        autoPartsEnabled: true,
        foodEnabled: true,
        groceryEnabled: true,
        ridingEnabled: true,
      },
    })

    const modules = {
      pharmacy: systemSettings?.pharmacyEnabled ?? true,
      autoParts: systemSettings?.autoPartsEnabled ?? true,
      food: systemSettings?.foodEnabled ?? true,
      grocery: systemSettings?.groceryEnabled ?? true,
      riding: systemSettings?.ridingEnabled ?? true,
    }

    return NextResponse.json({ modules, fetchedAt: new Date().toISOString() })
  } catch (error) {
    console.error("[system/modules] error", error)
    return NextResponse.json(
      {
        modules: {
          pharmacy: true,
          autoParts: true,
          food: true,
          grocery: true,
          riding: true,
        },
        fetchedAt: new Date().toISOString(),
      },
      { status: 200 }
    )
  }
}
