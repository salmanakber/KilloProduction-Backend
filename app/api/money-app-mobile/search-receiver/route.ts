import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { query } = await request.json()

    console.log("query", query)

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: "Search query must be at least 2 characters" },
        { status: 400 }
      )
    }

    const searchTerm = query.trim().toLowerCase()

    // Search by email, phone, or name - ONLY users with verified bank accounts
    const receivers = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: user.id } }, // Exclude sender
          { isActive: true },
          {
            OR: [
              { email: { contains: searchTerm, mode: "insensitive" } },
              { phone: { contains: searchTerm, mode: "insensitive" } },
              { name: { contains: searchTerm, mode: "insensitive" } },
            ],
          },
          // Only users with at least one verified bank account
          {
            bankAccounts: {
              some: {
                isVerified: true,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        userProfile: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      take: 20,
    })

    const formattedReceivers = receivers.map((receiver) => ({
      id: receiver.id,
      name: receiver.name || receiver.userProfile?.firstName 
        ? `${receiver.userProfile?.firstName || ""} ${receiver.userProfile?.lastName || ""}`.trim()
        : receiver.email || receiver.phone || "Unknown",
      email: receiver.email,
      phone: receiver.phone,
      avatar: receiver.avatar,
    }))

    return NextResponse.json({
      success: true,
      users: formattedReceivers, // Changed from 'receivers' to 'users' to match mobile API
    })
  } catch (error: any) {
    console.error("Error searching receivers:", error)
    return NextResponse.json(
      { error: error.message || "Failed to search receivers" },
      { status: 500 }
    )
  }
}
