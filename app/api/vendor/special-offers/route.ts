import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
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

function norm(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

async function getVendorModules(userId: any) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { autoPartsStore: true, pharmacy: true, restaurant: true, groceryStore: true, riderProfile: true, mechanicProfile: true },
  })
  
  return user?.autoPartsStore ? "AUTO_PARTS" : user?.pharmacy ? "PHARMACY" : user?.restaurant ? "FOOD" : user?.groceryStore ? "GROCERY" : user?.riderProfile ? "RIDING" : user?.mechanicProfile ? "MECHANIC" : null
}

// List active offers relevant to this vendor (invited / paid slots / AI selected)
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const vendorModules = await getVendorModules(user.id)
    

    const { searchParams } = new URL(request.url)
    const module = vendorModules || String(searchParams.get("module") || vendorModules).toUpperCase() as any
    const qLat = searchParams.get("lat") ? Number(searchParams.get("lat")) : undefined
    const qLon = searchParams.get("lon") ? Number(searchParams.get("lon")) : undefined

    // Try to resolve vendor/store location from DB (preferred), with query params as fallback.
    let vendorLat: number | undefined
    let vendorLon: number | undefined
    let vendorAddress: string | undefined

    let vendorPharmacyId: string | undefined

    let vendorGroceryCategories: Set<string> | null = null
    let vendorFoodCategories: Set<string> | null = null
    let vendorAutoPartsCategories: Set<string> | null = null

    // Resolve store location per module (and do basic "has products" eligibility)
    if (module === "PHARMACY") {
      const pharmacy = await prisma.pharmacy.findUnique({
        where: { userId: user.id },
        select: { id: true, lat: true, lon: true, address: true },
      })

      vendorPharmacyId = pharmacy?.id || undefined

      if (pharmacy?.lat != null && pharmacy?.lon != null) {
        vendorLat = pharmacy.lat
        vendorLon = pharmacy.lon
        vendorAddress = pharmacy.address || undefined
      }
      if (pharmacy?.id) {
        const productCount = await prisma.pharmacyMedicine.count({
          where: { pharmacyId: pharmacy.id, isAvailable: true, stock: { gt: 0 } },
        })
        if (productCount <= 0) return NextResponse.json({ success: true, offers: [] })
        
      }
    } else if (module === "GROCERY") {
      const store = await prisma.groceryStore.findUnique({
        where: { userId: user.id },
        select: { id: true, latitude: true, longitude: true, address: true },
      })

      if (store?.id) {
        const catRows = await prisma.groceryProduct.findMany({
          where: { storeId: store.id, isActive: true },
          distinct: ["category"],
          select: { category: true },
        })
        vendorGroceryCategories = new Set(catRows.map(r => norm(r.category || "")).filter(Boolean))
      } else {
        vendorGroceryCategories = new Set()
      }

      if (store?.latitude != null && store?.longitude != null) {
        vendorLat = store.latitude
        vendorLon = store.longitude
        vendorAddress = store.address || undefined
      }
      const productCount = store?.id
        ? await prisma.groceryProduct.count({ where: { storeId: store.id, isActive: true } })
        : 0
      if (productCount <= 0) return NextResponse.json({ success: true, offers: [] })
    } else if (module === "FOOD") {
      
      const restaurant = await prisma.restaurant.findUnique({
        where: { userId: user.id },
        select: { id: true, latitude: true, longitude: true, address: true },
      })
      

      if (restaurant?.id) {
        const catRows = await prisma.menuItem.findMany({
          where: { restaurantId: restaurant.id, isAvailable: true },
          distinct: ["categoryId"],
          select: { category: { select: { name: true } } },
        })
        vendorFoodCategories = new Set(catRows.map(r => norm(r.category?.name || "")).filter(Boolean))
          
      } else {
        vendorFoodCategories = new Set()
      }

      if (restaurant?.latitude != null && restaurant?.longitude != null) {
        vendorLat = restaurant.latitude
        vendorLon = restaurant.longitude
        vendorAddress = restaurant.address || undefined
      }
      const productCount = restaurant?.id
        ? await prisma.menuItem.count({ where: { restaurantId: restaurant.id, isAvailable: true } })
        : 0
      
      if (productCount <= 0) return NextResponse.json({ success: true, offers: [] })
    } else if (module === "AUTO_PARTS") {
      const store = await prisma.autoPartsStore.findUnique({
        where: { userId: user.id },
        select: { id: true, latitude: true, longitude: true, address: true },
      })

      if (store?.id) {
        const catRows = await prisma.product.findMany({
          where: { vendorId: user.id, type: "AUTO_PART", isActive: true },
          distinct: ["categoryId"],
          select: { category: true },
        })
        
        vendorAutoPartsCategories = new Set(catRows.map(r => norm(r.category?.name || "")).filter(Boolean))
        
      } else {
        vendorAutoPartsCategories = new Set()
      }

        
      if (store?.latitude != null && store?.longitude != null) {
        vendorLat = store.latitude
        vendorLon = store.longitude
        vendorAddress = store.address || undefined
      }
      const productCount = store?.id
        ? await prisma.product.count({ where: { vendorId: user.id, type: "AUTO_PART", isActive: true } })
        : 0
      if (productCount <= 0) return NextResponse.json({ success: true, offers: [] })
    }
    // Use query params ONLY as fallback if DB location is missing
    // Priority: DB location > query params
    if (vendorLat == null && qLat != null && !Number.isNaN(qLat)) {
      vendorLat = qLat
      
    }
    if (vendorLon == null && qLon != null && !Number.isNaN(qLon)) {
      vendorLon = qLon
      
    }

    

    const now = new Date()
    // Fetch ONLY offers where vendor is invited (in SpecialOfferVendor table)
    // Vendors should not see offers until they are explicitly invited
    const offers = await prisma.specialOffer.findMany({
      where: {
        isActive: true,
        validFrom: { lte: now },
        validUntil: { gte: now },
        module,
        vendors: {
          some: {
            vendorId: user.id,
            status: { in: ["INVITED", "ACCEPTED", "PURCHASED_SLOT", "SUBMITTED_PRODUCT", "APPROVED"] }, // Only show invited/accepted offers
          },
        },
      } as any,
      include: {
        vendors: { where: { vendorId: user.id }, select: { status: true, source: true, invitedAt: true } },
      } as any,
      orderBy: { createdAt: "desc" },
      take: 100,
    })

    // Pre-compute paid slot availability in one shot
    const offerIds = offers.map((o: any) => o.id).filter(Boolean)
    const paidSlotCounts =
      offerIds.length > 0
        ? await (prisma as any).specialOfferVendor.groupBy({
            by: ["offerId"],
            where: {
              offerId: { in: offerIds },
              source: "PAID_SLOT",
              status: { in: ["PURCHASED_SLOT", "SUBMITTED_PRODUCT", "APPROVED"] },
            },
            _count: { _all: true },
          })
        : []
    const paidSlotCountByOfferId = new Map<string, number>()
    for (const row of paidSlotCounts as any[]) {
      paidSlotCountByOfferId.set(row.offerId, row._count?._all || 0)
    }

    // Resolve offer category IDs to names once (used by non-pharmacy modules)
    const _catIds: string[] = []
    for (const o of offers as any[]) {

      const ids = Array.isArray(o?.conditions?.excludeCategoryIds)
        ? o.conditions.excludeCategoryIds
        : Array.isArray(o?.conditions?.excludeCategories)
          ? o.conditions.excludeCategories
          : []
      
      for (const id of ids as any[]) {
        const s = String(id || "").trim()
        if (s) _catIds.push(s)
      }
    }
    const categoryNameById = new Map<string, string>()
    const uniqueCatIds = Array.from(new Set(_catIds))
    if (uniqueCatIds.length > 0) {
      const rows = await prisma.category.findMany({
        where: { id: { in: uniqueCatIds } },
        select: { id: true, name: true },
      })
      for (const r of rows as any[]) {
        if (r?.id && r?.name) categoryNameById.set(String(r.id), String(r.name))
      }
    }

    // Preload vendor's available pharmacy medicine attributes once (for eligibility checks)
    let vendorPharmacyMedicineNames: Set<string> | null = null
    let vendorPharmacyCategories: Set<string> | null = null
    let vendorPharmacyIllnessTypes: Set<string> | null = null
    if (module === "PHARMACY") {
      const pharmacy = await prisma.pharmacy.findUnique({ where: { userId: user.id }, select: { id: true } })
      if (pharmacy?.id) {
        const rows = await prisma.pharmacyMedicine.findMany({
          where: { pharmacyId: pharmacy.id, isAvailable: true, stock: { gt: 0 } },
          select: { centralMedicine: { select: { name: true, category: true, illnessTypes: true } } },
        })
        
        vendorPharmacyMedicineNames = new Set(rows.map(r => norm(r.centralMedicine?.name || "")).filter(Boolean))
        vendorPharmacyCategories = new Set(rows.map(r => norm((r as any).centralMedicine?.category || "")).filter(Boolean))
        
        
        const illness = new Set<string>()
        for (const r of rows as any[]) {
          const arr = Array.isArray(r?.centralMedicine?.illnessTypes) ? r.centralMedicine.illnessTypes : []
          for (const t of arr) {
            const n = norm(String(t))
            if (n) illness.add(n)
          }
        }
        vendorPharmacyIllnessTypes = illness
      } else {
        vendorPharmacyMedicineNames = new Set()
        vendorPharmacyCategories = new Set()
        vendorPharmacyIllnessTypes = new Set()
      }
    }
    

    

    // Apply location eligibility. If offer has a radius+center, vendor must be within.
    
    const enriched = offers.map((o: any) => {
      let eligible = true
      let distanceKm: number | null = null
      const vendorRow = Array.isArray(o?.vendors) && o.vendors.length > 0 ? o.vendors[0] : null
      
      const hasVendorRow = !!vendorRow
      // Paid slots feature disabled – always treat as invitation-only
      const paidUsed = 0
      const paidRemaining: number | null = null
      const canPurchaseSlot = false

      // Debug tracking (only in development or when needed)
      const debug: any = { offerId: o.id, checks: {} }

      // If offer is locked to a specific pharmacy, bypass all other checks
      const pharmacyLocked = module === "PHARMACY" && (o as any).pharmacyId != null
      if (pharmacyLocked) {
        eligible = vendorPharmacyId != null && String((o as any).pharmacyId) === String(vendorPharmacyId)
        debug.checks.pharmacyLocked = { locked: true, vendorPharmacyId, offerPharmacyId: (o as any).pharmacyId, eligible }
            
      } else {
        debug.checks.pharmacyLocked = { locked: false }
      }

      if (!pharmacyLocked && o.locationLatitude != null && o.locationLongitude != null && o.locationRadiusKm != null) {
        if (vendorLat == null || vendorLon == null) {
          eligible = false
          debug.checks.geofence = { hasGeofence: true, vendorLocationMissing: true, eligible: false }
          
        } else {
          distanceKm = haversineKm(vendorLat, vendorLon, Number(o.locationLatitude), Number(o.locationLongitude))
          eligible = distanceKm <= Number(o.locationRadiusKm)
          debug.checks.geofence = { hasGeofence: true, distanceKm, radiusKm: Number(o.locationRadiusKm), eligible }



        }
      } else {
        debug.checks.geofence = { hasGeofence: false }
      }
      
      

      // Optional coarse state filtering (best-effort) using vendor address text if available.
      // NOTE: Only apply this when offer does NOT have a geofence circle configured, to avoid false negatives.
      if (!pharmacyLocked && eligible && (o.locationLatitude == null || o.locationLongitude == null || o.locationRadiusKm == null) && o.locationState && vendorAddress) {
        const state = String(o.locationState).trim().toLowerCase()
        const addrLower = String(vendorAddress).toLowerCase()
          const stateMatch = addrLower.includes(state)
          if (state && !stateMatch) eligible = false
          debug.checks.stateFilter = { hasState: true, state, vendorAddress: vendorAddress?.substring(0, 50), stateMatch, eligible }

      } else {
        debug.checks.stateFilter = { hasState: false }
        
      }

      
      
      // Target locations (sublocalities / areas).
      // Strategy: If offer has a geofence AND vendor is within it, they're eligible for sublocalities in that area.
      // This avoids Google API calls - we use the geofence radius as the real boundary.
      // Sublocalities are just for admin organization; geofence is the actual filter.
      if (!pharmacyLocked && eligible) {
        const locs = Array.isArray((o as any)?.targetAudience?.locations) ? (o as any).targetAudience.locations : []
        if (locs.length > 0) {
          const hasGeofence = o.locationLatitude != null && o.locationLongitude != null && o.locationRadiusKm != null
          
          if (hasGeofence && distanceKm != null) {
            // Vendor is within geofence → eligible for sublocalities in that area
            // (No need to text-match sublocality names - geofence is the real boundary)
            const withinGeofence = distanceKm <= Number(o.locationRadiusKm)
            if (!withinGeofence) {
              eligible = false
            }
            debug.checks.targetLocations = {
              hasLocations: true,
              locations: locs,
              hasGeofence: true,
              distanceKm,
              radiusKm: Number(o.locationRadiusKm),
              withinGeofence,
              eligible
            }
          } else {
            // No geofence: fallback to text matching (best-effort, may not work well)
            // This is rare - most offers should have geofence
            if (vendorAddress) {
              const addr = norm(vendorAddress)
              let ok = false
              for (const l of locs as any[]) {
                const n = norm(String(l || ""))
                if (n && addr.includes(n)) { ok = true; break }
              }
              if (!ok) eligible = false
              debug.checks.targetLocations = {
                hasLocations: true,
                locations: locs,
                hasGeofence: false,
                vendorAddress: vendorAddress?.substring(0, 50),
                textMatched: ok,
                eligible
              }
            } else {
              // No geofence and no vendor address → can't verify, skip this check
              debug.checks.targetLocations = {
                hasLocations: true,
                hasGeofence: false,
                hasVendorAddress: false,
                skipped: true
              }
            }
          }
        } else {
          debug.checks.targetLocations = { hasLocations: false }
        }
      }
      
      
      

      // Pharmacy-only: CentralMedicine category + illnessTypes eligibility
      if (!pharmacyLocked && eligible && module === "PHARMACY") {
        let conditionsCentralMedicine = o?.conditions
        if (typeof conditionsCentralMedicine === "string") {
          try {
            conditionsCentralMedicine = JSON.parse(conditionsCentralMedicine)
          } catch {
            conditionsCentralMedicine = {}
          }
        }
        const medicineCategories = Array.isArray(conditionsCentralMedicine?.medicineCategories) ? conditionsCentralMedicine.medicineCategories : []
        
        // medicineCategories is REQUIRED for pharmacy offers
        if (medicineCategories.length <= 0) {
          eligible = false
          debug.checks.medicineCategories = { required: true, provided: 0, eligible: false }
        } else {
          const allowed = new Set(medicineCategories.map(norm).filter(Boolean))
          const vendorCats = Array.from(vendorPharmacyCategories || new Set<string>())
          let ok = false
         
          ;(vendorPharmacyCategories || new Set<string>()).forEach((c) => {
            if (!ok && allowed.has(c)) ok = true
          })
          if (!ok) eligible = false
          debug.checks.medicineCategories = {
            required: true,
            offerCategories: Array.from(allowed),
            vendorCategories: vendorCats,
            matched: ok,
            eligible
          }
        }
 
         
         let conditions = o?.conditions
         if (typeof conditions === "string") {
           try {
             conditions = JSON.parse(conditions)
           } catch {
             conditions = {}
           }
         }

         const illnessTypes = Array.isArray(conditions?.illnessTypes)
           ? conditions.illnessTypes
           : [] 
                    
         if (eligible && illnessTypes.length > 0) {
           const required = new Set(illnessTypes.map(norm).filter(Boolean))
           
           let ok = false
           ;(vendorPharmacyIllnessTypes || new Set()).forEach((t) => {
             if (!ok && required.has(t)) ok = true
           })
         
           if (!ok) eligible = false
         }
        
        

        // Backward compatibility: IllnessCategory eligibility (offer.conditions.illnessCategoryIds)
        const illnessIds = Array.isArray(o?.conditions?.illnessCategoryIds) ? o.conditions.illnessCategoryIds : []
        if (eligible && illnessIds.length > 0) {
          // NOTE: IllnessCategory.medicines is an array of medicine names, not IDs.
          // We match on CentralMedicine.name (normalized).
          // Because this map() is sync, we attach a lightweight flag and filter later if needed.
          ;(o as any).__requiresIllnessCategoryCheck = illnessIds
        }
      }
      
      

      // Non-pharmacy: category eligibility (best-effort)
      if (!pharmacyLocked && eligible && module !== "PHARMACY") {
        const ids = Array.isArray((o as any)?.conditions?.excludeCategoryIds)
          ? (o as any).conditions.excludeCategoryIds
          : Array.isArray((o as any)?.conditions?.excludeCategories)
            ? (o as any).conditions.excludeCategories
            : []
        if (ids.length > 0) {
          const allowed = new Set(ids.map((id: any) => norm(categoryNameById.get(String(id)) || "")).filter(Boolean))
          const vendorSet = module === "GROCERY"
            ? (vendorGroceryCategories || new Set<string>())
            : module === "FOOD"
              ? (vendorFoodCategories || new Set<string>())
              : module === "AUTO_PARTS"
                ? (vendorAutoPartsCategories || new Set<string>())
                : new Set<string>()
          
          
          if (allowed.size > 0) {
            let ok = false
            vendorSet.forEach((c) => { if (!ok && allowed.has(c)) ok = true })
            if (!ok) eligible = false
          }
        }
      }
      

      

      // Only include debug in response if offer is not eligible (to help diagnose issues)
      const result: any = {
        ...o,
        vendor: vendorRow,
        eligible,
        distanceKm,
        vendorLocationUsed: vendorLat != null && vendorLon != null,
        paidSlotsUsed: paidUsed,
        paidSlotsRemaining: paidRemaining,
        canPurchaseSlot,
        // With paid slots disabled, actionable only if vendor already has a row
        actionable: hasVendorRow,
      }
      
      // Include debug info for ineligible offers to help diagnose
      if (!eligible) {
        result.__debug = debug
      }
      
      return result
    })

    // Resolve illness-category checks in one batch (avoid N+1 DB calls in map)
    const needIllnessChecks = enriched.filter((o: any) => o.__requiresIllnessCategoryCheck && o.eligible)
    if (module === "PHARMACY" && needIllnessChecks.length > 0) {
      const allIds = Array.from(
        new Set(needIllnessChecks.flatMap((o: any) => (Array.isArray(o.__requiresIllnessCategoryCheck) ? o.__requiresIllnessCategoryCheck : []))),
      )
      const illnessRows = await prisma.illnessCategory.findMany({
        where: { id: { in: allIds }, isActive: true },
        select: { id: true, medicines: true },
      })
      const medsByIllness = new Map<string, Set<string>>()
      for (const row of illnessRows) {
        const meds = Array.isArray(row.medicines) ? row.medicines : []
        medsByIllness.set(row.id, new Set(meds.map(norm).filter(Boolean)))
      }
      for (const o of needIllnessChecks) {
        const ids: string[] = o.__requiresIllnessCategoryCheck
        const allowed = new Set<string>()
        for (const id of ids) {
          const set = medsByIllness.get(id)
          if (set) set.forEach((n) => allowed.add(n))
        }
        let ok = false
        ;(vendorPharmacyMedicineNames || new Set<string>()).forEach((n) => {
          if (!ok && allowed.has(n)) ok = true
        })
        if (!ok) o.eligible = false
      }
    }

    const onlyEligible = searchParams.get("eligibleOnly") === "1"
    // Optional: when caller wants *only* offers the vendor can take an action on (invited/linked OR can purchase a slot)
    const actionableOnly = searchParams.get("actionableOnly") === "1"

    let finalOffers = enriched
    // Mobile vendor dashboards use eligibleOnly=1 to show nearby/eligible offers (even if not yet invited / not actionable).
    if (onlyEligible) finalOffers = finalOffers.filter((o: any) => o.eligible)
    if (actionableOnly) finalOffers = finalOffers.filter((o: any) => o.actionable)

    // Keep logs lightweight + non-sensitive (avoid dumping full offers array)
    const ineligibleOffers = enriched.filter((o: any) => !o.eligible)
    // console.log("vendor/special-offers", {
    //   module,
    //   onlyEligible,
    //   actionableOnly,
    //   total: enriched.length,
    //   returned: finalOffers.length,
    //   ineligible: ineligibleOffers.length,
    //   vendorLocationUsed: vendorLat != null && vendorLon != null,
    //   ineligibleDebug: ineligibleOffers.map((o: any) => ({
    //     offerId: o.id,
    //     title: o.title?.substring(0, 30),
    //     debug: o.__debug
    //   }))
    // })

    return NextResponse.json({ success: true, offers: finalOffers })
  } catch (error) {
    console.error("Vendor offers list error:", error)
    return NextResponse.json({ error: "Failed to fetch offers" }, { status: 500 })
  }
}

