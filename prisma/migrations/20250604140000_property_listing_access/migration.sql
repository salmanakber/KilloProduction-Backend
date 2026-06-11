ALTER TABLE "property_listings" ADD COLUMN IF NOT EXISTS "wifiSsid" TEXT;
ALTER TABLE "property_listings" ADD COLUMN IF NOT EXISTS "wifiPassword" TEXT;
ALTER TABLE "property_listings" ADD COLUMN IF NOT EXISTS "gatePin" TEXT;
