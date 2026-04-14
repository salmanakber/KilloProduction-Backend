import { prisma } from '@/lib/prisma';

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface PharmacyMedicineMatch {
  pharmacyId: string;
  pharmacyName: string;
  pharmacyAddress: string;
  pharmacyLat: number | null;
  pharmacyLon: number | null;
  distance: number;
  medicines: Array<{
    pharmacyMedicineId: string;
    centralMedicineId: string;
    medicineName: string;
    genericName: string | null;
    price: number;
    stock: number;
    isAvailable: boolean;
  }>;
}

/**
 * Find medicines from nearby pharmacies
 * Strategy: First try to find all medicines in ONE pharmacy, then try multiple if needed
 */
export async function findMedicinesFromNearbyPharmacies(
  medicineNames: string[],
  userLat: number | null,
  userLon: number | null,
  maxDistance: number = 50 // km
): Promise<{
  singlePharmacyMatch: PharmacyMedicineMatch | null;
  multiPharmacyMatch: PharmacyMedicineMatch[];
  allMedicinesFound: boolean;
}> {
  if (!userLat || !userLon) {
    console.log('⚠️ No user location provided, searching all pharmacies');
    // If no location, just search all pharmacies
    return await findMedicinesWithoutLocation(medicineNames);
  }

  console.log(`🔍 Searching for ${medicineNames.length} medicines near location (${userLat}, ${userLon})`);

  // Get all pharmacies with location
  const pharmacies = await prisma.pharmacy.findMany({
    where: {
      lat: { not: null },
      lon: { not: null },
      status: 'APPROVED',
    },
    select: {
      id: true,
      pharmacyName: true,
      address: true,
      lat: true,
      lon: true,
    },
  });

  // Calculate distances and sort by proximity
  const pharmaciesWithDistance = pharmacies
    .map(pharmacy => {
      if (!pharmacy.lat || !pharmacy.lon) return null;
      const distance = calculateDistance(userLat, userLon, Number(pharmacy.lat), Number(pharmacy.lon));
      if (distance > maxDistance) return null;
      return {
        ...pharmacy,
        distance,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => a.distance - b.distance);

  console.log(`📍 Found ${pharmaciesWithDistance.length} nearby pharmacies`);

  if (pharmaciesWithDistance.length === 0) {
    console.log('⚠️ No nearby pharmacies found, searching all pharmacies');
    return await findMedicinesWithoutLocation(medicineNames);
  }

  // Get all central medicines matching the names
  const centralMedicines = await prisma.centralMedicine.findMany({
    where: {
      isActive: true,
      OR: medicineNames.map(name => ({
        OR: [
          { name: { contains: name, mode: 'insensitive' } },
          { genericName: { contains: name, mode: 'insensitive' } },
        ],
      })),
    },
    select: {
      id: true,
      name: true,
      genericName: true,
    },
  });

  const centralMedicineIds = centralMedicines.map(m => m.id);
  const medicineNameMap = new Map(centralMedicines.map(m => [m.id, { name: m.name, genericName: m.genericName }]));

  if (centralMedicineIds.length === 0) {
    console.log('⚠️ No matching central medicines found');
    return {
      singlePharmacyMatch: null,
      multiPharmacyMatch: [],
      allMedicinesFound: false,
    };
  }

  // Strategy 1: Try to find ALL medicines in ONE pharmacy
  for (const pharmacy of pharmaciesWithDistance) {
    const pharmacyMedicines = await prisma.pharmacyMedicine.findMany({
      where: {
        pharmacyId: pharmacy.id,
        centralMedicineId: { in: centralMedicineIds },
        isAvailable: true,
        stock: { gt: 0 },
      },
      select: {
        id: true,
        centralMedicineId: true,
        price: true,
        stock: true,
        isAvailable: true,
      },
    });

    const foundMedicineIds = new Set(pharmacyMedicines.map(pm => pm.centralMedicineId));
    const allFound = centralMedicineIds.every(id => foundMedicineIds.has(id));

    if (allFound) {
      console.log(`✅ Found all medicines in single pharmacy: ${pharmacy.pharmacyName} (${pharmacy.distance.toFixed(1)} km)`);
      return {
        singlePharmacyMatch: {
          pharmacyId: pharmacy.id,
          pharmacyName: pharmacy.pharmacyName,
          pharmacyAddress: pharmacy.address || '',
          pharmacyLat: pharmacy.lat,
          pharmacyLon: pharmacy.lon,
          distance: pharmacy.distance,
          medicines: pharmacyMedicines.map(pm => {
            const medInfo = medicineNameMap.get(pm.centralMedicineId);
            return {
              pharmacyMedicineId: pm.id,
              centralMedicineId: pm.centralMedicineId,
              medicineName: medInfo?.name || 'Unknown',
              genericName: medInfo?.genericName || null,
              price: pm.price,
              stock: pm.stock,
              isAvailable: pm.isAvailable,
            };
          }),
        },
        multiPharmacyMatch: [],
        allMedicinesFound: true,
      };
    }
  }

  console.log('⚠️ Could not find all medicines in single pharmacy, trying multiple pharmacies...');

  // Strategy 2: Find medicines from multiple pharmacies
  const multiPharmacyMatch: PharmacyMedicineMatch[] = [];
  const foundMedicineIds = new Set<string>();

  for (const pharmacy of pharmaciesWithDistance) {
    if (foundMedicineIds.size === centralMedicineIds.length) break; // All found

    const pharmacyMedicines = await prisma.pharmacyMedicine.findMany({
      where: {
        pharmacyId: pharmacy.id,
        centralMedicineId: { in: centralMedicineIds },
        isAvailable: true,
        stock: { gt: 0 },
      },
      select: {
        id: true,
        centralMedicineId: true,
        price: true,
        stock: true,
        isAvailable: true,
      },
    });

    const newMedicines = pharmacyMedicines.filter(pm => !foundMedicineIds.has(pm.centralMedicineId));
    if (newMedicines.length > 0) {
      newMedicines.forEach(pm => foundMedicineIds.add(pm.centralMedicineId));
      
      multiPharmacyMatch.push({
        pharmacyId: pharmacy.id,
        pharmacyName: pharmacy.pharmacyName,
        pharmacyAddress: pharmacy.address || '',
        pharmacyLat: pharmacy.lat,
        pharmacyLon: pharmacy.lon,
        distance: pharmacy.distance,
        medicines: newMedicines.map(pm => {
          const medInfo = medicineNameMap.get(pm.centralMedicineId);
          return {
            pharmacyMedicineId: pm.id,
            centralMedicineId: pm.centralMedicineId,
            medicineName: medInfo?.name || 'Unknown',
            genericName: medInfo?.genericName || null,
            price: pm.price,
            stock: pm.stock,
            isAvailable: pm.isAvailable,
          };
        }),
      });
    }
  }

  const allMedicinesFound = foundMedicineIds.size === centralMedicineIds.length;
  console.log(`📦 Found medicines from ${multiPharmacyMatch.length} pharmacies (${foundMedicineIds.size}/${centralMedicineIds.length} medicines)`);

  return {
    singlePharmacyMatch: null,
    multiPharmacyMatch,
    allMedicinesFound,
  };
}

/**
 * Find medicines without location (fallback)
 */
async function findMedicinesWithoutLocation(
  medicineNames: string[]
): Promise<{
  singlePharmacyMatch: PharmacyMedicineMatch | null;
  multiPharmacyMatch: PharmacyMedicineMatch[];
  allMedicinesFound: boolean;
}> {
  // Get all central medicines
  const centralMedicines = await prisma.centralMedicine.findMany({
    where: {
      isActive: true,
      OR: medicineNames.map(name => ({
        OR: [
          { name: { contains: name, mode: 'insensitive' } },
          { genericName: { contains: name, mode: 'insensitive' } },
        ],
      })),
    },
    select: {
      id: true,
      name: true,
      genericName: true,
    },
  });

  const centralMedicineIds = centralMedicines.map(m => m.id);
  const medicineNameMap = new Map(centralMedicines.map(m => [m.id, { name: m.name, genericName: m.genericName }]));

  if (centralMedicineIds.length === 0) {
    return {
      singlePharmacyMatch: null,
      multiPharmacyMatch: [],
      allMedicinesFound: false,
    };
  }

  // Try to find all in one pharmacy
  const allPharmacies = await prisma.pharmacy.findMany({
    where: {
      status: 'APPROVED',
    },
    select: {
      id: true,
      pharmacyName: true,
      address: true,
      lat: true,
      lon: true,
    },
  });

  for (const pharmacy of allPharmacies) {
    const pharmacyMedicines = await prisma.pharmacyMedicine.findMany({
      where: {
        pharmacyId: pharmacy.id,
        centralMedicineId: { in: centralMedicineIds },
        isAvailable: true,
        stock: { gt: 0 },
      },
      select: {
        id: true,
        centralMedicineId: true,
        price: true,
        stock: true,
        isAvailable: true,
      },
    });

    const foundMedicineIds = new Set(pharmacyMedicines.map(pm => pm.centralMedicineId));
    const allFound = centralMedicineIds.every(id => foundMedicineIds.has(id));

    if (allFound) {
      return {
        singlePharmacyMatch: {
          pharmacyId: pharmacy.id,
          pharmacyName: pharmacy.pharmacyName,
          pharmacyAddress: pharmacy.address || '',
          pharmacyLat: pharmacy.lat,
          pharmacyLon: pharmacy.lon,
          distance: 0,
          medicines: pharmacyMedicines.map(pm => {
            const medInfo = medicineNameMap.get(pm.centralMedicineId);
            return {
              pharmacyMedicineId: pm.id,
              centralMedicineId: pm.centralMedicineId,
              medicineName: medInfo?.name || 'Unknown',
              genericName: medInfo?.genericName || null,
              price: pm.price,
              stock: pm.stock,
              isAvailable: pm.isAvailable,
            };
          }),
        },
        multiPharmacyMatch: [],
        allMedicinesFound: true,
      };
    }
  }

  // Multi-pharmacy fallback
  const multiPharmacyMatch: PharmacyMedicineMatch[] = [];
  const foundMedicineIds = new Set<string>();

  for (const pharmacy of allPharmacies) {
    if (foundMedicineIds.size === centralMedicineIds.length) break;

    const pharmacyMedicines = await prisma.pharmacyMedicine.findMany({
      where: {
        pharmacyId: pharmacy.id,
        centralMedicineId: { in: centralMedicineIds },
        isAvailable: true,
        stock: { gt: 0 },
      },
      select: {
        id: true,
        centralMedicineId: true,
        price: true,
        stock: true,
        isAvailable: true,
      },
    });

    const newMedicines = pharmacyMedicines.filter(pm => !foundMedicineIds.has(pm.centralMedicineId));
    if (newMedicines.length > 0) {
      newMedicines.forEach(pm => foundMedicineIds.add(pm.centralMedicineId));
      
      multiPharmacyMatch.push({
        pharmacyId: pharmacy.id,
        pharmacyName: pharmacy.pharmacyName,
        pharmacyAddress: pharmacy.address || '',
        pharmacyLat: pharmacy.lat,
        pharmacyLon: pharmacy.lon,
        distance: 0,
        medicines: newMedicines.map(pm => {
          const medInfo = medicineNameMap.get(pm.centralMedicineId);
          return {
            pharmacyMedicineId: pm.id,
            centralMedicineId: pm.centralMedicineId,
            medicineName: medInfo?.name || 'Unknown',
            genericName: medInfo?.genericName || null,
            price: pm.price,
            stock: pm.stock,
            isAvailable: pm.isAvailable,
          };
        }),
      });
    }
  }

  return {
    singlePharmacyMatch: null,
    multiPharmacyMatch,
    allMedicinesFound: foundMedicineIds.size === centralMedicineIds.length,
  };
}
