import { NextRequest, NextResponse } from "next/server"
import { MoneySavedRecipientDestination } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rows = await prisma.moneySavedRecipient.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        receiver: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatar: true,
            moneyTransferProfile: { select: { kiloNumber: true } },
            bankAccounts: {
              where: { isVerified: true },
              select: {
                id: true,
                bankName: true,
                accountNumber: true,
                accountHolderName: true,
                isDefault: true,
              },
            },
          },
        },
      },
    })

    const recipients = rows.map((row) => {
      const bank =
        row.destinationType === "BANK" && row.bankAccountId
          ? row.receiver.bankAccounts.find((b) => b.id === row.bankAccountId)
          : null
      return {
        id: row.id,
        receiverId: row.receiverId,
        nickname: row.nickname,
        destinationType: row.destinationType,
        bankAccountId: row.bankAccountId,
        name: row.nickname || row.receiver.name || row.receiver.email || "User",
        email: row.receiver.email,
        phone: row.receiver.phone,
        avatar: row.receiver.avatar,
        kiloNumber: row.receiver.moneyTransferProfile?.kiloNumber ?? null,
        bank: bank
          ? {
              id: bank.id,
              bankName: bank.bankName,
              accountNumber: bank.accountNumber,
              accountHolderName: bank.accountHolderName,
            }
          : null,
      }
    })

    return NextResponse.json({ success: true, recipients })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load recipients"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { receiverId, destinationType, bankAccountId, nickname } = body as {
      receiverId?: string
      destinationType?: string
      bankAccountId?: string
      nickname?: string
    }

    if (!receiverId) {
      return NextResponse.json({ error: "receiverId is required" }, { status: 400 })
    }

    const dest =
      destinationType === "BANK"
        ? MoneySavedRecipientDestination.BANK
        : MoneySavedRecipientDestination.WALLET

    if (dest === MoneySavedRecipientDestination.BANK) {
      if (!bankAccountId) {
        return NextResponse.json({ error: "bankAccountId required for bank destination" }, { status: 400 })
      }
      const bank = await prisma.bankAccount.findFirst({
        where: { id: bankAccountId, userId: receiverId, isVerified: true },
      })
      if (!bank) {
        return NextResponse.json({ error: "Invalid receiver bank account" }, { status: 400 })
      }
    }

    const existing = await prisma.moneySavedRecipient.findFirst({
      where: {
        ownerId: user.id,
        receiverId,
        destinationType: dest,
        bankAccountId: dest === "BANK" ? bankAccountId : null,
      },
    })

    if (existing) {
      const updated = await prisma.moneySavedRecipient.update({
        where: { id: existing.id },
        data: { nickname: nickname?.trim() || existing.nickname },
      })
      return NextResponse.json({ success: true, recipient: updated })
    }

    const created = await prisma.moneySavedRecipient.create({
      data: {
        ownerId: user.id,
        receiverId,
        destinationType: dest,
        bankAccountId: dest === "BANK" ? bankAccountId : null,
        nickname: nickname?.trim() || null,
      },
    })

    return NextResponse.json({ success: true, recipient: created }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save recipient"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const id = request.nextUrl.searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    await prisma.moneySavedRecipient.deleteMany({
      where: { id, ownerId: user.id },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete recipient"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
