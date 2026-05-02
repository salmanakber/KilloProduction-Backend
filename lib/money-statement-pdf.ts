import PDFDocument from "pdfkit"
import type { CompanyDisplayForPdf } from "@/lib/systemSettings"
import { DEFAULT_COMPANY_DISPLAY_FOR_PDF } from "@/lib/systemSettings"

// --- Brand Colors (Matching your mobile app theme) ---
const BRAND_PRIMARY = "#0f766e" // Teal
const BRAND_DARK = "#0F172A"
const TEXT_MUTED = "#64748B"
const BORDER_COLOR = "#E2E8F0"
const BG_LIGHT = "#F8FAFC"

// Status Colors
const COLOR_SUCCESS = "#10b981"
const COLOR_FAILED = "#ef4444"
const COLOR_PENDING = "#f59e0b"

export function buildStatementPdfBuffer(
  user: { id: string; name: string | null; email: string | null; phone?: string | null },
  transfers: any[],
  filter: string,
  summary: { totalSent: number; totalReceived: number; totalTransactions: number },
  opts?: { periodLabel?: string; company?: CompanyDisplayForPdf }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const company = opts?.company ?? DEFAULT_COMPANY_DISPLAY_FOR_PDF

    // A4 Dimensions: 595.28 x 841.89
    const doc = new PDFDocument({ margin: 50, size: "A4" })
    const chunks: Buffer[] = []

    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const pageWidth = doc.page.width
    const contentWidth = pageWidth - 100 // 495
    let currentPage = 1

    // ==========================================
    // 1. DRAW HEADER (company from SystemSettings.compnyinfo)
    // ==========================================
    let hy = 50

    doc.font("Helvetica-Bold").fontSize(22).fillColor(BRAND_PRIMARY).text(company.brandTitle, 50, hy, {
      width: contentWidth - 200,
    })
    hy += 26

    doc.font("Helvetica").fontSize(9).fillColor(TEXT_MUTED)
    const tag = company.tagline.length > 140 ? `${company.tagline.slice(0, 137)}…` : company.tagline
    if (tag) {
      const tagW = contentWidth - 200
      const tagH = doc.heightOfString(tag, { width: tagW, lineGap: 2 })
      doc.text(tag, 50, hy, { width: tagW, lineGap: 2 })
      hy += tagH + 6
    }

    for (const line of company.addressLines.slice(0, 4)) {
      doc.font("Helvetica").fontSize(9).fillColor(TEXT_MUTED).text(line, 50, hy)
      hy += 12
    }
    if (company.contactEmail) {
      doc.text(company.contactEmail, 50, hy)
      hy += 12
    }
    if (company.contactPhone) {
      doc.text(company.contactPhone, 50, hy)
      hy += 12
    }
    if (company.website) {
      doc.text(company.website, 50, hy)
      hy += 12
    }

    doc.font("Helvetica-Bold").fontSize(18).fillColor(BRAND_DARK)
    doc.text("STATEMENT OF ACCOUNT", 50, 50, { width: contentWidth, align: "right" })

    doc.font("Helvetica").fontSize(10).fillColor(TEXT_MUTED)
    doc.text(
      `Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
      50,
      75,
      { width: contentWidth, align: "right" }
    )

    // ==========================================
    // 2. CUSTOMER & STATEMENT INFO BOX
    // ==========================================
    const infoY = Math.max(160, hy + 18)
    
    // Background Box
    doc.roundedRect(50, infoY, contentWidth, 80, 6).fillAndStroke(BG_LIGHT, BORDER_COLOR)

    // Left Column: Customer Details
    doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND_DARK).text("Account Holder Details", 65, infoY + 15)
    doc.font("Helvetica").fontSize(10).fillColor(TEXT_MUTED)
    doc.text(user.name || "Valued Customer", 65, infoY + 35)
    doc.text(user.email || "No email on file", 65, infoY + 50)

    // Right Column: Statement Details
    doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND_DARK).text("Statement Details", 250, infoY + 15, { width: 230, align: "right" })
    doc.font("Helvetica").fontSize(10).fillColor(TEXT_MUTED)
    if (opts?.periodLabel) {
      doc.text(opts.periodLabel, 250, infoY + 35, { width: 230, align: "right" })
    }
    doc.text(`Filter: ${filter.charAt(0).toUpperCase() + filter.slice(1)}`, 250, infoY + 50, { width: 230, align: "right" })

    // ==========================================
    // 3. FINANCIAL SUMMARY
    // ==========================================
    const summaryY = infoY + 100
    const net = summary.totalReceived - summary.totalSent
    const colWidth = contentWidth / 3

    doc.font("Helvetica-Bold").fontSize(12).fillColor(BRAND_DARK).text("Account Summary", 50, summaryY)

    // Helper to draw summary blocks
    const drawSummaryBlock = (x: number, title: string, amount: number, isNegative: boolean = false) => {
      doc.font("Helvetica").fontSize(9).fillColor(TEXT_MUTED).text(title, x, summaryY + 25)
      const formatted = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      const prefix = isNegative && amount > 0 ? "-" : ""
      doc.font("Helvetica-Bold").fontSize(14).fillColor(BRAND_DARK).text(`${prefix}${formatted}`, x, summaryY + 40)
    }

    drawSummaryBlock(50, "Total Inflows (Received)", summary.totalReceived)
    drawSummaryBlock(50 + colWidth, "Total Outflows (Sent)", summary.totalSent, true)
    drawSummaryBlock(50 + colWidth * 2, "Net Movement", net)

    doc.moveTo(50, summaryY + 65).lineTo(pageWidth - 50, summaryY + 65).strokeColor(BORDER_COLOR).stroke()

    // ==========================================
    // 4. TRANSACTION TABLE
    // ==========================================
    let y = summaryY + 90

    doc.font("Helvetica-Bold").fontSize(12).fillColor(BRAND_DARK).text("Transaction History", 50, y)
    doc.font("Helvetica").fontSize(9).fillColor(TEXT_MUTED).text(`${summary.totalTransactions} transactions found`, 50, y, { width: contentWidth, align: "right" })
    y += 25

    // Column Setup
    const colDate = 50
    const colRef = 140
    const colParty = 240
    const colSt = 380
    const colAmt = 450 // Right-aligned

    const drawTableHeader = (startY: number) => {
      doc.rect(50, startY, contentWidth, 24).fill(BG_LIGHT)
      doc.fillColor(BRAND_DARK).font("Helvetica-Bold").fontSize(9)
      doc.text("Date", colDate + 5, startY + 7)
      doc.text("Reference", colRef, startY + 7)
      doc.text("Details", colParty, startY + 7)
      doc.text("Status", colSt, startY + 7)
      doc.text("Amount", colAmt, startY + 7, { width: 85, align: "right" }) // Right-align header
      return startY + 30
    }

    y = drawTableHeader(y)

    let isAltRow = false

    for (const t of transfers) {
      // Pagination Logic
      if (y > 750) {
        drawFooter(doc, currentPage, company)
        doc.addPage()
        currentPage++
        y = 50
        y = drawTableHeader(y)
      }

      const isSent = t.senderId === user.id
      const other = isSent ? t.receiver : t.sender
      const who = other?.name || other?.email || other?.phone || "Unknown Party"
      
      const d = new Date(t.createdAt)
      const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
      const timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })

      // Zebra Striping
      if (isAltRow) {
        doc.rect(50, y - 5, contentWidth, 30).fill("#FDFDFD") // Very light grey
      }
      isAltRow = !isAltRow

      doc.font("Helvetica").fontSize(8)

      // Date & Time
      doc.fillColor(BRAND_DARK).text(dateStr, colDate + 5, y)
      doc.fillColor(TEXT_MUTED).fontSize(7).text(timeStr, colDate + 5, y + 10)

      // Reference
      doc.fontSize(8).fillColor(TEXT_MUTED).text(String(t.reference).slice(0, 16), colRef, y + 4)

      // Party / Type
      doc.fillColor(BRAND_DARK).text(String(who).slice(0, 25), colParty, y)
      doc.fillColor(TEXT_MUTED).fontSize(7).text(isSent ? "Outgoing Transfer" : "Incoming Transfer", colParty, y + 10)

      // Status
      let stColor = COLOR_PENDING
      if (t.status === "COMPLETED" || t.status === "SENT") stColor = COLOR_SUCCESS
      if (t.status === "FAILED") stColor = COLOR_FAILED
      
      doc.fontSize(8).fillColor(stColor).text(String(t.status).charAt(0) + String(t.status).slice(1).toLowerCase(), colSt, y + 4)

      // Amount (Financial formatting: Right aligned)
      const sign = isSent ? "-" : "+"
      const amountColor = isSent ? BRAND_DARK : COLOR_SUCCESS
      const amtStr = `${sign}${t.currency} ${Number(t.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      
      doc.font("Helvetica-Bold").fillColor(amountColor).text(amtStr, colAmt, y + 4, { width: 85, align: "right" })

      y += 30
      doc.moveTo(50, y - 5).lineTo(pageWidth - 50, y - 5).strokeColor("#F1F5F9").stroke()
    }

    // Draw footer for the last page
    drawFooter(doc, currentPage, company)

    doc.end()
  })
}

// ==========================================
// 5. REUSABLE FOOTER FUNCTION
// ==========================================
function drawFooter(doc: InstanceType<typeof PDFDocument>, pageNum: number, company: CompanyDisplayForPdf) {
  const pageHeight = doc.page.height
  const pageWidth = doc.page.width
  const contentWidth = pageWidth - 100

  doc.moveTo(50, pageHeight - 60).lineTo(pageWidth - 50, pageHeight - 60).strokeColor(BORDER_COLOR).stroke()

  doc.font("Helvetica").fontSize(7).fillColor(TEXT_MUTED)
  const footerText = `${company.brandTitle} Money Transfer — automated statement. If you notice any discrepancies, contact ${company.supportEmail}.`
  doc.text(footerText, 50, pageHeight - 52, {
    width: contentWidth - 55,
    align: "left",
    lineBreak: true,
  })

  doc.font("Helvetica-Bold").text(`Page ${pageNum}`, pageWidth - 100, pageHeight - 45, { width: 50, align: "right" })
}