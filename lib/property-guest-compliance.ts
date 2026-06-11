import { prisma } from "@/lib/prisma"
import { getPropertyModuleConfig, getGuestComplianceRequirements, type PropertyComplianceConfig } from "@/lib/property-module-config"

export type GuestVerificationFile = {
  url: string
  source: "camera" | "gallery"
  uploadedAt: string
}

export async function getGuestComplianceStatus(userId: string) {
  const config = await getPropertyModuleConfig()
  const required = getGuestComplianceRequirements(config.compliance)
  if (required.length === 0) {
    return { required: [], satisfied: true, pending: [], submissions: [] }
  }

  const submissions = await prisma.propertyGuestVerification.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  })

  const latestByCompliance = new Map<string, (typeof submissions)[0]>()
  for (const row of submissions) {
    if (!latestByCompliance.has(row.complianceId)) {
      latestByCompliance.set(row.complianceId, row)
    }
  }

  const pending = required.filter((rule) => {
    const sub = latestByCompliance.get(rule.id)
    return !sub || sub.status === "REJECTED" || sub.status === "PENDING"
  })

  const satisfied = pending.length === 0 && required.every((rule) => {
    const sub = latestByCompliance.get(rule.id)
    return sub && (sub.status === "APPROVED" || sub.status === "SUBMITTED")
  })

  return {
    required,
    satisfied,
    pending,
    submissions: submissions.map((s) => ({
      id: s.id,
      complianceId: s.complianceId,
      documentName: s.documentName,
      files: s.files,
      status: s.status,
      rejectionReason: s.rejectionReason,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  }
}

export async function assertGuestComplianceForBooking(userId: string) {
  const status = await getGuestComplianceStatus(userId)
  if (!status.satisfied && status.pending.length > 0) {
    const names = status.pending.map((p: PropertyComplianceConfig) => p.documentName).join(", ")
    throw new Error(`Complete booking verification first: ${names}`)
  }
  return status.submissions
    .filter((s) => s.status === "APPROVED" || s.status === "SUBMITTED")
    .map((s) => s.id)
}

export async function linkVerificationsToBooking(bookingId: string, verificationIds: string[]) {
  const unique = Array.from(new Set(verificationIds.filter(Boolean)))
  if (unique.length === 0) return
  await prisma.propertyBookingVerification.createMany({
    data: unique.map((verificationId) => ({ bookingId, verificationId })),
    skipDuplicates: true,
  })
}
