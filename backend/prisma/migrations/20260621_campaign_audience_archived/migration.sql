-- AlterTable: add audienceType, audienceConfig, archived, description to Campaign
ALTER TABLE "Campaign"
  ADD COLUMN IF NOT EXISTS "audienceType"   TEXT    NOT NULL DEFAULT 'filter',
  ADD COLUMN IF NOT EXISTS "audienceConfig" JSONB   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "archived"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "description"    TEXT    NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Campaign_status_archived_idx" ON "Campaign"("status", "archived");
CREATE INDEX IF NOT EXISTS "Campaign_createdAt_idx" ON "Campaign"("createdAt");
