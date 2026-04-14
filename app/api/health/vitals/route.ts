import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

// GET /api/health/vitals – get user's health vital profile
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const vital = await prisma.healthVital.findUnique({ where: { userId: user.id } })

    // Also pull current medications from active pill reminders
    const activeReminders = await prisma.medicineReminder.findMany({
      where: { userId: user.id, isActive: true },
      select: { medicineName: true, dosage: true, frequency: true },
    })

    return NextResponse.json({
      vital: vital ?? null,
      activeReminders,
    })
  } catch (error) {
    console.error('Error fetching health vitals:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/health/vitals – create or update user's health vital profile
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const {
      name,
      age,
      gender,
      weight,
      height,
      chronicConditions,
      allergies,
      currentMedications,
      bloodType,
      emergencyContact,
    } = body

    const vital = await prisma.healthVital.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        name,
        age: age ? Number(age) : null,
        gender,
        weight: weight ? Number(weight) : null,
        height: height ? Number(height) : null,
        chronicConditions: chronicConditions ?? [],
        allergies: allergies ?? [],
        currentMedications: currentMedications ?? [],
        bloodType,
        emergencyContact,
      },
      update: {
        ...(name !== undefined && { name }),
        ...(age !== undefined && { age: age ? Number(age) : null }),
        ...(gender !== undefined && { gender }),
        ...(weight !== undefined && { weight: weight ? Number(weight) : null }),
        ...(height !== undefined && { height: height ? Number(height) : null }),
        ...(chronicConditions !== undefined && { chronicConditions }),
        ...(allergies !== undefined && { allergies }),
        ...(currentMedications !== undefined && { currentMedications }),
        ...(bloodType !== undefined && { bloodType }),
        ...(emergencyContact !== undefined && { emergencyContact }),
      },
    })

    return NextResponse.json({ vital })
  } catch (error) {
    console.error('Error saving health vitals:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
