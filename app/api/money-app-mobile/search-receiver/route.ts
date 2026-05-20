import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { query, purpose } = body as { query?: string; purpose?: string }

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: "Search query must be at least 2 characters" },
        { status: 400 }
      )
    }

    const raw = query.trim()
    const searchTerm = raw.toLowerCase()
    const forRequest = purpose === "request"

    /** QR / deep links pass user id; match exactly (not substring on email/name). */
    const looksLikeUserId =
      raw.length >= 20 &&
      !raw.includes("@") &&
      !raw.includes(" ") &&
      /^[a-z0-9_-]+$/i.test(raw)

    const receivers = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: user.id } },
          { isActive: true },
          {
            OR: [
              ...(looksLikeUserId ? [{ id: raw }] : []),
              { email: { contains: searchTerm, mode: "insensitive" } },
              { phone: { contains: searchTerm, mode: "insensitive" } },
              { name: { contains: searchTerm, mode: "insensitive" } },
            ],
          },
          ...(forRequest
            ? []
            : [
                {
                  bankAccounts: {
                    some: { isVerified: true },
                  },
                },
              ]),
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

    const formattedReceivers = receivers.map((receiver) => {
      const profileName = [receiver.userProfile?.firstName, receiver.userProfile?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim()
      const name =
        receiver.name?.trim() ||
        profileName ||
        receiver.email ||
        receiver.phone ||
        "Unknown"
      return {
        id: receiver.id,
        name,
        email: receiver.email,
        phone: receiver.phone,
        avatar: receiver.avatar,
      }
    })

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
