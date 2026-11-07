-- Demo / App Store review accounts: skip login OTP + money step-up OTP
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isDemoAccount" BOOLEAN NOT NULL DEFAULT false;
