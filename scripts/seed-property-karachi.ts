/**
 * Seeds 2 property host vendors + 1 customer and 5 ACTIVE listings per host in Karachi.
 * Run: npx tsx scripts/seed-property-karachi.ts
 */
import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import {
  type CitySeedConfig,
  type PropertyListingSeed,
  upsertPropertyHost,
  upsertPropertyListing,
  upsertSeedUser,
} from "./seed-property-helpers"

const prisma = new PrismaClient()

const KARACHI: CitySeedConfig = {
  city: "Karachi",
  state: "Sindh",
  country: "Pakistan",
  zip: "75000",
  centerLat: 24.8607,
  centerLng: 67.0011,
}

const HOSTS = [
  {
    email: "karachi.host1@killo.test",
    phone: "+923001111001",
    name: "Ayesha Khan",
    businessName: "Clifton Luxe Stays",
    suffix: "h1",
    description: "Premium stays across Clifton, PECHS, and Sea View — managed by Ayesha Khan",
  },
  {
    email: "karachi.host2@killo.test",
    phone: "+923001111002",
    name: "Omar Siddiqui",
    businessName: "DHA Premium Homes",
    suffix: "h2",
    description: "Designer villas and business hotels across DHA and mainland Karachi",
  },
]

const CUSTOMER = {
  email: "karachi.guest@killo.test",
  phone: "+923009999001",
  name: "Sara Malik",
}

const IMAGES = {
  hotel: [
    "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80",
    "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=1200&q=80",
    "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=1200&q=80",
  ],
  apartment: [
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80",
    "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80",
    "https://images.unsplash.com/photo-1560448204-e02f11c2d0ef?w=1200&q=80",
  ],
  villa: [
    "https://images.unsplash.com/photo-1611892440504-42a784e74f137?w=1200&q=80",
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80",
    "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=1200&q=80",
  ],
  house: [
    "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200&q=80",
    "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200&q=80",
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=80",
  ],
}

const LISTINGS_BY_HOST: Array<{ suffix: string; listings: PropertyListingSeed[] }> = [
  {
    suffix: "h1",
    listings: [
      {
        title: "Clifton Sea View Suite",
        tagline: "Ocean breeze and skyline views",
        type: "HOTEL",
        area: "Clifton",
        address: "Block 8, Clifton, Karachi",
        lat: 24.8138,
        lng: 67.0299,
        nightlyRate: 18500,
        cleaningFee: 1500,
        securityDeposit: 5000,
        amenities: ["pool", "wifi", "butler", "restaurant"],
        images: IMAGES.hotel,
        badge: "Editor's Choice",
        guestTier: "Platinum",
        rating: 4.92,
        reviewCount: 48,
        sqm: 65,
        bedrooms: 1,
        beds: 1,
        masterBeds: 1,
        maxAdults: 2,
        maxChildren: 1,
        hasOceanfront: true,
      },
      {
        title: "PECHS Executive Apartment",
        tagline: "Central Karachi business stay",
        type: "APARTMENT",
        area: "PECHS",
        address: "PECHS Block 2, Karachi",
        lat: 24.8671,
        lng: 67.0742,
        nightlyRate: 12000,
        amenities: ["wifi", "gym", "power", "parking"],
        images: IMAGES.apartment,
        badge: "Top Rated",
        rating: 4.85,
        reviewCount: 31,
        sqm: 110,
        bedrooms: 2,
        beds: 2,
        masterBeds: 1,
        maxAdults: 4,
        maxChildren: 2,
      },
      {
        title: "Saddar Heritage Loft",
        tagline: "Walk to cultural landmarks",
        type: "APARTMENT",
        area: "Saddar",
        address: "Preedy Street, Saddar, Karachi",
        lat: 24.8546,
        lng: 67.0203,
        nightlyRate: 9500,
        amenities: ["wifi", "power"],
        images: IMAGES.apartment,
        badge: "Value Pick",
        rating: 4.71,
        reviewCount: 19,
        sqm: 75,
        bedrooms: 1,
        beds: 1,
        maxAdults: 2,
      },
      {
        title: "Sea View Penthouse",
        tagline: "Private terrace overlooking the Arabian Sea",
        type: "VILLA",
        area: "Sea View",
        address: "Sea View Avenue, Karachi",
        lat: 24.7881,
        lng: 67.0382,
        nightlyRate: 32000,
        cleaningFee: 3000,
        securityDeposit: 12000,
        amenities: ["pool", "spa", "wifi", "butler", "chef"],
        images: IMAGES.villa,
        badge: "Ultra Luxury",
        guestTier: "VIP",
        rating: 4.97,
        reviewCount: 22,
        sqm: 280,
        bedrooms: 3,
        beds: 4,
        masterBeds: 1,
        maxAdults: 6,
        maxChildren: 3,
        hasOceanfront: true,
        hasClifftop: true,
        gatePin: "7721",
      },
      {
        title: "Nazimabad Family Villa",
        tagline: "Quiet gated neighborhood",
        type: "HOUSE",
        area: "Nazimabad",
        address: "Nazimabad No. 2, Karachi",
        lat: 24.9153,
        lng: 67.0292,
        nightlyRate: 14000,
        amenities: ["wifi", "power", "parking", "garden"],
        images: IMAGES.house,
        badge: "Family Friendly",
        rating: 4.78,
        reviewCount: 14,
        sqm: 180,
        bedrooms: 3,
        beds: 4,
        masterBeds: 1,
        maxAdults: 6,
        maxChildren: 4,
        hasGatedCommunity: true,
        gatePin: "4400",
      },
    ],
  },
  {
    suffix: "h2",
    listings: [
      {
        title: "DHA Phase 5 Designer Villa",
        tagline: "Modern architecture and private garden",
        type: "VILLA",
        area: "DHA Phase 5",
        address: "Street 12, DHA Phase 5, Karachi",
        lat: 24.7924,
        lng: 67.0562,
        nightlyRate: 28000,
        amenities: ["pool", "wifi", "chef", "parking"],
        images: IMAGES.villa,
        badge: "Signature",
        guestTier: "VIP",
        rating: 4.94,
        reviewCount: 36,
        sqm: 220,
        bedrooms: 3,
        beds: 4,
        masterBeds: 1,
        maxAdults: 6,
        maxChildren: 3,
        hasGatedCommunity: true,
        gatePin: "5505",
      },
      {
        title: "DHA Phase 6 Pool House",
        tagline: "Entertain in style",
        type: "VILLA",
        area: "DHA Phase 6",
        address: "Lane 4, DHA Phase 6, Karachi",
        lat: 24.7782,
        lng: 67.0751,
        nightlyRate: 35000,
        amenities: ["pool", "spa", "wifi", "butler", "chef"],
        images: IMAGES.villa,
        badge: "Premium",
        guestTier: "VIP",
        rating: 4.96,
        reviewCount: 27,
        sqm: 260,
        bedrooms: 4,
        beds: 5,
        masterBeds: 2,
        maxAdults: 8,
        maxChildren: 4,
        hasGatedCommunity: true,
        gatePin: "6606",
        requireGuidedSelfie: true,
      },
      {
        title: "Bahria Town Karachi Resort Suite",
        tagline: "Resort amenities within the city",
        type: "HOTEL",
        area: "Bahria Town",
        address: "Bahria Town Karachi",
        lat: 25.0122,
        lng: 67.3126,
        nightlyRate: 16000,
        amenities: ["pool", "gym", "wifi", "restaurant"],
        images: IMAGES.hotel,
        badge: "Resort",
        guestTier: "Platinum",
        rating: 4.82,
        reviewCount: 41,
        sqm: 58,
        bedrooms: 1,
        beds: 1,
        maxAdults: 2,
        maxChildren: 2,
      },
      {
        title: "Gulshan Family Apartment",
        tagline: "Spacious 3-bedroom near main road",
        type: "APARTMENT",
        area: "Gulshan-e-Iqbal",
        address: "Gulshan-e-Iqbal Block 13, Karachi",
        lat: 24.9142,
        lng: 67.0822,
        nightlyRate: 11000,
        amenities: ["wifi", "power", "parking"],
        images: IMAGES.apartment,
        badge: "Popular",
        rating: 4.74,
        reviewCount: 33,
        sqm: 125,
        bedrooms: 3,
        beds: 3,
        masterBeds: 1,
        maxAdults: 5,
        maxChildren: 3,
      },
      {
        title: "Shahrah-e-Faisal Business Hotel",
        tagline: "Minutes from airport corridor",
        type: "HOTEL",
        area: "Shahrah-e-Faisal",
        address: "Shahrah-e-Faisal, Karachi",
        lat: 24.8661,
        lng: 67.1301,
        nightlyRate: 13500,
        amenities: ["wifi", "gym", "restaurant", "concierge"],
        images: IMAGES.hotel,
        badge: "Business",
        rating: 4.69,
        reviewCount: 52,
        sqm: 48,
        bedrooms: 1,
        beds: 1,
        maxAdults: 2,
      },
    ],
  },
]

async function main() {
  const password = process.env.PROPERTY_SEED_PASSWORD || "Killo@1234"

  const customer = await upsertSeedUser(prisma, { ...CUSTOMER, role: "CUSTOMER", password })
  console.log(`Customer: ${customer.email}`)

  let totalListings = 0

  for (let h = 0; h < HOSTS.length; h++) {
    const hostDef = HOSTS[h]
    const host = await upsertPropertyHost(prisma, {
      host: hostDef,
      password,
      businessName: hostDef.businessName,
      cityConfig: KARACHI,
      description: hostDef.description,
    })

    const pack = LISTINGS_BY_HOST[h]
    for (const listing of pack.listings) {
      await upsertPropertyListing(prisma, {
        idPrefix: "khi",
        hostSuffix: pack.suffix,
        vendorId: host.id,
        listing,
        cityConfig: KARACHI,
      })
      totalListings++
    }
    console.log(`Host ${host.email}: ${pack.listings.length} listings in Karachi`)
  }

  console.log(`\nDone — ${totalListings} Karachi listings seeded.`)
  console.log("Login: PROPERTY_SEED_PASSWORD (default Killo@1234)")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
