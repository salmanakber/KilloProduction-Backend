import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authenticateRequest()
    if (!session || session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { question, answer, category, isActive, order, tags } = body

    const updateData: any = {}
    if (question !== undefined) updateData.question = question
    if (answer !== undefined) updateData.answer = answer
    if (category !== undefined) updateData.category = category
    if (isActive !== undefined) updateData.isActive = isActive
    if (order !== undefined) updateData.order = order
    if (tags !== undefined) updateData.tags = tags

    const faq = await prisma.fAQ.update({
      where: { id: params.id },
      data: updateData
    })

    return NextResponse.json({ success: true, faq })
  } catch (error) {
    console.error('Error updating FAQ:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authenticateRequest()
    if (!session || session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await prisma.fAQ.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting FAQ:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

