import { type NextRequest, NextResponse } from "next/server"
import { VehicleType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { hashPassword } from "@/lib/auth"
import { sendEmailFromTemplate } from "@/lib/email"
import { EMAIL_TEMPLATE_KEYS } from "@/lib/template-keys"
import { generateOTP } from "@/lib/twilio"
import { sendOTP } from "@/lib/twilio"
import { uploadRiderFileToCloudinary, uploadRiderImageString } from "@/lib/rider-registration-uploads"

const VEHICLE_TYPES = new Set<string>(Object.values(VehicleType))

type RiderPayload = {
  firstName: string
  lastName: string
  phone: string
  email: string
  password: string
  nationalId: string
  emergencyContact: string
  vehicleType: string
  vehicleBrand: string
  vehicleModel: string
  vehicleYear: string
  vehicleColor: string
  licensePlate: string
  licenseNumber: string
  licenseExpiry: string
  insurance?: string | null
  insuranceExpiry?: string | null
  serviceTypes: unknown
  modules: unknown
  maxDeliveryDistance: string | number
}

function parseServiceModules(serviceTypesRaw: unknown, modulesRaw: unknown) {
  const serviceTypes = Array.isArray(serviceTypesRaw)
    ? serviceTypesRaw.filter((s: unknown) => typeof s === "string")
    : []
  const modules = Array.isArray(modulesRaw) ? modulesRaw.filter((s: unknown) => typeof s === "string") : []
  return { serviceTypes, modules }
}

async function createRiderWithImages(
  data: RiderPayload,
  imageUrls: {
    vehiclePhotos: string[]
    nationalIdPhoto: string | null
    selfiePhoto: string | null
    licensePhoto: string | null
    insurancePhoto: string | null
  }
) {
  const {
    firstName,
    lastName,
    phone,
    email,
    password,
    nationalId,
    emergencyContact,
    vehicleType,
    vehicleBrand,
    vehicleModel,
    vehicleYear,
    vehicleColor,
    licensePlate,
    licenseNumber,
    licenseExpiry,
    insurance,
    insuranceExpiry,
    serviceTypes: serviceTypesRaw,
    modules: modulesRaw,
    maxDeliveryDistance,
  } = data

  
    

  const { serviceTypes, modules } = parseServiceModules(serviceTypesRaw, modulesRaw)

  if (!password || typeof password !== "string" || password.length < 6) {
    return { error: "Password is required and must be at least 6 characters", status: 400 as const }
  }

  if (!vehicleType || !VEHICLE_TYPES.has(vehicleType)) {
    return { error: "Invalid or missing vehicle type", status: 400 as const }
  }

  if (serviceTypes.includes("MODULE_DELIVERY") && modules.length === 0) {
    return {
      error: "Select at least one delivery module when module delivery is enabled",
      status: 400 as const,
    }
  }

  if (imageUrls.vehiclePhotos.length === 0) {
    return { error: "At least one vehicle photo is required", status: 400 as const }
  }
  if (!imageUrls.nationalIdPhoto || !imageUrls.selfiePhoto || !imageUrls.licensePhoto) {
    return { error: "National ID, selfie, and license photos are required", status: 400 as const }
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ phone }, { email }],
    },
  })

  if (existingUser) {
    return { error: "User already exists with this phone or email", status: 400 as const }
  }

  const hashedPassword = await hashPassword(password)
  const otp = generateOTP()

  const user = await prisma.user.create({
    data: {
      phone,
      email,
      name: `${firstName} ${lastName}`,
      password: hashedPassword,
      role: "RIDER",
      userProfile: {
        create: {
          firstName,
          lastName,
        },
      },
      userSettings: {
        create: {},
      },
      wallet: {
        create: {
          balance: 0,
        },
      },
      riderProfile: {
        create: {
          vehicleType: vehicleType as VehicleType,
          vehicleBrand,
          vehicleModel,
          vehicleYear,
          vehicleColor,
          licensePlate: String(licensePlate).toUpperCase(),
          licenseNumber,
          licenseExpiry: new Date(licenseExpiry),
          insurance: insurance || null,
          insuranceExpiry: insuranceExpiry ? new Date(insuranceExpiry) : null,
          nationalId,
          emergencyContact,
          serviceTypes,
          modules,
          maxDeliveryDistance: Number.parseFloat(String(maxDeliveryDistance)) || 15,
          vehiclePhotos: imageUrls.vehiclePhotos,
          licensePhoto: imageUrls.licensePhoto,
          insurancePhoto: imageUrls.insurancePhoto,
          nationalIdPhoto: imageUrls.nationalIdPhoto,
          selfiePhoto: imageUrls.selfiePhoto,
          documentsComplete: true,
          isApproved: false,
          isVerified: false,
          isAvailable: false,
        },
      },
    },
    include: {
      riderProfile: true,
    },
  })

  if (phone) {
    await sendOTP(phone, otp)
  }

  if (email) {
    try {
      await sendEmailFromTemplate(
        email,
        EMAIL_TEMPLATE_KEYS.RIDING.RIDER_ACCOUNT_CREATED,
        {
          app_name: process.env.APP_NAME || "Killo",
          rider_name: `${firstName} ${lastName}`,
          current_year: String(new Date().getFullYear()),
          support_email: process.env.SUPPORT_EMAIL || "support@killo.com",
        },
        "RIDING",
        "ACCOUNT"
      )
    } catch (emailErr) {
      console.error("Rider welcome email:", emailErr)
    }
  }

  return {
    ok: true as const,
    body: {
      message: "Rider registration submitted successfully. Please verify your phone number.",
      userId: user.id,
      requiresVerification: true,
      requiresApproval: true,
    },
  }
}

/** Multipart: field `payload` = JSON of text fields; file fields: vehiclePhotos[], nationalIdPhoto, selfiePhoto, licensePhoto, insurancePhoto? */
async function handleMultipart(request: NextRequest) {
  const form = await request.formData()
  const rawPayload = form.get("payload")
  if (!rawPayload || typeof rawPayload !== "string") {
    return NextResponse.json({ error: "Missing payload JSON field" }, { status: 400 })
  }

  let data: RiderPayload
  try {
    data = JSON.parse(rawPayload) as RiderPayload
  } catch {
    return NextResponse.json({ error: "Invalid payload JSON" }, { status: 400 })
  }

  const vehicleFiles = form.getAll("vehiclePhotos").filter((f): f is File => f instanceof File && f.size > 0)

  const getSingleFile = (key: string): File | null => {
    const v = form.get(key)
    return v instanceof File && v.size > 0 ? v : null
  }

  try {
    const vehiclePhotoUrls = await Promise.all(
      vehicleFiles.map((f) => uploadRiderFileToCloudinary(f, "vehicle"))
    )

    const nationalFile = getSingleFile("nationalIdPhoto")
    const selfieFile = getSingleFile("selfiePhoto")
    const licenseFile = getSingleFile("licensePhoto")
    const insuranceFile = getSingleFile("insurancePhoto")

    const nationalIdPhoto = nationalFile ? await uploadRiderFileToCloudinary(nationalFile, "national-id") : null
    const selfiePhoto = selfieFile ? await uploadRiderFileToCloudinary(selfieFile, "selfie") : null
    const licensePhoto = licenseFile ? await uploadRiderFileToCloudinary(licenseFile, "license") : null
    const insurancePhoto = insuranceFile ? await uploadRiderFileToCloudinary(insuranceFile, "insurance") : null

    const result = await createRiderWithImages(data, {
      vehiclePhotos: vehiclePhotoUrls,
      nationalIdPhoto,
      selfiePhoto,
      licensePhoto,
      insurancePhoto,
    })

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result.body, { status: 201 })
  } catch (e) {
    console.error("Rider multipart upload:", e)
    return NextResponse.json({ error: "Image upload failed" }, { status: 500 })
  }
}

/** JSON: image fields may be https URLs or data URIs / base64 — uploaded to Cloudinary when needed */
async function handleJson(request: NextRequest) {
  try {
    const data = (await request.json()) as RiderPayload & {
      vehiclePhotos?: unknown
      licensePhoto?: unknown
      insurancePhoto?: unknown
      nationalIdPhoto?: unknown
      selfiePhoto?: unknown
    }

    const {
      vehiclePhotos: vehiclePhotosRaw,
      licensePhoto: licenseRaw,
      insurancePhoto: insuranceRaw,
      nationalIdPhoto: nationalRaw,
      selfiePhoto: selfieRaw,
      ...rest
    } = data

    const vehicleInputs = Array.isArray(vehiclePhotosRaw)
      ? vehiclePhotosRaw.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : []

    try {
      const vehiclePhotos = await Promise.all(
        vehicleInputs.map((s) => uploadRiderImageString(s, "vehicle"))
      )

      const nationalIdPhoto =
        typeof nationalRaw === "string" && nationalRaw.trim()
          ? await uploadRiderImageString(nationalRaw, "national-id")
          : null
      const selfiePhoto =
        typeof selfieRaw === "string" && selfieRaw.trim()
          ? await uploadRiderImageString(selfieRaw, "selfie")
          : null
      const licensePhoto =
        typeof licenseRaw === "string" && licenseRaw.trim()
          ? await uploadRiderImageString(licenseRaw, "license")
          : null
      const insurancePhoto =
        typeof insuranceRaw === "string" && insuranceRaw.trim()
          ? await uploadRiderImageString(insuranceRaw, "insurance")
          : null

      const result = await createRiderWithImages(rest as RiderPayload, {
        vehiclePhotos,
        nationalIdPhoto,
        selfiePhoto,
        licensePhoto,
        insurancePhoto,
      })

      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status })
      }

      return NextResponse.json(result.body, { status: 201 })
    } catch (uploadErr) {
      console.error("Rider JSON image upload:", uploadErr)
      return NextResponse.json({ error: "Image upload failed" }, { status: 500 })
    }
  } catch (error) {
    console.error("Rider registration error:", error)
    return NextResponse.json({ error: "Registration failed" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || ""
  if (contentType.includes("multipart/form-data")) {
    return handleMultipart(request)
  }
  return handleJson(request)
}
