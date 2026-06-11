/**
 * Optional seed: run with `npx tsx scripts/seed-property-listings.ts`
 * Requires an existing VENDOR user id in PROPERTY_SEED_VENDOR_ID env.
 */
import "dotenv/config"
import { prisma } from "../lib/prisma"

async function main() {
  const vendorId = process.env.PROPERTY_SEED_VENDOR_ID
  if (!vendorId) {
    console.error("Set PROPERTY_SEED_VENDOR_ID to a vendor user id")
    process.exit(1)
  }

  const samples = [
    {
      type: "VILLA" as const,
      title: "Bulgari Resort Bali",
      tagline: "Clifftop sophistication suspended above the Indian Ocean",
      city: "Uluwatu, Bali",
      address: "Jl. Goa Lempeh, Banjar Dinas Kangin",
      nightlyRate: 1850,
      cleaningFee: 150,
      securityDeposit: 500,
      latitude: -8.8461,
      longitude: 115.1012,
      amenities: ["pool", "spa", "butler", "beachfront"],
      images: [
        "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=1000&q=80",
      ],
      badge: "Editor's Choice",
    },
    {
      type: "HOTEL" as const,
      title: "Mandapa, Ritz-Carlton",
      tagline: "Riverside sanctuary in Ubud",
      city: "Ubud, Bali",
      address: "Kedewatan, Ubud",
      nightlyRate: 1420,
      cleaningFee: 120,
      securityDeposit: 400,
      latitude: -8.4984,
      longitude: 115.2424,
      amenities: ["pool", "spa", "restaurant"],
      images: [
        "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=1000&q=80",
      ],
      badge: "Top Rated",
    },
  ]

  for (const s of samples) {
    await prisma.propertyListing.upsert({
      where: { id: `seed-${s.title.replace(/\s+/g, "-").toLowerCase()}` },
      create: {
        id: `seed-${s.title.replace(/\s+/g, "-").toLowerCase()}`,
        vendorId,
        status: "ACTIVE",
        requiresApproval: true,
        ...s,
      },
      update: { ...s, status: "ACTIVE" },
    })
  }

  console.log(`Seeded ${samples.length} property listings for vendor ${vendorId}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
