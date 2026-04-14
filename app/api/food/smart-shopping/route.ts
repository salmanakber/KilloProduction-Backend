import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { runFoodSmartShopping, type SmartAction } from "@/lib/smart-shopping/ai-plan"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { latitude, longitude, maxKm, action, message, selectedMeals, dietPreference } = body as {
      latitude?: number
      longitude?: number
      maxKm?: number
      action?: string
      message?: string
      selectedMeals?: string[]
      dietPreference?: string
    }

    if (latitude == null || longitude == null) {
      return NextResponse.json({ error: "latitude and longitude required" }, { status: 400 })
    }

    const act = (action || "chat") as SmartAction
    if (!["meal_plan", "chat", "weekly_plan"].includes(act)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    const userMessage = typeof message === "string" ? message : ""
    if (!userMessage.trim() && act === "chat") {
      return NextResponse.json({ error: "message required" }, { status: 400 })
    }

    const result = await runFoodSmartShopping({
      latitude: Number(latitude),
      longitude: Number(longitude),
      maxKm: maxKm != null ? Number(maxKm) : undefined,
      action: act,
      userMessage: userMessage || "Suggest a meal set from nearby restaurants.",
      selectedMeals: Array.isArray(selectedMeals) ? selectedMeals : undefined,
      dietPreference: typeof dietPreference === "string" ? dietPreference : undefined,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    console.error("food smart-shopping:", e)
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 })
  }
}
