import { prisma } from "@/lib/prisma"

export type PropertyCategoryConfig = {
  id: string
  name: string
  slug: string
  description?: string
  icon?: string | null
  image?: string | null
  isActive?: boolean
  minimumNights?: number
}

export type PropertyDestinationConfig = {
  id: string
  cityName: string
  country: string
  stateRegion?: string
  image?: string | null
  isActive?: boolean
  isFeatured?: boolean
  tourismLevyRate?: number
}

export type PropertyComplianceConfig = {
  id: string
  documentName: string
  isRequired?: boolean
  userType?: "HOST" | "GUEST"
  requiresUpload?: boolean
  allowMultipleFiles?: boolean
  allowCamera?: boolean
  description?: string
}

export type PropertyCollectionFolderConfig = {
  id: string
  label: string
  icon?: string | null
  isActive?: boolean
}

export type PropertyHeroSlideConfig = {
  id: string
  image: string
  label?: string
  isActive?: boolean
}

const DEFAULT_HERO_SLIDES: PropertyHeroSlideConfig[] = [
  {
    id: "hero-1",
    image: "https://images.unsplash.com/photo-1542314831-c6a4d14d83f1?w=1400&q=90",
    label: "Luxury resort",
    isActive: true,
  },
  {
    id: "hero-2",
    image: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1400&q=90",
    label: "Beach villa",
    isActive: true,
  },
  {
    id: "hero-3",
    image: "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=1400&q=90",
    label: "Pool suite",
    isActive: true,
  },
  {
    id: "hero-4",
    image: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1400&q=90",
    label: "Ocean view",
    isActive: true,
  },
]

const DEFAULT_CONFIG = {
  categories: [
    { id: "resort", name: "Resorts", slug: "resort", icon: "island", isActive: true, minimumNights: 1 },
    { id: "hotel", name: "Hotels", slug: "hotel", icon: "office-building", isActive: true, minimumNights: 1 },
    { id: "apartment", name: "Apartments", slug: "apartment", icon: "home-city", isActive: true, minimumNights: 1 },
    { id: "villa", name: "Villas", slug: "villa", icon: "home-variant", isActive: true, minimumNights: 1 },
  ] as PropertyCategoryConfig[],
  destinations: [
    { id: "lagos", cityName: "Lagos", country: "Nigeria", stateRegion: "Lagos State", isActive: true, isFeatured: true },
    { id: "abuja", cityName: "Abuja", country: "Nigeria", stateRegion: "FCT", isActive: true, isFeatured: true },
  ] as PropertyDestinationConfig[],
  compliance: [
    {
      id: "nin",
      documentName: "National ID (NIN)",
      isRequired: true,
      userType: "HOST",
      requiresUpload: false,
      description: "11-digit NIN for individual hosts",
    },
    {
      id: "bvn",
      documentName: "BVN",
      isRequired: true,
      userType: "HOST",
      requiresUpload: false,
      description: "11-digit BVN for payout verification",
    },
    {
      id: "cac",
      documentName: "CAC Registration",
      isRequired: true,
      userType: "HOST",
      requiresUpload: true,
      description: "Business registration for hotel/corporate hosts",
    },
  ] as PropertyComplianceConfig[],
  folders: [
    { id: "retreats", label: "Bali Retreats", icon: "palm-tree", isActive: true },
    { id: "beach", label: "Beachfront", icon: "waves", isActive: true },
    { id: "spas", label: "Wellness Spas", icon: "spa-outline", isActive: true },
  ] as PropertyCollectionFolderConfig[],
  heroSlides: DEFAULT_HERO_SLIDES,
}

function parseJsonArray<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback
}

function normalizeDestinations(destinations: PropertyDestinationConfig[]): PropertyDestinationConfig[] {
  return destinations
    .map((d, index) => ({
      id: String(d.id || `dest-${Date.now()}-${index}`).trim(),
      cityName: String(d.cityName || "").trim(),
      country: String(d.country || "Nigeria").trim(),
      stateRegion: d.stateRegion ? String(d.stateRegion).trim() : undefined,
      image: d.image ?? null,
      isActive: d.isActive !== false,
      isFeatured: !!d.isFeatured,
      tourismLevyRate: Number(d.tourismLevyRate) || 0,
    }))
    .filter((d) => d.id.length > 0 && d.cityName.length > 0)
}

function normalizeHeroSlides(slides: PropertyHeroSlideConfig[]): PropertyHeroSlideConfig[] {
  return slides
    .map((s, index) => ({
      id: String(s.id || `hero-${Date.now()}-${index}`).trim(),
      image: String(s.image || "").trim(),
      label: s.label ? String(s.label).trim() : undefined,
      isActive: s.isActive !== false,
    }))
    .filter((s) => s.id.length > 0 && s.image.length > 0)
}

export async function getPropertyModuleConfig() {
  let row = await prisma.propertyModuleConfig.findUnique({ where: { id: 1 } })
  if (!row) {
    row = await prisma.propertyModuleConfig.create({
      data: {
        id: 1,
        categories: DEFAULT_CONFIG.categories,
        destinations: DEFAULT_CONFIG.destinations,
        compliance: DEFAULT_CONFIG.compliance,
        folders: DEFAULT_CONFIG.folders,
        heroSlides: DEFAULT_CONFIG.heroSlides,
      },
    })
  }
  const heroSlides = parseJsonArray(
    (row as { heroSlides?: unknown }).heroSlides,
    DEFAULT_CONFIG.heroSlides,
  )
  return {
    categories: parseJsonArray(row.categories, DEFAULT_CONFIG.categories),
    destinations: parseJsonArray(row.destinations, DEFAULT_CONFIG.destinations),
    compliance: parseJsonArray(row.compliance, DEFAULT_CONFIG.compliance),
    folders: parseJsonArray(row.folders, DEFAULT_CONFIG.folders),
    heroSlides: normalizeHeroSlides(heroSlides as PropertyHeroSlideConfig[]),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function savePropertyModuleConfig(data: {
  categories?: PropertyCategoryConfig[]
  destinations?: PropertyDestinationConfig[]
  compliance?: PropertyComplianceConfig[]
  folders?: PropertyCollectionFolderConfig[]
  heroSlides?: PropertyHeroSlideConfig[]
}) {
  const current = await getPropertyModuleConfig()
  const updated = await prisma.propertyModuleConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      categories: data.categories ?? current.categories,
      destinations: data.destinations
        ? normalizeDestinations(data.destinations)
        : current.destinations,
      compliance: data.compliance ?? current.compliance,
      folders: data.folders ?? current.folders,
      heroSlides: data.heroSlides
        ? normalizeHeroSlides(data.heroSlides)
        : current.heroSlides,
    },
    update: {
      ...(data.categories ? { categories: data.categories } : {}),
      ...(data.destinations
        ? { destinations: normalizeDestinations(data.destinations) }
        : {}),
      ...(data.compliance ? { compliance: data.compliance } : {}),
      ...(data.folders ? { folders: data.folders } : {}),
      ...(data.heroSlides ? { heroSlides: normalizeHeroSlides(data.heroSlides) } : {}),
    },
  })
  const heroSlides = parseJsonArray(
    (updated as { heroSlides?: unknown }).heroSlides,
    DEFAULT_CONFIG.heroSlides,
  )
  return {
    categories: parseJsonArray(updated.categories, DEFAULT_CONFIG.categories),
    destinations: parseJsonArray(updated.destinations, DEFAULT_CONFIG.destinations),
    compliance: parseJsonArray(updated.compliance, DEFAULT_CONFIG.compliance),
    folders: parseJsonArray(updated.folders, DEFAULT_CONFIG.folders),
    heroSlides: normalizeHeroSlides(heroSlides as PropertyHeroSlideConfig[]),
    updatedAt: updated.updatedAt.toISOString(),
  }
}

export function getHostComplianceRequirements(
  compliance: PropertyComplianceConfig[],
  partnerType: string
) {
  const isBusiness = partnerType === "hotel" || partnerType === "corporate"
  return compliance.filter((c) => {
    if (!c.isRequired) return false
    if (c.userType === "GUEST") return false
    if (isBusiness && c.id === "cac") return true
    if (!isBusiness && (c.id === "nin" || c.id === "bvn")) return true
    if (c.userType === "HOST" || !c.userType) return true
    return false
  })
}

export function getGuestComplianceRequirements(compliance: PropertyComplianceConfig[]) {
  return compliance.filter((c) => c.isRequired && c.userType === "GUEST")
}
