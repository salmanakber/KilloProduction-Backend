import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest()
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const currencies = await prisma.currency.findMany({
      orderBy: [
        { isDefault: "desc" },
        { code: "asc" }
      ]
    })

    return NextResponse.json({ currencies })
  } catch (error) {
    console.error("Currencies fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch currencies" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const { code, name, symbol, isDefault, exchangeRate, decimalPlaces } = body

    // Validate required fields
    if (!code || !name || !symbol) {
      return NextResponse.json(
        { error: "Code, name, and symbol are required" },
        { status: 400 }
      )
    }

    // Check if currency code already exists
    const existingCurrency = await prisma.currency.findUnique({
      where: { code: code.toUpperCase() }
    })

    if (existingCurrency) {
      return NextResponse.json(
        { error: "Currency code already exists" },
        { status: 400 }
      )
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.currency.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      })
    }

    const currency = await prisma.currency.create({
      data: {
        code: code.toUpperCase(),
        name,
        symbol,
        isDefault: isDefault || false,
        exchangeRate: exchangeRate || 1.0,
        decimalPlaces: decimalPlaces || 2
      }
    })

    return NextResponse.json({
      message: "Currency created successfully",
      currency
    })
  } catch (error) {
    console.error("Currency creation error:", error)
    return NextResponse.json(
      { error: "Failed to create currency" },
      { status: 500 }
    )
  }
}
