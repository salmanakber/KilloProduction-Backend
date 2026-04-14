import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { WalletService } from "@/lib/wallet-service"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR" as any) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
    })

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    const body = await request.json()
    const { vehicleType, pharmacyAddress, wholesalerAddress } = body as any

    if (!vehicleType) {
      return NextResponse.json(
        { error: "Vehicle type is required" },
        { status: 400 }
      )
    }

    // Get the supplier order
    const supplierOrder = await prisma.supplierOrder.findUnique({
      where: { 
        id: params.id,
        pharmacyId: pharmacy.id,
        status: {
          in: ["QUOTE_SENT", "QUOTE_ACCEPTED", "CONFIRMED"]
        }
      },
      include: {
        wholesaler: true,
        items: true,
      }
    })
    console.log(supplierOrder , params.id)

    if (!supplierOrder) {
      return NextResponse.json(
        { error: "Quote not found" },
        { status: 404 }
      )
    }

    // Resolve coordinates for both addresses (supports string or object)
    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY

    // Resolve coordinates from addresses
    console.log('Resolving coordinates for pharmacy address:', pharmacyAddress)
    console.log('Resolving coordinates for wholesaler address:', wholesalerAddress)
    
    const origin = await resolveCoordinates(pharmacyAddress, googleApiKey)
    const dest = await resolveCoordinates(wholesalerAddress, googleApiKey)
    
    console.log('Resolved origin coordinates:', origin)
    console.log('Resolved destination coordinates:', dest)

    // Prefer Google Distance Matrix driving distance; fallback to haversine
    let distance = 0
    try {
      if (
        googleApiKey &&
        typeof origin.latitude === 'number' &&
        typeof origin.longitude === 'number' &&
        typeof dest.latitude === 'number' &&
        typeof dest.longitude === 'number'
      ) {
        console.log('Using Google Distance Matrix API for accurate distance calculation')
        distance = await getDrivingDistanceKm(
          origin.latitude,
          origin.longitude,
          dest.latitude,
          dest.longitude,
          googleApiKey
        )
        console.log('Google Distance Matrix result:', distance, 'km')
      } else {
        console.log('Falling back to haversine distance calculation')
        distance = haversineDistance(origin.latitude, origin.longitude, dest.latitude, dest.longitude)
        console.log('Haversine distance result:', distance, 'km')
      }
    } catch (e) {
      console.log('Error in distance calculation, using haversine fallback:', e)
      distance = haversineDistance(origin.latitude, origin.longitude, dest.latitude, dest.longitude)
      console.log('Haversine fallback distance result:', distance, 'km')
    }

    // Get commission settings
    const [platformCommission, riderCommission, vendorCommission] = await Promise.all([
      prisma.commissionSetting.findFirst({
        where: {
          module: 'PHARMACY',
          commissionType: 'PLATFORM_FEE',
          isActive: true
        }
      }),
      prisma.commissionSetting.findFirst({
        where: {
          module: 'PHARMACY',
          commissionType: 'RIDER_COMMISSION',
          isActive: true
        }
      }),
      prisma.commissionSetting.findFirst({
        where: {
          module: 'PHARMACY',
          commissionType: 'VENDOR_COMMISSION',
          isActive: true
        }
      })
    ])

    // Calculate commissions and charges
    const orderAmount = supplierOrder.totalAmount
    const platformCommissionAmount = (orderAmount * (platformCommission?.rate || 5)) / 100
    const riderCommissionAmount = distance * (riderCommission?.rate || 100) // Per km
    const vendorCommissionAmount = (orderAmount * (vendorCommission?.rate || 3)) / 100

    const totalCommission = platformCommissionAmount + riderCommissionAmount + vendorCommissionAmount
    const totalAmount = orderAmount + totalCommission

    return NextResponse.json({
      calculation: {
        orderAmount,
        distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
        vehicleType,
        origin: {
          address: origin.fullAddress,
          latitude: origin.latitude,
          longitude: origin.longitude
        },
        destination: {
          address: dest.fullAddress,
          latitude: dest.latitude,
          longitude: dest.longitude
        },
        commissions: {
          platform: {
            rate: platformCommission?.rate || 5,
            amount: platformCommissionAmount
          },
          rider: {
            rate: riderCommission?.rate || 100,
            amount: riderCommissionAmount
          },
          vendor: {
            rate: vendorCommission?.rate || 3,
            amount: vendorCommissionAmount
          }
        },
        totalCommission,
        totalAmount,
        currency: supplierOrder.currency || 'NGN'
      }
    })
  } catch (error) {
    console.error("Commission calculation error:", error)
    return NextResponse.json(
      { error: "Failed to calculate commission" },
      { status: 500 }
    )
  }
}

// Helpers shared with accept flow
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

async function getDrivingDistanceKm(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string
): Promise<number> {
  console.log('Calling Google Distance Matrix API with coordinates:', {
    origin: { lat: originLat, lng: originLng },
    destination: { lat: destLat, lng: destLng }
  })
  
  const params = new URLSearchParams({
    origins: `${originLat},${originLng}`,
    destinations: `${destLat},${destLng}`,
    key: apiKey,
    mode: 'driving',
    units: 'metric'
  })
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`
  console.log('Distance Matrix API URL:', url)
  
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.error('Distance Matrix API request failed:', res.status, res.statusText)
      throw new Error(`Distance API error ${res.status}`)
    }
    
    const data = await res.json()
    console.log('Distance Matrix API response status:', data.status)
    console.log('Distance Matrix API response:', data)
    
    const element = data?.rows?.[0]?.elements?.[0]
    if (!element) {
      console.error('No rows or elements in Distance Matrix response')
      throw new Error('Distance element missing')
    }
    
    console.log('Distance Matrix element:', element)
    
    if (element.status !== 'OK') {
      console.error('Distance Matrix element status not OK:', element.status)
      throw new Error(`Distance element status: ${element.status}`)
    }
    
    const meters = element?.distance?.value
    if (!meters) {
      console.error('No distance value in Distance Matrix response')
      throw new Error('Distance value missing')
    }
    
    const distanceKm = meters / 1000
    console.log('Calculated distance:', distanceKm, 'km from', meters, 'meters')
    return distanceKm
  } catch (error) {
    console.error('Error in getDrivingDistanceKm:', error)
    throw error
  }
}

async function resolveCoordinates(
  address: any,
  apiKey?: string
): Promise<{ latitude: number; longitude: number; fullAddress?: string }> {
  console.log('Resolving coordinates for address:', address, 'Type:', typeof address)
  
  if (address && typeof address === 'object') {
    const lat = address.latitude ?? address.lat
    const lng = address.longitude ?? address.lng
    if (typeof lat === 'number' && typeof lng === 'number') {
      console.log('Using existing coordinates:', { lat, lng })
      return { latitude: lat, longitude: lng, fullAddress: address.fullAddress || address.address }
    }
  }
  
  if (typeof address === 'string' && apiKey) {
    console.log('Geocoding string address:', address)
    const params = new URLSearchParams({ address, key: apiKey })
    const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
    console.log('Geocoding URL:', url)
    
    try {
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        console.log('Geocoding response status:', data.status)
        console.log('Geocoding results count:', data.results?.length || 0)
        
        const loc = data?.results?.[0]?.geometry?.location
        if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
          console.log('Successfully resolved coordinates:', { lat: loc.lat, lng: loc.lng })
          return { latitude: loc.lat, longitude: loc.lng, fullAddress: data?.results?.[0]?.formatted_address }
        } else {
          console.log('No valid coordinates found in geocoding response')
        }
      } else {
        console.log('Geocoding API request failed:', res.status, res.statusText)
      }
    } catch (error) {
      console.error('Error calling geocoding API:', error)
    }
  }
  
  console.log('Returning fallback coordinates (0,0) for address:', address)
  return { latitude: 0, longitude: 0, fullAddress: typeof address === 'string' ? address : address?.fullAddress }
}

