import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateOTP, sendOTP } from "@/lib/twilio"
import { getRequestMeta } from "@/lib/money-transfer-admin"
import { isMoneySecurityDevelopment } from "@/lib/money-security-env"
import { sendEmailFromTemplate } from "./email"
import { systemSettings as getSystemSettings } from "./systemSettings"

export type MoneyRiskAction =
  | "MONEY_APP_OPEN"
  | "SEND_MONEY"
  | "WALLET_WITHDRAW"
  | "SCHEDULED_TRANSFER"
  | "VTPASS_PAY"

export type RiskSignal =
  | "DEVELOPER_MODE"
  | "NEW_DEVICE"
  | "UNUSUAL_TIME"
  | "LARGE_AMOUNT_SPIKE"
  | "NEW_BENEFICIARY"
  | "FREQUENT_RETRIES"
  | "IP_COUNTRY_CHANGE"
  | "VPN_DETECTED"
  | "SIMULATOR"

const SIGNAL_SCORES: Record<RiskSignal, number> = {
  DEVELOPER_MODE: 100,
  SIMULATOR: 80,
  NEW_DEVICE: 35,
  UNUSUAL_TIME: 20,
  LARGE_AMOUNT_SPIKE: 30,
  NEW_BENEFICIARY: 25,
  FREQUENT_RETRIES: 45,
  IP_COUNTRY_CHANGE: 35,
  VPN_DETECTED: 50,
}

const STEP_UP_THRESHOLD = 40
const BLOCK_THRESHOLD = 80

export type MoneyRiskClientContext = {
  deviceFingerprint?: string
  deviceLabel?: string
  platform?: string
  developerMode?: boolean
  simulator?: boolean
  vpnDetected?: boolean
  timezoneOffsetMinutes?: number
}

export type AssessMoneyRiskInput = {
  userId: string
  action: MoneyRiskAction
  amount?: number
  currency?: string
  receiverId?: string
  bankAccountId?: string
  request?: NextRequest
  client?: MoneyRiskClientContext
}

export type MoneyRiskAssessment = {
  riskScore: number
  signals: RiskSignal[]
  blocked: boolean
  requiresStepUp: boolean
  message?: string
}

type IpIntel = {
  countryCode: string | null
  proxy: boolean
  hosting: boolean
}

const ipIntelCache = new Map<string, { at: number; data: IpIntel }>()

async function lookupIpIntel(ip: string | null): Promise<IpIntel> {
  if (!ip || ip === "127.0.0.1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return { countryCode: null, proxy: false, hosting: false }
  }
  const cached = ipIntelCache.get(ip)
  if (cached && Date.now() - cached.at < 3600_000) return cached.data

  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode,proxy,hosting`,
      { signal: AbortSignal.timeout(4000) },
    )
    const json = (await res.json()) as {
      status?: string
      countryCode?: string
      proxy?: boolean
      hosting?: boolean
    }
    const data: IpIntel = {
      countryCode: json.status === "success" ? json.countryCode ?? null : null,
      proxy: Boolean(json.proxy),
      hosting: Boolean(json.hosting),
    }
    ipIntelCache.set(ip, { at: Date.now(), data })
    return data
  } catch {
    return { countryCode: null, proxy: false, hosting: false }
  }
}

function countryFromHeaders(request?: NextRequest): string | null {
  if (!request) return null
  return (
    request.headers.get("cf-ipcountry") ||
    request.headers.get("x-vercel-ip-country") ||
    request.headers.get("x-country-code") ||
    null
  )?.toUpperCase() ?? null
}

function isUnusualHour(timezoneOffsetMinutes?: number): boolean {
  const now = new Date()
  let hour = now.getUTCHours()
  if (typeof timezoneOffsetMinutes === "number" && Number.isFinite(timezoneOffsetMinutes)) {
    const localMs = now.getTime() + timezoneOffsetMinutes * 60_000
    hour = new Date(localMs).getUTCHours()
  }
  return hour >= 2 && hour < 5
}

export async function assessMoneyTransferRisk(
  input: AssessMoneyRiskInput,
): Promise<MoneyRiskAssessment> {
  const { userId, action, amount, receiverId, request, client } = input
  const meta = request ? getRequestMeta(request) : { ipAddress: null, userAgent: null }
  const headerCountry = countryFromHeaders(request)
  const ipIntel = await lookupIpIntel(meta.ipAddress)
  const countryCode = headerCountry || ipIntel.countryCode

  const signals: RiskSignal[] = []
  const devBypass = isMoneySecurityDevelopment()

  if (!devBypass) {
    if (client?.developerMode) signals.push("DEVELOPER_MODE")
    if (client?.simulator) signals.push("SIMULATOR")
    if (client?.vpnDetected || ipIntel.proxy || ipIntel.hosting) signals.push("VPN_DETECTED")
  }

  const fingerprint = client?.deviceFingerprint?.trim()
  if (!devBypass) {
    if (fingerprint) {
      const trusted = await prisma.moneyTransferTrustedDevice.findUnique({
        where: { userId_deviceFingerprint: { userId, deviceFingerprint: fingerprint } },
      })
      if (!trusted) signals.push("NEW_DEVICE")
      else if (countryCode && trusted.lastCountryCode && trusted.lastCountryCode !== countryCode) {
        signals.push("IP_COUNTRY_CHANGE")
      }
    } else {
      signals.push("NEW_DEVICE")
    }
  }

  if (isUnusualHour(client?.timezoneOffsetMinutes)) signals.push("UNUSUAL_TIME")

  const since15 = new Date(Date.now() - 15 * 60_000)
  const recentFailures = await prisma.moneyTransferRiskLog.count({
    where: {
      userId,
      createdAt: { gte: since15 },
      OR: [{ blocked: true }, { stepUpRequired: true }],
    },
  })
  if (recentFailures >= 4) signals.push("FREQUENT_RETRIES")

  if (receiverId && (action === "SEND_MONEY" || action === "SCHEDULED_TRANSFER")) {
    const prior = await prisma.moneyTransfer.count({
      where: {
        senderId: userId,
        receiverId,
        status: { in: ["COMPLETED", "PROCESSING", "SENT"] },
      },
    })
    if (prior === 0) signals.push("NEW_BENEFICIARY")
  }

  if (amount != null && amount > 0) {
    const recent = await prisma.moneyTransfer.findMany({
      where: { senderId: userId, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { amount: true },
    })
    if (recent.length >= 3) {
      const avg = recent.reduce((s, t) => s + t.amount, 0) / recent.length
      if (amount >= avg * 3 && amount >= 500) signals.push("LARGE_AMOUNT_SPIKE")
    } else if (amount >= 2000) {
      signals.push("LARGE_AMOUNT_SPIKE")
    }
  }

  const riskScore = [...new Set(signals)].reduce((s, sig) => s + (SIGNAL_SCORES[sig] ?? 0), 0)
  const blocked =
    signals.includes("DEVELOPER_MODE") ||
    signals.includes("SIMULATOR") ||
    riskScore >= BLOCK_THRESHOLD ||
    recentFailures >= 8

  const requiresStepUp =
    !blocked &&
    (riskScore >= STEP_UP_THRESHOLD || signals.includes("NEW_DEVICE"))

  let message: string | undefined
  if (blocked) {
    if (signals.includes("DEVELOPER_MODE") || signals.includes("SIMULATOR")) {
      message = "Money transfer is not available in developer or simulator mode."
    } else if (signals.includes("FREQUENT_RETRIES")) {
      message = "Too many attempts. Please try again later or contact support."
    } else {
      message = "This action was blocked for your security. Contact support if you need help."
    }
  } else if (requiresStepUp) {
    message = "Additional verification required to continue."
  }

  await prisma.moneyTransferRiskLog.create({
    data: {
      userId,
      action,
      riskScore,
      signals: [...new Set(signals)],
      blocked,
      stepUpRequired: requiresStepUp,
      ipAddress: meta.ipAddress,
      countryCode,
      deviceFingerprint: fingerprint ?? null,
      metadata: {
        amount,
        receiverId,
        bankAccountId: input.bankAccountId,
      },
    },
  })

  if (fingerprint && !blocked) {
    const existing = await prisma.moneyTransferTrustedDevice.findUnique({
      where: { userId_deviceFingerprint: { userId, deviceFingerprint: fingerprint } },
    })
    if (existing) {
      await prisma.moneyTransferTrustedDevice.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          lastIp: meta.ipAddress,
          lastCountryCode: countryCode ?? existing.lastCountryCode,
          deviceLabel: client?.deviceLabel ?? existing.deviceLabel,
          platform: client?.platform ?? existing.platform,
        },
      })
    }
  }

  return { riskScore, signals: [...new Set(signals)], blocked, requiresStepUp, message }
}

export async function createMoneyStepUpChallenge(args: {
  userId: string
  action: MoneyRiskAction
  deviceFingerprint?: string
  signals: RiskSignal[]
  riskScore: number
}): Promise<{ challengeId: string; expiresAt: Date }> {
  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { phone: true, email: true },
  })
  if (!user?.phone) {
    throw new Error("A verified phone number is required for security verification.")
  }

  const code = generateOTP()
  const expiresAt = new Date(Date.now() + 10 * 60_000)

  const challenge = await prisma.moneyTransferStepUp.create({
    data: {
      userId: args.userId,
      action: args.action,
      code,
      deviceFingerprint: args.deviceFingerprint,
      signals: args.signals,
      riskScore: args.riskScore,
      expiresAt,
    },
  })

  
  const systemSettings = await getSystemSettings()
  const emailData = {
    otpCode: code,
    appName: systemSettings.appName || 'Kilo',
    appUrl: systemSettings.appUrl || 'https://kilo.com',
    customerName: user.email || 'Customer',
  } 

  await sendOTP(user.phone, code)
  await sendEmailFromTemplate(
    user?.email, 
    "OTP_VERIFICATION",
     emailData,
     "GLOBAL",
     "VERIFICATION"
    )

  return { challengeId: challenge.id, expiresAt }
}

export async function verifyMoneyStepUp(args: {
  userId: string
  challengeId: string
  code: string
  trustDevice?: boolean
  deviceFingerprint?: string
  deviceLabel?: string
  platform?: string
}): Promise<{ stepUpToken: string; expiresAt: Date }> {
  const challenge = await prisma.moneyTransferStepUp.findFirst({
    where: {
      id: args.challengeId,
      userId: args.userId,
      verifiedAt: null,
      expiresAt: { gt: new Date() },
    },
  })

  if (!challenge || challenge.code !== args.code.trim()) {
    throw new Error("Invalid or expired verification code")
  }

  await prisma.moneyTransferStepUp.update({
    where: { id: challenge.id },
    data: { verifiedAt: new Date(), trustDevice: Boolean(args.trustDevice) },
  })

  const fp = args.deviceFingerprint || challenge.deviceFingerprint
  if (args.trustDevice && fp) {
    await prisma.moneyTransferTrustedDevice.upsert({
      where: { userId_deviceFingerprint: { userId: args.userId, deviceFingerprint: fp } },
      create: {
        userId: args.userId,
        deviceFingerprint: fp,
        deviceLabel: args.deviceLabel,
        platform: args.platform,
      },
      update: {
        lastSeenAt: new Date(),
        deviceLabel: args.deviceLabel,
        platform: args.platform,
      },
    })
  }

  const expiresAt = new Date(Date.now() + 15 * 60_000)
  return { stepUpToken: challenge.id, expiresAt }
}

export async function assertValidMoneyStepUp(args: {
  userId: string
  stepUpToken?: string | null
  action: MoneyRiskAction
}): Promise<void> {
  if (!args.stepUpToken) {
    throw new MoneyRiskStepUpRequired("Step-up verification required")
  }

  const challenge = await prisma.moneyTransferStepUp.findFirst({
    where: {
      id: args.stepUpToken,
      userId: args.userId,
      action: args.action,
      verifiedAt: { not: null },
    },
  })

  if (!challenge) {
    throw new MoneyRiskStepUpRequired("Invalid or expired step-up token")
  }

  const maxAge = challenge.verifiedAt!.getTime() + 15 * 60_000
  if (Date.now() > maxAge) {
    throw new MoneyRiskStepUpRequired("Step-up verification expired. Please verify again.")
  }
}

export class MoneyRiskBlocked extends Error {
  readonly code = "MONEY_RISK_BLOCKED"
  constructor(message: string) {
    super(message)
  }
}

export class MoneyRiskStepUpRequired extends Error {
  readonly code = "MONEY_STEP_UP_REQUIRED"
  constructor(message: string) {
    super(message)
  }
}

export function readMoneyRiskClientContext(
  request: NextRequest,
  body?: Record<string, unknown>,
): MoneyRiskClientContext {
  const h = request.headers
  const devBypass = isMoneySecurityDevelopment()
  return {
    deviceFingerprint:
      (body?.deviceFingerprint as string) ||
      h.get("x-money-device-id") ||
      undefined,
    deviceLabel: (body?.deviceLabel as string) || h.get("x-money-device-label") || undefined,
    platform: (body?.platform as string) || h.get("x-money-platform") || undefined,
    developerMode: devBypass
      ? false
      : body?.developerMode === true ||
        h.get("x-money-developer-mode") === "1" ||
        h.get("x-money-developer-mode") === "true",
    simulator: devBypass
      ? false
      : body?.simulator === true ||
        h.get("x-money-simulator") === "1" ||
        h.get("x-money-simulator") === "true",
    vpnDetected: devBypass
      ? false
      : body?.vpnDetected === true ||
        h.get("x-money-vpn") === "1" ||
        h.get("x-money-vpn") === "true",
    timezoneOffsetMinutes:
      body?.timezoneOffsetMinutes != null
        ? Number(body.timezoneOffsetMinutes)
        : h.get("x-money-tz-offset")
          ? Number(h.get("x-money-tz-offset"))
          : undefined,
  }
}

export async function enforceMoneyTransferSecurity(args: {
  userId: string
  action: MoneyRiskAction
  request: NextRequest
  body?: Record<string, unknown>
  amount?: number
  currency?: string
  receiverId?: string
  bankAccountId?: string
}): Promise<MoneyRiskAssessment> {
  const client = readMoneyRiskClientContext(args.request, args.body)
  const stepUpToken =
    args.request.headers.get("x-money-step-up-token") ||
    (args.body?.stepUpToken as string | undefined)

  const assessment = await assessMoneyTransferRisk({
    userId: args.userId,
    action: args.action,
    amount: args.amount,
    currency: args.currency,
    receiverId: args.receiverId,
    bankAccountId: args.bankAccountId,
    request: args.request,
    client,
  })

  if (assessment.blocked) {
    throw new MoneyRiskBlocked(assessment.message || "Action blocked")
  }

  if (assessment.requiresStepUp) {
    if (!stepUpToken?.trim()) {
      throw new MoneyRiskStepUpRequired(
        assessment.message || "Complete OTP verification before continuing.",
      )
    }
    await assertValidMoneyStepUp({
      userId: args.userId,
      stepUpToken,
      action: args.action,
    })
  }

  return assessment
}
