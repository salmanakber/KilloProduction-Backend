import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Check if mechanic is currently available based on time
function isMechanicAvailable(availableFrom: string | null, availableTo: string | null, workingDays: any): boolean {
  if (!availableFrom || !availableTo) return true // If no schedule, assume available

  const now = new Date()
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' })
  const currentTime = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })

  // Check if today is a working day
  if (workingDays && Array.isArray(workingDays)) {
    if (!workingDays.includes(currentDay)) return false
  }

  // Parse time strings (format: "HH:MM")
  const [fromHour, fromMin] = availableFrom.split(':').map(Number)
  const [toHour, toMin] = availableTo.split(':').map(Number)
  const [currentHour, currentMin] = currentTime.split(':').map(Number)

  const fromMinutes = fromHour * 60 + fromMin
  const toMinutes = toHour * 60 + toMin
  const currentMinutes = currentHour * 60 + currentMin

  return currentMinutes >= fromMinutes && currentMinutes <= toMinutes
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const customerLat = searchParams.get("customerLat") ? parseFloat(searchParams.get("customerLat")!) : null
    const customerLon = searchParams.get("customerLon") ? parseFloat(searchParams.get("customerLon")!) : null
    const customerCity = searchParams.get("customerCity")
    const maxDistance = searchParams.get("maxDistance") ? parseFloat(searchParams.get("maxDistance")!) : 50 // km
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 10

    if (!customerLat || !customerLon) {
      return NextResponse.json({ error: "Customer latitude and longitude are required" }, { status: 400 })
    }

    // Get vendor's location (if available)
    const vendorProfile = await prisma.vendorProfile.findUnique({
      where: { userId: user.id },
      select: { latitude: true, longitude: true, city: true },
    })

    // Get all active mechanics
    const mechanicProfiles = await prisma.mechanicProfile.findMany({
      where: {
        isActive: true,
        user: {
          role: 'MECHANIC',
          isActive: true,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatar: true,
            isVerified: true,
          },
        },
        expertise: {
          select: {
            expertiseType: true,
            isPrimary: true,
          },
        },
      },
    })

    // Calculate distances and filter
    const mechanicsWithDistance = mechanicProfiles
      .map((profile) => {
        if (!profile.latitude || !profile.longitude) {
          return null
        }

        const distance = calculateDistance(
          customerLat,
          customerLon,
          profile.latitude,
          profile.longitude
        )

        // Check if within service radius
        if (profile.serviceRadius && distance > profile.serviceRadius) {
          return null
        }

        // Check if within max distance
        if (distance > maxDistance) {
          return null
        }

        const isAvailable = isMechanicAvailable(
          profile.availableFrom,
          profile.availableTo,
          profile.workingDays
        )

        return {
          id: profile.user.id,
          name: profile.user.name,
          phone: profile.user.phone,
          email: profile.user.email,
          avatar: profile.user.avatar,
          isVerified: profile.user.isVerified || profile.isVerified,
          businessName: profile.businessName,
          businessType: profile.businessType,
          address: profile.address,
          city: profile.city,
          state: profile.state,
          latitude: profile.latitude,
          longitude: profile.longitude,
          rating: profile.rating,
          totalReviews: profile.totalReviews,
          totalJobsCompleted: profile.totalJobsCompleted,
          yearsOfExperience: profile.yearsOfExperience,
          hourlyRate: profile.hourlyRate,
          serviceRadius: profile.serviceRadius,
          availableFrom: profile.availableFrom,
          availableTo: profile.availableTo,
          workingDays: profile.workingDays,
          expertise: profile.expertise.map((e) => e.expertiseType),
          primaryExpertise: profile.expertise.find((e) => e.isPrimary)?.expertiseType || null,
          distance: parseFloat(distance.toFixed(2)),
          isAvailable,
        }
      })
      .filter((m) => m !== null)
      .sort((a, b) => a!.distance - b!.distance)
      .slice(0, limit)

    return NextResponse.json({
      mechanics: mechanicsWithDistance,
      count: mechanicsWithDistance.length,
    })
  } catch (error) {
    console.error("Find nearby mechanics error:", error)
    return NextResponse.json({ error: "Failed to find nearby mechanics" }, { status: 500 })
  }
}

