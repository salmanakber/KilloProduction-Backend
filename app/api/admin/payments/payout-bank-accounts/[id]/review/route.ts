import { type NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/adminAuth"
import {
  reviewPayoutBankAccount,
  type PayoutBankReviewAction,
} from "@/lib/payout-bank-account-review"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireAdmin()
  if (error) return error

  try {
    const body = await request.json()
    const action = String(body.action || "") as PayoutBankReviewAction
    const reason = String(body.reason || body.message || "")
    const requestedDocuments = body.requestedDocuments
    const sendEmail = body.sendEmail !== false

    if (action !== "reject" && action !== "require_documents") {
      return NextResponse.json(
        { error: "action must be reject or require_documents" },
        { status: 400 }
      )
    }

    const result = await reviewPayoutBankAccount({
      accountId: params.id,
      action,
      adminUserId: session!.id,
      reason,
      requestedDocuments,
      sendEmail,
    })

    return NextResponse.json({
      success: true,
      account: {
        id: result.account.id,
        isVerified: result.account.isVerified,
        verificationStatus: result.account.verificationStatus,
        verificationNotes: result.account.verificationNotes,
      },
      ticket: {
        id: result.ticket.id,
        ticketNumber: result.ticket.ticketNumber,
        status: result.ticket.status,
      },
    })
  } catch (e: any) {
    const msg = e?.message || "Failed to review bank account"
    const status = msg.includes("not found") ? 404 : msg.includes("required") ? 400 : 500
    if (status === 500) console.error("payout-bank-account review:", e)
    return NextResponse.json({ error: msg }, { status })
  }
}
