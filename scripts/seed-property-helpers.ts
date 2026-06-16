import { PrismaClient, PropertyListingType } from "@prisma/client"
import bcrypt from "bcryptjs"

export type PropertyListingSeed = {
  title: string
  tagline: string
  type: PropertyListingType
  categorySlug?: string
  area: string
  address: string
  lat: number
  lng: number
  nightlyRate: number
  cleaningFee?: number
  securityDeposit?: number
  discountPercent?: number
  amenities: string[]
  images: string[]
  badge: string
  guestTier?: "Standard" | "Platinum" | "VIP"
  rating: number
  reviewCount: number
  sqm?: number
  bedrooms?: number
  beds?: number
  masterBeds?: number
  maxAdults?: number
  maxChildren?: number
  maxInfants?: number
  hasGatedCommunity?: boolean
  hasOceanfront?: boolean
  hasClifftop?: boolean
  hasJungleView?: boolean
  videoUrl?: string | null
  tourUrl?: string | null
  wifiSsid?: string | null
  wifiPassword?: string | null
  gatePin?: string | null
  requireGuidedSelfie?: boolean
  requiresApproval?: boolean
}

export type CitySeedConfig = {
  city: string
  state: string
  country: string
  zip: string
  centerLat: number
  centerLng: number
}

export async function upsertSeedUser(
  prisma: PrismaClient,
  params: {
    email: string
    phone: string
    name: string
    role: "VENDOR" | "CUSTOMER"
    password: string
  }
) {
  const passwordHash = await bcrypt.hash(params.password, 12)
  return prisma.user.upsert({
    where: { email: params.email },
    create: {
      email: params.email,
      phone: params.phone,
      name: params.name,
      role: params.role,
      password: passwordHash,
      isVerified: true,
      isActive: true,
      status: "ACTIVE",
    },
    update: {
      name: params.name,
      role: params.role,
      password: passwordHash,
      isVerified: true,
      isActive: true,
      status: "ACTIVE",
    },
  })
}

export async function upsertPropertyHost(
  prisma: PrismaClient,
  params: {
    host: { email: string; phone: string; name: string }
    password: string
    businessName: string
    cityConfig: CitySeedConfig
    description: string
  }
) {
  const user = await upsertSeedUser(prisma, {
    ...params.host,
    role: "VENDOR",
    password: params.password,
  })

  await prisma.vendorProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      businessName: params.businessName,
      businessType: "Property Host",
      description: params.description,
      address: `${params.cityConfig.city}, ${params.cityConfig.state}`,
      city: params.cityConfig.city,
      state: params.cityConfig.state,
      latitude: params.cityConfig.centerLat,
      longitude: params.cityConfig.centerLng,
    },
    update: {
      businessName: params.businessName,
      city: params.cityConfig.city,
      state: params.cityConfig.state,
      description: params.description,
    },
  })

  return user
}

function listingId(prefix: string, suffix: string, title: string) {
  const slug = title.replace(/\s+/g, "-").toLowerCase().slice(0, 40)
  return `seed-${prefix}-${suffix}-${slug}`
}

export async function upsertPropertyListing(
  prisma: PrismaClient,
  params: {
    idPrefix: string
    hostSuffix: string
    vendorId: string
    listing: PropertyListingSeed
    cityConfig: CitySeedConfig
  }
) {
  const L = params.listing
  const id = listingId(params.idPrefix, params.hostSuffix, L.title)
  const description =
    `${L.tagline}. Located in ${L.area}, ${params.cityConfig.city}. Fully verified address for maps and nearby search. ` +
    `${L.bedrooms ?? 1} bedroom(s), ${L.beds ?? 1} bed(s), ${L.sqm ?? 120} sqm.`

  const data = {
    vendorId: params.vendorId,
    type: L.type,
    categorySlug: L.categorySlug ?? L.type.toLowerCase(),
    title: L.title,
    tagline: L.tagline,
    description,
    address: L.address,
    city: params.cityConfig.city,
    state: params.cityConfig.state,
    zip: params.cityConfig.zip,
    country: params.cityConfig.country,
    latitude: L.lat,
    longitude: L.lng,
    hasGatedCommunity: L.hasGatedCommunity ?? false,
    hasOceanfront: L.hasOceanfront ?? false,
    hasClifftop: L.hasClifftop ?? false,
    hasJungleView: L.hasJungleView ?? false,
    amenities: L.amenities,
    images: L.images,
    videoUrl: L.videoUrl ?? null,
    tourUrl: L.tourUrl ?? null,
    nightlyRate: L.nightlyRate,
    cleaningFee: L.cleaningFee ?? 2500,
    securityDeposit: L.securityDeposit ?? 15000,
    discountPercent: L.discountPercent ?? 0,
    badge: L.badge,
    guestTier: L.guestTier ?? "Standard",
    sqm: L.sqm ?? 120,
    bedrooms: L.bedrooms ?? 1,
    beds: L.beds ?? 1,
    masterBeds: L.masterBeds ?? 0,
    maxAdults: L.maxAdults ?? 2,
    maxChildren: L.maxChildren ?? 0,
    maxInfants: L.maxInfants ?? 0,
    wifiSsid: L.wifiSsid ?? `Killo-${L.area.replace(/\s+/g, "")}`,
    wifiPassword: L.wifiPassword ?? "Welcome2024",
    gatePin: L.gatePin ?? null,
    status: "ACTIVE" as const,
    requiresApproval: L.requiresApproval ?? true,
    requireGuidedSelfie: L.requireGuidedSelfie ?? false,
    rating: L.rating,
    reviewCount: L.reviewCount,
  }

  return prisma.propertyListing.upsert({
    where: { id },
    create: { id, ...data },
    update: data,
  })
}
