-- Per-category customer notification preferences (JSON on user_settings)
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notificationPreferences" JSONB;
