import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { AjoContributionFrequency } from "@prisma/client"
import {
  createAjoGroup,
  listUserAjoGroups,
  serializeAjoGroup,
} from "@/lib/ajo-service"
import { getSystemDefaultCurrency } from "@/lib/money-transfer-wallet"

function parseFrequency(value: unknown): AjoContributionFrequency | null {
  if (typeof value !== "string") return null
  const u = value.toUpperCase()
  if (u === "DAILY" || u === "WEEKLY" || u === "MONTHLY") return u
  return null
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const groups = await listUserAjoGroups(user.id)
    return NextResponse.json({
      success: true,
      groups: groups.map((g) => serializeAjoGroup(g, user.id)),
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    console.error("ajo/groups GET:", e)
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
    const name = typeof body.name === "string" ? body.name : ""
    const contributionAmount = Number(body.contributionAmount)
    const maxMembers = Number(body.maxMembers)
    const frequency = parseFrequency(body.frequency)
    const systemCurrency = await getSystemDefaultCurrency()
    const currency =
      typeof body.currency === "string" && body.currency.trim()
        ? body.currency.trim().toUpperCase().slice(0, 3)
        : systemCurrency
    const description = typeof body.description === "string" ? body.description : undefined

    if (!frequency) {
      return NextResponse.json({ error: "Invalid frequency" }, { status: 400 })
    }

    const group = await createAjoGroup({
      userId: user.id,
      name,
      description,
      contributionAmount,
      currency,
      frequency,
      maxMembers,
    })

    return NextResponse.json({ success: true, group: { id: group.id, inviteCode: group.inviteCode } })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    console.error("ajo/groups POST:", e)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
