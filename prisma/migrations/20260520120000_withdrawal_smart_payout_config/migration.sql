-- Smart auto-approval / liquidity guards for wallet withdrawals (NGN Paystack rail)
ALTER TABLE "money_transfer_config" ADD COLUMN IF NOT EXISTS "withdrawalSmartAutoApprove" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "money_transfer_config" ADD COLUMN IF NOT EXISTS "withdrawalSmartApproveDelayMinutes" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "money_transfer_config" ADD COLUMN IF NOT EXISTS "withdrawalPaystackBufferNgn" DOUBLE PRECISION NOT NULL DEFAULT 50000;
ALTER TABLE "money_transfer_config" ADD COLUMN IF NOT EXISTS "withdrawalInstantMaxNgn" DOUBLE PRECISION;
