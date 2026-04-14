import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    const where: any = {
      isActive: true
    }
    if (category && category !== 'all') {
      where.category = category
    }

    const faqs = await prisma.fAQ.findMany({
      where,
      orderBy: [
        { order: 'asc' },
        { views: 'desc' },
        { createdAt: 'desc' }
      ]
    })

    return NextResponse.json(faqs)
  } catch (error) {
    console.error('Error fetching FAQs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
