import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from '@/lib/auth'
import { rejectIfRiderCommissionLocked } from '@/lib/rider-app-access'
import {
  BankAccountResolveError,
  requireVerifiedBankAccount,
} from "@/lib/resolve-bank-account"

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authenticateRequest(request)

    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const riderLockResponse = rejectIfRiderCommissionLocked(session)
    if (riderLockResponse) return riderLockResponse

    const bankAccountId = params.id
    const body = await request.json()

    // Verify bank account belongs to rider
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

    // If setting as primary, unset other primary accounts
    if (body.isPrimary) {
      await prisma.vendorBankAccount.updateMany({
        where: {
          vendorId: session.id,
          isPrimary: true,
          id: { not: bankAccountId },
        },
        data: {
          isPrimary: false,
        },
      })
    }

    // Check for duplicate account number if changing it
    if (body.accountNumber && body.accountNumber !== existingAccount.accountNumber) {
      const duplicateAccount = await prisma.vendorBankAccount.findFirst({
        where: {
          vendorId: session.id,
          accountNumber: body.accountNumber.trim(),
          id: { not: bankAccountId },
        },
      })

      if (duplicateAccount) {
        return NextResponse.json(
          { error: "Bank account with this account number already exists" },
          { status: 400 }
        )
      }
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

    const updatedAccount = await prisma.vendorBankAccount.update({
      where: { id: bankAccountId },
      data: {
        bankName: body.bankName?.trim() || existingAccount.bankName,
        accountNumber: updatedAccountNumber,
        accountName: verifiedName,
        bankCode: updatedBankCode || existingAccount.bankCode,
        routingNumber: updatedBankCode || existingAccount.routingNumber,
        swiftCode: body.swiftCode?.trim() || existingAccount.swiftCode,
        branchCode: body.branchCode?.trim() || existingAccount.branchCode,
        accountType: body.accountType || existingAccount.accountType,
        currency: body.currency || existingAccount.currency,
        isPrimary: body.isPrimary !== undefined ? body.isPrimary : existingAccount.isPrimary,
        ...(bankDetailsChanged
          ? { isVerified: true, verificationStatus: "VERIFIED" as const, verifiedAt: new Date() }
          : {}),
      },
    })

    return NextResponse.json(updatedAccount)
  } catch (error) {
    console.error("Error updating bank account:", error)
    return NextResponse.json(
      { error: "Failed to update bank account" },
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

    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const riderLockResponse = rejectIfRiderCommissionLocked(session)
    if (riderLockResponse) return riderLockResponse

    const bankAccountId = params.id

    // Verify bank account belongs to rider
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

    // Check if account has pending withdrawals
    const pendingWithdrawals = await prisma.vendorWithdrawal.count({
      where: {
        bankAccountId: bankAccountId,
        status: { in: ["PENDING", "APPROVED"] },
      },
    })

    if (pendingWithdrawals > 0) {
      return NextResponse.json(
        { error: "Cannot delete bank account with pending withdrawals" },
        { status: 400 }
      )
    }

    await prisma.vendorBankAccount.delete({
      where: { id: bankAccountId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting bank account:", error)
    return NextResponse.json(
      { error: "Failed to delete bank account" },
      { status: 500 }
    )
  }
}




