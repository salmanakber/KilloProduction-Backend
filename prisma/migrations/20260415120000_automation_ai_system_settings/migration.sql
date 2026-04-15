-- AlterTable
ALTER TABLE "system_settings" ADD COLUMN "marketingAutomationAiEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "system_settings" ADD COLUMN "marketingAutomationAiMaxCandidates" INTEGER NOT NULL DEFAULT 12;
ALTER TABLE "system_settings" ADD COLUMN "riderBonusAiEnabled" BOOLEAN NOT NULL DEFAULT false;
