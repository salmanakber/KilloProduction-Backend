import PDFDocument from "pdfkit"
import type { CompanyDisplayForPdf } from "@/lib/systemSettings"
import { DEFAULT_COMPANY_DISPLAY_FOR_PDF } from "@/lib/systemSettings"

const BRAND_PRIMARY = "#0f766e"
const BRAND_DARK = "#0F172A"
const TEXT_MUTED = "#64748B"
const BORDER_COLOR = "#E2E8F0"

type StatementMember = {
  name: string
  status: string
  amount: number
  currency: string
  cycleNumber: number
  dueDate: Date
  paidAt: Date | null
  contributionStatus: string
}

type StatementPayout = {
  name: string
  amount: number
  currency: string
  cycleNumber: number
  status: string
  processedAt: Date | null
}

export function buildAjoGroupStatementPdfBuffer(args: {
  groupName: string
  currency: string
  frequency: string
  contributionAmount: number
  treasuryBalance: number
  status: string
  creatorName: string
  contributions: StatementMember[]
  payouts: StatementPayout[]
  company?: CompanyDisplayForPdf
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const company = args.company ?? DEFAULT_COMPANY_DISPLAY_FOR_PDF
    const doc = new PDFDocument({ margin: 50, size: "A4" })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const pageWidth = doc.page.width
    const contentWidth = pageWidth - 100

    doc.font("Helvetica-Bold").fontSize(20).fillColor(BRAND_PRIMARY).text(company.brandTitle, 50, 50)
    doc.font("Helvetica-Bold").fontSize(16).fillColor(BRAND_DARK).text("AJO GROUP STATEMENT", 50, 50, {
      width: contentWidth,
      align: "right",
    })

    let y = 90
    doc.font("Helvetica").fontSize(10).fillColor(TEXT_MUTED)
    doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, 50, y)
    y += 28

    doc.font("Helvetica-Bold").fontSize(14).fillColor(BRAND_DARK).text(args.groupName, 50, y)
    y += 20
    doc.font("Helvetica").fontSize(10).fillColor(TEXT_MUTED)
    const meta = [
      `Creator: ${args.creatorName}`,
      `Status: ${args.status}`,
      `Frequency: ${args.frequency}`,
      `Contribution: ${args.currency} ${args.contributionAmount.toLocaleString()}`,
      `Treasury: ${args.currency} ${args.treasuryBalance.toLocaleString()}`,
    ]
    for (const line of meta) {
      doc.text(line, 50, y)
      y += 14
    }

    y += 12
    doc.moveTo(50, y).lineTo(50 + contentWidth, y).strokeColor(BORDER_COLOR).stroke()
    y += 18

    doc.font("Helvetica-Bold").fontSize(12).fillColor(BRAND_DARK).text("Contributions", 50, y)
    y += 18

    doc.font("Helvetica-Bold").fontSize(8).fillColor(TEXT_MUTED)
    doc.text("Cycle", 50, y)
    doc.text("Member", 90, y)
    doc.text("Amount", 250, y)
    doc.text("Status", 330, y)
    doc.text("Due / Paid", 400, y)
    y += 14
    doc.moveTo(50, y).lineTo(50 + contentWidth, y).strokeColor(BORDER_COLOR).stroke()
    y += 8

    doc.font("Helvetica").fontSize(8).fillColor(BRAND_DARK)
    for (const row of args.contributions) {
      if (y > 760) {
        doc.addPage()
        y = 50
      }
      const dateLabel = row.paidAt
        ? row.paidAt.toLocaleDateString("en-US")
        : row.dueDate.toLocaleDateString("en-US")
      doc.text(String(row.cycleNumber), 50, y, { width: 30 })
      doc.text(row.name.slice(0, 28), 90, y, { width: 150 })
      doc.text(`${row.currency} ${row.amount.toLocaleString()}`, 250, y, { width: 70 })
      doc.text(row.contributionStatus, 330, y, { width: 60 })
      doc.text(dateLabel, 400, y, { width: 100 })
      y += 14
    }

    y += 16
    if (y > 700) {
      doc.addPage()
      y = 50
    }
    doc.font("Helvetica-Bold").fontSize(12).fillColor(BRAND_DARK).text("Payouts", 50, y)
    y += 18
    doc.font("Helvetica-Bold").fontSize(8).fillColor(TEXT_MUTED)
    doc.text("Cycle", 50, y)
    doc.text("Recipient", 90, y)
    doc.text("Amount", 250, y)
    doc.text("Status", 330, y)
    doc.text("Processed", 400, y)
    y += 14
    doc.moveTo(50, y).lineTo(50 + contentWidth, y).strokeColor(BORDER_COLOR).stroke()
    y += 8

    doc.font("Helvetica").fontSize(8).fillColor(BRAND_DARK)
    if (args.payouts.length === 0) {
      doc.text("No payouts yet", 50, y)
    } else {
      for (const row of args.payouts) {
        if (y > 760) {
          doc.addPage()
          y = 50
        }
        doc.text(String(row.cycleNumber), 50, y, { width: 30 })
        doc.text(row.name.slice(0, 28), 90, y, { width: 150 })
        doc.text(`${row.currency} ${row.amount.toLocaleString()}`, 250, y, { width: 70 })
        doc.text(row.status, 330, y, { width: 60 })
        doc.text(row.processedAt ? row.processedAt.toLocaleDateString("en-US") : "—", 400, y, {
          width: 100,
        })
        y += 14
      }
    }

    doc.end()
  })
}
