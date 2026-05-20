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
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { transferId, bankAccountId } = await request.json()

    if (!transferId || !bankAccountId) {
      return NextResponse.json(
        { error: "Transfer ID and bank account ID are required" },
        { status: 400 }
      )
    }

    // Get transfer
    const transfer = await prisma.moneyTransfer.findUnique({
      where: { id: transferId },
      include: {
        payout: true,
      },
    })

    if (!transfer) {
      return NextResponse.json(
        { error: "Transfer not found" },
        { status: 404 }
      )
    }

    // Verify user is the receiver
    if (transfer.receiverId !== user.id) {
      return NextResponse.json(
        { error: "Only the receiver can withdraw this transfer" },
        { status: 403 }
      )
    }

    if (transfer.status === "COMPLETED") {
      return NextResponse.json(
        {
          error: "Funds are in your Kilo wallet",
          message:
            "This transfer was credited to your money wallet. Use Withdraw from Wallet on the Money home screen.",
          useWalletWithdraw: true,
        },
        { status: 400 },
      )
    }

    if (transfer.status !== "SENT" && transfer.status !== "PROCESSING") {
      return NextResponse.json(
        { error: `Transfer is ${transfer.status.toLowerCase()}. Cannot withdraw.` },
        { status: 400 }
      )
    }

    // Check if payout already exists
    if (transfer.payout) {
      if (transfer.payout.status === "SUCCESS") {
        return NextResponse.json(
          { error: "Payout already completed" },
          { status: 400 }
        )
      }
      if (transfer.payout.status === "PROCESSING") {
        return NextResponse.json(
          { error: "Payout is already being processed" },
          { status: 400 }
        )
      }
    }

    // Get bank account
    const bankAccount = await prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
    })

    if (!bankAccount || bankAccount.userId !== user.id) {
      return NextResponse.json(
        { error: "Bank account not found or access denied" },
        { status: 404 }
      )
    }

    if (!bankAccount.isVerified) {
      return NextResponse.json(
        { error: "Bank account must be verified before withdrawal" },
        { status: 400 }
      )
    }

    // Get Paystack secret key
    const paystackSecretKey = await getMoneyTransferPaystackConfig()

    // Calculate NGN amount if not already set
    let ngnAmount = transfer.ngnAmount
    if (!ngnAmount) {
      // For MVP, use a simple conversion (1 USD = 1500 NGN)
      // In production, use real-time exchange rates
      const exchangeRate = 1500
      ngnAmount = transfer.amount * exchangeRate
      
      await prisma.moneyTransfer.update({
        where: { id: transfer.id },
        data: {
          ngnAmount,
          exchangeRate,
        },
      })
    }

    // Create or update payout record
    let payout = transfer.payout
    if (!payout) {
      payout = await prisma.moneyTransferPayout.create({
        data: {
          transferId: transfer.id,
          amount: Math.round(ngnAmount * 100), // Convert to kobo
          currency: "NGN",
          bankName: bankAccount.bankName,
          accountNumber: bankAccount.accountNumber,
          accountName: bankAccount.accountHolderName,
          bankCode: bankAccount.routingNumber || "", // Using routingNumber as bankCode
          status: "PENDING",
        },
      })
    }

    // Create Paystack transfer recipient (if not exists)
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
          name: bankAccount.accountHolderName,
          account_number: bankAccount.accountNumber,
          bank_code: bankAccount.routingNumber || bankAccount.swiftCode || "",
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
        amount: Math.round(ngnAmount * 100), // Amount in kobo
        recipient: recipientCode,
        reference: `MT_${transfer.reference}_${Date.now()}`,
        reason: `Money transfer withdrawal: ${transfer.reference}`,
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
        },
      })

      return NextResponse.json(
        { error: transferData.message || "Failed to initiate payout" },
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
      },
    })

    // Update transfer status
    await prisma.moneyTransfer.update({
      where: { id: transfer.id },
      data: {
        status: "PROCESSING",
        receiverBankName: bankAccount.bankName,
        receiverAccountNumber: bankAccount.accountNumber,
        receiverAccountName: bankAccount.accountHolderName,
        receiverBankCode: bankAccount.routingNumber || "",
      },
    })

    // Create notification
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: "Withdrawal Initiated",
        message: `Your withdrawal of ₦${ngnAmount.toFixed(2)} is being processed`,
        type: "MONEY_TRANSFER",
        data: {
          transferId: transfer.id,
          payoutId: payout.id,
        },
      },
    })

    return NextResponse.json({
      success: true,
      payout: {
        id: payout.id,
        status: "PROCESSING",
        amount: ngnAmount,
        currency: "NGN",
        paystackReference: transferData.data.reference,
      },
    })
  } catch (error: any) {
    console.error("Error processing withdrawal:", error)
    return NextResponse.json(
      { error: error.message || "Failed to process withdrawal" },
      { status: 500 }
    )
  }
}
