-- AlterTable
ALTER TABLE "property_bookings" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "property_bookings" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "property_bookings" ADD COLUMN IF NOT EXISTS "rejectedById" TEXT;
ALTER TABLE "property_bookings" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);
ALTER TABLE "property_bookings" ADD COLUMN IF NOT EXISTS "checkedInById" TEXT;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "property_bookings" ADD CONSTRAINT "property_bookings_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "property_bookings" ADD CONSTRAINT "property_bookings_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "property_bookings" ADD CONSTRAINT "property_bookings_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
