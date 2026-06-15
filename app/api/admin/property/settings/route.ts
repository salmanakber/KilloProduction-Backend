import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { getPropertyModuleConfig, savePropertyModuleConfig } from "@/lib/property-module-config"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const config = await getPropertyModuleConfig()
    return NextResponse.json({ success: true, ...config })
  } catch (error) {
    console.error("Admin property settings GET error:", error)
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const body = await request.json()
    const saved = await savePropertyModuleConfig({
      categories: body.categories,
      destinations: body.destinations,
      compliance: body.compliance,
      folders: body.folders,
      heroSlides: body.heroSlides,
    })
    return NextResponse.json({ success: true, ...saved })
  } catch (error) {
    console.error("Admin property settings PUT error:", error)
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 })
  }
}
