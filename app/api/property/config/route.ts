import { type NextRequest, NextResponse } from "next/server"
import { getPropertyModuleConfig, getGuestComplianceRequirements } from "@/lib/property-module-config"
import { prisma } from "@/lib/prisma"

export async function GET(_request: NextRequest) {
  try {
    const [config, settings] = await Promise.all([
      getPropertyModuleConfig(),
      prisma.systemSettings.findUnique({
        where: { id: 1 },
        select: { propertyEnabled: true, defaultCurrency: true, currency: true },
      }),
    ])

    return NextResponse.json({
      success: true,
      enabled: settings?.propertyEnabled ?? true,
      currency: settings?.defaultCurrency || settings?.currency || "NGN",
      categories: config.categories.filter((c) => c.isActive !== false),
      destinations: config.destinations.filter((d) => d.isActive !== false),
      folders: config.folders.filter((f) => f.isActive !== false),
      heroSlides: config.heroSlides.filter((s) => s.isActive !== false && s.image),
      compliance: config.compliance,
      guestCompliance: getGuestComplianceRequirements(config.compliance),
      updatedAt: config.updatedAt,
    })
  } catch (error) {
    console.error("Property config GET error:", error)
    return NextResponse.json({ error: "Failed to load property config" }, { status: 500 })
  }
}
