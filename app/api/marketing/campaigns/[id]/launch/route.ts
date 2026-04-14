import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" + user }, { status: 401 })
    }

    const campaignId = params.id

    // Get campaign with segments
    const campaign = await prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      include: {
        segments: {
          include: {
            members: {
              where: { isActive: true },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    userSettings: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    if (campaign.status !== "DRAFT") {
      return NextResponse.json({ error: "Campaign already launched" }, { status: 400 })
    }

    // Get all target users from segments
    const targetUsers = new Set<string>()
    campaign.segments.forEach((segment) => {
      segment.members.forEach((member) => {
        targetUsers.add(member.userId)
      })
    })

    // Create campaign participants
    const participants = Array.from(targetUsers).map((userId) => ({
      campaignId,
      userId,
      variant: campaign.isABTest ? (Math.random() < 0.5 ? "A" : "B") : null,
    }))

    await prisma.campaignParticipant.createMany({
      data: participants,
      skipDuplicates: true,
    })

    // Update campaign status
    await prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: {
        status: "RUNNING",
        sentAt: new Date(),
        totalSent: participants.length,
      },
    })

    // Queue notifications based on channels
    const channels = campaign.channels as string[]
    const content = campaign.content as any

    for (const participant of participants) {
      for (const channel of channels) {
        await queueNotification({
          userId: participant.userId,
          campaignId,
          channel,
          content: content[channel] || content.default,
          variant: participant.variant,
        })
      }
    }

    return NextResponse.json({
      message: "Campaign launched successfully",
      participantCount: participants.length,
    })
  } catch (error) {
    console.error("Error launching campaign:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function queueNotification({
  userId,
  campaignId,
  channel,
  content,
  variant,
}: {
  userId: string
  campaignId: string
  channel: string
  content: any
  variant?: string | null
}) {
  try {
    // Create notification record
    await prisma.notification.create({
      data: {
        userId,
        campaignId,
        title: content.title || "Notification",
        message: content.message || "",
        type: "PROMOTION",
        data: {
          channel,
          variant,
          campaignId,
        },
        imageUrl: content.imageUrl,
        actionUrl: content.actionUrl,
      },
    })

    // Here you would integrate with actual notification services
    // For example: Firebase for push notifications, SendGrid for email, Twilio for SMS
  } catch (error) {
    console.error("Error queueing notification:", error)
  }
}
