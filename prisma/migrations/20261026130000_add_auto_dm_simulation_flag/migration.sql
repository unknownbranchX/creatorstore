-- AlterTable: Add is_simulation flag to auto_dm_queue_jobs
ALTER TABLE "auto_dm_queue_jobs" ADD COLUMN IF NOT EXISTS "is_simulation" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_auto_dm_queue_simulation" ON "auto_dm_queue_jobs"("is_simulation", "status");
