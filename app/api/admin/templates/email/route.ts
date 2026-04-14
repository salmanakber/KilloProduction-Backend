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

    const templates = await prisma.emailTemplate.findMany({
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
    console.error('Error fetching email templates:', error)
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
    const { name, subject, htmlContent, textContent, variables, category, module, description, isActive, isDefault, templateKey } = body

    if (!name || !subject || !htmlContent || !category || !templateKey) {
      return NextResponse.json(
        { error: 'Name, subject, HTML content, category, and template key are required' },
        { status: 400 }
      )
    }

    

    // If setting as default, remove default flag from other templates with same category+module
    if (isDefault) {
      const abc = await prisma.emailTemplate.updateMany({
        where: {
          category,
          module: module || 'GLOBAL',
          isDefault: isDefault
        },
        data: { isDefault: false }
      })
    

    }
    

    const template = await prisma.emailTemplate.create({
      data: {
        name,
        subject,
        htmlContent,
        textContent,
        variables: variables || [],
        category,
        module: module || 'GLOBAL',
        description,
        isActive: isActive ?? true,
        isDefault: isDefault ?? false,
        createdBy: session.id,
        templateKey,
      }
    })

    

    return NextResponse.json({ success: true, template })
  } catch (error: any) {
    console.error('Error creating email template:', error)
    
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Template name already exists' },
        { status: 400 }
      )
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

