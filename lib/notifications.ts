import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { sendSMS } from "@/lib/twilio"

export interface NotificationData {
  userId: string
  title: string
  message: string
  type: "ORDER_UPDATE" | "PROMOTION" | "REMINDER" | "SYSTEM" | "CHAT_MESSAGE" | "REVIEW_REQUEST" | "PAYMENT" | "DELIVERY"
  module?: "AUTO_PARTS" | "PHARMACY" | "FOOD" | "GROCERY" | "RIDING" | "COURIER"
  data?: any
  imageUrl?: string
  actionUrl?: string
  channels?: ("PUSH" | "EMAIL" | "SMS")[]
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT"
  scheduledAt?: Date
}

export interface PushNotificationData {
  title: string
  body: string
  data?: any
  imageUrl?: string
  actionUrl?: string
  priority?: "normal" | "high"
  sound?: string
  badge?: number
}

export class NotificationService {
  /**
   * Send notification to a single user
   */
  static async sendNotification(notificationData: NotificationData) {
    try {
      // Get user preferences
      const user = await prisma.user.findUnique({
        where: { id: notificationData.userId },
        include: { userSettings: true }
      })

      if (!user) {
        throw new Error("User not found")
      }

      const channels = notificationData.channels || ["PUSH", "EMAIL", "SMS"]
      const promises: Promise<any>[] = []

      // Create notification record
      const notification = await prisma.notification.create({
        data: {
          userId: notificationData.userId,
          title: notificationData.title,
          message: notificationData.message,
          type: notificationData.type,
          module: notificationData.module,
          data: notificationData.data,
          imageUrl: notificationData.imageUrl,
          actionUrl: notificationData.actionUrl,
          scheduledAt: notificationData.scheduledAt,
          status: "SENT"
        }
      })

      // Send push notification
      if (channels.includes("PUSH") && user.userSettings?.pushNotifications) {
        promises.push(this.sendPushNotification(user.id, {
          title: notificationData.title,
          body: notificationData.message,
          data: notificationData.data,
          imageUrl: notificationData.imageUrl,
          actionUrl: notificationData.actionUrl,
          priority: notificationData.priority === "URGENT" ? "high" : "normal"
        }))
      }

      // Send email
      if (channels.includes("EMAIL") && user.userSettings?.emailNotifications && user.email) {
        promises.push(this.sendEmailNotification(user.email, {
          title: notificationData.title,
          message: notificationData.message,
          actionUrl: notificationData.actionUrl,
          type: notificationData.type
        }))
      }

      // Send SMS
      if (channels.includes("SMS") && user.userSettings?.smsNotifications && user.phone) {
        promises.push(this.sendSMSNotification(user.phone, {
          message: notificationData.message,
          type: notificationData.type
        }))
      }

      // Execute all notifications
      await Promise.allSettled(promises)

      return notification

    } catch (error) {
      console.error("Notification send error:", error)
      throw error
    }
  }

  /**
   * Send notification to multiple users
   */
  static async sendBulkNotifications(userIds: string[], notificationData: Omit<NotificationData, "userId">) {
    const promises = userIds.map(userId => 
      this.sendNotification({ ...notificationData, userId })
    )

    return await Promise.allSettled(promises)
  }

  /**
   * Send notification to users by segment
   */
  static async sendSegmentNotification(segmentId: string, notificationData: Omit<NotificationData, "userId">) {
    const segmentMembers = await prisma.customerSegmentMember.findMany({
      where: { segmentId, isActive: true },
      select: { userId: true }
    })

    const userIds = segmentMembers.map(member => member.userId)
    return await this.sendBulkNotifications(userIds, notificationData)
  }

  /**
   * Send order status update notification
   */
  static async sendOrderStatusNotification(orderId: string, status: string, userId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, vendor: true }
    })

    if (!order) return

    const statusMessages = {
      "CONFIRMED": "Your order has been confirmed and is being prepared",
      "PREPARING": "Your order is being prepared and will be ready soon",
      "READY_FOR_PICKUP": "Your order is ready for pickup",
      "OUT_FOR_DELIVERY": "Your order is out for delivery",
      "DELIVERED": "Your order has been delivered successfully",
      "CANCELLED": "Your order has been cancelled"
    }

    const message = statusMessages[status as keyof typeof statusMessages] || "Your order status has been updated"

    await this.sendNotification({
      userId,
      title: `Order #${order.orderNumber} Update`,
      message,
      type: "ORDER_UPDATE",
      module: order.module,
      data: { orderId, status },
      actionUrl: `/orders/${orderId}`,
      channels: ["PUSH", "EMAIL"]
    })
  }

  /**
   * Send payment notification
   */
  static async sendPaymentNotification(transactionId: string, userId: string) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { order: true }
    })

    if (!transaction) return

    const statusMessages = {
      "COMPLETED": "Payment completed successfully",
      "FAILED": "Payment failed. Please try again",
      "CANCELLED": "Payment was cancelled"
    }

    const message = statusMessages[transaction.status as keyof typeof statusMessages] || "Payment status updated"

    await this.sendNotification({
      userId,
      title: "Payment Update",
      message,
      type: "PAYMENT",
      data: { transactionId, status: transaction.status },
      channels: ["PUSH", "EMAIL"]
    })
  }

  /**
   * Send chat message notification
   */
  static async sendChatNotification(chatId: string, senderId: string, message: string) {
    const chat = await prisma.pharmacyChat.findUnique({
      where: { id: chatId },
      include: { user: true, pharmacy: true }
    })

    if (!chat || chat.userId === senderId) return

    await this.sendNotification({
      userId: chat.userId,
      title: `New message from ${chat.pharmacy.pharmacyName}`,
      message: message.length > 50 ? `${message.substring(0, 50)}...` : message,
      type: "CHAT_MESSAGE",
      module: "PHARMACY",
      data: { chatId, senderId },
      actionUrl: `/chat/${chatId}`,
      channels: ["PUSH", "SMS"]
    })
  }

  /**
   * Send prescription review notification
   */
  static async sendPrescriptionReviewNotification(prescriptionId: string, pharmacyId: string) {
    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: { user: true }
    })

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: pharmacyId }
    })

    if (!prescription || !pharmacy) return

    await this.sendNotification({
      userId: prescription.userId,
      title: "Prescription Review Complete",
      message: `${pharmacy.pharmacyName} has reviewed your prescription`,
      type: "SYSTEM",
      module: "PHARMACY",
      data: { prescriptionId, pharmacyId },
      actionUrl: `/prescriptions/${prescriptionId}`,
      channels: ["PUSH", "EMAIL"]
    })
  }

  /**
   * Send low stock alert
   */
  static async sendLowStockAlert(medicineId: string, pharmacyId: string) {
    const medicine = await prisma.medicine.findUnique({
      where: { id: medicineId },
      include: { pharmacy: { include: { user: true } } }
    })

    if (!medicine) return

    await this.sendNotification({
      userId: medicine.pharmacy.user.id,
      title: "Low Stock Alert",
      message: `${medicine.name} is running low on stock (${medicine.stock} remaining)`,
      type: "REMINDER",
      module: "PHARMACY",
      data: { medicineId, currentStock: medicine.stock },
      actionUrl: `/medicines/${medicineId}`,
      channels: ["PUSH", "EMAIL"],
      priority: "HIGH"
    })
  }

  /**
   * Send delivery assignment notification
   */
  static async sendDeliveryAssignmentNotification(orderId: string, riderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, rider: true }
    })

    if (!order || !order.rider) return

    // Notify customer
    await this.sendNotification({
      userId: order.customerId,
      title: "Rider Assigned",
      message: `${order.rider.name} has been assigned to deliver your order`,
      type: "DELIVERY",
      module: order.module,
      data: { orderId, riderId },
      actionUrl: `/orders/${orderId}/tracking`,
      channels: ["PUSH", "SMS"]
    })

    // Notify rider
    await this.sendNotification({
      userId: riderId,
      title: "New Delivery Assignment",
      message: `You have been assigned to deliver order #${order.orderNumber}`,
      type: "DELIVERY",
      module: order.module,
      data: { orderId, customerId: order.customerId },
      actionUrl: `/deliveries/${orderId}`,
      channels: ["PUSH", "SMS"],
      priority: "HIGH"
    })
  }

  /**
   * Send push notification (implementation depends on your push service)
   */
  private static async sendPushNotification(userId: string, data: PushNotificationData) {
    // Implementation depends on your push notification service
    // (Firebase, OneSignal, etc.)
    console.log("Sending push notification to user:", userId, data)
    
    // Example implementation with Firebase
    // const user = await prisma.user.findUnique({ where: { id: userId } })
    // if (user?.deviceToken) {
    //   await admin.messaging().send({
    //     token: user.deviceToken,
    //     notification: {
    //       title: data.title,
    //       body: data.body,
    //       imageUrl: data.imageUrl
    //     },
    //     data: data.data,
    //     android: {
    //       priority: data.priority
    //     },
    //     apns: {
    //       payload: {
    //         aps: {
    //           sound: data.sound,
    //           badge: data.badge
    //         }
    //       }
    //     }
    //   })
    // }
  }

  /**
   * Send email notification
   */
  private static async sendEmailNotification(email: string, data: {
    title: string
    message: string
    actionUrl?: string
    type: string
  }) {
    const template = this.getEmailTemplate(data.type, data)
    await sendEmail(email, data.title, template)
  }

  /**
   * Send SMS notification
   */
  private static async sendSMSNotification(phone: string, data: {
    message: string
    type: string
  }) {
    await sendSMS(phone, data.message)
  }

  /**
   * Get email template based on notification type
   */
  private static getEmailTemplate(type: string, data: any): string {
    const baseTemplate = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #00C851;">${data.title}</h2>
        <p>${data.message}</p>
        ${data.actionUrl ? `<a href="${data.actionUrl}" style="background: #00C851; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Details</a>` : ''}
        <hr>
        <p style="color: #666; font-size: 12px;">This is an automated message from Killo Super App</p>
      </div>
    `

    return baseTemplate
  }
}
