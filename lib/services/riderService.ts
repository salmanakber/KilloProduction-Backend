import { prisma } from "../prisma";

export interface RiderLocation {
  id: string;
  latitude: number;
  longitude: number;
  updatedAt: Date;
}

// Cache to track the last known request count for each rider
const riderRequestCache = new Map<string, { count: number; lastUpdate: number }>();

export async function fetchRider(riderId: string, lat: number, lng: number): Promise<{ rider: RiderLocation | null; hasNewRequests: boolean }> {
  try {
    // Update rider location in RiderProfile.
    // Use updateMany to avoid P2025 when a rider account exists but profile row is missing/incomplete.
    const updateResult = await prisma.riderProfile.updateMany({
      where: { userId: riderId },
      data: {
        currentLocation: {
          latitude: lat,
          longitude: lng
        },
        lastLocationUpdate: new Date()
      },
    });

    if (updateResult.count === 0) {
      console.warn(`Rider profile not found for location update: ${riderId}`);
      return { rider: null, hasNewRequests: false };
    }

    const updatedRider = await prisma.riderProfile.findUnique({
      where: { userId: riderId },
      select: {
        userId: true,
        currentLocation: true,
        lastLocationUpdate: true
      }
    });

    if (!updatedRider.currentLocation || typeof updatedRider.currentLocation !== 'object') {
      return { rider: null, hasNewRequests: false };
    }

    const location = updatedRider.currentLocation as { latitude: number; longitude: number };

    const riderLocation = {
      id: updatedRider.userId,
      latitude: location.latitude,
      longitude: location.longitude,
      updatedAt: updatedRider.lastLocationUpdate || new Date()
    };

    // Check for nearby available requests (within 10km radius)
    const nearbyRequests = await prisma.courierBooking.findMany({
      where: {
        status: {
          in: ['REQUESTED', 'BIDDING']
        },
        riderId: null, // Not assigned to any rider
        // Add distance calculation here if needed
      },
      select: {
        id: true,
        pickupLatitude: true,
        pickupLongitude: true,
        status: true
      }
    });

    // Check for nearby ride requests
    const nearbyRideRequests = await prisma.rideBooking.findMany({
      where: {
        status: {
          in: ['REQUESTED', 'BIDDING']
        },
        riderId: null, // Not assigned to any rider
        // Add distance calculation here if needed
      },
      select: {
        id: true,
        pickupLatitude: true,
        pickupLongitude: true,
        status: true
      }
    });

    const totalRequestCount = nearbyRequests.length + nearbyRideRequests.length;
    const now = Date.now();
    
    // Check if this is actually a new request count
    const cached = riderRequestCache.get(riderId);
    const hasNewRequests = !cached || cached.count !== totalRequestCount;
    
    // Update cache
    riderRequestCache.set(riderId, {
      count: totalRequestCount,
      lastUpdate: now
    });

    // Clean up old cache entries (older than 5 minutes)
    const entriesToDelete: string[] = [];
    riderRequestCache.forEach((data, id) => {
      if (now - data.lastUpdate > 300000) { // 5 minutes
        entriesToDelete.push(id);
      }
    });
    entriesToDelete.forEach(id => riderRequestCache.delete(id));

    console.log(`📍 Rider ${riderId} location update:`, {
      totalRequests: totalRequestCount,
      hasNewRequests,
      cachedCount: cached?.count || 0
    });

    return {
      rider: riderLocation,
      hasNewRequests
    };

  } catch (error) {
    console.error('Error fetching rider:', error);
    return { rider: null, hasNewRequests: false };
  }
}
