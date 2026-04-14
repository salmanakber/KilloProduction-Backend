import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(
  request: NextRequest,
  { params }: { params: { requestId: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { requestId } = params
    const body = await request.json()
    const { rating, comment, title } = body

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 })
    }

    // Get the service request
    const serviceRequest = await prisma.mechanicServiceRequest.findUnique({
      where: { id: requestId },
      include: {
        mechanic: {
          include: {
            user: true,
          },
        },
      },
    })

    if (!serviceRequest) {
      return NextResponse.json({ error: "Service request not found" }, { status: 404 })
    }

    // Verify customer owns the request
    if (serviceRequest.customerId !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }

    /** Quote / marketplace jobs may have mechanicId null on the SR; resolve mechanic user + profile from quote or offers. */
    const quoteRow = await prisma.mechanicQuote.findFirst({
      where: { serviceRequestId: requestId },
      select: { mechanicId: true },
    })
    const acceptedOffer = await prisma.mechanicOffer.findFirst({
      where: { serviceRequestId: requestId, status: "ACCEPTED" },
      select: { mechanicId: true },
    })
    const anyOffer = !acceptedOffer
      ? await prisma.mechanicOffer.findFirst({
          where: { serviceRequestId: requestId },
          orderBy: { updatedAt: "desc" },
          select: { mechanicId: true },
        })
      : null

    let mechanicUserId: string | null = serviceRequest.mechanic?.userId ?? null
    if (!mechanicUserId && quoteRow?.mechanicId) {
      mechanicUserId = quoteRow.mechanicId
    }
    if (!mechanicUserId && acceptedOffer?.mechanicId) {
      mechanicUserId = acceptedOffer.mechanicId
    }
    if (!mechanicUserId && anyOffer?.mechanicId) {
      mechanicUserId = anyOffer.mechanicId
    }

    if (!mechanicUserId) {
      return NextResponse.json({ error: "No mechanic assigned to this request" }, { status: 400 })
    }

    const mechanicProfileRow =
      serviceRequest.mechanicId != null
        ? { id: serviceRequest.mechanicId }
        : await prisma.mechanicProfile.findUnique({
            where: { userId: mechanicUserId },
            select: { id: true },
          })

    const mechanicProfileId = mechanicProfileRow?.id ?? ""

    // Check if already rated
    const existingReview = await prisma.review.findFirst({
      where: {
        userId: user.id,
        targetId: mechanicUserId,
        targetType: "MECHANIC",
        bookingID: requestId,
      }
    })

    if (existingReview) {
      // Update existing review
      const updatedReview = await prisma.review.update({
        where: { id: existingReview.id },
        data: {
          rating,
          title: title || null,
          comment: comment || null,
          updatedAt: new Date(),
        }
      })

      // Recalculate mechanic rating
      await updateMechanicRating(mechanicUserId)

      return NextResponse.json({
        success: true,
        data: {
          review: updatedReview,
          message: "Rating updated successfully"
        }
      })
    }

    

    // Create new review
    const newReview = await prisma.review.create({
      data: {
        userId: user.id,
        targetId: mechanicUserId,
        targetType: "MECHANIC",
        mechanicId: mechanicProfileId || undefined,
        bookingID: requestId,
        rating,
        title: title || null,
        comment: comment || null,
      }
    })

    // Update mechanic profile rating
    await updateMechanicRating(mechanicUserId)

    // Wallet transactions should already be COMPLETED when customer approves
    // If they're still PENDING (shouldn't happen), complete them as a fallback
    // Note: Wallet transactions are completed in the approve endpoint, not here
    const metadata = (serviceRequest.metadata as any) || {}
    const orderId = metadata?.orderId

    if (orderId && serviceRequest.status === "COMPLETED") {
      try {
        // Create order tracking entry for rating (wallet transactions should already be completed)
        await prisma.orderTracking.create({
          data: {
            orderId: orderId,
            status: "DELIVERED",
            notes: `Customer rated mechanic. Rating: ${rating}/5`,
            timestamp: new Date(),
          },
        })
      } catch (error) {
        console.error("Error creating order tracking for rating:", error)
        // Don't fail the rating if tracking update fails
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        review: newReview,
        message: "Thank you for your rating!"
      }
    })

  } catch (error: any) {
    console.error("Rate mechanic error:", error)
    return NextResponse.json(
      { error: "Failed to submit rating", details: error.message },
      { status: 500 }
    )
  }
}

// Helper function to update mechanic's average rating
async function updateMechanicRating(mechanicId: string) {
  const reviews = await prisma.review.findMany({
    where: {
      targetId: mechanicId,
      targetType: "MECHANIC",
    }
  })

  if (reviews.length === 0) return

  const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length

  await prisma.mechanicProfile.update({
    where: { userId: mechanicId },
    data: {
      rating: averageRating,
      totalReviews: reviews.length,
    }
  })
}



