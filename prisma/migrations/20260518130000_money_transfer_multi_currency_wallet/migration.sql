-- Per-transfer settlement choice
ALTER TABLE "money_transfers" ADD COLUMN "settlementMode" "MoneyTransferSettlementMode" NOT NULL DEFAULT 'WALLET';

-- Multi-currency wallets: drop single wallet per user, allow one wallet per currency
ALTER TABLE "money_transfer_wallets" DROP CONSTRAINT IF EXISTS "money_transfer_wallets_userId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "money_transfer_wallets_userId_currency_key" ON "money_transfer_wallets"("userId", "currency");
