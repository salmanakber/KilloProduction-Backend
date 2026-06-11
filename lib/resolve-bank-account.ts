import { prisma } from "@/lib/prisma"

export type ResolvedBankAccount = {
  accountName: string
  accountNumber: string
  bankCode: string
}

export class BankAccountResolveError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function normalizeBankCode(raw: unknown): string {
  return String(raw || "").trim()
}

function normalizeAccountNumber(raw: unknown): string {
  return String(raw || "").trim()
}

async function getPaystackSecretKey(): Promise<string> {
  const config = await prisma.moneyTransferConfig.findFirst()
  const key = config?.paystackSecretKey || process.env.MONEY_TRANSFER_PAYSTACK_SECRET_KEY
  if (!key) {
    throw new BankAccountResolveError(
      "Paystack configuration not found. Please configure Paystack in admin panel.",
      503
    )
  }
  return key
}

/**
 * Resolve Nigerian bank account holder name via Paystack.
 * Throws BankAccountResolveError when verification cannot complete.
 */
export async function resolveBankAccountViaPaystack(
  accountNumberInput: unknown,
  bankCodeInput: unknown
): Promise<ResolvedBankAccount> {
  const accountNumber = normalizeAccountNumber(accountNumberInput)
  const bankCode = normalizeBankCode(bankCodeInput)

  if (!accountNumber || !bankCode) {
    throw new BankAccountResolveError("Account number and bank code are required")
  }

  if (accountNumber.length !== 10 || !/^\d+$/.test(accountNumber)) {
    throw new BankAccountResolveError("Invalid account number. Must be 10 digits")
  }

  const paystackSecretKey = await getPaystackSecretKey()

  const response = await fetch(
    `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        "Content-Type": "application/json",
      },
    }
  )

  const data = await response.json()

  if (!data.status) {
    throw new BankAccountResolveError(
      data.message || "Failed to resolve account name",
      400
    )
  }

  const accountName = String(data.data?.account_name || "").trim().toUpperCase()
  if (!accountName) {
    throw new BankAccountResolveError("Bank provider did not return an account name", 400)
  }

  return {
    accountName,
    accountNumber: String(data.data?.account_number || accountNumber).trim(),
    bankCode: String(data.data?.bank_code || bankCode).trim(),
  }
}

/** Mark matching saved rows verified for the authenticated user. */
export async function syncVerifiedBankAccountsForUser(
  userId: string,
  resolved: ResolvedBankAccount
): Promise<void> {
  const { accountNumber, bankCode, accountName } = resolved
  const bankMatch = {
    OR: [
      { routingNumber: bankCode },
      { swiftCode: bankCode },
      { bankCode },
    ],
  }

  await Promise.all([
    prisma.bankAccount.updateMany({
      where: {
        userId,
        accountNumber,
        ...bankMatch,
      },
      data: {
        isVerified: true,
        accountHolderName: accountName,
      },
    }),
    prisma.vendorBankAccount.updateMany({
      where: {
        vendorId: userId,
        accountNumber,
        ...bankMatch,
      },
      data: {
        isVerified: true,
        verificationStatus: "VERIFIED",
        verifiedAt: new Date(),
        accountName,
        bankCode,
        routingNumber: bankCode,
      },
    }),
  ])
}

/** Resolve via Paystack and return verified holder name for persistence. */
export async function requireVerifiedBankAccount(params: {
  accountNumber: unknown
  bankCode: unknown
  userId?: string
}): Promise<ResolvedBankAccount> {
  const resolved = await resolveBankAccountViaPaystack(params.accountNumber, params.bankCode)
  if (params.userId) {
    await syncVerifiedBankAccountsForUser(params.userId, resolved).catch((e) => {
      console.warn("syncVerifiedBankAccountsForUser:", e)
    })
  }
  return resolved
}
