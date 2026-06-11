/** Maps persisted user relations to app module strings (JWT / client). */

export type AuthUserModuleSource = {
  autoPartsStore?: unknown
  pharmacy?: unknown
  restaurant?: unknown
  mechanicProfile?: unknown
  groceryStore?: unknown
  riderProfile?: unknown
  wholesaler?: unknown
  vendorProfile?: { businessType?: string | null } | null
  propertyListings?: unknown[] | unknown
  propertyHostMembership?: { status?: string } | null
  _count?: { propertyListings?: number }
}

export function isPropertyHostUser(user: AuthUserModuleSource): boolean {
  if (user.propertyHostMembership?.status === "ACTIVE") return true
  const businessType = String(user.vendorProfile?.businessType || "").toLowerCase()
  if (businessType.includes("property")) return true
  const listingCount =
    user._count?.propertyListings ??
    (Array.isArray(user.propertyListings) ? user.propertyListings.length : 0)
  return listingCount > 0
}

/** Client auth payload — includes property team access when applicable. */
export function formatAuthUserPayload(user: {
  id: string
  phone?: string | null
  email?: string | null
  name?: string | null
  role: string
  isVerified: boolean
  isActive: boolean
  status?: string | null
  avatar?: string | null
  userProfile?: unknown
  userSettings?: unknown
  wallet?: unknown
  propertyHostMembership?: {
    accessRole?: string
    hostVendorId?: string
    status?: string
  } | null
} & AuthUserModuleSource) {
  const membership = user.propertyHostMembership
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    name: user.name,
    role: user.role,
    isVerified: user.isVerified,
    isActive: user.isActive,
    status: user.status,
    avatar: user.avatar,
    profile: user.userProfile,
    settings: user.userSettings,
    wallet: user.wallet,
    modules: getUserModules(user),
    propertyHostAccess:
      membership?.status === "ACTIVE" ? membership.accessRole : null,
    hostVendorId:
      membership?.status === "ACTIVE" ? membership.hostVendorId : user.id,
    riderProfile: (user as { riderProfile?: { isCommissionLocked?: boolean; commissionLockReason?: string | null } }).riderProfile
      ? {
          isCommissionLocked: Boolean(
            (user as { riderProfile?: { isCommissionLocked?: boolean } }).riderProfile?.isCommissionLocked
          ),
          commissionLockReason:
            (user as { riderProfile?: { commissionLockReason?: string | null } }).riderProfile?.commissionLockReason ??
            null,
        }
      : undefined,
  }
}

export function getUserModules(user: AuthUserModuleSource): string[] {
  const modules: string[] = []
  if (user.autoPartsStore) modules.push("AUTO_PARTS")
  if (user.pharmacy) modules.push("PHARMACY")
  if (user.restaurant) modules.push("FOOD")
  if (user.groceryStore) modules.push("GROCERY")
  if (user.riderProfile) modules.push("RIDING")
  if (user.mechanicProfile) modules.push("MECHANIC")
  if (user.wholesaler) modules.push("SUPPLIER")
  if (isPropertyHostUser(user)) modules.push("PROPERTY")
  return modules
}

/** Prisma include fragment for login / OTP / me — detects PROPERTY hosts. */
export const authUserModuleInclude = {
  userProfile: true,
  userSettings: true,
  wallet: true,
  autoPartsStore: true,
  pharmacy: true,
  restaurant: true,
  mechanicProfile: true,
  groceryStore: true,
  riderProfile: true,
  wholesaler: true,
  vendorProfile: true,
  propertyHostMembership: { select: { accessRole: true, hostVendorId: true, status: true } },
  _count: { select: { propertyListings: true } },
} as const
