import { prisma } from "@/lib/prisma"
import type { Prisma, RiderStatus, PharmacyStatus } from "@prisma/client"

export async function getKycDefaultCurrencyCode(): Promise<string> {
  const defaultCurrency = await prisma.currency.findFirst({
    where: { isDefault: true },
    select: { code: true },
  })
  return defaultCurrency?.code || process.env.DEFAULT_CURRENCY || "USD"
}

export async function ensureUserWalletAndProfile(
  userId: string,
  displayName: string
): Promise<void> {
  const currencyCode = await getKycDefaultCurrencyCode()
  const fullName = displayName.trim() || "User"
  const [firstName, ...rest] = fullName.split(/\s+/)
  const lastName = rest.join(" ")

  await prisma.wallet.upsert({
    where: { userId },
    update: { currency: currencyCode },
    create: { userId, balance: 0, currency: currencyCode },
  })
  await prisma.userProfile.upsert({
    where: { userId },
    update: { firstName: firstName || null, lastName: lastName || null },
    create: { userId, firstName: firstName || null, lastName: lastName || null },
  })
}

/** Mark user active/verified and resolve outstanding KYC rejections. */
export async function applyUserKycApproved(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      isActive: true,
      isVerified: true,
      status: "ACTIVE",
    },
  })
  await prisma.kycRejection.updateMany({
    where: { userId, isResolved: false },
    data: { isResolved: true, resolvedAt: new Date() },
  })
}

/** Mark user inactive/rejected — used on admin KYC rejection. */
export async function applyUserKycRejected(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      isActive: false,
      isVerified: false,
      status: "REJECTED",
    },
  })
}

export async function applyRiderKycApproved(userId: string, adminId: string): Promise<void> {
  await prisma.riderProfile.update({
    where: { userId },
    data: {
      isApproved: true,
      isVerified: true,
      status: "APPROVED" as RiderStatus,
      approvedAt: new Date(),
      approvedBy: adminId,
      verificationNotes: null,
    },
  })
}

export async function applyRiderKycRejected(userId: string, reason: string): Promise<void> {
  await prisma.riderProfile.update({
    where: { userId },
    data: {
      isApproved: false,
      isVerified: false,
      status: "REJECTED" as RiderStatus,
      approvedAt: null,
      approvedBy: null,
      verificationNotes: reason,
      isAvailable: false,
    },
  })
}

export async function applyPharmacyKycApproved(pharmacyId: string): Promise<void> {
  await prisma.pharmacy.update({
    where: { id: pharmacyId },
    data: {
      status: "APPROVED" as PharmacyStatus,
      approvalDate: new Date(),
      rejectedAt: null,
      rejectionReason: null,
      isVerified: true,
      isApprovedByAdmin: true,
    },
  })
}

export async function applyPharmacyKycRejected(
  pharmacyId: string,
  reason: string
): Promise<void> {
  await prisma.pharmacy.update({
    where: { id: pharmacyId },
    data: {
      status: "REJECTED" as PharmacyStatus,
      approvalDate: null,
      rejectedAt: new Date(),
      rejectionReason: reason,
      isVerified: false,
      isApprovedByAdmin: false,
    },
  })
}

export async function applyAutoPartsStoreKycApproved(storeId: string): Promise<void> {
  await prisma.autoPartsStore.update({
    where: { id: storeId },
    data: { isVerified: true, isActive: true },
  })
}

export async function applyAutoPartsStoreKycRejected(storeId: string): Promise<void> {
  await prisma.autoPartsStore.update({
    where: { id: storeId },
    data: { isVerified: false, isActive: false },
  })
}

export async function applyBookingHostKycApproved(hostUserId: string): Promise<void> {
  await applyUserKycApproved(hostUserId)
  await prisma.propertyListing.updateMany({
    where: { vendorId: hostUserId, status: "DRAFT" },
    data: { status: "ACTIVE", requiresApproval: false },
  })
}

export async function applyBookingHostKycRejected(
  hostUserId: string,
  reason?: string | null
): Promise<void> {
  await applyUserKycRejected(hostUserId)
  await prisma.propertyListing.updateMany({
    where: { vendorId: hostUserId, status: { in: ["DRAFT", "ACTIVE"] } },
    data: { status: "INACTIVE", requiresApproval: true },
  })
}

export async function createKycRejectionRecord(input: {
  entityType: string
  entityId: string
  userId: string
  rejectionReason: string
  rejectedBy: string
  rejectedFields?: Prisma.InputJsonValue
}): Promise<void> {
  await prisma.kycRejection.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      userId: input.userId,
      rejectionReason: input.rejectionReason,
      rejectedFields: input.rejectedFields,
      rejectedBy: input.rejectedBy,
    },
  })
}
