import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "WHOLESALER" as any) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wholesaler = await prisma.wholesaler.findUnique({
      where: { userId: user.id },
    })

    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")
    const search = searchParams.get("search")
    const status = searchParams.get("status")

    // Priority: Get from WholesalerProduct first
    const whereProduct: any = { wholesalerId: wholesaler.id, isActive: true }
    const whereMedicine: any = { wholesalerId: wholesaler.id }

    if (search) {
      whereProduct.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { genericName: { contains: search, mode: "insensitive" } },
        { manufacturer: { contains: search, mode: "insensitive" } },
      ]
      whereMedicine.centralMedicine = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { genericName: { contains: search, mode: "insensitive" } },
        ]
      }
    }

    if (status === "available") {
      whereProduct.stock = { gt: 0 }
      whereMedicine.isAvailable = true
    }
    if (status === "unavailable") {
      whereProduct.stock = 0
      whereMedicine.isAvailable = false
    }
    if (status === "low-stock") {
      whereProduct.stock = { lte: 10, gt: 0 }
      whereMedicine.stock = { lte: 10, gt: 0 }
    }
    if (status === "out-of-stock") {
      whereProduct.stock = 0
      whereMedicine.stock = 0
    }

    // Get products from WholesalerProduct (priority)
    const [products, productsTotal] = await Promise.all([
      prisma.wholesalerProduct.findMany({
        where: whereProduct,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.wholesalerProduct.count({ where: whereProduct }),
    ])

    // If we have enough products, return them
    if (products.length >= limit || productsTotal > 0) {
      return NextResponse.json({
        medicines: products.map(product => ({
          id: product.id,
          wholesalerId: product.wholesalerId,
          unitPrice: product.unitPrice,
          minOrderQuantity: product.minOrderQuantity,
          stock: product.stock,
          isAvailable: product.stock > 0,
          batchNumber: product.batchNumber,
          expiryDate: product.expiryDate,
          lastRestocked: product.updatedAt,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
          centralMedicine: {
            id: product.id,
            name: product.name,
            genericName: product.genericName,
            category: product.category,
            form: product.form,
            strength: product.dosage,
            manufacturer: product.manufacturer,
            description: product.brand,
            illnessTypes: [product.category], // Map category to illnessTypes
            medicineOrigins: [{
              medicineOrigin: {
                id: product.id,
                name: product.countryOfOrigin.toUpperCase(),
                displayName: product.countryOfOrigin
              }
            }]
          }
        })),
        pagination: {
          page,
          limit,
          total: productsTotal,
          pages: Math.ceil(productsTotal / limit),
        },
      })
    }

    // Fallback: Get from WholesalerMedicine
    const [medicines, medicinesTotal] = await Promise.all([
      prisma.wholesalerMedicine.findMany({
        where: whereMedicine,
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
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.wholesalerMedicine.count({ where: whereMedicine }),
    ])

    return NextResponse.json({
      medicines,
      pagination: {
        page,
        limit,
        total: medicinesTotal,
        pages: Math.ceil(medicinesTotal / limit),
      },
    })
  } catch (error) {
    console.error("Wholesaler medicines fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch medicines" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "WHOLESALER" as any) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wholesaler = await prisma.wholesaler.findUnique({
      where: { userId: user.id },
    })

    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    const body = await request.json()
    const {
      centralMedicineId,
      unitPrice,
      minOrderQuantity,
      stock,
      expiryDate,
      batchNumber,
    } = body

    // Validate required fields
    if (!centralMedicineId || !unitPrice || !minOrderQuantity || stock === undefined) {
      return NextResponse.json(
        { error: "Central medicine ID, unit price, minimum order quantity, and stock are required" },
        { status: 400 }
      )
    }

    // Verify central medicine exists
    const centralMedicine = await prisma.centralMedicine.findUnique({
      where: { id: centralMedicineId },
      include: {
        medicineOrigins: {
          include: {
            medicineOrigin: true
          }
        }
      }
    })

    if (!centralMedicine) {
      return NextResponse.json(
        { error: "Central medicine not found" },
        { status: 404 }
      )
    }

    // Check if medicine already exists for this wholesaler (in both models)
    const [existingMedicine, existingProduct] = await Promise.all([
      prisma.wholesalerMedicine.findUnique({
        where: {
          wholesalerId_centralMedicineId: {
            wholesalerId: wholesaler.id,
            centralMedicineId,
          },
        },
      }),
      prisma.wholesalerProduct.findFirst({
        where: {
          wholesalerId: wholesaler.id,
          name: centralMedicine.name,
        },
      })
    ])

    if (existingMedicine || existingProduct) {
      return NextResponse.json(
        { error: "This medicine is already in your inventory" },
        { status: 400 }
      )
    }

    // Get origin information
    const origin = centralMedicine.medicineOrigins[0]?.medicineOrigin
    const countryOfOrigin = origin?.displayName || "Unknown"

    // Create in both models
    const [medicine, product] = await Promise.all([
      // Create in WholesalerMedicine (legacy)
      prisma.wholesalerMedicine.create({
        data: {
          wholesalerId: wholesaler.id,
          centralMedicineId,
          unitPrice: Number(unitPrice),
          minOrderQuantity: Number(minOrderQuantity),
          stock: Number(stock),
          isAvailable: Number(stock) > 0,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          batchNumber: batchNumber || null,
          lastRestocked: new Date(),
        },
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

      // Create in WholesalerProduct (priority)
      prisma.wholesalerProduct.create({
        data: {
          wholesalerId: wholesaler.id,
          name: centralMedicine.name,
          genericName: centralMedicine.genericName,
          brand: centralMedicine.description || centralMedicine.name,
          manufacturer: centralMedicine.manufacturer || "Unknown",
          dosage: centralMedicine.strength || "Standard",
          form: centralMedicine.form,
          category: centralMedicine.category,
          unitPrice: Number(unitPrice),
          minOrderQuantity: Number(minOrderQuantity),
          stock: Number(stock),
          batchNumber: batchNumber || null,
          manufacturingDate: new Date(),
          expiryDate: expiryDate ? new Date(expiryDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Default 1 year
          countryOfOrigin: countryOfOrigin,
          isActive: true,
        }
      })
    ])

    // Return the WholesalerProduct data (priority) but include centralMedicine info
    return NextResponse.json({
      id: product.id,
      wholesalerId: product.wholesalerId,
      unitPrice: product.unitPrice,
      minOrderQuantity: product.minOrderQuantity,
      stock: product.stock,
      isAvailable: product.stock > 0,
      batchNumber: product.batchNumber,
      expiryDate: product.expiryDate,
      lastRestocked: product.updatedAt,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      centralMedicine: {
        id: product.id,
        name: product.name,
        genericName: product.genericName,
        category: product.category,
        form: product.form,
        strength: product.dosage,
        manufacturer: product.manufacturer,
        description: product.brand,
        illnessTypes: [product.category],
        medicineOrigins: [{
          medicineOrigin: {
            id: product.id,
            name: product.countryOfOrigin.toUpperCase(),
            displayName: product.countryOfOrigin
          }
        }]
      }
    }, { status: 201 })
  } catch (error) {
    console.error("Wholesaler medicine creation error:", error)
    return NextResponse.json({ error: "Failed to add medicine" }, { status: 500 })
  }
}
