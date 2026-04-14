import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from "@/lib/auth"
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user's wallet balance
    const wallet = await prisma.wallet.findUnique({
      where: {
        userId: session.id,
        isActive: true
      },
      select: {
        id: true,
        balance: true,
        currency: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    })

    // If wallet doesn't exist, create one
    if (!wallet) {
      const newWallet = await prisma.wallet.create({
        data: {
          userId: session.id,
          balance: 0,
          currency: 'NGN', // Default currency
          isActive: true
        },
        select: {
          id: true,
          balance: true,
          currency: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        }
      })

      return NextResponse.json({
        success: true,
        data: {
          wallet: newWallet,
          balance: newWallet.balance,
          currency: newWallet.currency,
          hasWallet: true
        }
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        wallet: wallet,
        balance: wallet.balance,
        currency: wallet.currency,
        hasWallet: true
      }
    })

  } catch (error: any) {
    console.error('Error fetching wallet balance:', error)
    return NextResponse.json({
      error: error.message || 'Failed to fetch wallet balance'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { amount, type, description, reference } = body

    if (!amount || !type || !description) {
      return NextResponse.json({ 
        error: 'Missing required fields: amount, type, description' 
      }, { status: 400 })
    }

    // Get or create wallet
    let wallet = await prisma.wallet.findUnique({
      where: {
        userId: session.id,
        isActive: true
      }
    })

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          userId: session.id,
          balance: 0,
          currency: 'NGN',
          isActive: true
        }
      })
    }

    // Validate transaction amount
    if (type === 'DEBIT' && wallet.balance < amount) {
      return NextResponse.json({
        error: 'Insufficient wallet balance'
      }, { status: 400 })
    }

    // Calculate new balance
    const newBalance = type === 'CREDIT' 
      ? wallet.balance + amount 
      : wallet.balance - amount

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Update wallet balance
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
        select: {
          id: true,
          balance: true,
          currency: true,
          isActive: true
        }
      })

      // Create wallet transaction record
      const walletTransaction = await tx.walletTransaction.create({
        data: {
          userId: session.id,
          type: type,
          amount: amount,
          balance: newBalance,
          description: description,
          reference: reference,
          status: 'COMPLETED',
          metadata: {
            walletId: wallet.id,
            previousBalance: wallet.balance
          }
        },
        select: {
          id: true,
          type: true,
          amount: true,
          balance: true,
          description: true,
          reference: true,
          status: true,
          createdAt: true
        }
      })

      return { wallet: updatedWallet, transaction: walletTransaction }
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: `Wallet ${type.toLowerCase()} successful`
    })

  } catch (error: any) {
    console.error('Error processing wallet transaction:', error)
    return NextResponse.json({
      error: error.message || 'Failed to process wallet transaction'
    }, { status: 500 })
  }
}