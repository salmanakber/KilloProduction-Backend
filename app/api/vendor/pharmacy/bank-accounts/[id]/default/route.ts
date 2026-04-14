import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    // Verify the bank account belongs to the user
    const bankAccount = await prisma.vendorBankAccount.findFirst({
      where: {
        id,
        userId: session.id
      }
    })

    if (!bankAccount) {
      return NextResponse.json({ error: 'Bank account not found' }, { status: 404 })
    }

    // Remove default from all other accounts
    await prisma.vendorBankAccount.updateMany({
      where: {
        userId: session.id,
        isDefault: true
      },
      data: {
        isDefault: false
      }
    })

    // Set this account as default
    const updatedAccount = await prisma.vendorBankAccount.update({
      where: { id },
      data: {
        isDefault: true
      }
    })

    return NextResponse.json(updatedAccount)
  } catch (error) {
    console.error('Error setting default bank account:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
