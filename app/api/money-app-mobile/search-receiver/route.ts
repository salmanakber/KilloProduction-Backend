import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { formatKiloNumberDisplay, getOrCreateMoneyTransferProfile } from "@/lib/money-transfer-profile"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { query, purpose, transferMode } = body as {
      query?: string
      purpose?: string
      transferMode?: "LOCAL" | "INTERNATIONAL"
    }

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: "Search query must be at least 2 characters" },
        { status: 400 },
      )
    }

    const raw = query.trim()
    const searchTerm = raw.toLowerCase()
    const forRequest = purpose === "request"
    const isLocal = transferMode === "LOCAL"
    const digitsOnly = raw.replace(/\D/g, "")

    /** QR / deep links pass user id; match exactly (not substring on email/name). */
    const looksLikeUserId =
      raw.length >= 20 &&
      !raw.includes("@") &&
      !raw.includes(" ") &&
      /^[a-z0-9_-]+$/i.test(raw)

    /** 10-digit Kilo wallet number */
    const looksLikeKiloNumber = /^\d{10}$/.test(digitsOnly)

    const kiloProfileMatch = looksLikeKiloNumber
      ? await prisma.moneyTransferProfile.findUnique({
          where: { kiloNumber: digitsOnly },
          select: { userId: true },
        })
      : null

    const receivers = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: user.id } },
          { isActive: true },
          {
            OR: [
              ...(looksLikeUserId ? [{ id: raw }] : []),
              ...(kiloProfileMatch ? [{ id: kiloProfileMatch.userId }] : []),
              ...(digitsOnly.length >= 4 && !looksLikeKiloNumber
                ? [{ moneyTransferProfile: { kiloNumber: { contains: digitsOnly } } }]
                : []),
              { email: { contains: searchTerm, mode: "insensitive" as const } },
              { phone: { contains: searchTerm, mode: "insensitive" as const } },
              { name: { contains: searchTerm, mode: "insensitive" as const } },
            ],
          },
          ...(forRequest || isLocal
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
        moneyTransferProfile: {
          select: { kiloNumber: true },
        },
        bankAccounts: {
          where: { isVerified: true },
          orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            bankName: true,
            accountNumber: true,
            accountHolderName: true,
            isDefault: true,
            currency: true,
          },
        },
        moneyTransferWallets: {
          where: { isActive: true },
          select: { currency: true, balance: true },
          take: 5,
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
      const kiloNumber = receiver.moneyTransferProfile?.kiloNumber ?? null
      return {
        id: receiver.id,
        name,
        email: receiver.email,
        phone: receiver.phone,
        avatar: receiver.avatar,
        kiloNumber,
        kiloNumberFormatted: kiloNumber ? formatKiloNumberDisplay(kiloNumber) : null,
        hasWallet: receiver.moneyTransferWallets.length > 0,
        bankAccounts: receiver.bankAccounts.map((b) => ({
          id: b.id,
          bankName: b.bankName,
          accountNumber: b.accountNumber,
          accountHolderName: b.accountHolderName,
          isDefault: b.isDefault,
          currency: b.currency,
          accountNumberMasked: b.accountNumber.length > 4
            ? `****${b.accountNumber.slice(-4)}`
            : b.accountNumber,
        })),
      }
    })

    // Ensure caller has a profile (lazy create on search)
    void getOrCreateMoneyTransferProfile(user.id)

    return NextResponse.json({
      success: true,
      users: formattedReceivers,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to search receivers"
    console.error("Error searching receivers:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
