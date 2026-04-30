import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cloudinary } from "@/lib/cloudinary"

async function uploadProfileImage(imageBase64: string) {
  return new Promise<string>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder: "kilo/admin-profiles" }, (error, result) => {
        if (error || !result?.secure_url) return reject(error || new Error("Upload failed"))
        resolve(result.secure_url)
      })
      .end(Buffer.from(imageBase64, "base64"))
  })
}

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const admin = await prisma.user.findUnique({
    where: { id: user.id },
    include: { adminProfile: true },
  })
  if (!admin) return NextResponse.json({ error: "Admin not found" }, { status: 404 })

  return NextResponse.json({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    avatar: admin.avatar,
    adminProfile: admin.adminProfile,
  })
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const name = typeof body.name === "string" ? body.name.trim() : undefined
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : undefined
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : undefined
    const imageData = typeof body.imageData === "string" ? body.imageData : undefined

    const existing = await prisma.user.findUnique({ where: { id: user.id } })
    if (!existing) return NextResponse.json({ error: "Admin not found" }, { status: 404 })

    let avatarUrl: string | undefined
    if (imageData) {
      const base64 = imageData.includes(",") ? imageData.split(",")[1] : imageData
      avatarUrl = await uploadProfileImage(base64)
    }

    if (email && email !== existing.email) {
      const duplicate = await prisma.user.findUnique({ where: { email } })
      if (duplicate && duplicate.id !== existing.id) {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 })
      }
    }

    const data: Record<string, unknown> = {}
    if (name) data.name = name
    if (email) data.email = email
    if (avatarUrl) data.avatar = avatarUrl

    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Current password is required" }, { status: 400 })
      }
      const valid = await bcrypt.compare(currentPassword, existing.password || "")
      if (!valid) return NextResponse.json({ error: "Current password is invalid" }, { status: 400 })
      data.password = await bcrypt.hash(newPassword, 12)
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data,
      select: { id: true, name: true, email: true, avatar: true },
    })

    await prisma.auditLog.create({
      data: {
        action: "ADMIN_PROFILE_UPDATED",
        entityType: "USER",
        entityId: updated.id,
        details: { updatedFields: Object.keys(data) },
        performedBy: updated.id,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Failed to update admin profile", error)
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 })
  }
}
