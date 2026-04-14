import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const category = searchParams.get("category")
    const form = searchParams.get("form")
    const illnessType = searchParams.get("illnessType")
    const stockFilter = searchParams.get("stockFilter") // "all", "low", "out"
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    // Get pharmacy specializations
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
      include: { 
        specializations: {
          include: {
            medicineOrigin: true
          }
        }
      }
    })

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    // Build where clause for pharmacy medicines
    const where: any = {
      pharmacyId: pharmacy.id
    }

    // Stock filter
    if (stockFilter === "low") {
      where.stock = { lte: 10, gt: 0 }
    } else if (stockFilter === "out") {
      where.stock = 0
    }

    // Search in central medicine
    if (search) {
      where.centralMedicine = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { genericName: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { purpose: { contains: search, mode: "insensitive" } },
        ]
      }
    }

    if (category) {
      where.centralMedicine = {
        ...where.centralMedicine,
        category
      }
    }
    
    if (form) {
      where.centralMedicine = {
        ...where.centralMedicine,
        form
      }
    }
    
    if (illnessType) {
      where.centralMedicine = {
        ...where.centralMedicine,
        illnessTypes: {
          array_contains: [illnessType]
        }
      }
    }

    // Fetch pharmacy medicines with their central medicine details
    const [pharmacyMedicines, total] = await Promise.all([
      prisma.pharmacyMedicine.findMany({
        where,
        orderBy: [{ stock: "asc" }, { centralMedicine: { name: "asc" } }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          centralMedicine: {
            include: {
              medicineOrigins: {
                include: {
                  medicineOrigin: true
                }
              }
            }
          }
        }
      }),
      prisma.pharmacyMedicine.count({ where })
    ])

    // Get filters from pharmacy medicines
    const allPharmacyMedicines = await prisma.pharmacyMedicine.findMany({
      where: { pharmacyId: pharmacy.id },
      include: {
        centralMedicine: true
      }
    })

    // Extract unique categories and forms
    const categories = new Map<string, number>()
    const forms = new Map<string, number>()
    const allIllnessTypes = new Set<string>()

    allPharmacyMedicines.forEach(pm => {
      const cat = pm.centralMedicine.category
      const form = pm.centralMedicine.form
      
      categories.set(cat, (categories.get(cat) || 0) + 1)
      forms.set(form, (forms.get(form) || 0) + 1)
      
      if (pm.centralMedicine.illnessTypes && Array.isArray(pm.centralMedicine.illnessTypes)) {
        pm.centralMedicine.illnessTypes.forEach((type: string) => allIllnessTypes.add(type))
      }
    })

    // Get all available medicine origins
    const allMedicineOrigins = await prisma.medicineOrigin.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" }
    })

    // Transform pharmacy medicines to match the expected format
    const medicinesWithStatus = pharmacyMedicines.map(pm => {
      const medicine = pm.centralMedicine
      const medicineOriginNames = medicine.medicineOrigins.map(mo => mo.medicineOrigin.displayName)
      
      // Determine stock status
      let stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' = 'IN_STOCK'
      if (pm.stock === 0) {
        stockStatus = 'OUT_OF_STOCK'
      } else if (pm.stock <= pm.minStock) {
        stockStatus = 'LOW_STOCK'
      }
      
      return {
        id: medicine.id,
        pharmacyMedicineId: pm.id,
        name: medicine.name,
        genericName: medicine.genericName,
        description: medicine.description,
        purpose: medicine.purpose,
        category: medicine.category,
        form: medicine.form,
        strength: medicine.strength,
        manufacturer: medicine.manufacturer,
        illnessTypes: medicine.illnessTypes,
        origins: medicineOriginNames,
        isActive: medicine.isActive,
        isAdded: true,
        canAdd: false,
        stock: pm.stock,
        minStock: pm.minStock,
        price: pm.price,
        isAvailable: pm.isAvailable,
        stockStatus,
        lastSupplierId: pm.lastSupplierId,
        lastSupplierOrderId: pm.lastSupplierOrderId,
        expiryDate: pm.expiryDate,
        batchNumber: pm.batchNumber,
        medicineOrigins: medicine.medicineOrigins
      }
    })

    return NextResponse.json({
      medicines: medicinesWithStatus,
      filters: {
        categories: Array.from(categories.entries()).map(([name, count]) => ({ name, count })),
        forms: Array.from(forms.entries()).map(([name, count]) => ({ name, count })),
        illnessTypes: Array.from(allIllnessTypes).sort(),
        origins: allMedicineOrigins.map(mo => mo.displayName).sort()
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      pharmacy: {
        specializations: pharmacy.specializations,
        isVerified: pharmacy.isVerified
      }
    })

  } catch (error) {
    console.error("Central medicines fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch medicines" }, { status: 500 })
  }
}
