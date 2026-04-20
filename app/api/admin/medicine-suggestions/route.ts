import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: Record<string, unknown> = {}

    if (status && status !== "ALL") {
      where.status = status
    }

    const [suggestions, total] = await Promise.all([
      prisma.medicineSuggestion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.medicineSuggestion.count({ where }),
    ])

    const ids = [...new Set(suggestions.map((s) => s.suggestedBy))]
    const [wholesalers, pharmacies] = await Promise.all([
      prisma.wholesaler.findMany({
        where: { id: { in: ids } },
        select: { id: true, companyName: true, email: true, phone: true },
      }),
      prisma.pharmacy.findMany({
        where: { id: { in: ids } },
        select: { id: true, pharmacyName: true, email: true, phone: true },
      }),
    ])
    const wMap = new Map(wholesalers.map((w) => [w.id, { type: "WHOLESALER" as const, ...w }]))
    const pMap = new Map(pharmacies.map((p) => [p.id, { type: "PHARMACY" as const, ...p }]))

    const processedSuggestions = suggestions.map((suggestion) => {
      const suggesterInfo =
        suggestion.suggestedByType === "WHOLESALER"
          ? wMap.get(suggestion.suggestedBy) ?? null
          : pMap.get(suggestion.suggestedBy) ?? null
      return {
        ...suggestion,
        suggesterInfo,
      }
    })

    return NextResponse.json({
      suggestions: processedSuggestions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Medicine suggestions fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch suggestions" }, { status: 500 })
  }
}
