import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

const VALID_FORMS = new Set(["TABLET", "CAPSULE", "SYRUP", "INJECTION", "CREAM", "DROPS"])

function normalizeString(v: any) {
  return String(v ?? "").trim()
}

function normKey(v: any) {
  return normalizeString(v).toLowerCase()
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const items: any[] = Array.isArray(body?.items) ? body.items : []
    if (items.length === 0) return NextResponse.json({ error: "No items provided" }, { status: 400 })

    let created = 0
    let updated = 0
    let skipped = 0
    const errors: Array<{ name?: string; error: string }> = []

    const originList = await prisma.medicineOrigin.findMany({
      select: { id: true, name: true, displayName: true },
    })
    const originByName = new Map<string, { id: string }>()
    for (const o of originList) {
      if (o?.name) originByName.set(normKey(o.name), { id: o.id })
      if (o?.displayName) originByName.set(normKey(o.displayName), { id: o.id })
    }

    for (const raw of items) {
      const name = normalizeString(raw?.name)
      const category = normalizeString(raw?.category)
      if (!name || !category) {
        skipped++
        errors.push({ name: name || undefined, error: "Missing required fields: name/category" })
        continue
      }

      const formRaw = normalizeString(raw?.form)
      const form = formRaw ? formRaw.toUpperCase() : ""
      if (form && !VALID_FORMS.has(form)) {
        skipped++
        errors.push({ name, error: `Invalid form: ${formRaw}` })
        continue
      }

      const illnessTypes = Array.isArray(raw?.illnessTypes) ? raw.illnessTypes : []
      const medicineOriginsRaw = Array.isArray(raw?.medicineOrigins) ? raw.medicineOrigins : []
      const medicineOriginIds: string[] = []
      for (const v of medicineOriginsRaw) {
        const found = originByName.get(normKey(v))
        if (found?.id) medicineOriginIds.push(found.id)
        else if (normalizeString(v)) errors.push({ name, error: `Unknown medicine origin: ${normalizeString(v)}` })
      }

      const data: any = {
        name,
        category,
        form: form || "TABLET",
        genericName: normalizeString(raw?.genericName) || null,
        description: normalizeString(raw?.description) || null,
        purpose: normalizeString(raw?.purpose) || null,
        dosageInfo: normalizeString(raw?.dosageInfo) || null,
        warnings: normalizeString(raw?.warnings) || null,
        manufacturer: normalizeString(raw?.manufacturer) || null,
        strength: normalizeString(raw?.strength) || null,
        illnessTypes: illnessTypes.length > 0 ? illnessTypes : null,
      }

      const existing = await prisma.centralMedicine.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
        select: { id: true },
      })

      if (existing?.id) {
        await prisma.$transaction(async (tx) => {
          await tx.centralMedicine.update({ where: { id: existing.id }, data })
          if (medicineOriginIds.length > 0) {
            await tx.centralMedicineOrigin.deleteMany({ where: { centralMedicineId: existing.id } })
            await tx.centralMedicineOrigin.createMany({
              data: Array.from(new Set(medicineOriginIds)).map((oid) => ({
                centralMedicineId: existing.id,
                medicineOriginId: oid,
              })),
              skipDuplicates: true,
            })
          }
        })
        updated++
      } else {
        await prisma.$transaction(async (tx) => {
          const createdMed = await tx.centralMedicine.create({ data })
          if (medicineOriginIds.length > 0) {
            await tx.centralMedicineOrigin.createMany({
              data: Array.from(new Set(medicineOriginIds)).map((oid) => ({
                centralMedicineId: createdMed.id,
                medicineOriginId: oid,
              })),
              skipDuplicates: true,
            })
          }
        })
        created++
      }
    }

    return NextResponse.json({ success: true, created, updated, skipped, errors })
  } catch (error) {
    console.error("Medicines import error:", error)
    return NextResponse.json({ error: "Failed to import medicines" }, { status: 500 })
  }
}

