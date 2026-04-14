import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { bodyTemp, bodyBp } = body;

    if (!bodyTemp && !bodyBp) {
      return NextResponse.json(
        { error: 'At least one metric (bodyTemp or bodyBp) is required' },
        { status: 400 }
      );
    }

    // Validate temperature format (e.g., "98.6" or "98.6°F")
    if (bodyTemp) {
      const tempValue = parseFloat(bodyTemp.toString().replace(/[°F°C]/g, ''));
      if (isNaN(tempValue) || tempValue < 90 || tempValue > 110) {
        return NextResponse.json(
          { error: 'Invalid temperature. Please provide a value between 90-110°F' },
          { status: 400 }
        );
      }
    }

    // Validate blood pressure format (e.g., "120/80" or "120/80 mmHg")
    if (bodyBp) {
      const bpMatch = bodyBp.toString().match(/(\d+)\s*\/\s*(\d+)/);
      if (!bpMatch) {
        return NextResponse.json(
          { error: 'Invalid blood pressure format. Please use format: "120/80"' },
          { status: 400 }
        );
      }
      const systolic = parseInt(bpMatch[1]);
      const diastolic = parseInt(bpMatch[2]);
      if (systolic < 70 || systolic > 200 || diastolic < 40 || diastolic > 130) {
        return NextResponse.json(
          { error: 'Invalid blood pressure values. Systolic: 70-200, Diastolic: 40-130' },
          { status: 400 }
        );
      }
    }

    // Update user profile
    const updatedProfile = await prisma.userProfile.upsert({
      where: { userId: session.id },
      update: {
        ...(bodyTemp && { bodyTemp: bodyTemp.toString() }),
        ...(bodyBp && { bodyBp: bodyBp.toString() }),
        updatedAt: new Date(),
      },
      create: {
        userId: session.id,
        firstName: session.name?.split(' ')[0] || 'User',
        lastName: session.name?.split(' ').slice(1).join(' ') || '',
        ...(bodyTemp && { bodyTemp: bodyTemp.toString() }),
        ...(bodyBp && { bodyBp: bodyBp.toString() }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Health metrics updated successfully',
      data: {
        bodyTemp: updatedProfile.bodyTemp,
        bodyBp: updatedProfile.bodyBp,
      },
    });
  } catch (error) {
    console.error('Error updating health metrics:', error);
    return NextResponse.json(
      { error: 'Failed to update health metrics' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.id },
      select: { bodyTemp: true, bodyBp: true, updatedAt: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        bodyTemp: profile?.bodyTemp || null,
        bodyBp: profile?.bodyBp || null,
        lastUpdated: profile?.updatedAt || null,
      },
    });
  } catch (error) {
    console.error('Error fetching health metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch health metrics' },
      { status: 500 }
    );
  }
}
