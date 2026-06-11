ALTER TABLE "property_listings" ADD COLUMN IF NOT EXISTS "guestTier" TEXT NOT NULL DEFAULT 'Standard';
ALTER TABLE "property_bookings" ADD COLUMN IF NOT EXISTS "guestTier" TEXT NOT NULL DEFAULT 'Standard';
