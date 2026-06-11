/**
 * Seeds 2 property host vendors + 1 customer and 5 ACTIVE listings per host in Karachi.
 * Run: npx tsx scripts/seed-property-karachi.ts
 */
import "dotenv/config"
import { PrismaClient, PropertyListingType } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

const HOSTS = [
  {
    email: "karachi.host1@killo.test",
    phone: "+923001111001",
    name: "Ayesha Khan",
    businessName: "Clifton Luxe Stays",
  },
  {
    email: "karachi.host2@killo.test",
    phone: "+923001111002",
    name: "Omar Siddiqui",
    businessName: "DHA Premium Homes",
  },
]

const CUSTOMER = {
  email: "karachi.guest@killo.test",
  phone: "+923009999001",
  name: "Sara Malik",
}

const LISTINGS_BY_HOST: Array<{
  suffix: string
  listings: Array<{
    title: string
    tagline: string
    type: PropertyListingType
    area: string
    address: string
    lat: number
    lng: number
    nightlyRate: number
    amenities: string[]
    badge: string
    rating: number
    reviewCount: number
  }>
}> = [
  {
    suffix: "h1",
    listings: [
      { title: "Clifton Sea View Suite", tagline: "Ocean breeze and skyline views", type: "HOTEL", area: "Clifton", address: "Block 8, Clifton, Karachi", lat: 24.8138, lng: 67.0299, nightlyRate: 18500, amenities: ["pool", "wifi", "butler"], badge: "Editor's Choice", rating: 4.92, reviewCount: 48 },
      { title: "PECHS Executive Apartment", tagline: "Central Karachi business stay", type: "APARTMENT", area: "PECHS", address: "PECHS Block 2, Karachi", lat: 24.8671, lng: 67.0742, nightlyRate: 12000, amenities: ["wifi", "gym"], badge: "Top Rated", rating: 4.85, reviewCount: 31 },
      { title: "Saddar Heritage Loft", tagline: "Walk to cultural landmarks", type: "APARTMENT", area: "Saddar", address: "Preedy Street, Saddar, Karachi", lat: 24.8546, lng: 67.0203, nightlyRate: 9500, amenities: ["wifi"], badge: "Value Pick", rating: 4.71, reviewCount: 19 },
      { title: "Sea View Penthouse", tagline: "Private terrace overlooking the Arabian Sea", type: "VILLA", area: "Sea View", address: "Sea View Avenue, Karachi", lat: 24.7881, lng: 67.0382, nightlyRate: 32000, amenities: ["pool", "spa", "wifi", "butler"], badge: "Ultra Luxury", rating: 4.97, reviewCount: 22 },
      { title: "Nazimabad Family Villa", tagline: "Quiet gated neighborhood", type: "HOUSE", area: "Nazimabad", address: "Nazimabad No. 2, Karachi", lat: 24.9153, lng: 67.0292, nightlyRate: 14000, amenities: ["wifi", "power"], badge: "Family Friendly", rating: 4.78, reviewCount: 14 },
    ],
  },
  {
    suffix: "h2",
    listings: [
      { title: "DHA Phase 5 Designer Villa", tagline: "Modern architecture and private garden", type: "VILLA", area: "DHA Phase 5", address: "Street 12, DHA Phase 5, Karachi", lat: 24.7924, lng: 67.0562, nightlyRate: 28000, amenities: ["pool", "wifi", "chef"], badge: "Signature", rating: 4.94, reviewCount: 36 },
      { title: "DHA Phase 6 Pool House", tagline: "Entertain in style", type: "VILLA", area: "DHA Phase 6", address: "Lane 4, DHA Phase 6, Karachi", lat: 24.7782, lng: 67.0751, nightlyRate: 35000, amenities: ["pool", "spa", "wifi", "butler"], badge: "Premium", rating: 4.96, reviewCount: 27 },
      { title: "Bahria Town Karachi Resort Suite", tagline: "Resort amenities within the city", type: "HOTEL", area: "Bahria Town", address: "Bahria Town Karachi", lat: 25.0122, lng: 67.3126, nightlyRate: 16000, amenities: ["pool", "gym", "wifi"], badge: "Resort", rating: 4.82, reviewCount: 41 },
      { title: "Gulshan Family Apartment", tagline: "Spacious 3-bedroom near main road", type: "APARTMENT", area: "Gulshan-e-Iqbal", address: "Gulshan-e-Iqbal Block 13, Karachi", lat: 24.9142, lng: 67.0822, nightlyRate: 11000, amenities: ["wifi", "power"], badge: "Popular", rating: 4.74, reviewCount: 33 },
      { title: "Shahrah-e-Faisal Business Hotel", tagline: "Minutes from airport corridor", type: "HOTEL", area: "Shahrah-e-Faisal", address: "Shahrah-e-Faisal, Karachi", lat: 24.8661, lng: 67.1301, nightlyRate: 13500, amenities: ["wifi", "gym", "restaurant"], badge: "Business", rating: 4.69, reviewCount: 52 },
    ],
  },
]

async function upsertUser(params: {
  email: string
  phone: string
  name: string
  role: "VENDOR" | "CUSTOMER"
  password: string
}) {
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

async function main() {
  const password = process.env.PROPERTY_SEED_PASSWORD || "Killo@1234"

  const customer = await upsertUser({ ...CUSTOMER, role: "CUSTOMER", password })
  console.log(`Customer: ${customer.email}`)

  for (let h = 0; h < HOSTS.length; h++) {
    const hostDef = HOSTS[h]
    const host = await upsertUser({
      email: hostDef.email,
      phone: hostDef.phone,
      name: hostDef.name,
      role: "VENDOR",
      password,
    })

    await prisma.vendorProfile.upsert({
      where: { userId: host.id },
      create: {
        userId: host.id,
        businessName: hostDef.businessName,
        businessType: "Property Host",
        description: `Premium stays across Karachi — managed by ${hostDef.name}`,
        address: "Karachi, Sindh",
        city: "Karachi",
        state: "Sindh",
        latitude: 24.8607,
        longitude: 67.0011,
      },
      update: {
        businessName: hostDef.businessName,
        city: "Karachi",
        state: "Sindh",
      },
    })

    const pack = LISTINGS_BY_HOST[h]
    for (const L of pack.listings) {
      const id = `seed-khi-${pack.suffix}-${L.title.replace(/\s+/g, "-").toLowerCase().slice(0, 40)}`
      await prisma.propertyListing.upsert({
        where: { id },
        create: {
          id,
          vendorId: host.id,
          type: L.type,
          title: L.title,
          tagline: L.tagline,
          description: `${L.tagline}. Located in ${L.area}, Karachi. Fully verified address for accurate search and maps.`,
          address: L.address,
          city: "Karachi",
          state: "Sindh",
          country: "Pakistan",
          zip: "75000",
          latitude: L.lat,
          longitude: L.lng,
          nightlyRate: L.nightlyRate,
          cleaningFee: 1500,
          securityDeposit: 5000,
          amenities: L.amenities,
          images: [
            "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80",
            "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=1200&q=80",
          ],
          badge: L.badge,
          rating: L.rating,
          reviewCount: L.reviewCount,
          status: "ACTIVE",
          requiresApproval: true,
          sqm: 180,
        },
        update: {
          vendorId: host.id,
          title: L.title,
          address: L.address,
          city: "Karachi",
          latitude: L.lat,
          longitude: L.lng,
          nightlyRate: L.nightlyRate,
          rating: L.rating,
          reviewCount: L.reviewCount,
          status: "ACTIVE",
        },
      })
    }
    console.log(`Host ${host.email}: 5 listings in Karachi`)
  }

  console.log("\nDone. Login hosts with PROPERTY_SEED_PASSWORD (default Killo@1234)")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
