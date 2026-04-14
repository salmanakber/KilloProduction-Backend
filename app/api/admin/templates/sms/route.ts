import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest() 
    if (!session || session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const module = searchParams.get('module')
    const isActive = searchParams.get('isActive')
    const isDefault = searchParams.get('isDefault')

    const where: any = {}
    
    if (category && category !== 'ALL') {
      where.category = category
    }
    
    if (module && module !== 'ALL') {
      where.module = module
    }
    
    if (isActive !== null && isActive !== undefined && isActive !== 'ALL') {
      where.isActive = isActive === 'true'
    }
    
    if (isDefault !== null && isDefault !== undefined && isDefault !== 'ALL') {
      where.isDefault = isDefault === 'true'
    }

    const templates = await prisma.smsTemplate.findMany({
      where,
      orderBy: [
        { module: 'asc' },
        { category: 'asc' },
        { isDefault: 'desc' },
        { createdAt: 'desc' }
      ]
    })

    return NextResponse.json({ templates })
  } catch (error) {
    console.error('Error fetching SMS templates:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
        const session = await authenticateRequest() 
    if (!session || session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, content, variables, category, module, description, isActive, isDefault, maxLength } = body

    if (!name || !content || !category) {
      return NextResponse.json(
        { error: 'Name, content, and category are required' },
        { status: 400 }
      )
    }

    // If setting as default, remove default flag from other templates with same category+module
    if (isDefault) {
      await prisma.smsTemplate.updateMany({
        where: {
          category,
          module: module || 'GLOBAL',
          isDefault: true
        },
        data: { isDefault: false }
      })
    }

    const template = await prisma.smsTemplate.create({
      data: {
        name,
        content,
        variables: variables || [],
        category,
        module: module || 'GLOBAL',
        description,
        isActive: isActive ?? true,
        isDefault: isDefault ?? false,
        maxLength: maxLength || 160,
        createdBy: session.id,
      }
    })

    return NextResponse.json({ success: true, template })
  } catch (error: any) {
    console.error('Error creating SMS template:', error)
    
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Template name already exists' },
        { status: 400 }
      )
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

