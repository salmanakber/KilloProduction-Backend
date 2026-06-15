import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import type { User } from "@prisma/client"

export const MONEY_TRANSFER_AUDIT_ENTITY = "MONEY_TRANSFER"
export const MONEY_TRANSFER_CASE_ENTITY = "MONEY_TRANSFER_CASE"
export const MONEY_TRANSFER_PAYOUT_ENTITY = "MONEY_TRANSFER_PAYOUT"

export type MoneyAdminUser = Pick<User, "id" | "role" | "email" | "name">

export function getRequestMeta(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null
  const userAgent = request.headers.get("user-agent") || null
  return { ipAddress: ip, userAgent }
}

export async function requireMoneyTransferAdmin(
  request?: NextRequest,
  options?: { superAdminOnly?: boolean },
): Promise<{ user: MoneyAdminUser; meta: ReturnType<typeof getRequestMeta> }> {
  const user = await authenticateRequest(request)
  if (!user) {
    throw new MoneyAdminAuthError("Unauthorized", 401)
  }
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    throw new MoneyAdminAuthError("Forbidden — admin access required", 403)
  }
  if (options?.superAdminOnly && user.role !== "SUPER_ADMIN") {
    throw new MoneyAdminAuthError("Forbidden — super admin required for this action", 403)
  }
  const meta = request ? getRequestMeta(request) : { ipAddress: null, userAgent: null }
  return {
    user: { id: user.id, role: user.role, email: user.email, name: user.name },
    meta,
  }
}

export class MoneyAdminAuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function logMoneyTransferAdminAction(args: {
  performedBy: string
  action: string
  entityType: string
  entityId: string
  details?: Record<string, unknown>
  ipAddress?: string | null
  userAgent?: string | null
}) {
  await prisma.auditLog.create({
    data: {
      performedBy: args.performedBy,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      details: (args.details ?? {}) as object,
      ipAddress: args.ipAddress ?? undefined,
      userAgent: args.userAgent ?? undefined,
    },
  })
}

export function generateMoneyCaseTicketNumber(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `MTC-${y}${m}${day}-${rand}`
}

/** Require confirmation token: `CONFIRM:<reference>` in body for destructive ops. */
export function assertAdminConfirmation(
  provided: string | undefined | null,
  expectedReference: string,
  alternates?: string[],
) {
  const normalized = String(provided ?? "").trim()
  const candidates = [
    `CONFIRM:${expectedReference}`,
    ...(alternates ?? []).map((a) => `CONFIRM:${a}`),
  ]
  if (!normalized || !candidates.includes(normalized)) {
    throw new MoneyAdminAuthError(
      `Confirmation required. Pass confirmToken: "${candidates[0]}"`,
      400,
    )
  }
}

/** Short payout confirmation token shown in admin UI (avoids long reference mismatches). */
export function payoutAdminConfirmToken(payoutId: string) {
  return `CONFIRM:PO-${payoutId.slice(0, 8)}`
}

export function assertPayoutAdminConfirmation(
  provided: string | undefined | null,
  payoutId: string,
) {
  const expected = payoutAdminConfirmToken(payoutId)
  const normalized = String(provided ?? "").trim()
  if (normalized !== expected) {
    throw new MoneyAdminAuthError(
      `Confirmation required. Pass confirmToken: "${expected}"`,
      400,
    )
  }
}
