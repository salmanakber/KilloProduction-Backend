ALTER TABLE "ride_bookings"
  ADD COLUMN IF NOT EXISTS "pickupWaitingAccruedFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pickupWaitingBillableMinutesCharged" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pickupWaitingGraceNotified50At" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pickupWaitingGraceNotified90At" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pickupWaitingBreakdown" JSONB;

ALTER TABLE "courier_bookings"
  ADD COLUMN IF NOT EXISTS "pickupWaitingAccruedFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pickupWaitingBillableMinutesCharged" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pickupWaitingGraceNotified50At" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pickupWaitingGraceNotified90At" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pickupWaitingBreakdown" JSONB;
