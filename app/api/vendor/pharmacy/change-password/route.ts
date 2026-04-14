import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function PUT(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { currentPassword, newPassword } = body

    // Validate required fields
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current password and new password are required' }, { status: 400 })
    }

    // Validate new password length
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters long' }, { status: 400 })
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        password: true,
        email: true,
        phone: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify current password
    if (!user.password) {
      return NextResponse.json({ error: 'No password set for this account' }, { status: 400 })
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password)
    if (!isCurrentPasswordValid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }

    // Hash new password
    const saltRounds = 12
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds)

    // Update password
    await prisma.user.update({
      where: { id: session.id },
      data: {
        password: hashedNewPassword,
        updatedAt: new Date()
      }
    })

    return NextResponse.json({ 
      message: 'Password updated successfully',
      success: true
    })
  } catch (error) {
    console.error('Error changing password:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
