import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import crypto from "crypto"

// Generate a unique API key
function generateApiKey(): string {
  return `food_${crypto.randomBytes(32).toString('hex')}`
}

// GET - Get or generate API key
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        apiKey: true,
      },
    })

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    // Generate API key if it doesn't exist
    if (!restaurant.apiKey) {
      const apiKey = generateApiKey()
      await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { apiKey },
      })
      return NextResponse.json({
        apiKey,
        restaurantName: restaurant.name,
        baseUrl: `${process.env.NEXT_PUBLIC_API_URL || 'https://your-api-domain.com'}/api/pos/food`,
        message: "API key generated successfully. Keep this key secure and use it for all POS integration requests.",
      })
    }

    return NextResponse.json({
      apiKey: restaurant.apiKey,
      restaurantName: restaurant.name,
      baseUrl: `${process.env.NEXT_PUBLIC_API_URL || 'https://your-api-domain.com'}/api/pos/food`,
    })
  } catch (error) {
    console.error("Error fetching API key:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Regenerate API key
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { userId: user.id },
    })

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    const newApiKey = generateApiKey()
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { apiKey: newApiKey },
    })

    return NextResponse.json({
      apiKey: newApiKey,
      restaurantName: restaurant.name,
      baseUrl: `${process.env.NEXT_PUBLIC_API_URL || 'https://your-api-domain.com'}/api/pos/food`,
      message: "API key regenerated successfully. Your old key is no longer valid.",
    })
  } catch (error) {
    console.error("Error regenerating API key:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
