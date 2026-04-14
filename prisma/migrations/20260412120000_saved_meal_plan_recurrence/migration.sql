-- Meal plan reminders + diet preference (BullMQ schedules next run)
ALTER TABLE "saved_meal_plans" ADD COLUMN IF NOT EXISTS "dietPreference" TEXT;
ALTER TABLE "saved_meal_plans" ADD COLUMN IF NOT EXISTS "recurrenceIntervalDays" INTEGER;
ALTER TABLE "saved_meal_plans" ADD COLUMN IF NOT EXISTS "nextRunAt" TIMESTAMP(3);
ALTER TABLE "saved_meal_plans" ADD COLUMN IF NOT EXISTS "lastReminderAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "saved_meal_plans_isActive_nextRunAt_idx" ON "saved_meal_plans"("isActive", "nextRunAt");
