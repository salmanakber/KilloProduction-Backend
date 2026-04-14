import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const bankAccounts = await prisma.vendorBankAccount.findMany({
      where: { vendorId: session.id },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json(bankAccounts)
  } catch (error) {
    console.error('Error fetching bank accounts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      accountName,
      accountNumber,
      bankName,
      bankCode,
      swiftCode,
      routingNumber,
      isPrimary,
    } = body

    // Validate required fields
    if (!accountName || !accountNumber || !bankName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Validate account number length
    if (accountNumber.length < 10) {
      return NextResponse.json({ error: 'Account number must be at least 10 digits' }, { status: 400 })
    }

    const bankAccount = await prisma.vendorBankAccount.create({
      data: {
        vendorId: session.id,
        accountName,
        accountNumber,
        bankName,
        bankCode,
        swiftCode,
        routingNumber,
        isPrimary, // Will be set to true if this is the first account
      }
    })

    // If this is the first account, make it default
    const accountCount = await prisma.vendorBankAccount.count({
      where: { vendorId: session.id }
    })

    if (accountCount === 1) {
      await prisma.vendorBankAccount.update({
        where: { id: bankAccount.id },
        data: { isPrimary: true }
      })
    }

    return NextResponse.json(bankAccount, { status: 201 })
  } catch (error) {
    console.error('Error creating bank account:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
