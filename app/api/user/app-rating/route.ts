import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user has already rated or dismissed
    const appRating = await prisma.appRating.findUnique({
      where: { userId: user.id },
    })

    if (!appRating) {
      return NextResponse.json({
        success: true,
        hasRated: false,
        hasDismissed: false,
        rating: null,
      })
    }

    return NextResponse.json({
      success: true,
      hasRated: !!appRating.rating,
      hasDismissed: appRating.dismissed,
      rating: appRating.rating,
      feedback: appRating.feedback,
      createdAt: appRating.createdAt.toISOString(),
    })
  } catch (error: any) {
    console.error('Error fetching app rating:', error)
    return NextResponse.json(
      { error: 'Failed to fetch app rating', details: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { rating, feedback, dismissed, appVersion, platform } = body

    // Validate rating if provided
    if (rating !== null && rating !== undefined) {
      if (rating < 1 || rating > 5) {
        return NextResponse.json(
          { error: 'Rating must be between 1 and 5' },
          { status: 400 }
        )
      }
    }

    // Check if user already has a rating
    const existingRating = await prisma.appRating.findUnique({
      where: { userId: user.id },
    })

    if (existingRating) {
      // Update existing rating
      const updatedRating = await prisma.appRating.update({
        where: { id: existingRating.id },
        data: {
          rating: rating !== undefined ? rating : existingRating.rating,
          feedback: feedback !== undefined ? feedback : existingRating.feedback,
          dismissed: dismissed !== undefined ? dismissed : existingRating.dismissed,
          appVersion: appVersion || existingRating.appVersion,
          platform: platform || existingRating.platform,
          updatedAt: new Date(),
        },
      })

      return NextResponse.json({
        success: true,
        message: 'App rating updated successfully',
        rating: updatedRating,
      })
    }

    // Create new rating
    const newRating = await prisma.appRating.create({
      data: {
        userId: user.id,
        rating: rating || null,
        feedback: feedback || null,
        dismissed: dismissed || false,
        appVersion: appVersion || null,
        platform: platform || null,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'App rating saved successfully',
      rating: newRating,
    })
  } catch (error: any) {
    console.error('Error saving app rating:', error)
    return NextResponse.json(
      { error: 'Failed to save app rating', details: error.message },
      { status: 500 }
    )
  }
}

