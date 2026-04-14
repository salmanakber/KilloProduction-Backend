import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { buildSmartShopSuggestedQuestions } from "@/lib/smart-shop-suggested-questions"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const module = String(searchParams.get("module") || "").toUpperCase()
    if (module !== "FOOD" && module !== "GROCERY") {
      return NextResponse.json({ error: "module must be FOOD or GROCERY" }, { status: 400 })
    }

    const { askAnything, mealPlanning } = await buildSmartShopSuggestedQuestions(session.id, module)
    return NextResponse.json({
      success: true,
      questions: askAnything,
      askAnything,
      mealPlanning,
      module,
    })
  } catch (e) {
    console.error("smart-shop/suggested-questions:", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
