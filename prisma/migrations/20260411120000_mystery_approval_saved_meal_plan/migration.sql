-- Add approval columns to restaurant_offers
ALTER TABLE "restaurant_offers" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT DEFAULT 'APPROVED';
ALTER TABLE "restaurant_offers" ADD COLUMN IF NOT EXISTS "rejectionNote" TEXT;
ALTER TABLE "restaurant_offers" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL;
CREATE INDEX IF NOT EXISTS "restaurant_offers_restaurantId_promoKind_idx" ON "restaurant_offers"("restaurantId", "promoKind");
CREATE INDEX IF NOT EXISTS "restaurant_offers_approvalStatus_idx" ON "restaurant_offers"("approvalStatus");

-- Add approval columns to grocery_offers
ALTER TABLE "grocery_offers" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT DEFAULT 'APPROVED';
ALTER TABLE "grocery_offers" ADD COLUMN IF NOT EXISTS "rejectionNote" TEXT;
ALTER TABLE "grocery_offers" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL;
CREATE INDEX IF NOT EXISTS "grocery_offers_storeId_promoKind_idx" ON "grocery_offers"("storeId", "promoKind");
CREATE INDEX IF NOT EXISTS "grocery_offers_approvalStatus_idx" ON "grocery_offers"("approvalStatus");

-- Set existing MYSTERY / FLASH offers to PENDING so admin can review
UPDATE "restaurant_offers" SET "approvalStatus" = 'PENDING' WHERE "promoKind" IN ('MYSTERY', 'FLASH') AND "approvalStatus" IS NULL;
UPDATE "grocery_offers"    SET "approvalStatus" = 'PENDING' WHERE "promoKind" IN ('MYSTERY', 'FLASH') AND "approvalStatus" IS NULL;

-- Create saved_meal_plans table
CREATE TABLE IF NOT EXISTS "saved_meal_plans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" "Module" NOT NULL,
    "title" TEXT NOT NULL,
    "planType" TEXT NOT NULL DEFAULT 'WEEKLY',
    "aiReply" TEXT,
    "items" JSONB NOT NULL,
    "meals" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_meal_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "saved_meal_plans_userId_module_idx" ON "saved_meal_plans"("userId", "module");

ALTER TABLE "saved_meal_plans" DROP CONSTRAINT IF EXISTS "saved_meal_plans_userId_fkey";
ALTER TABLE "saved_meal_plans" ADD CONSTRAINT "saved_meal_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
