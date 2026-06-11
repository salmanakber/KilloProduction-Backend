-- Property module: security deposit tracking, settings, config, listing category
ALTER TABLE "property_bookings" ADD COLUMN IF NOT EXISTS "securityDepositRefundedAt" TIMESTAMP(3);

ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "propertyEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "propertyAutoApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "propertyCommission" DOUBLE PRECISION NOT NULL DEFAULT 10.0;

ALTER TABLE "property_listings" ADD COLUMN IF NOT EXISTS "categorySlug" TEXT;

ALTER TABLE "vendor_profiles" ADD COLUMN IF NOT EXISTS "registrationDocuments" JSONB;

CREATE TABLE IF NOT EXISTS "property_module_config" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "categories" JSONB NOT NULL DEFAULT '[]',
  "destinations" JSONB NOT NULL DEFAULT '[]',
  "compliance" JSONB NOT NULL DEFAULT '[]',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "property_module_config_pkey" PRIMARY KEY ("id")
);

INSERT INTO "property_module_config" ("id", "categories", "destinations", "compliance", "updatedAt")
VALUES (
  1,
  '[
    {"id":"resort","name":"Resorts","slug":"resort","icon":"island","image":null,"isActive":true,"minimumNights":1},
    {"id":"hotel","name":"Hotels","slug":"hotel","icon":"office-building","image":null,"isActive":true,"minimumNights":1},
    {"id":"apartment","name":"Apartments","slug":"apartment","icon":"home-city","image":null,"isActive":true,"minimumNights":1},
    {"id":"villa","name":"Villas","slug":"villa","icon":"home-variant","image":null,"isActive":true,"minimumNights":1}
  ]'::jsonb,
  '[
    {"id":"lagos","cityName":"Lagos","stateRegion":"Lagos State","image":null,"isActive":true,"isFeatured":true},
    {"id":"abuja","cityName":"Abuja","stateRegion":"FCT","image":null,"isActive":true,"isFeatured":true}
  ]'::jsonb,
  '[
    {"id":"nin","documentName":"National ID (NIN)","isRequired":true,"userType":"HOST","requiresUpload":false,"description":"11-digit NIN for individual hosts"},
    {"id":"bvn","documentName":"BVN","isRequired":true,"userType":"HOST","requiresUpload":false,"description":"11-digit BVN for payout verification"},
    {"id":"cac","documentName":"CAC Registration","isRequired":true,"userType":"HOST","requiresUpload":true,"description":"Business registration for hotel/corporate hosts"}
  ]'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
