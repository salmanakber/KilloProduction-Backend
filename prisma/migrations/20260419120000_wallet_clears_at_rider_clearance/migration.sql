-- AlterTable
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "clearsAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "wallet_transactions_status_clearsAt_idx" ON "wallet_transactions"("status", "clearsAt");

-- AlterTable
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "riderWalletClearanceDays" INTEGER NOT NULL DEFAULT 4;
