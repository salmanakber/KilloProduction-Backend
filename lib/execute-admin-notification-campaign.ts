import { prisma } from "@/lib/prisma"
import { NotificationBridge } from "@/lib/notification-bridge"
import { sendEmail } from "@/lib/email"
import { sendTransactionalSms } from "@/lib/twilio"
import type { NotificationType, UserRole } from "@prisma/client"

const VALID_ROLES = new Set<string>([
  "CUSTOMER",
  "VENDOR",
  "RIDER",
  "WHOLESALER",
  "ADMIN",
  "SUPER_ADMIN",
  "MECHANIC",
  "AUTOPARTS",
])

async function resolveAdminContact(): Promise<string> {
  const s = await prisma.systemSettings.findFirst({
    select: { smtpFrom: true, defaultSender: true },
  })
  return (
    (s?.smtpFrom && String(s.smtpFrom).trim()) ||
    process.env.SUPPORT_EMAIL ||
    process.env.SMTP_FROM ||
    "support@killo.com"
  )
}

/**
 * Delivers an admin “system notice” campaign: Expo push via {@link NotificationBridge}
 * (reads `UserSettings.deviceTokens`), email via {@link sendEmail} (`genericNotification`),
 * SMS via {@link sendTransactionalSms} (Twilio or configured provider).
 */
export async function executeAdminNotificationCampaignSend(campaignId: string): Promise<{
  ok: boolean
  delivered: number
  error?: string
}> {
  const campaign = await prisma.notificationCampaign.findUnique({
    where: { id: campaignId },
  })

  if (!campaign) {
    return { ok: false, delivered: 0, error: "Campaign not found" }
  }

  if (campaign.status === "SENT") {
    return { ok: false, delivered: 0, error: "Already sent" }
  }

  const roles = (campaign.targetUserTypes || [])
    .map((r) => String(r).toUpperCase())
    .filter((r): r is UserRole => VALID_ROLES.has(r))

  const roleFilter: UserRole[] = roles.length > 0 ? roles : ["CUSTOMER"]

  const chunkSize = Math.max(
    50,
    Math.min(5000, Number(process.env.NOTIFICATION_BROADCAST_CHUNK_SIZE) || 500)
  )

  const adminContact = await resolveAdminContact()
  let delivered = 0
  const type = String(campaign.type || "PUSH").toUpperCase()

  const smsBody = `${campaign.title}\n\n${campaign.message}`.trim()

  const userWhere = {
    deletedAt: null as const,
    isActive: true,
    role: { in: roleFilter },
  }

  const userSelect = {
    id: true,
    email: true,
    phone: true,
    userSettings: {
      select: {
        pushNotifications: true,
        emailNotifications: true,
        smsNotifications: true,
        deviceTokens: true,
      },
    },
  } as const

  let cursor: string | undefined
  for (;;) {
    const users = await prisma.user.findMany({
      where: userWhere,
      select: userSelect,
      take: chunkSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    })

    if (users.length === 0) break

    for (const u of users) {
      try {
        if (type === "PUSH") {
          await NotificationBridge.sendNotification({
            userId: u.id,
            title: campaign.title,
            message: campaign.message,
            type: "SYSTEM",
            module: "ADMIN",
            imageUrl: campaign.imageUrl || undefined,
            actionUrl: campaign.actionUrl || undefined,
            data: {
              source: "admin_system_broadcast",
              campaignId: campaign.id,
            },
          })
          delivered += 1
          continue
        }

        if (type === "EMAIL") {
          if (!u.email?.trim()) continue
          if (u.userSettings?.emailNotifications === false) continue
          try {
            await sendEmail(u.email.trim(), "genericNotification", {
              title: campaign.title,
              message: campaign.message,
              email: u.email.trim(),
              actionUrl: campaign.actionUrl || undefined,
              actionText: campaign.actionUrl ? "Open link" : undefined,
              adminContact,
            })
            delivered += 1
          } catch {
            /* provider/template failure — skip user */
          }
          continue
        }

        if (type === "SMS") {
          if (!u.phone?.trim()) continue
          if (u.userSettings?.smsNotifications === false) continue
          const ok = await sendTransactionalSms(u.phone.trim(), smsBody)
          if (ok) delivered += 1
          continue
        }

        if (type === "IN_APP") {
          await prisma.notification.create({
            data: {
              userId: u.id,
              title: campaign.title,
              message: campaign.message,
              type: "SYSTEM" as NotificationType,
              module: "ADMIN",
              data: {
                source: "admin_system_broadcast",
                campaignId: campaign.id,
              },
              imageUrl: campaign.imageUrl || undefined,
              actionUrl: campaign.actionUrl || undefined,
              sentAt: new Date(),
              status: "SENT",
            },
          })
          delivered += 1
          continue
        }
      } catch (e) {
        console.error("[admin-notification-campaign] user delivery failed", u.id, e)
      }
    }

    cursor = users[users.length - 1]?.id
    if (!cursor || users.length < chunkSize) break
  }

  await prisma.notificationCampaign.update({
    where: { id: campaignId },
    data: {
      status: delivered > 0 ? "SENT" : "FAILED",
      sentAt: new Date(),
      sentCount: delivered,
      deliveredCount: delivered,
    },
  })

  return { ok: delivered > 0, delivered }
}
