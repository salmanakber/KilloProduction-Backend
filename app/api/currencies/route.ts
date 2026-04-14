import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const currencies = await prisma.currency.findMany({
    where: { isActive: true },
  })

  const defaultCurrency = await prisma.currency.findFirst({
    where: { isDefault: true },
  })

  return NextResponse.json({
    currencies,
    defaultCurrency: defaultCurrency || null,
  })
}

export async function POST(request: NextRequest) {
  const currencies = await prisma.currency.findMany({
    where: { isActive: true },
  })

  const defaultCurrency = await prisma.currency.findFirst({
    where: { isDefault: true },
  })

  return NextResponse.json({
    currencies,
    defaultCurrency: defaultCurrency || null,
  })
}
