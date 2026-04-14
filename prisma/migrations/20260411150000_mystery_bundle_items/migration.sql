-- Add bundleItems to restaurant_offers
ALTER TABLE "restaurant_offers" ADD COLUMN IF NOT EXISTS "bundleItems" JSONB;

-- Add bundleItems to grocery_offers
ALTER TABLE "grocery_offers" ADD COLUMN IF NOT EXISTS "bundleItems" JSONB;
