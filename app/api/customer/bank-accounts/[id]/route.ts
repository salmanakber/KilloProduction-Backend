import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const bankAccountId = params.id
    const body = await request.json()

    // Verify bank account belongs to user
    const existingAccount = await prisma.bankAccount.findFirst({
      where: {
        id: bankAccountId,
        userId: session.id,
      },
    })

    if (!existingAccount) {
      return NextResponse.json(
        { error: "Bank account not found" },
        { status: 404 }
      )
    }

    // If setting as default, unset other default accounts
    if (body.isDefault) {
      await prisma.bankAccount.updateMany({
        where: {
          userId: session.id,
          isDefault: true,
          id: { not: bankAccountId },
        },
        data: { isDefault: false },
      })
    }

    const updateData: any = {}
    if (body.accountName) updateData.accountHolderName = body.accountName.trim().toUpperCase()
    if (body.accountNumber) updateData.accountNumber = body.accountNumber.trim()
    if (body.bankName) updateData.bankName = body.bankName.trim()
    if (body.bankCode) updateData.routingNumber = body.bankCode
    if (body.routingNumber) updateData.routingNumber = body.routingNumber
    if (body.swiftCode) updateData.swiftCode = body.swiftCode
    if (body.isDefault !== undefined) updateData.isDefault = body.isDefault

    const updatedAccount = await prisma.bankAccount.update({
      where: { id: bankAccountId },
      data: updateData,
    })

    // Transform response
    return NextResponse.json({
      id: updatedAccount.id,
      accountName: updatedAccount.accountHolderName,
      accountNumber: updatedAccount.accountNumber,
      bankName: updatedAccount.bankName,
      bankCode: updatedAccount.routingNumber || updatedAccount.swiftCode || "",
      swiftCode: updatedAccount.swiftCode,
      routingNumber: updatedAccount.routingNumber,
      isDefault: updatedAccount.isDefault,
      isVerified: updatedAccount.isVerified,
      createdAt: updatedAccount.createdAt.toISOString(),
    })
  } catch (error: any) {
    console.error("Error updating bank account:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const bankAccountId = params.id

    // Verify bank account belongs to user
    const existingAccount = await prisma.bankAccount.findFirst({
      where: {
        id: bankAccountId,
        userId: session.id,
      },
    })

    if (!existingAccount) {
      return NextResponse.json(
        { error: "Bank account not found" },
        { status: 404 }
      )
    }

    await prisma.bankAccount.delete({
      where: { id: bankAccountId },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting bank account:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
