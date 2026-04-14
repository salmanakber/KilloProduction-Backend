import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getVendorMerchandiseCredits, sumCreditsInRange } from "@/lib/vendor-wallet-revenue"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check and create user profile if it doesn't exist
    let userProfile = await prisma.userProfile.findUnique({
      where: { userId: user.id },
    })

    if (!userProfile) {
      try {
        userProfile = await prisma.userProfile.create({
          data: {
            userId: user.id,
            firstName: user.name?.split(' ')[0] || 'User',
            lastName: user.name?.split(' ').slice(1).join(' ') || '',
          },
        })
        console.log('✅ Created user profile for user:', user.id)
      } catch (error) {
        console.error('❌ Error creating user profile:', error)
        // Continue with existing profile or create minimal one
        userProfile = {
          id: 'temp',
          userId: user.id,
          firstName: user.name?.split(' ')[0] || 'User',
          lastName: user.name?.split(' ').slice(1).join(' ') || '',
          dateOfBirth: null,
          gender: null,
          bio: null,
          profileImage: null,
          emergencyContact: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }
    }

    // Check and create user settings if they don't exist
    let userSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    })

    if (!userSettings) {
      try {
        userSettings = await prisma.userSettings.create({
          data: {
            userId: user.id,
            // Default settings
            language: 'en',
            currency: 'NGN',
            theme: 'light',
            pushNotifications: true,
            emailNotifications: true,
            smsNotifications: false,
            locationTracking: true,
            dataSharing: false,
            autoReorder: false
          },
        })
        console.log('✅ Created user settings for user:', user.id)
      } catch (error) {
        console.error('❌ Error creating user settings:', error)
        // Continue with default settings
        userSettings = {
          id: 'temp',
          userId: user.id,
          pushNotifications: true,
          emailNotifications: true,
          smsNotifications: false,
          locationTracking: true,
          dataSharing: false,
          language: 'en',
          currency: 'NGN',
          theme: 'light',
          autoReorder: false,
          deliveryInstructions: null,
          deviceTokens: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }
    }

    // Check and create wallet if it doesn't exist
    let wallet = await prisma.wallet.findUnique({
      where: { userId: user.id },
    })

    if (!wallet) {
      try {
        wallet = await prisma.wallet.create({
          data: {
            userId: user.id,
            balance: 0,
            currency: 'NGN',
            isActive: true
          },
        })
        console.log('✅ Created wallet for user:', user.id)
      } catch (error) {
        console.error('❌ Error creating wallet:', error)
        // Continue with default wallet
        wallet = {
          id: 'temp',
          userId: user.id,
          balance: 0,
          currency: 'NGN',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }
    }

    // Check and create pharmacy if it doesn't exist
    let pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
    })

    if (!pharmacy) {
      try {
        pharmacy = await prisma.pharmacy.create({
          data: {
            userId: user.id,
            pharmacyName: user.name ? `${user.name}'s Pharmacy` : 'My Pharmacy',
            licenseNumber: `PHAR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            description: 'Pharmacy description',
            address: 'Pharmacy address',
            phone: user.phone || '',
            email: user.email || '',
            isVerified: false,
            is24Hours: false,
            deliveryAvailable: true,
            rating: 0,
            totalReviews: 0,
            totalOrders: 0,
            openingHours: {
              monday: { open: '08:00', close: '18:00', isOpen: true },
              tuesday: { open: '08:00', close: '18:00', isOpen: true },
              wednesday: { open: '08:00', close: '18:00', isOpen: true },
              thursday: { open: '08:00', close: '18:00', isOpen: true },
              friday: { open: '08:00', close: '18:00', isOpen: true },
              saturday: { open: '09:00', close: '17:00', isOpen: true },
              sunday: { open: '10:00', close: '16:00', isOpen: false }
            },
            specialties: ['General Pharmacy', 'Prescription Medicine'],
            medicineOrigins: ['Local', 'International'],
            selectedIllnesses: ['General Health', 'Pain Management'],
            responseTime: 30,
            status: 'PENDING'
          },
        })
        console.log('✅ Created pharmacy for user:', user.id)
      } catch (error) {
        console.error('❌ Error creating pharmacy:', error)
        return NextResponse.json({ error: "Failed to create pharmacy profile" }, { status: 500 })
      }
    }

    // Get dashboard analytics
    const [
      totalOrders,
      totalRevenue,
      totalMedicines,
      pendingOrders,
      lowStockMedicines,
      recentOrders,
      topMedicines,
      prescriptionRequests,
      monthlyRevenue,
      urgentStockAlerts,
    ] = await Promise.all([
      // Total orders
      prisma.order.count({
        where: {
          vendorId: user.id,
          module: "PHARMACY",
        },
      }),

      // Total revenue
      prisma.order.aggregate({
        where: {
          vendorId: user.id,
          module: "PHARMACY",
          status: "DELIVERED",
        },
        _sum: { total: true },
      }),

      // Total medicines
      prisma.medicine.count({
        where: { pharmacyId: pharmacy.id },
      }),

      // Pending orders
      prisma.order.count({
        where: {
          vendorId: user.id,
          module: "PHARMACY",
          status: { in: ["PENDING", "CONFIRMED"] },
        },
      }),

      // Low stock medicines
      prisma.medicine.count({
        where: {
          pharmacyId: pharmacy.id,
          stock: { lte: 10 },
          isActive: true,
        },
      }),

      // Recent orders
      prisma.order.findMany({
        where: {
          vendorId: user.id,
          module: "PHARMACY",
        },
        include: {
          customer: {
            select: { name: true, phone: true },
          },
          orderItems: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),

      // Top selling medicines
      prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          order: {
            vendorId: user.id,
            module: "PHARMACY",
            status: "DELIVERED",
          },
        },
        _sum: { quantity: true },
        _count: { productId: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),

      // Prescription requests
      prisma.prescription.count({
        where: {
          status: { in: ["UPLOADED", "UNDER_REVIEW"] },
        },
      }),

      // Monthly revenue - using Prisma aggregation instead of raw SQL
      prisma.order.groupBy({
        by: ['createdAt'],
        where: {
          vendorId: user.id,
          module: "PHARMACY",
          status: "DELIVERED",
          createdAt: {
            gte: new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000) // 12 months ago
          }
        },
        _sum: { total: true },
        _count: true,
        orderBy: { createdAt: 'desc' }
      }),

      // Urgent stock alerts (expiring soon or very low stock)
      prisma.medicine.findMany({
        where: {
          pharmacyId: pharmacy.id,
          isActive: true,
          OR: [
            { stock: { lte: 5 } },
            {
              expiryDate: {
                lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
              },
            },
          ],
        },
        select: {
          id: true,
          name: true,
          stock: true,
          expiryDate: true,
          minStock: true,
        },
        orderBy: { stock: "asc" },
        take: 10,
      }),
    ])

    // Get medicine details for top medicines
    const topMedicinesWithDetails = await Promise.all(
      topMedicines.map(async (item) => {
        const medicine = await prisma.medicine.findUnique({
          where: { id: item.productId },
          select: { id: true, name: true, price: true, images: true, form: true, stock: true },
        })
  
        return {
          id: medicine?.id || item.productId,
          name: medicine?.name || 'Unknown Medicine',
          price: medicine?.price || 0,
          images: medicine?.images || [],
          form: medicine?.form,
          stock: medicine?.stock || 0,
          totalSold: item._sum.quantity,
          orderCount: item._count.productId,
        }
      }),
    )

    // Format recent orders to match mobile app expectations
    const formattedRecentOrders = recentOrders.map(order => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customer?.name || 'Unknown Customer',
      total: order.total,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      items: order.orderItems.map(item => ({
        productName: item.productName,
        quantity: item.quantity,
        price: item.unitPrice
      }))
    }))

    // eslint-disable-line no-console
    

    // Format top medicines to match mobile app expectations
    const formattedTopMedicines = topMedicinesWithDetails.map(medicine => ({
      id: medicine.id,
      name: medicine.name,
      totalSold: medicine.totalSold || 0,
      revenue: (medicine.totalSold || 0) * (medicine.price || 0),
      stock: medicine.stock || 0,
      image: Array.isArray(medicine.images) ? medicine.images[0] : null
    }))

    // Format urgent stock alerts
    const formattedUrgentAlerts = urgentStockAlerts.map(alert => ({
      id: alert.id,
      name: alert.name,
      stock: alert.stock,
      minStock: alert.minStock || 10,
      expiryDate: alert.expiryDate?.toISOString()
    }))

    // Format monthly revenue data from Prisma aggregation
    const formattedMonthlyRevenue = Array.isArray(monthlyRevenue) ? monthlyRevenue.map(item => ({
      month: item.createdAt.toISOString().substring(0, 7), // YYYY-MM format
      revenue: item._sum.total || 0,
      orders: item._count || 0
    })) : []
    
    
    // Get today's prescription queue entries for this pharmacy
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    // Calculate match score based on pharmacy's share of total prescription queues
    // Get total count of all prescription queues today
    const totalQueueCount = await prisma.prescriptionQueue.count({
      where: {
        createdAt: {
          gte: startOfToday
        },
        status: {
          in: ['PENDING_PHARMACY_REVIEW', 'PHARMACY_APPROVED', 'CUSTOMER_APPROVED']
        }
      }
    });
    
    // Get this pharmacy's queue count today
    const pharmacyQueueCount = await prisma.prescriptionQueue.count({
      where: {
        pharmacyId: pharmacy.id,
        createdAt: {
          gte: startOfToday
        },
        status: {
          in: ['PENDING_PHARMACY_REVIEW', 'PHARMACY_APPROVED', 'CUSTOMER_APPROVED']
        }
      }
    });
    
    // Calculate match score as percentage: (pharmacy_count / total_count) * 100
    const avgMatchScore = totalQueueCount > 0
      ? Math.round((pharmacyQueueCount / totalQueueCount) * 100)
      : 0;
    
    const todayQueueEntries = await prisma.prescriptionQueue.findMany({
      where: {
        pharmacyId: pharmacy.id,
        createdAt: {
          gte: startOfToday
        },
        status: {
          in: ['PENDING_PHARMACY_REVIEW', 'PHARMACY_APPROVED', 'CUSTOMER_APPROVED']
        }
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            avatar: true
          }
        },
        pharmacy: {
          select: {
            id: true,
            pharmacyName: true,
            logo: true,
            rating: true,
            isVerified: true,
            pharmacyChats: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Format suggested customers
    const [pendingQueueCount, openSupplierOrders, deliveredNeedingRiderRating] = await Promise.all([
      prisma.prescriptionQueue.count({
        where: {
          pharmacyId: pharmacy.id,
          status: "PENDING_PHARMACY_REVIEW",
        },
      }),
      prisma.supplierOrder.findMany({
        where: {
          pharmacyId: pharmacy.id,
          status: {
            in: [
              "PENDING",
              "CONFIRMED",
              "SHIPPED",
              "QUOTE_ACCEPTED",
              "QUOTE_RECEIVED",
            ],
          },
        },
        select: { id: true, orderNumber: true, status: true, updatedAt: true },
        take: 4,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.supplierOrder.findMany({
        where: {
          pharmacyId: pharmacy.id,
          status: "DELIVERED",
          courierBooking: {
            riderId: { not: null },
            riderRating: null,
          },
        },
        select: {
          id: true,
          orderNumber: true,
          courierBooking: {
            select: {
              id: true,
              rider: { select: { id: true, name: true } },
            },
          },
        },
        take: 4,
        orderBy: { updatedAt: "desc" },
      }),
    ])

    const vendorActions: Array<{
      id: string
      type: string
      title: string
      subtitle?: string
      orderId?: string
      priority: "high" | "normal"
    }> = []

    if (pendingQueueCount > 0) {
      vendorActions.push({
        id: "prescription-queue",
        type: "PRESCRIPTION_REVIEW",
        title: `${pendingQueueCount} prescription match${pendingQueueCount > 1 ? "es" : ""} need your review`,
        subtitle: "Review matched customers and respond in chat.",
        priority: "high",
      })
    }

    for (const so of deliveredNeedingRiderRating) {
      vendorActions.push({
        id: `rate-rider-${so.id}`,
        type: "RATE_RIDER",
        title: "Rate delivery rider",
        subtitle: so.courierBooking?.rider?.name
          ? `${so.orderNumber} · ${so.courierBooking.rider.name}`
          : String(so.orderNumber),
        orderId: so.id,
        priority: "normal",
      })
    }

    for (const so of openSupplierOrders) {
      vendorActions.push({
        id: `supplier-order-${so.id}`,
        type: "SUPPLIER_ORDER",
        title: "Supplier order in progress",
        subtitle: `${so.orderNumber} · ${String(so.status).replace(/_/g, " ")}`,
        orderId: so.id,
        priority: "normal",
      })
    }

    const suggestedCustomers = todayQueueEntries.map(queue => {
      const prescriptionData = queue.prescriptionData as any;
      const aiResponse = queue.aiResponse as any;
      
      // Use the calculated match score from pharmacy's share of total queues
      // For individual customer, we can use the overall pharmacy match score
      const customerMatchScore = avgMatchScore;
      
      return {
        id: queue.customerId,
        name: queue.customer?.name || 'Unknown Customer',
        condition: prescriptionData?.title || aiResponse?.summary || 'Prescription Review',
        matchScore: customerMatchScore,
        distance: 'Nearby',
        urgency: queue.status === 'PENDING_PHARMACY_REVIEW' ? 'High' : queue.status === 'PHARMACY_APPROVED' ? 'Medium' : 'Low',
        chatId: queue.chatId || queue.pharmacy.pharmacyChats[0]?.id || null,
        queueId: queue.id,
        createdAt: queue.createdAt.toISOString(),
        pharmacy: {
          id: queue.pharmacy.id,
          pharmacyName: queue.pharmacy.pharmacyName,
          logo: queue.pharmacy.logo || null,
          rating: queue.pharmacy.rating || 0,
          isVerified: queue.pharmacy.isVerified || false
        }
      };
    });

    const { txs: walletTxs } = await getVendorMerchandiseCredits({
      vendorUserId: user.id,
      module: "PHARMACY",
      pharmacyId: pharmacy.id,
    })
    const walletTotalRevenue = walletTxs.reduce((s, t) => s + Number(t.amount || 0), 0)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const tomorrowStart = new Date(todayStart)
    tomorrowStart.setDate(tomorrowStart.getDate() + 1)
    const todayWalletSales = sumCreditsInRange(walletTxs, todayStart, tomorrowStart)

    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1)
    const walletMonthRevenue = sumCreditsInRange(walletTxs, monthStart, tomorrowStart)

    const last7: { month: string; revenue: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      d.setHours(0, 0, 0, 0)
      const nd = new Date(d)
      nd.setDate(nd.getDate() + 1)
      last7.push({
        month: d.toISOString().substring(0, 10),
        revenue: sumCreditsInRange(walletTxs, d, nd),
      })
    }

    return NextResponse.json({
      analytics: {
        totalOrders,
        totalRevenue: walletTotalRevenue,
        totalMedicines,
        pendingOrders,
        lowStockMedicines,
        prescriptionRequests,
        todaySales: todayWalletSales,
        monthlyRevenue: walletMonthRevenue,
        activeCustomers: 0, // Will be calculated separately if needed
        avgOrderValue: totalOrders > 0 ? walletTotalRevenue / totalOrders : 0
      },
      recentOrders: formattedRecentOrders,
      topMedicines: formattedTopMedicines,
      urgentStockAlerts: formattedUrgentAlerts,
      pharmacy: {
        pharmacyName: pharmacy.pharmacyName,
        verificationStatus: pharmacy.isVerified ? "VERIFIED" : "PENDING",
        medicineTypes: [], // Will be populated from specializations
        isVerified: pharmacy.isVerified,
        rating: 0, // Will be calculated from reviews
        totalReviews: 0,
        is24Hours: pharmacy.is24Hours || false,
        deliveryAvailable: pharmacy.deliveryAvailable || false
      },
      user: {
        name: user.name || 'Unknown User',
        avatar: user.avatar,
        role: user.role,
        profileImage: user.userProfile?.profileImage || "",
        email: user.email
      },
      salesData: {
        labels: last7.map((x) => x.month.slice(5)),
        datasets: [{ data: last7.map((x) => x.revenue) }],
      },
      suggestedCustomers,
      matchScore: avgMatchScore,
      vendorActions: vendorActions.slice(0, 10),
      notifications: [], // Will be populated from notifications table
      unreadNotifications: 0
    })
  } catch (error) {
    console.error("Pharmacy dashboard fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
