import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const campaigns = await prisma.marketingCampaign.findMany({
      orderBy: {
        createdAt: "desc",
      },
    })

    const formattedCampaigns = campaigns.map((campaign) => ({
  id: campaign.id,
  name: campaign.name,
  type: campaign.type,
  status: campaign.status,
  targetAudience: campaign.targetAudience,
  channels: campaign.channels,
  content: campaign.content,
  schedule: campaign.schedule,
  // Safely serialize metrics relation (may be null)
  metrics: campaign.metrics ? {
    sent: campaign.metrics.sent,
    delivered: campaign.metrics.delivered,
    opened: campaign.metrics.opened,
    clicked: campaign.metrics.clicked,
    converted: campaign.metrics.converted,
    revenue: campaign.metrics.revenue,
    unsubscribed: campaign.metrics.unsubscribed,
    bounced: campaign.metrics.bounced,
  } : null,
  // Safely serialize abTest relation (may be null)
  abTest: campaign.abTest ? {
    id: campaign.abTest.id,
    name: campaign.abTest.name,
    status: campaign.abTest.status,
  } : null,
  createdAt: campaign.createdAt.toISOString(),
  updatedAt: campaign.updatedAt.toISOString(),
  // Safely serialize createdBy relation (may be null)
  createdBy: campaign.createdBy ? {
    id: campaign.createdBy.id,
    name: campaign.createdBy.name,
    email: campaign.createdBy.email,
  } : null,
}))

    return NextResponse.json({
      campaigns: formattedCampaigns,
      total: campaigns.length,
    })
  } catch (error) {
    console.error("Error fetching marketing campaigns:", error)
    return NextResponse.json({ error: "Failed to fetch marketing campaigns" }, { status: 500 })
  }
}

// --- POST /api/marketing/campaigns ---
// Corrected: Use Prisma nested writes for all relations. Use createdById, not createdBy. Robust error handling for relations.
export async function POST(request: NextRequest) {
  try {
    const user  = await authenticateRequest()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = user.id

    const body = await request.json();
    const {
      name,
      type,
      targetAudience, // Should be an object for create, or { id } for connect
      channels,
      content,
      schedule,
      abTest, // Should be { id } for connect, or object for create
      createdBy, // Should be a user ID
    } = body;

    // Validate required fields
    if (!name || !type || !channels || !content || !schedule || !createdBy) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Prepare relation objects
    const data: any = {
      name,
      type,
      status: "DRAFT",
      channels,
      content,
      schedule,
      createdById: userId,
      metrics: {
        create: {
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          converted: 0,
          revenue: 0,
          unsubscribed: 0,
          bounced: 0,
        },
      },
    };

    // Handle abTest relation
    if (abTest && abTest.id) {
      data.abTest = { connect: { id: abTest.id } };
    } else if (abTest && Object.keys(abTest).length > 0) {
      data.abTest = { create: abTest };
    }

    // Handle targetAudience relation
    if (targetAudience && targetAudience.id) {
      data.targetAudience = { connect: { id: targetAudience.id } };
    } else if (targetAudience && Object.keys(targetAudience).length > 0) {
      data.targetAudience = { create: targetAudience };
    }

    const campaign = await prisma.marketingCampaign.create({ data });

    return NextResponse.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
      },
    });
  } catch (error) {
    console.error("Error creating marketing campaign:", error);
    return NextResponse.json({ error: "Failed to create marketing campaign" }, { status: 500 });
  }
}

