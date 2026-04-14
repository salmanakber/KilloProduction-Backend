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
    const { name, content, variables, category, description, isActive, maxLength } = body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (content !== undefined) updateData.content = content
    if (variables !== undefined) updateData.variables = variables
    if (category !== undefined) updateData.category = category
    if (description !== undefined) updateData.description = description
    if (isActive !== undefined) updateData.isActive = isActive
    if (maxLength !== undefined) updateData.maxLength = maxLength

    const template = await prisma.smsTemplate.update({
      where: { id: params.id },
      data: updateData
    })

    return NextResponse.json({ success: true, template })
  } catch (error) {
    console.error('Error updating SMS template:', error)
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

    // Check if template is a system template
    const template = await prisma.smsTemplate.findUnique({
      where: { id: params.id }
    })

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    if (template.isSystem) {
      return NextResponse.json(
        { error: 'Cannot delete system template. You can only deactivate it.' },
        { status: 403 }
      )
    }

    await prisma.smsTemplate.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting SMS template:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

