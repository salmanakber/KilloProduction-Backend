-- Money transfer fraud protection: trusted devices, step-up OTP, risk logs

CREATE TABLE IF NOT EXISTS "money_transfer_trusted_devices" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceFingerprint" TEXT NOT NULL,
  "deviceLabel" TEXT,
  "platform" TEXT,
  "lastIp" TEXT,
  "lastCountryCode" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "money_transfer_trusted_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "money_transfer_trusted_devices_userId_deviceFingerprint_key"
  ON "money_transfer_trusted_devices"("userId", "deviceFingerprint");
CREATE INDEX IF NOT EXISTS "money_transfer_trusted_devices_userId_idx"
  ON "money_transfer_trusted_devices"("userId");

ALTER TABLE "money_transfer_trusted_devices"
  ADD CONSTRAINT "money_transfer_trusted_devices_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "money_transfer_step_ups" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "deviceFingerprint" TEXT,
  "signals" JSONB,
  "riskScore" INTEGER NOT NULL DEFAULT 0,
  "verifiedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "trustDevice" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "money_transfer_step_ups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "money_transfer_step_ups_userId_idx" ON "money_transfer_step_ups"("userId");
CREATE INDEX IF NOT EXISTS "money_transfer_step_ups_expiresAt_idx" ON "money_transfer_step_ups"("expiresAt");

ALTER TABLE "money_transfer_step_ups"
  ADD CONSTRAINT "money_transfer_step_ups_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "money_transfer_risk_logs" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "riskScore" INTEGER NOT NULL,
  "signals" JSONB NOT NULL,
  "blocked" BOOLEAN NOT NULL DEFAULT false,
  "stepUpRequired" BOOLEAN NOT NULL DEFAULT false,
  "ipAddress" TEXT,
  "countryCode" TEXT,
  "deviceFingerprint" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "money_transfer_risk_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "money_transfer_risk_logs_userId_idx" ON "money_transfer_risk_logs"("userId");
CREATE INDEX IF NOT EXISTS "money_transfer_risk_logs_createdAt_idx" ON "money_transfer_risk_logs"("createdAt");

ALTER TABLE "money_transfer_risk_logs"
  ADD CONSTRAINT "money_transfer_risk_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
