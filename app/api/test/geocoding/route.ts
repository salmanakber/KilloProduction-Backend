import { type NextRequest, NextResponse } from "next/server"
import { geocodeAddress, getGoogleMapsRuntimeConfig } from "@/lib/google-maps"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get("address")

    if (!address) {
      return NextResponse.json({
        success: false,
        error: "Address parameter is required",
      })
    }

    const mapsConfig = await getGoogleMapsRuntimeConfig()

    const coordinates = await geocodeAddress(address)

    if (coordinates) {
      return NextResponse.json({
        success: true,
        address,
        coordinates: { lat: coordinates.lat, lng: coordinates.lng },
        formattedAddress: coordinates.formattedAddress,
        location: {
          countryCode: mapsConfig.countryCode,
          restrictToCountry: mapsConfig.restrictToCountry,
          components: mapsConfig.componentsParam ?? null,
        },
        mapsApiKeyConfigured: Boolean(mapsConfig.apiKey),
        message: "Geocoding successful",
      })
    }

    return NextResponse.json({
      success: false,
      address,
      location: {
        countryCode: mapsConfig.countryCode,
        restrictToCountry: mapsConfig.restrictToCountry,
      },
      mapsApiKeyConfigured: Boolean(mapsConfig.apiKey),
      error: "Failed to geocode address",
    })
  } catch (error) {
    console.error("Error in geocoding test:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
