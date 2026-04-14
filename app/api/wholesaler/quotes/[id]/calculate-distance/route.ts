import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "WHOLESALER" as any) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wholesaler = await prisma.wholesaler.findUnique({ where: { userId: user.id } })
    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    const body = await request.json()
    const { pharmacyAddress, wholesalerAddress } = body as any

    const supplierOrder = await prisma.supplierOrder.findUnique({
      where: {
        id: params.id,
        wholesalerId: wholesaler.id,
      },
      include: {
        pharmacy: true,
      }
    })

    if (!supplierOrder) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 })
    }

    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY

    const origin = await resolveCoordinates(
      wholesalerAddress ?? { latitude: wholesaler.latitude, longitude: wholesaler.longitude, fullAddress: wholesaler.address },
      googleApiKey
    )
    const dest = await resolveCoordinates(
      pharmacyAddress ?? { latitude: supplierOrder.pharmacy.latitude, longitude: supplierOrder.pharmacy.longitude, fullAddress: supplierOrder.pharmacy.address },
      googleApiKey
    )

    let distance = 0
    try {
      if (
        googleApiKey &&
        typeof origin.latitude === 'number' &&
        typeof origin.longitude === 'number' &&
        typeof dest.latitude === 'number' &&
        typeof dest.longitude === 'number'
      ) {
        distance = await getDrivingDistanceKm(
          origin.latitude,
          origin.longitude,
          dest.latitude,
          dest.longitude,
          googleApiKey
        )
      } else {
        distance = haversineDistance(origin.latitude, origin.longitude, dest.latitude, dest.longitude)
      }
    } catch (e) {
      distance = haversineDistance(origin.latitude, origin.longitude, dest.latitude, dest.longitude)
    }

    return NextResponse.json({
      calculation: {
        distance: Math.round(distance * 100) / 100,
        origin: {
          address: origin.fullAddress,
          latitude: origin.latitude,
          longitude: origin.longitude
        },
        destination: {
          address: dest.fullAddress,
          latitude: dest.latitude,
          longitude: dest.longitude
        }
      }
    })
  } catch (error) {
    console.error("Wholesaler distance calculation error:", error)
    return NextResponse.json(
      { error: "Failed to calculate distance" },
      { status: 500 }
    )
  }
}

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
  const params = new URLSearchParams({
    origins: `${originLat},${originLng}`,
    destinations: `${destLat},${destLng}`,
    key: apiKey,
    mode: 'driving',
    units: 'metric'
  })
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Distance API error ${res.status}`)
  const data = await res.json()
  const element = data?.rows?.[0]?.elements?.[0]
  const meters = element?.distance?.value
  if (!meters || element.status !== 'OK') throw new Error('Distance element missing')
  return meters / 1000
}

async function resolveCoordinates(
  address: any,
  apiKey?: string
): Promise<{ latitude: number; longitude: number; fullAddress?: string }> {
  if (address && typeof address === 'object') {
    const lat = address.latitude ?? address.lat
    const lng = address.longitude ?? address.lng
    if (typeof lat === 'number' && typeof lng === 'number') {
      return { latitude: lat, longitude: lng, fullAddress: address.fullAddress || address.address }
    }
  }
  // console.log(address , 'address')
  
  if (address && apiKey) {
    
    const params = new URLSearchParams({ address, key: apiKey })
    
    const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
    const res = await fetch(url)
    
    if (res.ok) {
      const data = await res.json()
      console.log(data , 'data')
      const loc = data?.results?.[0]?.geometry?.location
      if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        return { latitude: loc.lat, longitude: loc.lng, fullAddress: data?.results?.[0]?.formatted_address }
      }
    }
  }
  return { latitude: 0, longitude: 0, fullAddress: typeof address === 'string' ? address : address?.fullAddress }
}


