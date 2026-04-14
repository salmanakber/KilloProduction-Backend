import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

// Get Money Transfer Paystack config (separate from marketplace)
async function getMoneyTransferPaystackConfig() {
  const config = await prisma.moneyTransferConfig.findFirst()
  
  if (config?.paystackSecretKey) {
    return config.paystackSecretKey
  }
  
  // Fallback to environment variable if config not set
  if (process.env.MONEY_TRANSFER_PAYSTACK_SECRET_KEY) {
    return process.env.MONEY_TRANSFER_PAYSTACK_SECRET_KEY
  }
  
  throw new Error("Money Transfer Paystack configuration not found")
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { payoutId } = await request.json()

    if (!payoutId) {
      return NextResponse.json(
        { error: "Payout ID is required" },
        { status: 400 }
      )
    }

    // Get payout
    const payout = await prisma.moneyTransferPayout.findUnique({
      where: { id: payoutId },
      include: {
        transfer: true,
      },
    })

    if (!payout) {
      return NextResponse.json(
        { error: "Payout not found" },
        { status: 404 }
      )
    }

    // Only retry failed payouts
    if (payout.status !== "FAILED") {
      return NextResponse.json(
        { error: `Cannot retry payout with status: ${payout.status}` },
        { status: 400 }
      )
    }

    const paystackSecretKey = await getMoneyTransferPaystackConfig()

    // Ensure recipient exists
    let recipientCode = payout.paystackRecipientCode

    if (!recipientCode) {
      // Create recipient
      const recipientResponse = await fetch("https://api.paystack.co/transferrecipient", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "nuban",
          name: payout.accountName,
          account_number: payout.accountNumber,
          bank_code: payout.bankCode,
          currency: "NGN",
        }),
      })

      const recipientData = await recipientResponse.json()

      if (!recipientData.status) {
        throw new Error(recipientData.message || "Failed to create Paystack recipient")
      }

      recipientCode = recipientData.data.recipient_code

      await prisma.moneyTransferPayout.update({
        where: { id: payout.id },
        data: {
          paystackRecipientCode: recipientCode,
        },
      })
    }

    // Initiate Paystack transfer
    const transferResponse = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: payout.amount, // Already in kobo
        recipient: recipientCode,
        reference: `MT_RETRY_${payout.transfer.reference}_${Date.now()}`,
        reason: `Money transfer withdrawal retry: ${payout.transfer.reference}`,
      }),
    })

    const transferData = await transferResponse.json()

    if (!transferData.status) {
      // Update payout with failure
      await prisma.moneyTransferPayout.update({
        where: { id: payout.id },
        data: {
          status: "FAILED",
          failureReason: transferData.message || "Paystack transfer failed",
          paystackResponse: transferData,
          failedAt: new Date(),
          retryCount: payout.retryCount + 1,
          lastRetryAt: new Date(),
        },
      })

      return NextResponse.json(
        { error: transferData.message || "Failed to retry payout" },
        { status: 500 }
      )
    }

    // Update payout with success
    await prisma.moneyTransferPayout.update({
      where: { id: payout.id },
      data: {
        status: "PROCESSING",
        paystackTransferCode: transferData.data.transfer_code,
        paystackReference: transferData.data.reference,
        paystackResponse: transferData,
        processedAt: new Date(),
        retryCount: payout.retryCount + 1,
        lastRetryAt: new Date(),
        failureReason: null,
        failedAt: null,
      },
    })

    // Update transfer status
    await prisma.moneyTransfer.update({
      where: { id: payout.transferId },
      data: {
        status: "PROCESSING",
      },
    })

    return NextResponse.json({
      success: true,
      payout: {
        id: payout.id,
        status: "PROCESSING",
        paystackReference: transferData.data.reference,
        retryCount: payout.retryCount + 1,
      },
    })
  } catch (error: any) {
    console.error("Error retrying payout:", error)
    return NextResponse.json(
      { error: error.message || "Failed to retry payout" },
      { status: 500 }
    )
  }
}
