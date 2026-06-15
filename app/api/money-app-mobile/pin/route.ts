import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import {
  getOrCreateMoneyTransferProfile,
  issueTransferPinToken,
  isValidTransferPin,
  setMoneyTransferPin,
  verifyMoneyTransferPin,
} from "@/lib/money-transfer-profile"
import { assertValidMoneyStepUp } from "@/lib/money-transfer-risk"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { action, pin, currentPin, newPin, stepUpToken } = body as {
      action?: string
      pin?: string
      currentPin?: string
      newPin?: string
      stepUpToken?: string
    }

    if (action === "set") {
      if (!isValidTransferPin(String(pin || ""))) {
        return NextResponse.json({ error: "PIN must be 4–6 digits" }, { status: 400 })
      }
      const profile = await prisma.moneyTransferProfile.findUnique({
        where: { userId: user.id },
        select: { transferPinHash: true },
      })
      if (profile?.transferPinHash) {
        return NextResponse.json({ error: "PIN already set. Use change instead." }, { status: 400 })
      }
      await setMoneyTransferPin(user.id, String(pin))
      return NextResponse.json({ success: true, message: "Transfer PIN set successfully" })
    }

    if (action === "verify") {
      if (!isValidTransferPin(String(pin || ""))) {
        return NextResponse.json({ error: "Invalid PIN format" }, { status: 400 })
      }
      await getOrCreateMoneyTransferProfile(user.id)
      const ok = await verifyMoneyTransferPin(user.id, String(pin))
      if (!ok) {
        return NextResponse.json({ success: false, error: "Incorrect PIN" }, { status: 401 })
      }
      const transferPinToken = await issueTransferPinToken(user.id)
      return NextResponse.json({ success: true, transferPinToken })
    }

    if (action === "biometric") {
      await getOrCreateMoneyTransferProfile(user.id)
      const profile = await prisma.moneyTransferProfile.findUnique({
        where: { userId: user.id },
        select: { transferPinHash: true },
      })
      if (!profile?.transferPinHash) {
        return NextResponse.json(
          { error: "Transfer PIN not set", requiresPinSetup: true },
          { status: 400 },
        )
      }
      const transferPinToken = await issueTransferPinToken(user.id)
      return NextResponse.json({ success: true, transferPinToken })
    }

    if (action === "change") {
      if (!isValidTransferPin(String(currentPin || "")) || !isValidTransferPin(String(newPin || ""))) {
        return NextResponse.json({ error: "PIN must be 4–6 digits" }, { status: 400 })
      }
      const ok = await verifyMoneyTransferPin(user.id, String(currentPin))
      if (!ok) {
        return NextResponse.json({ error: "Current PIN is incorrect" }, { status: 401 })
      }
      await setMoneyTransferPin(user.id, String(newPin))
      return NextResponse.json({ success: true, message: "Transfer PIN updated" })
    }

    if (action === "reset") {
      if (!isValidTransferPin(String(newPin || ""))) {
        return NextResponse.json({ error: "PIN must be 4–6 digits" }, { status: 400 })
      }
      try {
        await assertValidMoneyStepUp({
          userId: user.id,
          stepUpToken: String(stepUpToken || ""),
          action: "RESET_TRANSFER_PIN",
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : "Verification required"
        return NextResponse.json({ error: message }, { status: 401 })
      }
      await getOrCreateMoneyTransferProfile(user.id)
      await setMoneyTransferPin(user.id, String(newPin))
      return NextResponse.json({ success: true, message: "Transfer PIN reset successfully" })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "PIN operation failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const profile = await getOrCreateMoneyTransferProfile(user.id)
    return NextResponse.json({
      success: true,
      pinSet: Boolean(profile.transferPinHash),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
