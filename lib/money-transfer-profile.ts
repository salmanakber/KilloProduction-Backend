import { SignJWT, jwtVerify } from "jose"
import { prisma } from "@/lib/prisma"
import { hashPassword, verifyPassword } from "@/lib/auth"

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"
const getSecretKey = () => new TextEncoder().encode(JWT_SECRET)

const PIN_TOKEN_TTL = "5m"
const KILO_NUMBER_ATTEMPTS = 12

/** 10-digit bank-style Kilo account number (starts with 8). */
function generateKiloNumberCandidate(): string {
  let n = "8"
  for (let i = 0; i < 9; i++) {
    n += Math.floor(Math.random() * 10).toString()
  }
  return n
}

export async function allocateUniqueKiloNumber(): Promise<string> {
  for (let attempt = 0; attempt < KILO_NUMBER_ATTEMPTS; attempt++) {
    const candidate = generateKiloNumberCandidate()
    const exists = await prisma.moneyTransferProfile.findUnique({
      where: { kiloNumber: candidate },
      select: { id: true },
    })
    if (!exists) return candidate
  }
  throw new Error("Could not allocate Kilo number")
}

export async function getOrCreateMoneyTransferProfile(userId: string) {
  const existing = await prisma.moneyTransferProfile.findUnique({
    where: { userId },
  })
  if (existing) return existing

  const kiloNumber = await allocateUniqueKiloNumber()
  return prisma.moneyTransferProfile.create({
    data: { userId, kiloNumber },
  })
}

export function isValidTransferPin(pin: string): boolean {
  return /^\d{4,6}$/.test(String(pin || "").trim())
}

export async function setMoneyTransferPin(userId: string, pin: string) {
  if (!isValidTransferPin(pin)) {
    throw new Error("PIN must be 4–6 digits")
  }
  await getOrCreateMoneyTransferProfile(userId)
  const transferPinHash = await hashPassword(pin)
  return prisma.moneyTransferProfile.update({
    where: { userId },
    data: { transferPinHash, pinSetAt: new Date() },
  })
}

export async function verifyMoneyTransferPin(userId: string, pin: string): Promise<boolean> {
  const profile = await prisma.moneyTransferProfile.findUnique({
    where: { userId },
    select: { transferPinHash: true },
  })
  if (!profile?.transferPinHash) return false
  return verifyPassword(pin, profile.transferPinHash)
}

export async function issueTransferPinToken(userId: string): Promise<string> {
  return new SignJWT({ userId, purpose: "MONEY_TRANSFER_PIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(PIN_TOKEN_TTL)
    .sign(getSecretKey())
}

export async function assertTransferPinToken(
  token: string | undefined | null,
  userId: string,
): Promise<void> {
  if (!token || typeof token !== "string") {
    throw new Error("Transfer PIN verification required")
  }
  try {
    const { payload } = await jwtVerify(token, getSecretKey())
    if (payload.userId !== userId || payload.purpose !== "MONEY_TRANSFER_PIN") {
      throw new Error("Invalid transfer authorization")
    }
  } catch {
    throw new Error("Transfer PIN verification expired or invalid")
  }
}

export async function assertUserTransferLimits(
  userId: string,
  amount: number,
  currency: string,
): Promise<void> {
  const profile = await prisma.moneyTransferProfile.findUnique({
    where: { userId },
    select: { dailyLimit: true, monthlyLimit: true },
  })
  if (!profile) return

  const now = new Date()
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const statuses = ["PENDING", "PROCESSING", "SENT", "COMPLETED"] as const

  const [dailyAgg, monthlyAgg] = await Promise.all([
    profile.dailyLimit != null
      ? prisma.moneyTransfer.aggregate({
          where: {
            senderId: userId,
            currency: currency.toUpperCase(),
            status: { in: [...statuses] },
            createdAt: { gte: dayStart },
          },
          _sum: { amount: true },
        })
      : null,
    profile.monthlyLimit != null
      ? prisma.moneyTransfer.aggregate({
          where: {
            senderId: userId,
            currency: currency.toUpperCase(),
            status: { in: [...statuses] },
            createdAt: { gte: monthStart },
          },
          _sum: { amount: true },
        })
      : null,
  ])

  if (profile.dailyLimit != null) {
    const spent = dailyAgg?._sum.amount ?? 0
    if (spent + amount > profile.dailyLimit) {
      throw new Error(
        `Daily transfer limit exceeded (${currency} ${profile.dailyLimit.toFixed(2)} max)`,
      )
    }
  }

  if (profile.monthlyLimit != null) {
    const spent = monthlyAgg?._sum.amount ?? 0
    if (spent + amount > profile.monthlyLimit) {
      throw new Error(
        `Monthly transfer limit exceeded (${currency} ${profile.monthlyLimit.toFixed(2)} max)`,
      )
    }
  }
}

export function formatKiloNumberDisplay(kiloNumber: string): string {
  const digits = String(kiloNumber || "").replace(/\D/g, "")
  if (digits.length !== 10) return kiloNumber
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
}
