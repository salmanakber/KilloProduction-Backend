import PDFDocument from "pdfkit"
import type { CompanyDisplayForPdf } from "@/lib/systemSettings"
import { DEFAULT_COMPANY_DISPLAY_FOR_PDF } from "@/lib/systemSettings"

const BRAND_PRIMARY = "#0f766e"
const BRAND_DARK = "#0F172A"
const TEXT_MUTED = "#64748B"
const BORDER_COLOR = "#E2E8F0"
const BG_LIGHT = "#F8FAFC"

function statusColor(status: string): string {
  if (status === "COMPLETED" || status === "SENT") return "#10b981"
  if (status === "FAILED") return "#ef4444"
  return "#f59e0b"
}

export function buildTransferReceiptPdfBuffer(args: {
  transfer: {
    reference: string
    amount: number
    currency: string
    status: string
    description?: string | null
    createdAt: Date | string
    receiveAmount?: number | null
    receiveCurrency?: string | null
  }
  accountHolder: { name: string | null; email: string | null; phone?: string | null }
  otherParty: { name: string | null; email?: string | null }
  direction: "sent" | "received"
  company?: CompanyDisplayForPdf
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { transfer, accountHolder, otherParty, direction } = args
    const company = args.company ?? DEFAULT_COMPANY_DISPLAY_FOR_PDF
    const doc = new PDFDocument({ margin: 50, size: "A4" })
    const chunks: Buffer[] = []

    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const contentWidth = doc.page.width - 100
  const dateStr = new Date(transfer.createdAt).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

    doc.font("Helvetica-Bold").fontSize(22).fillColor(BRAND_PRIMARY).text(company.brandTitle, 50, 50)
    doc.font("Helvetica-Bold").fontSize(18).fillColor(BRAND_DARK).text("TRANSFER RECEIPT", 50, 50, {
      width: contentWidth,
      align: "right",
    })
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(TEXT_MUTED)
      .text(`Generated: ${new Date().toLocaleDateString("en-US")}`, 50, 75, {
        width: contentWidth,
        align: "right",
      })

    const infoY = 120
    doc.roundedRect(50, infoY, contentWidth, 70, 6).fillAndStroke(BG_LIGHT, BORDER_COLOR)
    doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND_DARK).text("Account holder", 65, infoY + 12)
    doc.font("Helvetica").fontSize(10).fillColor(TEXT_MUTED)
    doc.text(accountHolder.name || "Customer", 65, infoY + 28)
    doc.text(accountHolder.email || accountHolder.phone || "", 65, infoY + 42)

    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(BRAND_DARK)
      .text("Receipt type", 300, infoY + 12, { width: 230, align: "right" })
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(TEXT_MUTED)
      .text(direction === "sent" ? "Money sent" : "Money received", 300, infoY + 28, {
        width: 230,
        align: "right",
      })

    const amountY = infoY + 95
    doc.font("Helvetica").fontSize(11).fillColor(TEXT_MUTED).text("Amount", 50, amountY)
    doc
      .font("Helvetica-Bold")
      .fontSize(28)
      .fillColor(BRAND_PRIMARY)
      .text(
        `${transfer.currency} ${Number(transfer.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        50,
        amountY + 18,
      )

    if (transfer.receiveAmount && transfer.receiveCurrency) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(TEXT_MUTED)
        .text(
          `Counter amount: ${transfer.receiveCurrency} ${Number(transfer.receiveAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
          50,
          amountY + 52,
        )
    }

    const tableY = amountY + 90
    const rows: [string, string][] = [
      [direction === "sent" ? "Sent to" : "Received from", otherParty.name || "Unknown"],
      ["Reference", transfer.reference],
      ["Status", transfer.status],
      ["Date", dateStr],
    ]
    if (transfer.description) rows.push(["Description", transfer.description])

    doc.font("Helvetica-Bold").fontSize(12).fillColor(BRAND_DARK).text("Transaction details", 50, tableY)

    let y = tableY + 22
    for (const [label, value] of rows) {
      doc.roundedRect(50, y, contentWidth, 28, 4).stroke(BORDER_COLOR)
      doc.font("Helvetica").fontSize(9).fillColor(TEXT_MUTED).text(label, 60, y + 9)
      const valColor = label === "Status" ? statusColor(transfer.status) : BRAND_DARK
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(valColor)
        .text(value, 200, y + 8, { width: contentWidth - 160, align: "right" })
      y += 32
    }

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(TEXT_MUTED)
      .text(
        `This receipt was generated electronically by ${company.brandTitle}.`,
        50,
        doc.page.height - 60,
        { width: contentWidth, align: "center" },
      )

    doc.end()
  })
}
