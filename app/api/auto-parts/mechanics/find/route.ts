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

interface MechanicScore {
  mechanic: any
  score: number
  distance: number
  expertiseMatch: number
  rating: number
  availability: number
  loadBalance: number
}

// Calculate mechanic relevance score
async function calculateMechanicScore(
  mechanic: any,
  requiredExpertise: string[],
  customerLat: number | null,
  customerLon: number | null,
  customerCity: string | null
): Promise<MechanicScore> {
  let score = 0
  let distance = Infinity
  let expertiseMatch = 0
  let rating = 0
  let availability = 0
  let loadBalance = 0

  const profile = Array.isArray(mechanic.mechanicProfile) 
    ? mechanic.mechanicProfile[0] 
    : mechanic.mechanicProfile

  // 1. Distance Weighting (0-40 points)
  if (customerLat && customerLon && profile?.latitude && profile?.longitude) {
    distance = calculateDistance(
      customerLat,
      customerLon,
      profile.latitude,
      profile.longitude
    )
    // Closer = higher score
    if (distance <= 5) score += 40
    else if (distance <= 10) score += 35
    else if (distance <= 20) score += 25
    else if (distance <= 50) score += 15
    else score += 5
  } else if (profile?.city === customerCity) {
    score += 20 // Same city fallback
    distance = 0
  }

  // 2. Expertise Match (0-35 points)
  if (requiredExpertise.length > 0 && mechanic.expertise) {
    const mechanicExpertise = mechanic.expertise.map((e: any) => e.expertiseType.toLowerCase())
    const requiredLower = requiredExpertise.map(e => e.toLowerCase())
    
    const matches = requiredLower.filter(req => 
      mechanicExpertise.some((mech: string) => 
        mech.includes(req) || req.includes(mech)
      )
    )
    
    if (matches.length > 0) {
      expertiseMatch = (matches.length / requiredExpertise.length) * 35
      score += expertiseMatch
    } else {
      // General mechanic gets some points
      if (mechanicExpertise.some((e: string) => e.includes('general') || e.includes('diagnostic'))) {
        expertiseMatch = 15
        score += expertiseMatch
      }
    }
  } else {
    // No specific expertise required, give points for having any expertise
    if (mechanic.expertise && mechanic.expertise.length > 0) {
      expertiseMatch = 20
      score += expertiseMatch
    }
  }

  // 3. Rating (0-15 points)
  rating = (profile?.rating || 0) * 3 // Scale 0-15 (assuming 5-star max)
  score += rating

  // 4. Availability (0-5 points)
  // Check if mechanic is currently available (simplified - can be enhanced with working hours)
  if (profile?.isActive) {
    availability = 5
    score += availability
  }

  // 5. Load Balancing (0-5 points, but can be negative)
  // Check recent notifications sent to this mechanic
  const oneHourAgo = new Date()
  oneHourAgo.setHours(oneHourAgo.getHours() - 1)
  
  // Get mechanic's user ID from profile
  const mechanicUserId = profile?.userId || mechanic.id
  const recentNotifications = await prisma.mechanicNotification.count({
    where: {
      mechanicId: mechanicUserId,
      sentAt: { gte: oneHourAgo },
    },
  })

  const maxNotificationsPerHour = 3
  if (recentNotifications < maxNotificationsPerHour) {
    loadBalance = 5 - recentNotifications // More available = higher score
    score += loadBalance
  } else {
    loadBalance = -20 // Heavy penalty for overloaded mechanics
    score += loadBalance
  }

  return {
    mechanic,
    score,
    distance,
    expertiseMatch,
    rating,
    availability,
    loadBalance,
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    console.log("User:", user)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()
    const {
      requiredExpertise = [], // Array of mechanic types needed
      customerLatitude,
      customerLongitude,
      customerCity,
      maxDistance = 50, // km
      maxMechanics = 5, // Number of mechanics to return
    } = data
 

    // Build where clause for mechanics
    const mechanicProfileWhere: any = {
      isActive: true,
      user: {
        role: 'MECHANIC',
        isActive: true,
      },
    }

    // Filter by city if coordinates not available
    if (!customerLatitude || !customerLongitude) {
      if (customerCity) {
        mechanicProfileWhere.city = {
          contains: customerCity,
          mode: 'insensitive',
        }
      }
    }

    // Get all active mechanics by querying MechanicProfile directly
    const mechanicProfiles = await prisma.mechanicProfile.findMany({
      where: mechanicProfileWhere,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatar: true,
            isVerified: true,
            reviews: true,
            mechanicProfile: {
              select: {
                logo: true,
                coverImage: true,
              },
            },
          },
        },
        expertise: true,
      },
    })

    // Transform to match expected structure
    const mechanics = mechanicProfiles.map(profile => ({
      ...profile.user,
      mechanicProfile: profile,
    }))

    // Calculate scores for all mechanics
    const scoredMechanics: MechanicScore[] = []
    for (const mechanic of mechanics) {
      const profile = mechanic.mechanicProfile
      
      // Filter by distance if coordinates available
      if (customerLatitude && customerLongitude && profile?.latitude && profile?.longitude) {
        const distance = calculateDistance(
          customerLatitude,
          customerLongitude,
          profile.latitude,
          profile.longitude
        )
        if (distance > maxDistance) continue
      }

      // Create a combined object with expertise from profile
      const mechanicWithExpertise = {
        ...mechanic,
        expertise: profile?.expertise || [],
      }

      const score = await calculateMechanicScore(
        mechanicWithExpertise,
        requiredExpertise,
        customerLatitude || null,
        customerLongitude || null,
        customerCity || null
      )

      // Only include mechanics with positive scores (not overloaded)
      if (score.score > 0) {
        scoredMechanics.push(score)
      }
    }

    // Sort by score (descending)
    scoredMechanics.sort((a, b) => b.score - a.score)

    // Return top N mechanics
    const topMechanics = scoredMechanics.slice(0, maxMechanics).map((scored) => {
      const profile = scored.mechanic.mechanicProfile
      return {
        id: scored.mechanic.id,
        name: scored.mechanic.name,
        businessName: profile?.businessName,
        city: profile?.city,
        state: profile?.state,
        address: profile?.address,
        latitude: profile?.latitude,
        longitude: profile?.longitude,
        logo: profile?.logo,
        rating: profile?.rating || 0,
        totalReviews: profile?.totalReviews || 0,
        totalJobsCompleted: profile?.totalJobsCompleted || 0,
        yearsOfExperience: profile?.yearsOfExperience,
        hourlyRate: profile?.hourlyRate,
        serviceRadius: profile?.serviceRadius,
        isVerified: profile?.isVerified || false,
        expertise: scored.mechanic.mechanicProfile?.expertise?.map((e: any) => ({
          type: e.expertiseType,
          experienceYears: e.experienceYears,
          isPrimary: e.isPrimary,
        })) || [],
        distance: scored.distance !== Infinity ? `${scored.distance.toFixed(1)} km` : null,
        distanceValue: scored.distance !== Infinity ? scored.distance : null,
        score: scored.score,
        mechanicProfile: profile,
      }
    })

    return NextResponse.json({
      mechanics: topMechanics,
      totalFound: scoredMechanics.length,
    })
  } catch (error) {
    console.error("Find mechanics error:", error)
    return NextResponse.json({ error: "Failed to find mechanics" }, { status: 500 })
  }
}

