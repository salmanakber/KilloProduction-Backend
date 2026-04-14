import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { cloudinary } from "@/lib/cloudinary"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { filter, startDate, endDate } = await request.json()

    // Build where clause
    const where: any = {
      OR: [
        { senderId: user.id },
        { receiverId: user.id },
      ],
    }

    if (filter === "sent") {
      where.OR = [{ senderId: user.id }]
    } else if (filter === "received") {
      where.OR = [{ receiverId: user.id }]
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(endDate)
    }

    // Fetch all transactions for the statement
    const transfers = await prisma.moneyTransfer.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        receiver: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        payout: {
          select: {
            status: true,
            paystackReference: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    // Generate PDF HTML
    const html = generatePDFHTML(user, transfers, filter)

    // For PDF generation, we'll upload HTML to Cloudinary as raw file
    // Note: Cloudinary doesn't directly convert HTML to PDF, so we store HTML
    // The mobile app can use a library to convert HTML to PDF, or we can use puppeteer/pdfkit in future
    try {
      const htmlBase64 = Buffer.from(html).toString('base64')
      
      // Upload HTML to Cloudinary as raw file
      const uploadResult = await cloudinary.uploader.upload(
        `data:text/html;base64,${htmlBase64}`,
        {
          folder: 'money-transfer/statements',
          resource_type: 'raw',
          public_id: `statement_${user.id}_${Date.now()}`,
        }
      )

      // Return Cloudinary URL (HTML file - can be converted to PDF on client or via service)
      return NextResponse.json({
        success: true,
        htmlUrl: uploadResult.secure_url,
        pdfUrl: uploadResult.secure_url, // Same URL for now (HTML)
        publicId: uploadResult.public_id,
        data: {
          user: {
            name: user.name,
            email: user.email,
          },
          transactions: transfers.map(t => ({
            id: t.id,
            reference: t.reference,
            type: t.senderId === user.id ? 'sent' : 'received',
            amount: t.amount,
            currency: t.currency,
            status: t.status,
            createdAt: t.createdAt,
            otherUser: t.senderId === user.id ? t.receiver : t.sender,
          })),
          summary: {
            totalSent: transfers.filter(t => t.senderId === user.id).reduce((sum, t) => sum + t.amount, 0),
            totalReceived: transfers.filter(t => t.receiverId === user.id).reduce((sum, t) => sum + t.amount, 0),
            totalTransactions: transfers.length,
          },
        },
      })
    } catch (cloudinaryError: any) {
      console.error('Cloudinary upload error:', cloudinaryError)
      // Fallback: Return HTML if Cloudinary fails
      return NextResponse.json({
        success: true,
        html,
        data: {
          user: {
            name: user.name,
            email: user.email,
          },
          transactions: transfers.map(t => ({
            id: t.id,
            reference: t.reference,
            type: t.senderId === user.id ? 'sent' : 'received',
            amount: t.amount,
            currency: t.currency,
            status: t.status,
            createdAt: t.createdAt,
            otherUser: t.senderId === user.id ? t.receiver : t.sender,
          })),
          summary: {
            totalSent: transfers.filter(t => t.senderId === user.id).reduce((sum, t) => sum + t.amount, 0),
            totalReceived: transfers.filter(t => t.receiverId === user.id).reduce((sum, t) => sum + t.amount, 0),
            totalTransactions: transfers.length,
          },
        },
      })
    }
  } catch (error: any) {
    console.error("Error generating statement:", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate statement" },
      { status: 500 }
    )
  }
}

function generatePDFHTML(user: any, transfers: any[], filter: string) {
  const totalSent = transfers.filter(t => t.senderId === user.id).reduce((sum, t) => sum + t.amount, 0)
  const totalReceived = transfers.filter(t => t.receiverId === user.id).reduce((sum, t) => sum + t.amount, 0)
  const netBalance = totalReceived - totalSent

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 40px;
          color: #333;
        }
        .header {
          text-align: center;
          margin-bottom: 40px;
          border-bottom: 3px solid #2dd4bf;
          padding-bottom: 20px;
        }
        .header h1 {
          color: #0f172a;
          margin: 0;
          font-size: 28px;
        }
        .header p {
          color: #64748b;
          margin: 5px 0;
        }
        .summary {
          display: flex;
          justify-content: space-around;
          margin: 30px 0;
          padding: 20px;
          background: #f8fafc;
          border-radius: 12px;
        }
        .summary-item {
          text-align: center;
        }
        .summary-label {
          font-size: 12px;
          color: #64748b;
          margin-bottom: 5px;
        }
        .summary-value {
          font-size: 20px;
          font-weight: bold;
          color: #0f172a;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 30px;
        }
        th {
          background: #0f172a;
          color: white;
          padding: 12px;
          text-align: left;
          font-size: 12px;
          text-transform: uppercase;
        }
        td {
          padding: 12px;
          border-bottom: 1px solid #e2e8f0;
        }
        tr:nth-child(even) {
          background: #f8fafc;
        }
        .status {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
        }
        .status-completed { background: #ecfdf5; color: #10b981; }
        .status-pending { background: #fef3c7; color: #f59e0b; }
        .status-failed { background: #fee2e2; color: #ef4444; }
        .amount-sent { color: #0f172a; }
        .amount-received { color: #10b981; }
        .footer {
          margin-top: 40px;
          text-align: center;
          color: #94a3b8;
          font-size: 12px;
          border-top: 1px solid #e2e8f0;
          padding-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Money Transfer Statement</h1>
        <p>${user.name || user.email}</p>
        <p>Generated on ${new Date().toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}</p>
      </div>

      <div class="summary">
        <div class="summary-item">
          <div class="summary-label">Total Sent</div>
          <div class="summary-value">$${totalSent.toFixed(2)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Total Received</div>
          <div class="summary-value">$${totalReceived.toFixed(2)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Net Balance</div>
          <div class="summary-value">$${netBalance.toFixed(2)}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Reference</th>
            <th>Type</th>
            <th>Counterparty</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${transfers.map(t => {
            const isSent = t.senderId === user.id
            const otherUser = isSent ? t.receiver : t.sender
            const date = new Date(t.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })
            return `
              <tr>
                <td>${date}</td>
                <td>${t.reference}</td>
                <td>${isSent ? 'Sent' : 'Received'}</td>
                <td>${otherUser?.name || otherUser?.email || 'Unknown'}</td>
                <td class="amount-${isSent ? 'sent' : 'received'}">
                  ${isSent ? '-' : '+'}${t.currency} ${t.amount.toFixed(2)}
                </td>
                <td>
                  <span class="status status-${t.status.toLowerCase()}">
                    ${t.status}
                  </span>
                </td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>

      <div class="footer">
        <p>This is an automated statement generated by SuperKillo Money Transfer</p>
        <p>For support, contact: support@superkillo.com</p>
      </div>
    </body>
    </html>
  `
}
