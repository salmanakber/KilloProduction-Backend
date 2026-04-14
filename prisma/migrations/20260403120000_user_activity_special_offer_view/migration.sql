-- AlterEnum (idempotent on re-run)
DO $$ BEGIN
  ALTER TYPE "UserActivityType" ADD VALUE 'SPECIAL_OFFER_VIEW';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
