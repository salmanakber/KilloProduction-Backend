import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  try {
      const session = await authenticateRequest() 
    if (!session || session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const template = await prisma.smsTemplate.findFirst({
      where: { name: params.name }
    })

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ template })
  } catch (error) {
    console.error('Error fetching SMS template:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

