import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const settings = await prisma.commissionSetting.findMany({
      where: { module: 'GROCERY', isActive: true },
    })

    const commissions: Record<string, { rate: number; minAmount?: number; maxAmount?: number }> = {}
    for (const s of settings) {
      commissions[s.commissionType] = {
        rate: s.rate,
        minAmount: s.minAmount ?? undefined,
        maxAmount: s.maxAmount ?? undefined,
      }
    }

    const platformFee = commissions.PLATFORM_FEE || { rate: 8.0, minAmount: 15, maxAmount: 800 }

    return NextResponse.json({ platformFee })
  } catch (error) {
    console.error('Grocery commission fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch commission settings' }, { status: 500 })
  }
}
