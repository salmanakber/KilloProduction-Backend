
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
    const isActive = searchParams.get('isActive')

    const where: any = {}
    
    if (category && category !== 'ALL') {
      where.category = category
    }
    
    if (isActive !== null && isActive !== undefined && isActive !== 'ALL') {
      where.isActive = isActive === 'true'
    }

    const faqs = await prisma.fAQ.findMany({
      where,
      orderBy: [
        { order: 'asc' },
        { createdAt: 'desc' }
      ]
    })

    return NextResponse.json({ faqs })
  } catch (error) {
    console.error('Error fetching FAQs:', error)
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
    const { question, answer, category, isActive, order, tags } = body

    if (!question || !answer || !category) {
      return NextResponse.json(
        { error: 'Question, answer, and category are required' },
        { status: 400 }
      )
    }

    const faq = await prisma.fAQ.create({
      data: {
        question,
        answer,
        category,
        isActive: isActive ?? true,
        order: order ?? 0,
        tags: tags || [],
      }
    })

    return NextResponse.json({ success: true, faq })
  } catch (error) {
    console.error('Error creating FAQ:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

