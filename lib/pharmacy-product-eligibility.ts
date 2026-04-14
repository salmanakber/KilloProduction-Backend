import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export type PharmacyForEligibility = Prisma.PharmacyGetPayload<{
  select: {
    id: true
    selectedIllnesses: true
    specializations: {
      select: {
        medicineOriginId: true
        illnessTypes: true
        medicineOrigin: { select: { id: true; displayName: true; name: true } }
      }
    }
  }
}>

function norm(s: unknown) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
}

export function buildPharmacyEligibilityProfile(pharmacy: PharmacyForEligibility) {
  const allowedOriginIds = new Set(pharmacy.specializations.map((s) => s.medicineOriginId))
  const illnessNorm = new Set<string>()

  for (const spec of pharmacy.specializations) {
    const it = spec.illnessTypes
    if (Array.isArray(it)) {
      for (const x of it) illnessNorm.add(norm(x))
    }
  }

  const sel = pharmacy.selectedIllnesses
  if (Array.isArray(sel)) {
    for (const x of sel) illnessNorm.add(norm(x))
  }

  return {
    allowedOriginIds,
    illnessNorm,
    hasOriginRules: allowedOriginIds.size > 0,
    hasIllnessRules: illnessNorm.size > 0,
  }
}

export async function evaluateWholesalerProductEligibility(
  pharmacy: PharmacyForEligibility,
  product: Prisma.WholesalerProductGetPayload<{
    include: {
      wholesalerMedicine: {
        include: {
          centralMedicine: {
            include: {
              medicineOrigins: { include: { medicineOrigin: true } }
            }
          }
        }
      }
    }
  }>,
): Promise<{ matchesPharmacyProfile: boolean; restrictionReason: string | null }> {
  const profile = buildPharmacyEligibilityProfile(pharmacy)

  if (!profile.hasOriginRules && !profile.hasIllnessRules) {
    return { matchesPharmacyProfile: true, restrictionReason: null }
  }

  const cm = product.wholesalerMedicine?.centralMedicine
  let originOk = true
  let originDetail = ""

  if (profile.hasOriginRules) {
    if (cm) {
      const mids = cm.medicineOrigins.map((mo) => mo.medicineOriginId)
      originOk = mids.length === 0 || mids.some((id) => profile.allowedOriginIds.has(id))
      if (!originOk) {
        originDetail =
          cm.medicineOrigins
            .filter((mo) => !profile.allowedOriginIds.has(mo.medicineOriginId))
            .map((mo) => mo.medicineOrigin.displayName)
            .join(", ") || "this origin"
      }
    } else {
      const mo = await prisma.medicineOrigin.findFirst({
        where: { displayName: product.countryOfOrigin },
      })
      originOk = mo ? profile.allowedOriginIds.has(mo.id) : true
      if (!originOk && mo) originDetail = mo.displayName
    }
  }

  let illnessOk = true
  let illnessDetail = ""

  if (profile.hasIllnessRules && cm && Array.isArray(cm.illnessTypes) && cm.illnessTypes.length > 0) {
    const medIll = cm.illnessTypes.map((x: unknown) => norm(x)).filter(Boolean)
    illnessOk = medIll.some((x) => profile.illnessNorm.has(x))
    if (!illnessOk) illnessDetail = "illness / specialization mismatch"
  }

  const matches = originOk && illnessOk

  if (matches) {
    return { matchesPharmacyProfile: true, restrictionReason: null }
  }

  const parts: string[] = []
  if (!originOk) parts.push(`Origin not allowed for your pharmacy${originDetail ? ` (${originDetail})` : ""}`)
  if (!illnessOk) parts.push(illnessDetail || "Does not match your illness specializations")

  return { matchesPharmacyProfile: false, restrictionReason: parts.join(". ") }
}
