CREATE TABLE IF NOT EXISTS "ride_trip_share_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "bookingType" TEXT NOT NULL DEFAULT 'RIDE',
    "customerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_trip_share_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ride_trip_share_tokens_token_key" ON "ride_trip_share_tokens"("token");
CREATE INDEX IF NOT EXISTS "ride_trip_share_tokens_bookingId_idx" ON "ride_trip_share_tokens"("bookingId");
CREATE INDEX IF NOT EXISTS "ride_trip_share_tokens_token_idx" ON "ride_trip_share_tokens"("token");
