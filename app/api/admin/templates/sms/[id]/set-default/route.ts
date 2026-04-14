import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authenticateRequest()
    if (!session || (session.role !== 'ADMIN' && session.role !== 'SUPER_ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the template to set as default
    const template = await prisma.smsTemplate.findUnique({
      where: { id: params.id }
    })

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Use transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // Remove default flag from other templates with same category+module
      await tx.smsTemplate.updateMany({
        where: {
          category: template.category,
          module: template.module,
          isDefault: true,
          id: { not: params.id }
        },
        data: { isDefault: false }
      })

      // Set this template as default
      await tx.smsTemplate.update({
        where: { id: params.id },
        data: { isDefault: true }
      })
    })

    const updatedTemplate = await prisma.smsTemplate.findUnique({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true, template: updatedTemplate })
  } catch (error) {
    console.error('Error setting default SMS template:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

