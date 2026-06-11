import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { cloudinary } from "@/lib/cloudinary"
import { prisma } from "@/lib/prisma"
import { getPropertyModuleConfig, getGuestComplianceRequirements } from "@/lib/property-module-config"
import { getGuestComplianceStatus } from "@/lib/property-guest-compliance"

async function uploadFile(file: File, folder: string) {
  const buffer = Buffer.from(await file.arrayBuffer())
  return await new Promise<string>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder, resource_type: "auto" }, (err, result) => {
        if (err || !result) return reject(err)
        resolve(result.secure_url)
      })
      .end(buffer)
  })
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const config = await getPropertyModuleConfig()
    const status = await getGuestComplianceStatus(user.id)
    return NextResponse.json({
      success: true,
      guestCompliance: getGuestComplianceRequirements(config.compliance),
      ...status,
    })
  } catch (error) {
    console.error("Guest verification GET error:", error)
    return NextResponse.json({ error: "Failed to load verification status" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const formData = await request.formData()
    const complianceId = String(formData.get("complianceId") || "").trim()
    const source = String(formData.get("source") || "gallery") as "camera" | "gallery"

    if (!complianceId) {
      return NextResponse.json({ error: "complianceId is required" }, { status: 400 })
    }

    const config = await getPropertyModuleConfig()
    const rule = getGuestComplianceRequirements(config.compliance).find((c) => c.id === complianceId)
    if (!rule) {
      return NextResponse.json({ error: "Unknown compliance requirement" }, { status: 400 })
    }

    const files = formData.getAll("files").filter((f) => f instanceof File) as File[]
    if (files.length === 0) {
      const single = formData.get("file")
      if (single instanceof File) files.push(single)
    }
    if (files.length === 0) {
      return NextResponse.json({ error: "At least one file is required" }, { status: 400 })
    }
    if (!rule.allowMultipleFiles && files.length > 1) {
      return NextResponse.json({ error: "Only one file allowed for this requirement" }, { status: 400 })
    }

    const uploaded: { url: string; source: string; uploadedAt: string }[] = []
    for (const file of files) {
      const url = await uploadFile(file, "property/guest-compliance")
      uploaded.push({ url, source, uploadedAt: new Date().toISOString() })
    }

    const record = await prisma.propertyGuestVerification.create({
      data: {
        userId: user.id,
        complianceId: rule.id,
        documentName: rule.documentName,
        files: uploaded,
        status: "SUBMITTED",
        metadata: { source, allowCamera: rule.allowCamera ?? true },
      },
    })

    const status = await getGuestComplianceStatus(user.id)
    return NextResponse.json({
      success: true,
      verification: {
        id: record.id,
        complianceId: record.complianceId,
        documentName: record.documentName,
        files: record.files,
        status: record.status,
      },
      ...status,
    })
  } catch (error) {
    console.error("Guest verification POST error:", error)
    return NextResponse.json({ error: "Failed to submit verification" }, { status: 500 })
  }
}
