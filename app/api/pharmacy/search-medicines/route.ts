import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { serializePharmacyProductImages } from "@/lib/central-medicine-images"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = (searchParams.get("search") || searchParams.get("q") || "").trim() || null
    const illness = searchParams.get("illness")
    const origin = searchParams.get("origin")
    const category = searchParams.get("category")
    const location = searchParams.get("location") // User location for nearby pharmacies
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    // Build search conditions for central medicines
    const medicineWhere: any = {
      isActive: true,
    }

    if (search) {
      medicineWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { genericName: { contains: search, mode: "insensitive" } },
        { purpose: { contains: search, mode: "insensitive" } },
      ]
    }

    if (illness) {
      medicineWhere.purpose = { contains: illness, mode: "insensitive" }
    }

    if (origin) {
      medicineWhere.medicineOrigins = {
        some: { medicineOriginId: origin },
      }
    }

    if (category) {
      medicineWhere.category = category
    }

    // Get medicines with pharmacy availability
    const medicines = await prisma.centralMedicine.findMany({
      where: medicineWhere,
      include: {
        pharmacyMedicines: {
          where: {
            isAvailable: true,
            stock: { gt: 0 },
          },
          include: {
            pharmacy: {
              select: {
                id: true,
                pharmacyName: true,
                rating: true,
                totalReviews: true,
                deliveryAvailable: true,
                responseTime: true,
                address: true,
                phone: true,
                is24Hours: true,
              },
            },
          },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: "asc" },
    })

    // Transform data to include pharmacy information
    const medicinesWithPharmacies = medicines.map((medicine) => {
      const availablePharmacies = medicine.pharmacyMedicines.map((pm) => ({
        pharmacyMedicineId: pm.id,
        pharmacyId: pm.pharmacy.id,
        pharmacyName: pm.pharmacy.pharmacyName,
        price: pm.price,
        stock: pm.stock,
        rating: pm.pharmacy.rating,
        totalReviews: pm.pharmacy.totalReviews,
        deliveryAvailable: pm.pharmacy.deliveryAvailable,
        responseTime: pm.pharmacy.responseTime,
        address: pm.pharmacy.address,
        phone: pm.pharmacy.phone,
        is24Hours: pm.pharmacy.is24Hours,
        lastRestocked: pm.lastRestocked,
        expiryDate: pm.expiryDate,
      }))

      // Calculate price range
      const prices = availablePharmacies.map((p) => p.price)
      const lowestPrice = prices.length > 0 ? Math.min(...prices) : null
      const highestPrice = prices.length > 0 ? Math.max(...prices) : null

      const { image, images } = serializePharmacyProductImages(medicine.images)

      return {
        id: medicine.id,
        name: medicine.name,
        genericName: medicine.genericName,
        description: medicine.description,
        purpose: medicine.purpose,
        dosageInfo: medicine.dosageInfo,
        warnings: medicine.warnings,
        sideEffects: medicine.sideEffects,
        category: medicine.category,
        illnessTypes: medicine.illnessTypes,
        activeIngredients: medicine.activeIngredients,
        form: medicine.form,
        strength: medicine.strength,
        manufacturer: medicine.manufacturer,
        image,
        images,
        availablePharmacies: availablePharmacies.length,
        pharmacies: availablePharmacies,
        priceRange: {
          lowest: lowestPrice,
          highest: highestPrice,
        },
      }
    })

    // Filter out medicines with no available pharmacies
    const availableMedicines = medicinesWithPharmacies.filter((m) => m.availablePharmacies > 0)

    return NextResponse.json({
      medicines: availableMedicines,
      /** Alias for mobile clients expecting `products` */
      products: availableMedicines,
      total: availableMedicines.length,
      pagination: {
        page,
        limit,
        hasMore: availableMedicines.length === limit,
      },
    })
  } catch (error) {
    console.error("Medicine search error:", error)
    return NextResponse.json({ error: "Failed to search medicines" }, { status: 500 })
  }
}
