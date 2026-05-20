-- VTpass airtime/data/bills + recurring schedule kinds

CREATE TYPE "MoneyScheduleKind" AS ENUM (
  'P2P_TRANSFER',
  'VTPASS_AIRTIME',
  'VTPASS_DATA',
  'VTPASS_ELECTRICITY',
  'VTPASS_CABLE'
);

ALTER TABLE "money_scheduled_transfers"
  ADD COLUMN IF NOT EXISTS "scheduleKind" "MoneyScheduleKind" NOT NULL DEFAULT 'P2P_TRANSFER',
  ADD COLUMN IF NOT EXISTS "servicePayload" JSONB;

ALTER TABLE "money_scheduled_transfers" ALTER COLUMN "receiverId" DROP NOT NULL;

CREATE TYPE "VtpassTransactionStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'DELIVERED',
  'FAILED',
  'REVERSED'
);

CREATE TABLE IF NOT EXISTS "vtpass_config" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "apiKey" TEXT,
  "secretKey" TEXT,
  "sandbox" BOOLEAN NOT NULL DEFAULT true,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "airtimeCommissionPct" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  "dataCommissionPct" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  "billsCommissionPct" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vtpass_config_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "vtpass_transactions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scheduleId" TEXT,
  "serviceType" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "variationCode" TEXT,
  "billersCode" TEXT NOT NULL,
  "phone" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "customerPaid" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "requestId" TEXT NOT NULL,
  "vtpassReference" TEXT,
  "status" "VtpassTransactionStatus" NOT NULL DEFAULT 'PENDING',
  "response" JSONB,
  "failureReason" TEXT,
  "walletTxId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vtpass_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "vtpass_transactions_requestId_key" ON "vtpass_transactions"("requestId");
CREATE INDEX IF NOT EXISTS "vtpass_transactions_userId_idx" ON "vtpass_transactions"("userId");
CREATE INDEX IF NOT EXISTS "vtpass_transactions_status_idx" ON "vtpass_transactions"("status");

ALTER TABLE "vtpass_transactions"
  ADD CONSTRAINT "vtpass_transactions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vtpass_transactions"
  ADD CONSTRAINT "vtpass_transactions_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "money_scheduled_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "vtpass_config" ("id") VALUES ('default') ON CONFLICT DO NOTHING;
