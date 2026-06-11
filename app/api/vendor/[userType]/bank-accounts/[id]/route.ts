import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import {
  BankAccountResolveError,
  requireVerifiedBankAccount,
} from "@/lib/resolve-bank-account"

export async function PUT(
  request: NextRequest,
  { params }: { params: { userType: string; id: string } }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const bankAccountId = params.id
    const body = await request.json()

    // Verify bank account belongs to user
    const existingAccount = await prisma.vendorBankAccount.findFirst({
      where: {
        id: bankAccountId,
        vendorId: session.id,
      },
    })

    if (!existingAccount) {
      return NextResponse.json(
        { error: "Bank account not found" },
        { status: 404 }
      )
    }

    // If setting as default/primary, unset other primary accounts
    if (body.isDefault) {
      await prisma.vendorBankAccount.updateMany({
        where: {
          vendorId: session.id,
          isPrimary: true,
          id: { not: bankAccountId },
        },
        data: { isPrimary: false },
      })
    }

    const updatedAccountNumber = body.accountNumber?.trim() || existingAccount.accountNumber
    const updatedBankCode = String(
      body.routingNumber || body.bankCode || existingAccount.bankCode || existingAccount.routingNumber || ""
    ).trim()

    let verifiedName = existingAccount.accountName
    const bankDetailsChanged =
      updatedAccountNumber !== existingAccount.accountNumber ||
      updatedBankCode !== String(existingAccount.bankCode || existingAccount.routingNumber || "").trim()

    if (bankDetailsChanged) {
      if (!updatedBankCode) {
        return NextResponse.json({ error: "Bank code is required" }, { status: 400 })
      }
      try {
        const verified = await requireVerifiedBankAccount({
          accountNumber: updatedAccountNumber,
          bankCode: updatedBankCode,
          userId: session.id,
        })
        verifiedName = verified.accountName
      } catch (err) {
        if (err instanceof BankAccountResolveError) {
          return NextResponse.json({ error: err.message }, { status: err.status })
        }
        throw err
      }
    }

    const updateData: Record<string, unknown> = {}
    if (bankDetailsChanged || body.accountName) updateData.accountName = verifiedName
    if (body.accountNumber) updateData.accountNumber = updatedAccountNumber
    if (body.bankName) updateData.bankName = body.bankName.trim()
    if (body.bankCode || body.routingNumber) {
      updateData.bankCode = updatedBankCode
      updateData.routingNumber = updatedBankCode
    }
    if (body.swiftCode) updateData.swiftCode = body.swiftCode
    if (body.isDefault !== undefined) updateData.isPrimary = body.isDefault
    if (bankDetailsChanged) {
      updateData.isVerified = true
      updateData.verificationStatus = "VERIFIED"
      updateData.verifiedAt = new Date()
    }

    const updatedAccount = await prisma.vendorBankAccount.update({
      where: { id: bankAccountId },
      data: updateData,
    })

    // Transform response
    return NextResponse.json({
      id: updatedAccount.id,
      accountName: updatedAccount.accountName,
      accountNumber: updatedAccount.accountNumber,
      bankName: updatedAccount.bankName,
      bankCode: updatedAccount.routingNumber || updatedAccount.swiftCode || "",
      swiftCode: updatedAccount.swiftCode,
      routingNumber: updatedAccount.routingNumber,
      isDefault: updatedAccount.isPrimary,
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
  { params }: { params: { userType: string; id: string } }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const bankAccountId = params.id

    // Verify bank account belongs to user
    const existingAccount = await prisma.vendorBankAccount.findFirst({
      where: {
        id: bankAccountId,
        vendorId: session.id,
      },
    })

    if (!existingAccount) {
      return NextResponse.json(
        { error: "Bank account not found" },
        { status: 404 }
      )
    }

    await prisma.vendorBankAccount.delete({
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
