import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { supplierOrderId, selectedItemIds } = body

    // Get pharmacy details with specializations
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
      return NextResponse.json(
        { error: "Pharmacy profile not found" },
        { status: 404 }
      )
    }

    // Get pharmacy's allowed medicine origin IDs
    const allowedOriginIds = pharmacy.specializations.map(s => s.medicineOriginId)

    // Get the completed supplier order
    const supplierOrder = await prisma.supplierOrder.findUnique({
      where: { 
        id: supplierOrderId,
        pharmacyId: pharmacy.id,
        status: "DELIVERED"
      },
      include: {
        items: true
      }
    })

    if (!supplierOrder) {
      return NextResponse.json(
        { error: "Completed supplier order not found" },
        { status: 404 }
      )
    }

    // Filter items to import (if specific items selected, only import those)
    const itemsToImport = selectedItemIds && selectedItemIds.length > 0
      ? supplierOrder.items.filter(item => selectedItemIds.includes(item.id))
      : supplierOrder.items

    // Import products to pharmacy inventory
    const importedProducts: Array<{name: string; action: string; quantity: number}> = []
    const skippedProducts: Array<{name: string; reason: string}> = []



    for (const item of itemsToImport) {
      
      // Get the wholesaler product with its linked wholesaler medicine
      const wholesalerProduct = await prisma.wholesalerProduct.findUnique({
        where: { id: item.productId },
        include: {
          wholesaler: true,
          wholesalerMedicine: {
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
          }
        }
      })
      

      if (!wholesalerProduct) {
        skippedProducts.push({
          name: item.productName,
          reason: "Product not found"
        })
        continue
      }

      console.log('wholesalerProduct', wholesalerProduct)

      // Check if product is linked to central medicine through wholesalerMedicine
      if (!wholesalerProduct.wholesalerMedicine?.centralMedicine) {
        skippedProducts.push({
          name: item.productName,
          reason: "Product is not linked to central medicine database"
        })
        continue
      }

      const centralMedicine = wholesalerProduct.wholesalerMedicine.centralMedicine
      const medicineOriginIds = centralMedicine.medicineOrigins.map(mo => mo.medicineOriginId)
      
      // No specializations configured → allow import (onboarding / legacy pharmacies).
      // Otherwise require overlap between medicine origins and pharmacy specializations.
      const canImport =
        allowedOriginIds.length === 0 ||
        medicineOriginIds.length === 0 ||
        medicineOriginIds.some((originId) => allowedOriginIds.includes(originId))
      
      if (!canImport) {
        const restrictedOrigins = centralMedicine.medicineOrigins
          .filter(mo => !allowedOriginIds.includes(mo.medicineOriginId))
          .map(mo => mo.medicineOrigin.displayName)
        
        skippedProducts.push({
          name: item.productName,
          reason: `Requires specialization: ${restrictedOrigins.join(', ')}`
        })
        continue
      }


      // Check if product already exists in pharmacy inventory
      const existingProduct = await prisma.pharmacyMedicine.findFirst({
        where: {
          pharmacyId: pharmacy.id,
          centralMedicineId: centralMedicine.id
        }
      })

      if (existingProduct) {
        // Update existing product stock
        await prisma.pharmacyMedicine.update({
          where: { id: existingProduct.id },
          data: {
            stock: existingProduct.stock + item.quantity,
            lastRestocked: new Date(),
            lastSupplierId: supplierOrder.wholesalerId,
            lastSupplierOrderId: supplierOrder.id,
            updatedAt: new Date()
          }
        })
        importedProducts.push({
          name: item.productName,
          action: 'updated',
          quantity: item.quantity
        })
      } else {
        // Create new product in pharmacy inventory
        await prisma.pharmacyMedicine.create({
          data: {
            pharmacyId: pharmacy.id,
            centralMedicineId: centralMedicine.id,
            price: item.unitPrice,
            stock: item.quantity,
            minStock: 10, // Default minimum stock
            lastSupplierId: supplierOrder.wholesalerId,
            lastSupplierOrderId: supplierOrder.id,
            lastRestocked: new Date()
          }
        })
        importedProducts.push({
          name: item.productName,
          action: 'created',
          quantity: item.quantity
        })
      }
    }

    // Note: We don't change supplier order status here
    // The order status is "DELIVERED" and should remain as such
    // Importing products is a separate action that doesn't change the delivery status

    return NextResponse.json({
      message: "Import process completed",
      importedCount: importedProducts.length,
      skippedCount: skippedProducts.length,
      totalItems: itemsToImport.length,
      importedProducts,
      skippedProducts
    })
  } catch (error) {
    console.error("Import supplier products error:", error)
    return NextResponse.json(
      { error: "Failed to import products" },
      { status: 500 }
    )
  }
}

