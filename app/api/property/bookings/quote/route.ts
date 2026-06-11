import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { calculatePropertyQuote } from "@/lib/property-pricing"
import { roundMoney2 } from "@/lib/money-round"
import { assertListingAvailable } from "@/lib/property-booking-service"

export async function POST(request: NextRequest) {
  try {
    const { listingId, checkIn, checkOut, nights: nightsInput } = await request.json()
    if (!listingId || !checkIn || !checkOut) {
      return NextResponse.json(
        { error: "listingId, checkIn, and checkOut are required" },
        { status: 400 }
      )
    }

    const listing = await prisma.propertyListing.findUnique({ where: { id: listingId } })
    if (!listing || listing.status !== "ACTIVE") {
      return NextResponse.json({ error: "Listing not available" }, { status: 404 })
    }

    const checkInDate = new Date(checkIn)
    const checkOutDate = new Date(checkOut)
    const nights =
      nightsInput ||
      Math.max(1, Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (86400000)))

    await assertListingAvailable(listingId, checkInDate, checkOutDate)

    const quote = await calculatePropertyQuote({
      nightlyRate: listing.nightlyRate,
      discountPercent: listing.discountPercent,
      cleaningFee: listing.cleaningFee,
      securityDeposit: listing.securityDeposit,
      nights,
    })

    return NextResponse.json({
      success: true,
      quote: {
        ...quote,
        breakdown: [
          ...(quote.discountedNights > 0
            ? [
                {
                  label: `First ${quote.discountedNights} night(s) (promo rate)`,
                  amount: roundMoney2(quote.effectiveNightlyRate * quote.discountedNights),
                },
                ...(quote.nights > quote.discountedNights
                  ? [
                      {
                        label: `Remaining ${quote.nights - quote.discountedNights} night(s)`,
                        amount: roundMoney2(
                          quote.nightlyRate * (quote.nights - quote.discountedNights)
                        ),
                      },
                    ]
                  : []),
              ]
            : [{ label: "Nightly charges", amount: quote.subtotal }]),
          { label: "Cleaning fee", amount: quote.cleaningFee },
          { label: "Security deposit", amount: quote.securityDeposit },
          { label: "Platform fee", amount: quote.platformFee },
        ],
        total: quote.totalAmount,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to calculate quote" },
      { status: 400 }
    )
  }
}
