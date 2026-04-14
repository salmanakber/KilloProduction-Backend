import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { cloudinary } from "@/lib/cloudinary"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const transfer = await prisma.moneyTransfer.findUnique({
      where: { id: params.id },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatar: true,
          },
        },
        receiver: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatar: true,
          },
        },
      },
    })

    if (!transfer) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      )
    }

    // Verify user has access to this transaction
    if (transfer.senderId !== user.id && transfer.receiverId !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized access to this transaction" },
        { status: 403 }
      )
    }

    const isSender = transfer.senderId === user.id
    const otherUser = isSender ? transfer.receiver : transfer.sender

    // Generate SVG receipt (Cloudinary can convert SVG to PNG)
    const svgReceipt = generateSVGReceipt(transfer, otherUser, isSender)
    const svgBase64 = Buffer.from(svgReceipt).toString('base64')

    // Upload SVG to Cloudinary and convert to PNG
    try {
      const uploadResult = await cloudinary.uploader.upload(
        `data:image/svg+xml;base64,${svgBase64}`,
        {
          folder: 'money-transfer/receipts',
          resource_type: 'image',
          format: 'png',
          transformation: [
            { width: 800, height: 1200, crop: 'limit' },
            { quality: 'auto', fetch_format: 'png' }
          ],
          public_id: `receipt_${transfer.reference}_${Date.now()}`,
        }
      )

      // Return the Cloudinary PNG URL
      return NextResponse.json({
        success: true,
        receiptUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
      })
    } catch (cloudinaryError: any) {
      console.error('Cloudinary upload error:', cloudinaryError)
      // Fallback: Return SVG directly if Cloudinary fails
      return new NextResponse(svgReceipt, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Content-Disposition': `attachment; filename="Receipt_${transfer.reference}.svg"`,
        },
      })
    }
  } catch (error: any) {
    console.error("Error generating receipt:", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate receipt" },
      { status: 500 }
    )
  }
}

function generateHTMLReceipt(transfer: any, otherUser: any, isSender: boolean) {
  const date = new Date(transfer.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const statusColor = transfer.status === 'COMPLETED' || transfer.status === 'SENT' 
    ? '#10b981' 
    : transfer.status === 'FAILED' 
    ? '#ef4444' 
    : '#f59e0b'

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
      background: #fff;
      width: 400px;
      margin: 0 auto;
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
    .amount-section {
      text-align: center;
      margin: 30px 0;
    }
    .amount-label {
      color: #64748b;
      font-size: 14px;
      margin-bottom: 8px;
    }
    .amount-value {
      color: ${statusColor};
      font-size: 36px;
      font-weight: bold;
    }
    .details {
      margin: 30px 0;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 1px solid #e2e8f0;
    }
    .detail-label {
      color: #64748b;
      font-size: 14px;
    }
    .detail-value {
      color: #0f172a;
      font-size: 14px;
      font-weight: 600;
      text-align: right;
    }
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
    <h1>Money Transfer Receipt</h1>
  </div>
  
  <div class="amount-section">
    <div class="amount-label">Total Amount</div>
    <div class="amount-value">${transfer.currency} ${transfer.amount.toFixed(2)}</div>
  </div>

  <div class="details">
    <div class="detail-row">
      <span class="detail-label">${isSender ? 'To' : 'From'}</span>
      <span class="detail-value">${otherUser?.name || 'Unknown'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Reference</span>
      <span class="detail-value">${transfer.reference}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Status</span>
      <span class="detail-value" style="color: ${statusColor}">${transfer.status}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Date</span>
      <span class="detail-value">${date}</span>
    </div>
    ${transfer.description ? `
    <div class="detail-row">
      <span class="detail-label">Description</span>
      <span class="detail-value">${transfer.description}</span>
    </div>
    ` : ''}
  </div>

  <div class="footer">
    <p>SuperKillo Money Transfer</p>
    <p>Generated on ${new Date().toLocaleDateString()}</p>
  </div>
</body>
</html>
  `
}

function generateSVGReceipt(transfer: any, otherUser: any, isSender: boolean) {
  const date = new Date(transfer.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const statusColor = transfer.status === 'COMPLETED' || transfer.status === 'SENT' 
    ? '#10b981' 
    : transfer.status === 'FAILED' 
    ? '#ef4444' 
    : '#f59e0b'

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .title { font-family: Arial, sans-serif; font-size: 24px; font-weight: bold; fill: #0f172a; }
      .label { font-family: Arial, sans-serif; font-size: 12px; fill: #64748b; }
      .value { font-family: Arial, sans-serif; font-size: 14px; font-weight: 600; fill: #0f172a; }
      .amount { font-family: Arial, sans-serif; font-size: 32px; font-weight: bold; fill: ${statusColor}; }
      .header { fill: #0f172a; }
      .footer { fill: #94a3b8; font-size: 10px; }
    </style>
  </defs>
  
  <!-- Background -->
  <rect width="400" height="600" fill="#ffffff"/>
  
  <!-- Header -->
  <text x="200" y="40" text-anchor="middle" class="title">Money Transfer Receipt</text>
  <line x1="50" y1="60" x2="350" y2="60" stroke="#e2e8f0" stroke-width="2"/>
  
  <!-- Amount -->
  <text x="200" y="120" text-anchor="middle" class="label">Total Amount</text>
  <text x="200" y="160" text-anchor="middle" class="amount">${transfer.currency} ${transfer.amount.toFixed(2)}</text>
  
  <!-- Details -->
  <text x="50" y="220" class="label">${isSender ? 'To' : 'From'}</text>
  <text x="200" y="220" text-anchor="end" class="value">${otherUser?.name || 'Unknown'}</text>
  
  <text x="50" y="250" class="label">Reference</text>
  <text x="200" y="250" text-anchor="end" class="value">${transfer.reference}</text>
  
  <text x="50" y="280" class="label">Status</text>
  <text x="200" y="280" text-anchor="end" class="value" fill="${statusColor}">${transfer.status}</text>
  
  <text x="50" y="310" class="label">Date</text>
  <text x="200" y="310" text-anchor="end" class="value">${date}</text>
  
  ${transfer.description ? `
  <text x="50" y="340" class="label">Description</text>
  <text x="200" y="340" text-anchor="end" class="value">${transfer.description}</text>
  ` : ''}
  
  <!-- Footer -->
  <line x1="50" y1="380" x2="350" y2="380" stroke="#e2e8f0" stroke-width="1"/>
  <text x="200" y="410" text-anchor="middle" class="footer">SuperKillo Money Transfer</text>
  <text x="200" y="430" text-anchor="middle" class="footer">Generated on ${new Date().toLocaleDateString()}</text>
</svg>`
}
