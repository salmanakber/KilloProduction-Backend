-- CreateTable
CREATE TABLE IF NOT EXISTS "payment_processing_ledger" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" "Module" NOT NULL,
    "orderAmount" DOUBLE PRECISION NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL,
    "commissionAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_processing_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payment_processing_ledger_paymentId_key" ON "payment_processing_ledger"("paymentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payment_processing_ledger_userId_idx" ON "payment_processing_ledger"("userId");

-- AddForeignKey
ALTER TABLE "payment_processing_ledger" DROP CONSTRAINT IF EXISTS "payment_processing_ledger_paymentId_fkey";
ALTER TABLE "payment_processing_ledger" ADD CONSTRAINT "payment_processing_ledger_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_processing_ledger" DROP CONSTRAINT IF EXISTS "payment_processing_ledger_userId_fkey";
ALTER TABLE "payment_processing_ledger" ADD CONSTRAINT "payment_processing_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
