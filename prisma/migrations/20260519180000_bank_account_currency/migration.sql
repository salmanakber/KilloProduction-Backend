-- Bank account payout currency (money wallet withdrawals)
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'NGN';

CREATE INDEX IF NOT EXISTS "bank_accounts_userId_currency_idx" ON "bank_accounts"("userId", "currency");
