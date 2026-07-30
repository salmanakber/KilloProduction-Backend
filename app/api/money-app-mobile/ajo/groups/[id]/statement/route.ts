import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { cloudinary } from "@/lib/cloudinary"
import { getAjoGroupStatementData } from "@/lib/ajo-service"
import { buildAjoGroupStatementPdfBuffer } from "@/lib/ajo-statement-pdf"
import { getCompanyInfoForStatementPdf } from "@/lib/systemSettings"
import { Readable } from "stream"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { group, contributions, payouts } = await getAjoGroupStatementData(params.id, user.id)
    const company = await getCompanyInfoForStatementPdf()

    const pdfBuffer = await buildAjoGroupStatementPdfBuffer({
      groupName: group.name,
      currency: group.currency,
      frequency: group.frequency,
      contributionAmount: group.contributionAmount,
      treasuryBalance: group.treasuryBalance,
      status: group.status,
      creatorName: group.creator?.name || user.name || user.email || "Creator",
      contributions: contributions.map((c) => ({
        name: c.user.name || c.user.phone || c.user.email || "Member",
        status: c.status,
        amount: c.amount,
        currency: c.currency,
        cycleNumber: c.cycle.cycleNumber,
        dueDate: c.dueDate,
        paidAt: c.paidAt,
        contributionStatus: c.status,
      })),
      payouts: payouts.map((p) => ({
        name: p.recipient.name || p.recipient.phone || p.recipient.email || "Recipient",
        amount: p.amount,
        currency: p.currency,
        cycleNumber: p.cycle.cycleNumber,
        status: p.status,
        processedAt: p.processedAt,
      })),
      company,
    })

    const folder = "money-transfer/ajo-statements"
    const publicId = `ajo_${group.id}_${Date.now()}`

    const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          resource_type: "raw",
          format: "pdf",
          type: "upload",
        },
        (err, result) => {
          if (err || !result?.secure_url) reject(err || new Error("Upload failed"))
          else resolve({ secure_url: result.secure_url })
        },
      )
      Readable.from(pdfBuffer).pipe(stream)
    })

    return NextResponse.json({
      success: true,
      pdfUrl: uploadResult.secure_url,
      groupName: group.name,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to export statement"
    console.error("ajo/groups/[id]/statement POST:", e)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
