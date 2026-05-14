-- Pickup waiting configuration (per ride type)
ALTER TABLE "ride_types" ADD COLUMN IF NOT EXISTS "waitingGraceMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ride_types" ADD COLUMN IF NOT EXISTS "waitingPricePerMinute" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Ride bookings: persisted pickup waiting charge + one-shot customer notification marker
ALTER TABLE "ride_bookings" ADD COLUMN IF NOT EXISTS "pickupWaitingFee" DOUBLE PRECISION;
ALTER TABLE "ride_bookings" ADD COLUMN IF NOT EXISTS "pickupWaitingMinutesBillable" INTEGER;
ALTER TABLE "ride_bookings" ADD COLUMN IF NOT EXISTS "pickupWaitingChargeNotifiedAt" TIMESTAMP(3);

-- Courier bookings: assignment / arrival timestamps + same waiting fields as rides
ALTER TABLE "courier_bookings" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);
ALTER TABLE "courier_bookings" ADD COLUMN IF NOT EXISTS "arrivedAt" TIMESTAMP(3);
ALTER TABLE "courier_bookings" ADD COLUMN IF NOT EXISTS "pickupWaitingFee" DOUBLE PRECISION;
ALTER TABLE "courier_bookings" ADD COLUMN IF NOT EXISTS "pickupWaitingMinutesBillable" INTEGER;
ALTER TABLE "courier_bookings" ADD COLUMN IF NOT EXISTS "pickupWaitingChargeNotifiedAt" TIMESTAMP(3);
