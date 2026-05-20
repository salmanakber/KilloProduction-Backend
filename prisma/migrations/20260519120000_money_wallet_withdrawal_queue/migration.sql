-- Money wallet withdrawal queue + auto payout settings
CREATE TYPE "MoneyWalletWithdrawalStatus" AS ENUM (
  'PENDING',
  'SCHEDULED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'REJECTED'
);

ALTER TABLE "money_transfer_config"
  ADD COLUMN IF NOT EXISTS "autoPayoutEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "autoPayoutDelayMinutes" INTEGER NOT NULL DEFAULT 12;

CREATE TABLE "money_wallet_withdrawals" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "walletTransactionId" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "status" "MoneyWalletWithdrawalStatus" NOT NULL DEFAULT 'PENDING',
  "bankName" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "bankCode" TEXT NOT NULL,
  "paystackReference" TEXT,
  "paystackTransferCode" TEXT,
  "failureReason" TEXT,
  "scheduledProcessAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "money_wallet_withdrawals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "money_wallet_withdrawals_walletTransactionId_key" ON "money_wallet_withdrawals"("walletTransactionId");
CREATE INDEX "money_wallet_withdrawals_userId_idx" ON "money_wallet_withdrawals"("userId");
CREATE INDEX "money_wallet_withdrawals_status_idx" ON "money_wallet_withdrawals"("status");
CREATE INDEX "money_wallet_withdrawals_scheduledProcessAt_idx" ON "money_wallet_withdrawals"("scheduledProcessAt");

ALTER TABLE "money_wallet_withdrawals" ADD CONSTRAINT "money_wallet_withdrawals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "money_wallet_withdrawals" ADD CONSTRAINT "money_wallet_withdrawals_walletTransactionId_fkey" FOREIGN KEY ("walletTransactionId") REFERENCES "money_transfer_wallet_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
