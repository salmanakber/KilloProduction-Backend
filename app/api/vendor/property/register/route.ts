import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { cloudinary } from "@/lib/cloudinary"
import { getPropertyModuleConfig, getHostComplianceRequirements } from "@/lib/property-module-config"
import { sendEmailFromTemplate } from "@/lib/email"

async function uploadToCloudinary(file: File, folder = "property/registration") {
  const buffer = Buffer.from(await file.arrayBuffer())
  return await new Promise<string>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder }, (err, result) => {
        if (err || !result) return reject(err)
        resolve(result.secure_url)
      })
      .end(buffer)
  })
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const partnerType = String(formData.get("partnerType") || "owner")
    const isBusiness = partnerType === "hotel" || partnerType === "corporate"
    const fullName = String(formData.get("fullName") || formData.get("businessName") || "").trim()
    const email = String(formData.get("email") || "").trim().toLowerCase()
    const phone = String(formData.get("phone") || "").trim()
    const password = String(formData.get("password") || "")
    const countryName = String(formData.get("countryName") || "Nigeria")
    const state = String(formData.get("state") || "")
    const city = String(formData.get("city") || "")
    const address = String(formData.get("address") || "")
    const bankName = String(formData.get("bankName") || "")
    const accountNumber = String(formData.get("accountNumber") || "")
    const accountName = String(formData.get("accountName") || "")
    const nin = String(formData.get("nin") || "")
    const bvn = String(formData.get("bvn") || "")
    const cacNumber = String(formData.get("cacNumber") || "")
    const businessName = String(formData.get("businessName") || fullName)

    if (!fullName || !email || !phone || !password || !state || !city) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } })
    if (settings && settings.propertyEnabled === false) {
      return NextResponse.json({ error: "Property bookings module is currently disabled" }, { status: 403 })
    }

    const config = await getPropertyModuleConfig()
    const requiredDocs = getHostComplianceRequirements(config.compliance, partnerType)
    for (const doc of requiredDocs) {
      if (doc.id === "nin" && !isBusiness && !nin) {
        return NextResponse.json({ error: "NIN is required" }, { status: 400 })
      }
      if (doc.id === "bvn" && !isBusiness && !bvn) {
        return NextResponse.json({ error: "BVN is required" }, { status: 400 })
      }
      if (doc.id === "cac" && isBusiness && !cacNumber) {
        return NextResponse.json({ error: "CAC registration number is required" }, { status: 400 })
      }
      if (doc.requiresUpload) {
        const file = formData.get(`doc_${doc.id}`) as File | null
        if (!file) {
          return NextResponse.json({ error: `${doc.documentName} upload is required` }, { status: 400 })
        }
      }
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    })
    if (existingUser) {
      return NextResponse.json({ error: "User with this email or phone already exists" }, { status: 400 })
    }

    const documentUploads: Record<string, string> = {}
    for (const doc of requiredDocs) {
      if (doc.requiresUpload) {
        const file = formData.get(`doc_${doc.id}`) as File | null
        if (file) documentUploads[doc.id] = await uploadToCloudinary(file, "property/compliance")
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    const autoApprove = settings?.propertyAutoApproval ?? false

    const result = await prisma.$transaction(async (tx) => {
      const defaultCurrency = await tx.currency.findFirst({ where: { isDefault: true }, select: { code: true } })
      const currencyCode = defaultCurrency?.code || process.env.DEFAULT_CURRENCY || "NGN"

      const user = await tx.user.create({
        data: {
          email,
          phone,
          name: fullName,
          role: "VENDOR",
          isVerified: autoApprove,
          isActive: autoApprove,
          password: hashedPassword,
          userSettings: { create: { currency: currencyCode } },
          wallet: { create: { balance: 0, currency: currencyCode } },
        },
      })

      await tx.vendorProfile.create({
        data: {
          userId: user.id,
          businessName: isBusiness ? businessName : fullName,
          businessType: isBusiness ? "Property Hotel/Corporate" : "Property Host",
          businessLicense: isBusiness ? cacNumber : nin || null,
          taxId: bvn || null,
          address: address || `${city}, ${state}`,
          city,
          state,
          registrationDocuments: {
            partnerType,
            countryName,
            bankName,
            accountNumber,
            accountName,
            nin: nin || null,
            bvn: bvn || null,
            cacNumber: cacNumber || null,
            uploads: documentUploads,
            submittedAt: new Date().toISOString(),
          },
        },
      })

      return user
    })

    try {
      await sendEmailFromTemplate({
        to: email,
        templateCategory: "WELCOME",
        module: "PROPERTY",
        variables: { name: fullName, businessName: isBusiness ? businessName : fullName },
      })
    } catch {
      /* non-blocking */
    }

    return NextResponse.json({
      success: true,
      userId: result.id,
      autoApproved: autoApprove,
      message: autoApprove
        ? "Registration complete. You can sign in and start listing."
        : "Registration submitted. Our team will review your documents shortly.",
    })
  } catch (error) {
    console.error("Property vendor register error:", error)
    return NextResponse.json({ error: "Registration failed" }, { status: 500 })
  }
}
