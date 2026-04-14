import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    // Build where clause
    const where: any = {}

    if (status && status !== "ALL") {
      where.status = status
    }

    const [suggestions, total] = await Promise.all([
      prisma.medicineSuggestion.findMany({
        where,
        include: {
          // Include wholesaler info if it's a wholesaler suggestion
          wholesaler: {
            where: { id: { equals: { suggestedBy: true } } },
            select: {
              companyName: true,
              email: true,
              phone: true,
            },
          },
          // Include pharmacy info if it's a pharmacy suggestion
          pharmacy: {
            where: { id: { equals: { suggestedBy: true } } },
            select: {
              pharmacyName: true,
              email: true,
              phone: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.medicineSuggestion.count({ where }),
    ])

    // Process suggestions to include suggester info
    const processedSuggestions = suggestions.map(suggestion => {
      const suggesterInfo = suggestion.suggestedByType === "WHOLESALER" 
        ? suggestion.wholesaler 
        : suggestion.pharmacy

      return {
        ...suggestion,
        suggesterInfo,
        wholesaler: undefined,
        pharmacy: undefined,
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

