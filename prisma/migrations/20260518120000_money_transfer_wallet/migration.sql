-- CreateEnum
CREATE TYPE "MoneyTransferSettlementMode" AS ENUM ('WALLET', 'DIRECT_BANK');

-- CreateEnum
CREATE TYPE "MoneyTransferWalletTxType" AS ENUM ('CREDIT', 'DEBIT', 'WITHDRAWAL', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "money_transfer_config" ADD COLUMN "settlementMode" "MoneyTransferSettlementMode" NOT NULL DEFAULT 'WALLET';

-- CreateTable
CREATE TABLE "money_transfer_wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "money_transfer_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_transfer_wallet_transactions" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "MoneyTransferWalletTxType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "transferId" TEXT,
    "payoutId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_transfer_wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "money_transfer_wallets_userId_key" ON "money_transfer_wallets"("userId");

-- CreateIndex
CREATE INDEX "money_transfer_wallets_userId_idx" ON "money_transfer_wallets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "money_transfer_wallet_transactions_reference_key" ON "money_transfer_wallet_transactions"("reference");

-- CreateIndex
CREATE INDEX "money_transfer_wallet_transactions_walletId_idx" ON "money_transfer_wallet_transactions"("walletId");

-- CreateIndex
CREATE INDEX "money_transfer_wallet_transactions_userId_idx" ON "money_transfer_wallet_transactions"("userId");

-- CreateIndex
CREATE INDEX "money_transfer_wallet_transactions_transferId_idx" ON "money_transfer_wallet_transactions"("transferId");

-- AddForeignKey
ALTER TABLE "money_transfer_wallets" ADD CONSTRAINT "money_transfer_wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_transfer_wallet_transactions" ADD CONSTRAINT "money_transfer_wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "money_transfer_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_transfer_wallet_transactions" ADD CONSTRAINT "money_transfer_wallet_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_transfer_wallet_transactions" ADD CONSTRAINT "money_transfer_wallet_transactions_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "money_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
