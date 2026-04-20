import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    console.log('user', user?.role)

    // Allow both pharmacy vendors (VENDOR) and wholesalers (WHOLESALER) to view this endpoint
    if (!user || (user.role !== "VENDOR" && user.role !== "WHOLESALER" as any)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: supplierOrderId } = params

    // Get the supplier order with related pharmacy & wholesaler
    const supplierOrder = await prisma.supplierOrder.findUnique({
      where: { id: supplierOrderId },
      include: {
        pharmacy: {
          include: {
            specializations: {
              include: {
                medicineOrigin: true
              }
            }
          }
        },
        wholesaler: {
          select: {
            id: true,
            companyName: true,
            phone: true,
            email: true,
            userId: true,
          },
        },
        items: true,
        courierBooking: {
          include: {
            rider: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                riderProfile: {
                  select: {
                    vehicleType: true,
                    rating: true,
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!supplierOrder || !supplierOrder.pharmacy) {
      return NextResponse.json(
        { error: "Supplier order not found" },
        { status: 404 }
      )
    }

    // Authorization: pharmacy vendor or wholesaler vendor must own this order
    const isPharmacyVendor =
      user.role === "VENDOR" && supplierOrder.pharmacy.userId === user.id
    const isWholesalerVendor =
      user.role === "WHOLESALER" && supplierOrder.wholesaler?.userId === user.id

    if (!isPharmacyVendor && !isWholesalerVendor) {
      return NextResponse.json(
        { error: "You do not have access to this supplier order" },
        { status: 403 }
      )
    }

    // Get pharmacy's allowed medicine origin IDs (from the pharmacy on this order)
    const allowedOriginIds = supplierOrder.pharmacy.specializations.map(s => s.medicineOriginId)

    // Fetch detailed product information for each item
    const itemsWithDetails = await Promise.all(
      supplierOrder.items.map(async (item) => {
        
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
          return {
            ...item,
            canImport: false,
            reason: "Product not found",
            product: null
          }
        }

        // If linked to central medicine, check specializations
        let canImport = true
        let restrictedOrigins: string[] = []

        if (wholesalerProduct.wholesalerMedicine?.centralMedicine) {
          const centralMedicine = wholesalerProduct.wholesalerMedicine.centralMedicine
          const medicineOriginIds = centralMedicine.medicineOrigins.map(mo => mo.medicineOriginId)
          
          // Check if pharmacy has specialization for any of the medicine's origins
          canImport = medicineOriginIds.length === 0 || medicineOriginIds.some(originId => allowedOriginIds.includes(originId))
          
          if (!canImport) {
            restrictedOrigins = centralMedicine.medicineOrigins
              .filter(mo => !allowedOriginIds.includes(mo.medicineOriginId))
              .map(mo => mo.medicineOrigin.displayName)
          }
        } else {
          // If not linked to central medicine, check by countryOfOrigin
          const medicineOrigin = await prisma.medicineOrigin.findFirst({
            where: { 
              displayName: wholesalerProduct.countryOfOrigin 
            }
          })
          
          canImport = medicineOrigin ? allowedOriginIds.includes(medicineOrigin.id) : true
          if (!canImport && medicineOrigin) {
            restrictedOrigins = [medicineOrigin.displayName]
          }
        }

        return {
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          canImport,
          restrictedOrigins,
          reason: canImport ? null : `Requires specialization: ${restrictedOrigins.join(', ')}`,
          product: {
            id: wholesalerProduct.id,
            name: wholesalerProduct.name,
            genericName: wholesalerProduct.genericName,
            description: wholesalerProduct.wholesalerMedicine?.centralMedicine?.description,
            purpose: wholesalerProduct.wholesalerMedicine?.centralMedicine?.purpose,
            category: wholesalerProduct.category,
            form: wholesalerProduct.form,
            strength: wholesalerProduct.dosage,
            manufacturer: wholesalerProduct.manufacturer,
            brand: wholesalerProduct.brand,
            countryOfOrigin: wholesalerProduct.countryOfOrigin,
            expiryDate: wholesalerProduct.expiryDate,
            batchNumber: wholesalerProduct.batchNumber,
            stock: wholesalerProduct.stock,
            origins: wholesalerProduct.wholesalerMedicine?.centralMedicine?.medicineOrigins.map(mo => ({
              id: mo.medicineOrigin.id,
              name: mo.medicineOrigin.name,
              displayName: mo.medicineOrigin.displayName,
              isAllowed: allowedOriginIds.includes(mo.medicineOriginId)
            })) || []
          }
        }
      })
    )
    
    // Calculate import summary
    const importableMedicines = itemsWithDetails.filter(item => item.canImport)
    const restrictedMedicines = itemsWithDetails.filter(item => !item.canImport)

    return NextResponse.json({
      order: {
        id: supplierOrder.id,
        orderNumber: supplierOrder.orderNumber,
        status: supplierOrder.status,
        totalAmount: supplierOrder.totalAmount,
        currency: supplierOrder.currency,
        deliveryAddress: supplierOrder.deliveryAddress,
        pickupAddress: supplierOrder.pickupAddress,
        notes: supplierOrder.notes,
        expectedDeliveryDate: supplierOrder.expectedDeliveryDate,
        createdAt: supplierOrder.createdAt,
        supplierResponse: supplierOrder.supplierResponse,
        orderSlip: (supplierOrder as { orderSlip?: unknown }).orderSlip ?? null,
        wholesaler: supplierOrder.wholesaler,
        courierBooking: supplierOrder.courierBooking ? {
          id: supplierOrder.courierBooking.id,
          bookingNumber: supplierOrder.courierBooking.bookingNumber,
          supplierORder: supplierOrder.items,
          status: supplierOrder.courierBooking.status,
          distance: supplierOrder.courierBooking.distance,
          estimatedTime: supplierOrder.courierBooking.estimatedTime,
          fare: supplierOrder.courierBooking.fare,
          rider: supplierOrder.courierBooking.rider ? {
            id: supplierOrder.courierBooking.rider.id,
            name: supplierOrder.courierBooking.rider.name,
            phone: supplierOrder.courierBooking.rider.phone,
            email: supplierOrder.courierBooking.rider.email,
            vehicleType: supplierOrder.courierBooking.rider.riderProfile?.vehicleType,
            rating: supplierOrder.courierBooking.rider.riderProfile?.rating,
          } : null,
        } : null,
      },
      items: itemsWithDetails,
      summary: {
        totalItems: itemsWithDetails.length,
        importableItems: importableMedicines.length,
        restrictedItems: restrictedMedicines.length,
        canImportAll: restrictedMedicines.length === 0
      },
      pharmacySpecializations: supplierOrder.pharmacy.specializations.map(s => ({
        id: s.medicineOriginId,
        name: s.medicineOrigin.name,
        displayName: s.medicineOrigin.displayName
      }))
    })
  } catch (error) {
    console.error("Supplier order details fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch supplier order details" },
      { status: 500 }
    )
  }
}

