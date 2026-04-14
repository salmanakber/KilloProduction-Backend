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
    const { name, subject, htmlContent, textContent, variables, category, description, isActive } = body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (subject !== undefined) updateData.subject = subject
    if (htmlContent !== undefined) updateData.htmlContent = htmlContent
    if (textContent !== undefined) updateData.textContent = textContent
    if (variables !== undefined) updateData.variables = variables
    if (category !== undefined) updateData.category = category
    if (description !== undefined) updateData.description = description
    if (isActive !== undefined) updateData.isActive = isActive

    const template = await prisma.emailTemplate.update({
      where: { id: params.id },
      data: updateData
    })

    return NextResponse.json({ success: true, template })
  } catch (error) {
    console.error('Error updating email template:', error)
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
    const template = await prisma.emailTemplate.findUnique({
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

    await prisma.emailTemplate.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting email template:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

