import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { formatKiloNumberDisplay, getOrCreateMoneyTransferProfile } from "@/lib/money-transfer-profile"

function maskAccountNumber(accountNumber: string) {
  return accountNumber.length > 4 ? `****${accountNumber.slice(-4)}` : accountNumber
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "12", 10) || 12, 30)

    const recent = await prisma.moneyTransfer.findMany({
      where: {
        senderId: user.id,
        status: { in: ["COMPLETED", "SENT", "PROCESSING", "PENDING"] },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        receiver: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatar: true,
            userProfile: {
              select: { firstName: true, lastName: true },
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
          },
        },
      },
    })

    const seen = new Set<string>()
    const users: Array<{
      id: string
      name: string
      email: string
      phone: string
      avatar?: string
      kiloNumber?: string | null
      kiloNumberFormatted?: string | null
      hasWallet?: boolean
      bankAccounts: Array<{
        id: string
        bankName: string
        accountNumber: string
        accountHolderName: string
        isDefault?: boolean
        currency?: string | null
        accountNumberMasked: string
      }>
    }> = []

    for (const t of recent) {
      if (seen.has(t.receiverId)) continue
      seen.add(t.receiverId)
      const r = t.receiver
      const profileName = [r.userProfile?.firstName, r.userProfile?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim()
      const name = r.name?.trim() || profileName || r.email || r.phone || "User"
      const kiloNumber = r.moneyTransferProfile?.kiloNumber ?? null

      users.push({
        id: r.id,
        name,
        email: r.email || "",
        phone: r.phone || "",
        avatar: r.avatar || undefined,
        kiloNumber,
        kiloNumberFormatted: kiloNumber ? formatKiloNumberDisplay(kiloNumber) : null,
        hasWallet: Boolean(kiloNumber),
        bankAccounts: r.bankAccounts.map((b) => ({
          id: b.id,
          bankName: b.bankName,
          accountNumber: b.accountNumber,
          accountHolderName: b.accountHolderName,
          isDefault: b.isDefault,
          currency: b.currency,
          accountNumberMasked: maskAccountNumber(b.accountNumber),
        })),
      })
      if (users.length >= limit) break
    }

    void getOrCreateMoneyTransferProfile(user.id)

    return NextResponse.json({ success: true, users })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    console.error("recent-recipients:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
