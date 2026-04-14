import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function DELETE(
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

    // Check if this is the default account
    if (bankAccount.isDefault) {
      return NextResponse.json({ 
        error: 'Cannot delete default bank account. Please set another account as default first.' 
      }, { status: 400 })
    }

    // Delete the bank account
    await prisma.vendorBankAccount.delete({
      where: { id }
    })

    return NextResponse.json({ message: 'Bank account deleted successfully' })
  } catch (error) {
    console.error('Error deleting bank account:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
