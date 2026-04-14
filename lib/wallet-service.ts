import { prisma } from "@/lib/prisma"

export interface CommissionPayment {
  userId: string
  orderId: string
  amount: number
  commissionType: 'PLATFORM_FEE' | 'RIDER_COMMISSION' | 'VENDOR_COMMISSION'
  module: 'PHARMACY' | 'FOOD' | 'GROCERY' | 'AUTO_PARTS'
  description: string
}

export interface WalletTransaction {
  userId: string
  amount: number
  type: 'CREDIT' | 'DEBIT'
  description: string
  orderId?: string
  reference?: string
  metadata?: any
}

export class WalletService {
  /**
   * Process commission payment and add to user's wallet
   */
  static async processCommissionPayment(payment: CommissionPayment) {
    const transaction = await prisma.$transaction(async (tx) => {
      // Get or create user's wallet
      let wallet = await tx.wallet.findUnique({
        where: { userId: payment.userId }
      })

      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            userId: payment.userId,
            balance: 0,
            currency: 'NGN'
          }
        })
      }

      // Add commission to wallet balance
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: {
            increment: payment.amount
          }
        }
      })

      // Create wallet transaction record
      const walletTransaction = await tx.transaction.create({
        data: {
          userId: payment.userId,
          walletId: wallet.id,
          orderId: payment.orderId,
          type: 'CREDIT',
          amount: payment.amount,
          currency: 'NGN',
          status: 'COMPLETED',
          description: payment.description,
          reference: `COMM_${payment.commissionType}_${payment.orderId}`,
          metadata: {
            commissionType: payment.commissionType,
            module: payment.module,
            orderId: payment.orderId
          }
        }
      })

      // Create commission record
      const commissionRecord = await tx.vendorCommission.create({
        data: {
          vendorId: payment.userId,
          orderId: payment.orderId,
          module: payment.module,
          commissionType: payment.commissionType,
          orderAmount: payment.amount * 20, // Assuming 5% commission, so order amount is 20x
          commissionRate: 5, // 5% commission
          commissionAmount: payment.amount,
          status: 'PAID'
        }
      })

      return {
        wallet: updatedWallet,
        transaction: walletTransaction,
        commission: commissionRecord
      }
    })

    return transaction
  }

  /**
   * Process wallet transaction (credit/debit)
   */
  static async processWalletTransaction(transaction: WalletTransaction) {
    const result = await prisma.$transaction(async (tx) => {
      // Get or create user's wallet
      let wallet = await tx.wallet.findUnique({
        where: { userId: transaction.userId }
      })

      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            userId: transaction.userId,
            balance: 0,
            currency: 'NGN'
          }
        })
      }

      // Update wallet balance
      const balanceChange = transaction.type === 'CREDIT' ? transaction.amount : -transaction.amount
      const newBalance = wallet.balance + balanceChange

      if (transaction.type === 'DEBIT' && newBalance < 0) {
        throw new Error('Insufficient wallet balance')
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: newBalance
        }
      })

      // Create transaction record
      const walletTransaction = await tx.transaction.create({
        data: {
          userId: transaction.userId,
          walletId: wallet.id,
          orderId: transaction.orderId,
          type: transaction.type,
          amount: transaction.amount,
          currency: 'NGN',
          status: 'COMPLETED',
          description: transaction.description,
          reference: transaction.reference,
          metadata: transaction.metadata
        }
      })

      return {
        wallet: updatedWallet,
        transaction: walletTransaction
      }
    })

    return result
  }

  /**
   * Get user's wallet balance
   */
  static async getWalletBalance(userId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    })

    return wallet
  }

  /**
   * Get user's transaction history
   */
  static async getTransactionHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true
            }
          }
        }
      }),
      prisma.transaction.count({
        where: { userId }
      })
    ])

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  }

  /**
   * Calculate commission for an order
   */
  static async calculateCommission(orderId: string) {
    const order = await prisma.supplierOrder.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        pharmacy: true,
        wholesaler: true
      }
    })

    if (!order) {
      throw new Error('Order not found')
    }

    const orderAmount = order.totalAmount

    // Get commission settings
    const [platformCommission, riderCommission, vendorCommission] = await Promise.all([
      prisma.commissionSetting.findFirst({
        where: {
          module: 'PHARMACY',
          commissionType: 'PLATFORM_FEE',
          isActive: true
        }
      }),
      prisma.commissionSetting.findFirst({
        where: {
          module: 'PHARMACY',
          commissionType: 'RIDER_COMMISSION',
          isActive: true
        }
      }),
      prisma.commissionSetting.findFirst({
        where: {
          module: 'PHARMACY',
          commissionType: 'VENDOR_COMMISSION',
          isActive: true
        }
      })
    ])

    const commissions = {
      platform: {
        rate: platformCommission?.rate || 5,
        amount: (orderAmount * (platformCommission?.rate || 5)) / 100
      },
      rider: {
        rate: riderCommission?.rate || 100,
        amount: riderCommission?.rate || 100 // Per km, simplified
      },
      vendor: {
        rate: vendorCommission?.rate || 3,
        amount: (orderAmount * (vendorCommission?.rate || 3)) / 100
      }
    }

    return {
      orderAmount,
      commissions,
      totalCommission: commissions.platform.amount + commissions.rider.amount + commissions.vendor.amount
    }
  }

  /**
   * Process order completion and distribute commissions
   */
  static async processOrderCompletion(orderId: string) {
    const order = await prisma.supplierOrder.findUnique({
      where: { id: orderId },
      include: {
        pharmacy: true,
        wholesaler: true
      }
    })

    if (!order) {
      throw new Error('Order not found')
    }

    const commissionCalculation = await this.calculateCommission(orderId)

    // Process platform commission (goes to system wallet)
    await this.processCommissionPayment({
      userId: 'system', // System wallet
      orderId,
      amount: commissionCalculation.commissions.platform.amount,
      commissionType: 'PLATFORM_FEE',
      module: 'PHARMACY',
      description: `Platform commission for order ${order.orderNumber}`
    })

    // Process rider commission
    if (order.courierBookingId) {
      const courierBooking = await prisma.courierBooking.findUnique({
        where: { id: order.courierBookingId },
        include: { riderProfile: true }
      })

      if (courierBooking?.riderProfile) {
        await this.processCommissionPayment({
          userId: courierBooking.riderProfile.userId,
          orderId,
          amount: commissionCalculation.commissions.rider.amount,
          commissionType: 'RIDER_COMMISSION',
          module: 'PHARMACY',
          description: `Rider commission for order ${order.orderNumber}`
        })
      }
    }

    // Process vendor commission (wholesaler)
    await this.processCommissionPayment({
      userId: order.wholesaler.userId,
      orderId,
      amount: commissionCalculation.commissions.vendor.amount,
      commissionType: 'VENDOR_COMMISSION',
      module: 'PHARMACY',
      description: `Vendor commission for order ${order.orderNumber}`
    })

    return {
      orderId,
      commissionCalculation,
      message: 'Commissions processed successfully'
    }
  }
}

