import { prisma } from "@/lib/prisma"
import { sendEmailFromTemplate } from "@/lib/email"
import { NotificationBridge } from "@/lib/notification-bridge"
import { getPublicAppBaseUrl } from "@/lib/ride-trip-share"
import type { BankVerificationStatus } from "@prisma/client"

export type PayoutBankReviewAction = "reject" | "require_documents"

const APP_NAME = process.env.APP_NAME || "Killo"
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@killo.com"

async function nextTicketNumber(): Promise<string> {
  const ticketCount = await prisma.supportTicket.count()
  return `TKT-${String(ticketCount + 1).padStart(6, "0")}`
}

function maskAccountNumber(accountNumber: string): string {
  const n = String(accountNumber || "")
  if (n.length <= 4) return n
  return `****${n.slice(-4)}`
}

function parseRequestedDocuments(raw: string): {
  document1: string
  document2: string
  document3: string
  document4_optional: string
} {
  const lines = String(raw || "")
    .split(/\n/)
    .map((line) => line.replace(/^[\s•\-*\d.)]+/, "").trim())
    .filter(Boolean)
  return {
    document1: lines[0] || "—",
    document2: lines[1] || "—",
    document3: lines[2] || "—",
    document4_optional: lines.slice(3).join("; ") || "",
  }
}

function formatVerificationDeadline(daysFromNow: number): string {
  const deadline = new Date()
  deadline.setDate(deadline.getDate() + daysFromNow)
  return deadline.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function buildSupportTicketActionUrl(ticketId: string, ticketNumber: string): string {
  const qs = new URLSearchParams({ ticketNumber })
  return `${getPublicAppBaseUrl()}/support/tickets/${encodeURIComponent(ticketId)}?${qs}`
}

export function buildSupportTicketDeepLink(ticketId: string, ticketNumber: string): string {
  const qs = new URLSearchParams({ ticketNumber })
  return `kilosuperappv1://support/tickets/${encodeURIComponent(ticketId)}?${qs}`
}

export async function reviewPayoutBankAccount(params: {
  accountId: string
  action: PayoutBankReviewAction
  adminUserId: string
  reason: string
  requestedDocuments?: string
  sendEmail?: boolean
}) {
  const reason = String(params.reason || "").trim()
  const requestedDocuments = String(params.requestedDocuments || "").trim()

  if (!reason) {
    throw new Error("A reason or message is required")
  }
  if (params.action === "require_documents" && !requestedDocuments) {
    throw new Error("Please specify which documents are required")
  }

  const account = await prisma.vendorBankAccount.findUnique({
    where: { id: params.accountId },
    include: {
      vendor: {
        select: { id: true, name: true, email: true, phone: true, role: true },
      },
    },
  })

  if (!account) {
    throw new Error("Bank account not found")
  }

  const owner = account.vendor
  const ownerLabel = owner.role === "RIDER" ? "rider" : "vendor"
  const masked = maskAccountNumber(account.accountNumber)
  const verificationStatus: BankVerificationStatus =
    params.action === "reject" ? "REJECTED" : "REQUIRES_DOCUMENTS"

  const ticketSubject =
    params.action === "reject"
      ? `Payout bank account rejected (${masked})`
      : `Documents required for payout bank account (${masked})`

  const ticketDescription = [
    `A payout bank account review requires your attention.`,
    ``,
    `Account holder: ${account.accountName}`,
    `Bank: ${account.bankName}`,
    `Account number: ${account.accountNumber}`,
    `Bank code: ${account.bankCode || account.routingNumber || "—"}`,
    `Owner type: ${ownerLabel}`,
    ``,
    `Admin message:`,
    reason,
    ...(params.action === "require_documents"
      ? ["", "Documents requested:", requestedDocuments]
      : []),
    ``,
    `Bank account ID: ${account.id}`,
  ].join("\n")

  const ticketNumber = await nextTicketNumber()

  const result = await prisma.$transaction(async (tx) => {
    const updatedAccount = await tx.vendorBankAccount.update({
      where: { id: account.id },
      data: {
        isVerified: false,
        verificationStatus,
        verifiedAt: null,
        verificationNotes: [
          params.action === "reject" ? "Rejected by admin" : "Documents required by admin",
          reason,
          params.action === "require_documents" ? `Documents: ${requestedDocuments}` : null,
        ]
          .filter(Boolean)
          .join(" — "),
      },
    })

    const ticket = await tx.supportTicket.create({
      data: {
        ticketNumber,
        userId: owner.id,
        subject: ticketSubject,
        description: ticketDescription,
        category: "BANK_VERIFICATION",
        priority: params.action === "require_documents" ? "HIGH" : "MEDIUM",
        status: "OPEN",
      },
    })

    await tx.supportTicketReply.create({
      data: {
        ticketId: ticket.id,
        userId: params.adminUserId,
        message: [
          `Hello ${owner.name || "there"},`,
          "",
          params.action === "reject"
            ? `Your payout bank account ending in ${masked} could not be approved.`
            : `We need additional documents to verify your payout bank account ending in ${masked}.`,
          "",
          reason,
          ...(params.action === "require_documents"
            ? ["", "Please submit the following:", requestedDocuments]
            : []),
          "",
          "Reply to this ticket in the app under Help & Support with the requested information or an updated bank account.",
        ].join("\n"),
        isAdmin: true,
      },
    })

    return { updatedAccount, ticket }
  })

  const emailTitle =
    params.action === "reject"
      ? `${APP_NAME}: Payout bank account not approved`
      : `${APP_NAME}: Documents required for your payout bank account`

  const documents = parseRequestedDocuments(
    params.action === "require_documents" ? requestedDocuments : "",
  )
  const verificationStatusLabel =
    params.action === "reject" ? "Rejected" : "Additional documents required"
  const verificationDeadline =
    params.action === "require_documents"
      ? formatVerificationDeadline(7)
      : "Not applicable"
  const actionUrl = buildSupportTicketActionUrl(
    result.ticket.id,
    result.ticket.ticketNumber,
  )
  const actionText =
    params.action === "reject" ? "View support ticket" : "Upload documents & reply"

  if (params.sendEmail !== false && owner.email) {
    try {
      await sendEmailFromTemplate(
        owner.email,
        "BANK_VERIFICATION",
        {
          emailTitle,
          receiverName: owner.name || "there",
          appName: APP_NAME,
          verificationStatus: verificationStatusLabel,
          verificationDeadline,
          document1: documents.document1,
          document2: documents.document2,
          document3: documents.document3,
          document4_optional: documents.document4_optional,
          bankName: account.bankName,
          accountNumberMasked: masked,
          reference: result.ticket.ticketNumber,
          verificationReason: reason,
          actionText,
          actionUrl,
          adminContact: SUPPORT_EMAIL,
          year: String(new Date().getFullYear()),
        },
        "GLOBAL",
        "SUPPORT",
      )
    } catch (e) {
      console.error("payout-bank-account-review email:", e)
    }
  }

  try {
    await NotificationBridge.sendNotification({
      userId: owner.id,
      title: emailTitle,
      message:
        params.action === "reject"
          ? `Your payout bank account ending ${masked} was rejected. Ticket ${result.ticket.ticketNumber} — tap to view and reply.`
          : `Upload requested documents for bank account ending ${masked}. Ticket ${result.ticket.ticketNumber}.`,
      type: "WALLET_UPDATE",
      module: "COURIER",
      actionUrl,
      data: {
        actionType: "navigate",
        screen: "TicketDetails",
        ticketId: result.ticket.id,
        ticketNumber: result.ticket.ticketNumber,
        bankAccountId: account.id,
        action: params.action,
      },
    })
  } catch (e) {
    console.error("payout-bank-account-review notification:", e)
  }

  return {
    account: result.updatedAccount,
    ticket: result.ticket,
  }
}
