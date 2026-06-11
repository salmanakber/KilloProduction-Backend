import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import bcrypt from "bcryptjs"
import { getPropertyHostContext } from "@/lib/property-host-resolve"
import { uploadPropertyHostImage } from "@/lib/property-host-profile-upload"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ctx = await getPropertyHostContext(user.id)
    if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const isBookingsOnly = ctx.accessRole === "BOOKINGS_ONLY"

    if (isBookingsOnly) {
      const me = await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, name: true, email: true, phone: true, avatar: true },
      })
      if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 })
      return NextResponse.json({
        success: true,
        profileMode: "personal",
        profile: {
          id: me.id,
          name: me.name,
          email: me.email,
          phone: me.phone,
          avatar: me.avatar,
          propertyHostAccess: ctx.accessRole,
        },
      })
    }

    const hostUser = await prisma.user.findUnique({
      where: { id: ctx.hostVendorId },
      include: { vendorProfile: true },
    })
    if (!hostUser) return NextResponse.json({ error: "Host not found" }, { status: 404 })

    const operator =
      user.id !== ctx.hostVendorId
        ? await prisma.user.findUnique({
            where: { id: user.id },
            select: { id: true, name: true, phone: true, avatar: true, email: true },
          })
        : null

    return NextResponse.json({
      success: true,
      profileMode: "business",
      profile: {
        id: hostUser.id,
        name: hostUser.name,
        email: hostUser.email,
        phone: hostUser.phone,
        avatar: hostUser.avatar,
        businessName: hostUser.vendorProfile?.businessName,
        bio: hostUser.vendorProfile?.description,
        coverImage: hostUser.vendorProfile?.coverImage,
        city: hostUser.vendorProfile?.city,
        address: hostUser.vendorProfile?.address,
        propertyHostAccess: ctx.accessRole,
      },
      personalProfile: operator
        ? {
            id: operator.id,
            name: operator.name,
            email: operator.email,
            phone: operator.phone,
            avatar: operator.avatar,
          }
        : null,
    })
  } catch (error) {
    console.error("Property host profile GET:", error)
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ctx = await getPropertyHostContext(user.id)
    if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const isBookingsOnly = ctx.accessRole === "BOOKINGS_ONLY"
    const hostId = isBookingsOnly ? user.id : ctx.hostVendorId

    const contentType = request.headers.get("content-type") || ""
    let avatarUrl: string | undefined
    let coverUrl: string | undefined
    let personalAvatarUrl: string | undefined
    let body: Record<string, unknown> = {}

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData()
      const avatarFile = formData.get("avatar") as File | null
      const coverFile = formData.get("coverImage") as File | null
      const personalAvatarFile = formData.get("personalAvatar") as File | null
      if (avatarFile?.size) {
        const url = await uploadPropertyHostImage(avatarFile, "avatar")
        if (url) avatarUrl = url
      }
      if (coverFile?.size) {
        const url = await uploadPropertyHostImage(coverFile, "cover")
        if (url) coverUrl = url
      }
      if (personalAvatarFile?.size) {
        const url = await uploadPropertyHostImage(personalAvatarFile, "avatar")
        if (url) personalAvatarUrl = url
      }
      body = {
        name: formData.get("name"),
        phone: formData.get("phone"),
        bio: formData.get("bio"),
        businessName: formData.get("businessName"),
        personalName: formData.get("personalName"),
        personalPhone: formData.get("personalPhone"),
        currentPassword: formData.get("currentPassword"),
        newPassword: formData.get("newPassword"),
      }
    } else {
      body = await request.json()
    }

    const targetUser = await prisma.user.findUnique({ where: { id: hostId } })
    if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const newPassword = typeof body.newPassword === "string" ? body.newPassword : ""
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : ""

    const applyPassword = async (userId: string) => {
      if (!newPassword) return
      const row = await prisma.user.findUnique({ where: { id: userId } })
      if (!row?.password) {
        throw new Error("NO_PASSWORD")
      }
      if (!currentPassword || !bcrypt.compareSync(currentPassword, row.password)) {
        throw new Error("BAD_PASSWORD")
      }
      if (newPassword.length < 8) {
        throw new Error("SHORT_PASSWORD")
      }
      await prisma.user.update({
        where: { id: userId },
        data: { password: await bcrypt.hash(newPassword, 12) },
      })
    }

    try {
      await applyPassword(isBookingsOnly ? user.id : user.id)
    } catch (e: any) {
      if (e.message === "BAD_PASSWORD") {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 })
      }
      if (e.message === "SHORT_PASSWORD") {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
      }
      if (e.message === "NO_PASSWORD") {
        return NextResponse.json({ error: "Current password required" }, { status: 400 })
      }
    }

    if (isBookingsOnly) {
      const userUpdate: Record<string, unknown> = {}
      if (typeof body.name === "string" && body.name.trim()) userUpdate.name = body.name.trim()
      if (typeof body.phone === "string") userUpdate.phone = body.phone.trim()
      if (avatarUrl) userUpdate.avatar = avatarUrl

      if (Object.keys(userUpdate).length > 0) {
        await prisma.user.update({ where: { id: user.id }, data: userUpdate })
      }

      const updated = await prisma.user.findUnique({ where: { id: user.id } })
      return NextResponse.json({
        success: true,
        profileMode: "personal",
        profile: {
          id: updated?.id,
          name: updated?.name,
          email: updated?.email,
          phone: updated?.phone,
          avatar: updated?.avatar,
        },
      })
    }

    const hostUser = targetUser
    const userUpdate: Record<string, unknown> = {}
    if (typeof body.name === "string" && body.name.trim()) userUpdate.name = body.name.trim()
    if (typeof body.phone === "string") userUpdate.phone = body.phone.trim()
    if (avatarUrl) userUpdate.avatar = avatarUrl

    if (Object.keys(userUpdate).length > 0) {
      await prisma.user.update({ where: { id: hostId }, data: userUpdate })
    }

    const vpUpdate: Record<string, unknown> = {}
    if (typeof body.businessName === "string" && body.businessName.trim()) {
      vpUpdate.businessName = body.businessName.trim()
    }
    if (typeof body.bio === "string") vpUpdate.description = String(body.bio).trim()
    if (coverUrl) vpUpdate.coverImage = coverUrl

    if (Object.keys(vpUpdate).length > 0) {
      await prisma.vendorProfile.upsert({
        where: { userId: hostId },
        create: {
          userId: hostId,
          businessName: String(vpUpdate.businessName || hostUser.name || "Property Host"),
          businessType: "Property Host",
          address: "To be updated",
          city: "To be updated",
          state: "To be updated",
          ...vpUpdate,
        },
        update: vpUpdate,
      })
    }

    if (user.id !== hostId) {
      const personalUpdate: Record<string, unknown> = {}
      if (typeof body.personalName === "string" && body.personalName.trim()) {
        personalUpdate.name = body.personalName.trim()
      }
      if (typeof body.personalPhone === "string") {
        personalUpdate.phone = body.personalPhone.trim()
      }
      if (personalAvatarUrl) personalUpdate.avatar = personalAvatarUrl
      if (Object.keys(personalUpdate).length > 0) {
        await prisma.user.update({ where: { id: user.id }, data: personalUpdate })
      }
    }

    const updated = await prisma.user.findUnique({
      where: { id: hostId },
      include: { vendorProfile: true },
    })
    const operator =
      user.id !== hostId
        ? await prisma.user.findUnique({
            where: { id: user.id },
            select: { id: true, name: true, phone: true, avatar: true, email: true },
          })
        : null

    return NextResponse.json({
      success: true,
      profileMode: "business",
      profile: {
        id: updated?.id,
        name: updated?.name,
        email: updated?.email,
        phone: updated?.phone,
        avatar: updated?.avatar,
        businessName: updated?.vendorProfile?.businessName,
        bio: updated?.vendorProfile?.description,
        coverImage: updated?.vendorProfile?.coverImage,
      },
      personalProfile: operator,
    })
  } catch (error) {
    console.error("Property host profile PUT:", error)
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 })
  }
}
