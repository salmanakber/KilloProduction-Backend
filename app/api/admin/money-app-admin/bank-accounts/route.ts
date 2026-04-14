import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    
    if (!user || user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") // "verified" | "unverified" | "all"
    const search = searchParams.get("search")
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    const where: any = {}

    if (status === "verified") {
      where.isVerified = true
    } else if (status === "unverified") {
      where.isVerified = false
    }

    if (search) {
      where.OR = [
        { accountNumber: { contains: search, mode: "insensitive" } },
        { accountHolderName: { contains: search, mode: "insensitive" } },
        { bankName: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { user: { phone: { contains: search, mode: "insensitive" } } },
      ]
    }

    const [bankAccounts, total] = await Promise.all([
      prisma.bankAccount.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.bankAccount.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      bankAccounts,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    })
  } catch (error: any) {
    console.error("Error fetching bank accounts:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch bank accounts" },
      { status: 500 }
    )
  }
}
