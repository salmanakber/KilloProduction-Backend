import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import {
  formatKiloNumberDisplay,
  getOrCreateMoneyTransferProfile,
} from "@/lib/money-transfer-profile"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const profile = await getOrCreateMoneyTransferProfile(user.id)

    return NextResponse.json({
      success: true,
      profile: {
        kiloNumber: profile.kiloNumber,
        kiloNumberFormatted: formatKiloNumberDisplay(profile.kiloNumber),
        pinSet: Boolean(profile.transferPinHash),
        pinSetAt: profile.pinSetAt?.toISOString() ?? null,
        dailyLimit: profile.dailyLimit,
        monthlyLimit: profile.monthlyLimit,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load profile"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { dailyLimit, monthlyLimit } = body as {
      dailyLimit?: number | null
      monthlyLimit?: number | null
    }

    await getOrCreateMoneyTransferProfile(user.id)

    const data: { dailyLimit?: number | null; monthlyLimit?: number | null } = {}

    if (dailyLimit !== undefined) {
      if (dailyLimit != null && (typeof dailyLimit !== "number" || dailyLimit <= 0)) {
        return NextResponse.json({ error: "Invalid daily limit" }, { status: 400 })
      }
      data.dailyLimit = dailyLimit
    }

    if (monthlyLimit !== undefined) {
      if (monthlyLimit != null && (typeof monthlyLimit !== "number" || monthlyLimit <= 0)) {
        return NextResponse.json({ error: "Invalid monthly limit" }, { status: 400 })
      }
      data.monthlyLimit = monthlyLimit
    }

    const profile = await prisma.moneyTransferProfile.update({
      where: { userId: user.id },
      data,
    })

    return NextResponse.json({
      success: true,
      profile: {
        kiloNumber: profile.kiloNumber,
        kiloNumberFormatted: formatKiloNumberDisplay(profile.kiloNumber),
        pinSet: Boolean(profile.transferPinHash),
        dailyLimit: profile.dailyLimit,
        monthlyLimit: profile.monthlyLimit,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update profile"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
