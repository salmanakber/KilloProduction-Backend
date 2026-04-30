import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import crypto from "crypto"

// Generate a unique API key
function generateApiKey(): string {
  return `grocery_${crypto.randomBytes(32).toString('hex')}`
}

// Verify API key and get store
async function verifyApiKey(apiKey: string) {
  const store = await prisma.groceryStore.findFirst({
    where: { apiKey },
    include: {
      user: {
        select: {
          id: true,
          role: true,
        },
      },
    },
  })
  return store
}

// GET - Get or generate API key
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const store = await prisma.groceryStore.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        storeName: true,
        apiKey: true,
      },
    })

    if (!store) {
      return NextResponse.json({ error: "Grocery store not found" }, { status: 404 })
    }

    // Generate API key if it doesn't exist
    if (!store.apiKey) {
      const apiKey = generateApiKey()
      await prisma.groceryStore.update({
        where: { id: store.id },
        data: { apiKey },
      })
      return NextResponse.json({
        apiKey,
        storeName: store.storeName,
        baseUrl: `${process.env.NEXT_PUBLIC_API_URL || 'https://api.kilo1app.com'}/api/pos/grocery`,
        message: "API key generated successfully. Keep this key secure and use it for all POS integration requests.",
      })
    }

    return NextResponse.json({
      apiKey: store.apiKey,
      storeName: store.storeName,
      baseUrl: `${process.env.NEXT_PUBLIC_API_URL || 'https://api.kilo1app.com'}/api/pos/grocery`,
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

    const store = await prisma.groceryStore.findUnique({
      where: { userId: user.id },
    })

    if (!store) {
      return NextResponse.json({ error: "Grocery store not found" }, { status: 404 })
    }

    const newApiKey = generateApiKey()
    await prisma.groceryStore.update({
      where: { id: store.id },
      data: { apiKey: newApiKey },
    })

    return NextResponse.json({
      apiKey: newApiKey,
      storeName: store.storeName,
      baseUrl: `${process.env.NEXT_PUBLIC_API_URL || 'https://api.kilo1app.com'}/api/pos/grocery`,
      message: "API key regenerated successfully. Your old key is no longer valid.",
    })
  } catch (error) {
    console.error("Error regenerating API key:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
