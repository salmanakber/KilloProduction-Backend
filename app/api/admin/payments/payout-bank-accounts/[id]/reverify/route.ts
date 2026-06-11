import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import {
  BankAccountResolveError,
  resolveBankAccountViaPaystack,
} from "@/lib/resolve-bank-account"

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const account = await prisma.vendorBankAccount.findUnique({
      where: { id: params.id },
      include: {
        vendor: {
          select: { id: true, name: true, role: true },
        },
      },
    })

    if (!account) {
      return NextResponse.json({ error: "Bank account not found" }, { status: 404 })
    }

    const bankCode = String(account.bankCode || account.routingNumber || "").trim()
    if (!bankCode) {
      return NextResponse.json({ error: "Bank code missing on this account" }, { status: 400 })
    }

    let resolved: Awaited<ReturnType<typeof resolveBankAccountViaPaystack>>
    try {
      resolved = await resolveBankAccountViaPaystack(account.accountNumber, bankCode)
    } catch (err) {
      if (err instanceof BankAccountResolveError) {
        await prisma.vendorBankAccount.update({
          where: { id: account.id },
          data: {
            isVerified: false,
            verificationStatus: "REJECTED",
            verificationNotes: err.message,
          },
        })
        return NextResponse.json({ error: err.message }, { status: err.status })
      }
      throw err
    }

    const updated = await prisma.vendorBankAccount.update({
      where: { id: account.id },
      data: {
        accountName: resolved.accountName,
        accountNumber: resolved.accountNumber,
        bankCode: resolved.bankCode,
        routingNumber: resolved.bankCode,
        isVerified: true,
        verificationStatus: "VERIFIED",
        verifiedAt: new Date(),
        verificationNotes: "Re-verified via Paystack (admin)",
      },
    })

    return NextResponse.json({
      success: true,
      account: {
        id: updated.id,
        accountName: updated.accountName,
        accountNumber: updated.accountNumber,
        bankName: updated.bankName,
        bankCode: updated.bankCode || updated.routingNumber,
        isVerified: updated.isVerified,
        verificationStatus: updated.verificationStatus,
        verifiedAt: updated.verifiedAt?.toISOString() ?? null,
        owner: {
          id: account.vendor.id,
          name: account.vendor.name,
          role: account.vendor.role,
        },
      },
    })
  } catch (e) {
    console.error("admin payout-bank-accounts reverify:", e)
    return NextResponse.json({ error: "Failed to re-verify bank account" }, { status: 500 })
  }
}
