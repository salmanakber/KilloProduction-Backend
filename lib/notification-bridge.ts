import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"

export interface NotificationData {
  userId: string
  title: string
  message: string
  type: string
  module?: string
  data?: any
  imageUrl?: string
  actionUrl?: string
  scheduledAt?: Date
}

export interface PushNotificationData {
  userId: string
  title: string
  body: string
  data?: any
  imageUrl?: string
  actionUrl?: string
}

export interface EmailNotificationData {
  userId: string
  template: string
  subject: string
  data: any
}

export class NotificationBridge {
  /**
   * Send a notification to a user
   */
  static async sendNotification(data: NotificationData) {
    try {
      // Create notification record
      const notification = await prisma.notification.create({
        data: {
          userId: data.userId,
          title: data.title,
          message: data.message,
          type: data.type as any,
          module: data.module as any,
          data: data.data,
          imageUrl: data.imageUrl,
          actionUrl: data.actionUrl,
          scheduledAt: data.scheduledAt,
          sentAt: new Date(),
          status: "SENT"
        }
      })

      // Send push notification if user has device tokens
      await this.sendPushNotification({
        userId: data.userId,
        title: data.title,
        body: data.message,
        data: data.data,
        imageUrl: data.imageUrl,
        actionUrl: data.actionUrl
      })

      return notification
    } catch (error) {
      console.error("Notification send error:", error)
      throw error
    }
  }

  /**
   * Review / feedback prompt with a consistent app deep link (`/riderfeedback?...`) for mobile
   * `navigateFromNotification` + Notification list.
   */
  static async sendReviewRequestWithDeepLink(params: {
    userId: string
    title: string
    message: string
    bookingId: string
    perspective?: string
    module?: string
  }) {
    const q = new URLSearchParams({ bookingId: params.bookingId })
    if (params.perspective) q.set("perspective", params.perspective)
    const actionUrl = `/riderfeedback?${q.toString()}`
    return this.sendNotification({
      userId: params.userId,
      title: params.title,
      message: params.message,
      type: "REVIEW_REQUEST",
      module: (params.module as any) || "GENERAL",
      actionUrl,
      data: {
        actionType: "navigate",
        screen: "riderfeedback",
        bookingId: params.bookingId,
        perspective: params.perspective,
        params: [
          { name: "bookingId", value: params.bookingId },
          ...(params.perspective ? [{ name: "perspective", value: params.perspective }] : []),
        ],
      },
    })
  }

  /**
   * Send push notification
   */
  static async sendPushNotification(data: PushNotificationData) {
    try {
      // Get user's device tokens
      const user = await prisma.user.findUnique({
        where: { id: data.userId },
        select: { 
          id: true,
          email: true,
          name: true,
          userSettings: {
            select: {
              pushNotifications: true,
              deviceTokens: true
            }
          }
        }
      })

      if (!user || !user.userSettings?.pushNotifications) {
        return
      }

      const deviceTokens = Array.isArray(user.userSettings.deviceTokens) 
        ? user.userSettings.deviceTokens 
        : []
      
      if (deviceTokens.length === 0) {
        return
      }

      // Send to all device tokens
      for (const token of deviceTokens) {
        await this.sendToDevice(token as string, {
          title: data.title,
          body: data.body,
          data: data.data,
          imageUrl: data.imageUrl,
          actionUrl: data.actionUrl
        })
      }

      // Send real-time notification via WebSocket
      try {
        const { socketIOServer } = require('./socket-server.ts')
        await socketIOServer.sendNotificationToUser(data.userId, {
          id: `ws-${Date.now()}`,
          userId: data.userId,
          title: data.title,
          message: data.body,
          type: 'SYSTEM',
          module: 'GENERAL',
          data: data.data,
          imageUrl: data.imageUrl,
          actionUrl: data.actionUrl,
          isRead: false,
          createdAt: new Date().toISOString(),
          status: 'SENT'
        })
      } catch (error) {
        console.error('WebSocket notification error:', error)
      }
    } catch (error) {
      console.error("Push notification error:", error)
    }
  }

  /**
   * Send notification to specific device
   */
  private static async sendToDevice(token: string, payload: any) {
    try {
      // Check if it's an Expo push token (starts with ExponentPushToken)
      if (token.startsWith('ExponentPushToken[')) {
        await this.sendExpoNotification(token as string, payload)
      } else {
        // Fallback to Firebase for non-Expo tokens
        const { FirebaseService } = await import('./firebase')
        await FirebaseService.sendToDevice(token, {
          title: payload.title,
          body: payload.body,
          data: payload.data,
          imageUrl: payload.imageUrl,
          actionUrl: payload.actionUrl
        })
      }
    } catch (error) {
      console.error("Device notification error:", error)
    }
  }

  /**
   * Send notification via Expo Push API
   */
  private static async sendExpoNotification(token: string, payload: any) {
    try {
      const message = {
        to: token,
        sound: 'default',
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
      }

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      })

      const result = await response.json()
      
      if (result.errors && result.errors.length > 0) {
        console.error('Expo push notification error:', result.errors)
      } else {
        console.log('Expo push notification sent successfully')
      }
    } catch (error) {
      console.error('Expo push notification error:', error)
    }
  }

  /**
   * Send email notification
   */
  static async sendEmailNotification(data: EmailNotificationData) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: data.userId },
        select: { email: true, name: true }
      })

      if (!user?.email) {
        throw new Error("User email not found")
      }

      await sendEmail(data.template, data.subject as any, {
        to: user.email,
        data: {
          ...data.data,
          userName: user.name,
        },
      })
    } catch (error) {
      console.error("Email notification error:", error)
      throw error
    }
  }

  /**
   * Send bulk notifications to multiple users
   */
  static async sendBulkNotifications(userIds: string[], data: Omit<NotificationData, 'userId'>) {
    try {
      const notifications: any[] = []
      
      for (const userId of userIds) {
        const notification: any = await this.sendNotification({
          ...data,
          userId
        })
        notifications.push(notification)
      }

      return notifications
    } catch (error) {
      console.error("Bulk notification error:", error)
      throw error
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: string) {
    try {
      return await prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true }
      })
    } catch (error) {
      console.error("Mark as read error:", error)
      throw error
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(userId: string) {
    try {
      return await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true }
      })
    } catch (error) {
      console.error("Mark all as read error:", error)
      throw error
    }
  }

  /**
   * Get unread notification count for a user
   */
  static async getUnreadCount(userId: string) {
    try {
      return await prisma.notification.count({
        where: { userId, isRead: false }
      })
    } catch (error) {
      console.error("Get unread count error:", error)
      throw error
    }
  }

  /**
   * Pharmacy-specific notification helpers
   */
  static async notifyPharmacyOrderUpdate(pharmacyId: string, orderId: string, status: string, message: string) {
    try {
      const pharmacy = await prisma.pharmacy.findUnique({
        where: { id: pharmacyId },
        select: { userId: true }
      })

      if (!pharmacy) return

      await this.sendNotification({
        userId: pharmacy.userId,
        title: "Order Update",
        message,
        type: "ORDER_UPDATE",
        module: "PHARMACY",
        data: { orderId, status },
        actionUrl: `/pharmacy/orders/${orderId}`
      })
    } catch (error) {
      console.error("Pharmacy order notification error:", error)
    }
  }

  /**
   * Supplier-specific notification helpers
   */
  static async notifySupplierQuote(wholesalerId: string, quoteId: string, pharmacyName: string) {
    try {
      const wholesaler = await prisma.wholesaler.findUnique({
        where: { id: wholesalerId },
        select: { userId: true }
      })

      if (!wholesaler) return

      await this.sendNotification({
        userId: wholesaler.userId,
        title: "New Quote Request",
        message: `You have received a quote request from ${pharmacyName}`,
        type: "ORDER_UPDATE",
        module: "PHARMACY",
        actionUrl: `/wholesaler/quotes/${quoteId}`,
        data: {
          actionType: "navigate",
          screen: 'WholesalerQuoteDetails',
          params: [
            { name: 'quoteId', value: quoteId },
          ],
          quoteId: quoteId,
          pharmacyName: pharmacyName,
        }
      })
    } catch (error) {
      console.error("Supplier quote notification error:", error)
    }
  }

  /**
   * Rider-specific notification helpers
   */
  static async notifyRiderNewDelivery(riderId: string, bookingId: string, pickupAddress: string) {
    try {
      await this.sendNotification({
        userId: riderId,
        title: "New Delivery Request",
        message: `New delivery request from ${pickupAddress}`,
        type: "DELIVERY",
        module: "RIDER",
        data: { bookingId, pickupAddress },
        actionUrl: `/rider/deliveries/${bookingId}`
      })
    } catch (error) {
      console.error("Rider delivery notification error:", error)
    }
  }

  /**
   * System-wide notification helpers
   */
  static async notifySystemUpdate(userId: string, title: string, message: string) {
    try {
      await this.sendNotification({
        userId,
        title,
        message,
        type: "SYSTEM",
        data: { systemUpdate: true }
      })
    } catch (error) {
      console.error("System notification error:", error)
    }
  }

  /**
   * Notify a pharmacy that they have been matched by SuperKillo AI
   */
  static async notifyPharmacyAIMatch(params: {
    pharmacyUserId: string
    pharmacyId: string
    chatId: string
    queueId: string
    customerName: string
    matchScore: number
    prescriptionData: any
    aiResponse?: string
    userPrompt?: string
  }) {
    try {
      await this.sendNotification({
        userId: params.pharmacyUserId,
        title: '🤖 New AI Prescription Match!',
        message: `You've been matched with ${params.customerName} by SuperKillo AI${params.matchScore > 0 ? ` (${params.matchScore}% match)` : ''}. Tap to review the prescription.`,
        type: 'PRESCRIPTION_MATCHED_AI',
        module: 'PHARMACY',
        data: {
          // Navigation metadata for NotificationScreen
          actionType: 'navigate',
          screen: 'Chat',
          params: [
            { name: 'chatId',          value: params.chatId },
            { name: 'queueId',         value: params.queueId },
            { name: 'customerName',    value: params.customerName },
            { name: 'pharmacyId',      value: params.pharmacyId },
            { name: 'matchScore',      value: params.matchScore },
            { name: 'isVendorReview',  value: true },
          ],
          // Flat keys for direct socket access
          chatId: params.chatId,
          queueId: params.queueId,
          pharmacyId: params.pharmacyId,
          customerName: params.customerName,
          matchScore: params.matchScore,
          prescriptionData: params.prescriptionData,
          aiResponse: params.aiResponse,
          userPrompt: params.userPrompt,
        },
        actionUrl: `/pharmacy/chat/${params.chatId}`
      })

      // Also emit a real-time websocket event with the correct type
      try {
        const { getGlobalSocketServer } = require('./socket-server')
        const socketServer = getGlobalSocketServer()
        socketServer.sendNotificationToUser(params.pharmacyUserId, {
          type: 'PRESCRIPTION_MATCHED_AI',
          chatId: params.chatId,
          queueId: params.queueId,
          pharmacyId: params.pharmacyId,
          customerName: params.customerName,
          matchScore: params.matchScore,
          prescriptionData: params.prescriptionData,
          aiResponse: params.aiResponse,
          userPrompt: params.userPrompt,
        })
      } catch (wsError) {
        console.error('WebSocket AI match notification error:', wsError)
      }
    } catch (error) {
      console.error('AI match notification error:', error)
    }
  }

  /**
   * Notify a customer that their prescription has been approved by the pharmacy
   */
  static async notifyCustomerPrescriptionApproved(params: {
    customerId: string
    pharmacyId: string
    pharmacyName: string
    chatId: string
    queueId: string
    totalCost?: number
    prescriptionData?: any
    pharmacyNotes?: string
  }) {
    try {
      await this.sendNotification({
        userId: params.customerId,
        title: '✅ Prescription Approved',
        message: `${params.pharmacyName} has reviewed and approved your prescription. Please confirm your order.`,
        type: 'PRESCRIPTION_APPROVED',
        module: 'PHARMACY',
        data: {
          // Navigation metadata for NotificationScreen
          actionType: 'navigate',
          screen: 'Chat',
          params: [
            { name: 'chatId',        value: params.chatId },
            { name: 'queueId',       value: params.queueId },
            { name: 'customerName',  value: params.pharmacyName },
            { name: 'pharmacyId',    value: params.pharmacyId },
          ],
          // Flat keys for direct socket access
          chatId: params.chatId,
          queueId: params.queueId,
          pharmacyId: params.pharmacyId,
          pharmacyName: params.pharmacyName,
          totalCost: params.totalCost,
          prescriptionData: params.prescriptionData,
          pharmacyNotes: params.pharmacyNotes,
        },
        actionUrl: `/chat/${params.chatId}`
      })

      // Also emit a real-time websocket event with the correct type
      try {
        const { getGlobalSocketServer } = require('./socket-server')
        const socketServer = getGlobalSocketServer()
        socketServer.sendNotificationToUser(params.customerId, {
          type: 'prescription_approved_by_pharmacy',
          chatId: params.chatId,
          queueId: params.queueId,
          pharmacyId: params.pharmacyId,
          pharmacyName: params.pharmacyName,
          totalCost: params.totalCost,
          prescriptionData: params.prescriptionData,
          pharmacyNotes: params.pharmacyNotes,
        })
      } catch (wsError) {
        console.error('WebSocket prescription approved notification error:', wsError)
      }
    } catch (error) {
      console.error('Prescription approved notification error:', error)
    }
  }

  /**
   * Notify both customer and pharmacy that the order has been confirmed
   */
  static async notifyOrderConfirmed(params: {
    customerId: string
    pharmacyUserId: string
    orderId: string
    orderNumber: string
    totalCost: number
  }) {
    try {
      // Notify customer
      await this.sendNotification({
        userId: params.customerId,
        title: '🛒 Order Confirmed',
        message: `Your prescription order #${params.orderNumber} has been confirmed and is being processed.`,
        type: 'ORDER_CONFIRMED',
        module: 'PHARMACY',
        data: {
          actionType: 'navigate',
          screen: 'OrderDetails',
          params: [
            { name: 'orderId',     value: params.orderId },
            { name: 'orderNumber', value: params.orderNumber },
          ],
          orderId: params.orderId,
          orderNumber: params.orderNumber,
          totalCost: params.totalCost,
        },
        actionUrl: `/orders/${params.orderId}`
      })

      // Notify pharmacy
      await this.sendNotification({
        userId: params.pharmacyUserId,
        title: '🛒 Order Confirmed by Customer',
        message: `Customer has confirmed Order #${params.orderNumber}. Ready for processing.`,
        type: 'ORDER_CONFIRMED',
        module: 'PHARMACY',
        data: {
          actionType: 'navigate',
          screen: 'OrderDetails',
          params: [
            { name: 'orderId',     value: params.orderId },
            { name: 'orderNumber', value: params.orderNumber },
          ],
          orderId: params.orderId,
          orderNumber: params.orderNumber,
          totalCost: params.totalCost,
        },
        actionUrl: `/pharmacy/orders/${params.orderId}`
      })

      // Emit real-time events
      try {
        const { getGlobalSocketServer } = require('./socket-server')
        const socketServer = getGlobalSocketServer()
        socketServer.sendNotificationToUser(params.customerId, {
          type: 'ORDER_CONFIRMED',
          orderId: params.orderId,
          orderNumber: params.orderNumber,
          totalCost: params.totalCost,
        })
        socketServer.sendNotificationToUser(params.pharmacyUserId, {
          type: 'ORDER_CONFIRMED',
          orderId: params.orderId,
          orderNumber: params.orderNumber,
          totalCost: params.totalCost,
        })
      } catch (wsError) {
        console.error('WebSocket order confirmed notification error:', wsError)
      }
    } catch (error) {
      console.error('Order confirmed notification error:', error)
    }
  }
}
