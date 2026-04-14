import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { 
      centralMedicineId,
      centralMedicineIds, // For bulk operation
      price, 
      stock, 
      minStock = 10,
      expiryDate,
      batchNumber,
      supplierInfo,
      images = [],
      productIds = [] // Wholesaler product IDs to update
    } = await request.json()

    // Get pharmacy
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

    const allowedOriginIds = pharmacy.specializations.map(s => s.medicineOriginId)

    // Handle bulk operation
    if (centralMedicineIds && Array.isArray(centralMedicineIds) && centralMedicineIds.length > 0) {
      const results = {
        success: [] as any[],
        failed: [] as any[]
      }

      for (const medicineId of centralMedicineIds) {
        try {
          const result = await addSingleMedicine(pharmacy.id, medicineId, allowedOriginIds, {
            price: 0, // Will be set based on wholesaler product
            stock: 0,
            minStock,
            expiryDate,
            batchNumber,
            supplierInfo,
            images
          })
          results.success.push(result)
        } catch (error: any) {
          results.failed.push({ medicineId, error: error.message })
        }
      }

      // Update wholesaler product statuses if provided
      if (productIds.length > 0) {
        await prisma.wholesalerProduct.updateMany({
          where: { id: { in: productIds } },
          data: { status: 'IMPORTED' }
        })
      }

      return NextResponse.json({
        success: true,
        results,
        message: `Successfully added ${results.success.length} medicines. ${results.failed.length} failed.`
      })
    }

    // Handle single operation
    if (!centralMedicineId || !price || !stock) {
      return NextResponse.json({ 
        error: "Central medicine ID, price, and stock are required" 
      }, { status: 400 })
    }

    const result = await addSingleMedicine(pharmacy.id, centralMedicineId, allowedOriginIds, {
      price: parseFloat(price),
      stock: parseInt(stock),
      minStock: parseInt(minStock),
      expiryDate,
      batchNumber,
      supplierInfo,
      images
    })

    // Update wholesaler product statuses if provided
    if (productIds.length > 0) {
      await prisma.wholesalerProduct.updateMany({
        where: { id: { in: productIds } },
        data: { status: 'IMPORTED' }
      })
    }

    return NextResponse.json({
      success: true,
      ...result,
      message: "Medicine added to inventory successfully"
    }, { status: 201 })

  } catch (error: any) {
    console.error("Add medicine to inventory error:", error)
    return NextResponse.json({ error: error.message || "Failed to add medicine to inventory" }, { status: 500 })
  }
}

async function addSingleMedicine(
  pharmacyId: string, 
  centralMedicineId: string, 
  allowedOriginIds: string[],
  data: {
    price: number,
    stock: number,
    minStock: number,
    expiryDate?: string,
    batchNumber?: string,
    supplierInfo?: string,
    images?: string[]
  }
) {
  // Get central medicine
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
    throw new Error("Medicine not found in central database")
  }

  // Check if pharmacy can sell this medicine based on specializations
  const medicineOriginIds = centralMedicine.medicineOrigins.map(mo => mo.medicineOriginId)
  const canSell = medicineOriginIds.length === 0 || medicineOriginIds.some(originId => allowedOriginIds.includes(originId))

  if (!canSell) {
    throw new Error("You cannot sell this medicine. Please request specialization approval first.")
  }

  // Get wholesaler product data if available
  const wholesalerProduct = await prisma.wholesalerProduct.findFirst({
    where: {
      wholesalerMedicine: {
        centralMedicineId
      },
      status: 'PENDING'
    },
    include: {
      wholesalerMedicine: true
    }
  })

  const finalPrice = data.price || wholesalerProduct?.unitPrice || 0
  const finalStock = data.stock || wholesalerProduct?.stock || 0

  // Check if medicine is already in inventory
  const existingMedicine = await prisma.pharmacyMedicine.findUnique({
    where: {
      pharmacyId_centralMedicineId: {
        pharmacyId,
        centralMedicineId
      }
    }
  })

  if (existingMedicine) {
    // Update existing stock
    const pharmacyMedicine = await prisma.pharmacyMedicine.update({
      where: { id: existingMedicine.id },
      data: {
        stock: existingMedicine.stock + finalStock,
        lastRestocked: new Date()
      },
      include: {
        centralMedicine: true
      }
    })

    return { pharmacyMedicine, action: 'updated' }
  }

  // Create pharmacy medicine record
  const pharmacyMedicine = await prisma.pharmacyMedicine.create({
    data: {
      pharmacyId,
      centralMedicineId,
      price: finalPrice,
      stock: finalStock,
      minStock: data.minStock,
      isAvailable: true,
      lastRestocked: new Date(),
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : wholesalerProduct?.expiryDate,
      batchNumber: data.batchNumber || wholesalerProduct?.batchNumber,
      supplierInfo: data.supplierInfo
    },
    include: {
      centralMedicine: true,
      pharmacy: {
        select: {
          pharmacyName: true,
          isVerified: true
        }
      }
    }
  })

  // Create medicine record for customer-facing API
  const medicine = await prisma.medicine.create({
    data: {
      pharmacyId,
      name: centralMedicine.name,
      genericName: centralMedicine.genericName,
      brand: centralMedicine.brand || centralMedicine.name,
      manufacturer: centralMedicine.manufacturer,
      dosage: centralMedicine.dosageInfo || "As prescribed",
      form: centralMedicine.form,
      strength: centralMedicine.strength,
      category: centralMedicine.category,
      price: finalPrice,
      stock: finalStock,
      minStock: data.minStock,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : wholesalerProduct?.expiryDate,
      batchNumber: data.batchNumber || wholesalerProduct?.batchNumber,
      countryOfOrigin: wholesalerProduct?.countryOfOrigin || centralMedicine.medicineOrigins[0]?.medicineOrigin?.displayName || "Unknown",
      activeIngredients: centralMedicine.activeIngredients,
      sideEffects: centralMedicine.sideEffects,
      contraindications: centralMedicine.contraindications,
      storageInstructions: centralMedicine.storageInstructions || "Store in a cool, dry place",
      images: data.images && data.images.length > 0 ? data.images : (wholesalerProduct?.images || centralMedicine.images),
      isPrescriptionRequired: centralMedicine.isPrescriptionRequired || false,
      isControlled: centralMedicine.isControlled || false,
      isActive: true,
      tags: centralMedicine.illnessTypes || []
    }
  })

  return { pharmacyMedicine, medicine, action: 'created' }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { 
      centralMedicineId, 
      price, 
      stock, 
      minStock,
      expiryDate,
      batchNumber,
      supplierInfo,
      isAvailable
    } = await request.json()

    if (!centralMedicineId) {
      return NextResponse.json({ error: "Central medicine ID is required" }, { status: 400 })
    }

    // Get pharmacy
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id }
    })

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    // Update pharmacy medicine
    const updateData: any = {}
    if (price !== undefined) updateData.price = parseFloat(price)
    if (stock !== undefined) updateData.stock = parseInt(stock)
    if (minStock !== undefined) updateData.minStock = parseInt(minStock)
    if (expiryDate !== undefined) updateData.expiryDate = expiryDate ? new Date(expiryDate) : null
    if (batchNumber !== undefined) updateData.batchNumber = batchNumber
    if (supplierInfo !== undefined) updateData.supplierInfo = supplierInfo
    if (isAvailable !== undefined) updateData.isAvailable = isAvailable
    if (stock !== undefined) updateData.lastRestocked = new Date()

    const pharmacyMedicine = await prisma.pharmacyMedicine.update({
      where: {
        pharmacyId_centralMedicineId: {
          pharmacyId: pharmacy.id,
          centralMedicineId
        }
      },
      data: updateData,
      include: {
        centralMedicine: true
      }
    })

    // Update corresponding medicine record
    const medicine = await prisma.medicine.findFirst({
      where: {
        pharmacyId: pharmacy.id,
        name: pharmacyMedicine.centralMedicine.name
      }
    })

    if (medicine) {
      const medicineUpdateData: any = {}
      if (price !== undefined) medicineUpdateData.price = parseFloat(price)
      if (stock !== undefined) medicineUpdateData.stock = parseInt(stock)
      if (minStock !== undefined) medicineUpdateData.minStock = parseInt(minStock)
      if (expiryDate !== undefined) medicineUpdateData.expiryDate = expiryDate ? new Date(expiryDate) : null
      if (batchNumber !== undefined) medicineUpdateData.batchNumber = batchNumber
      if (isAvailable !== undefined) medicineUpdateData.isActive = isAvailable

      await prisma.medicine.update({
        where: { id: medicine.id },
        data: medicineUpdateData
      })
    }

    return NextResponse.json({
      success: true,
      pharmacyMedicine,
      message: "Medicine inventory updated successfully"
    })

  } catch (error) {
    console.error("Update medicine inventory error:", error)
    return NextResponse.json({ error: "Failed to update medicine inventory" }, { status: 500 })
  }
}
