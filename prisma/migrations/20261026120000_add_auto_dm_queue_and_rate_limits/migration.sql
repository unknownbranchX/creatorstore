-- Migration: Add Auto-DM Queue Jobs and Rate Limiting
-- Non-destructive creation of tables, indexes, and constraints

CREATE TABLE IF NOT EXISTS "auto_dm_queue_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creator_id" UUID NOT NULL,
    "instagram_account_id" UUID,
    "automation_id" UUID,
    "dedupe_key" TEXT NOT NULL,
    "trigger_type" TEXT NOT NULL DEFAULT 'COMMENT',
    "comment_id" TEXT,
    "media_id" TEXT,
    "recipient_id" TEXT,
    "recipient_username" TEXT,
    "message" TEXT NOT NULL,
    "quick_replies" JSONB DEFAULT '[]',
    "comment_reply" TEXT,
    "destination_url" TEXT,
    "button_text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_attempt_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" TEXT,
    "lock_expires_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "provider_message_id" TEXT,
    "last_error_category" TEXT,
    "last_error_message" TEXT,
    "last_error_details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_dm_queue_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "auto_dm_rate_limits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "instagram_account_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "last_sent_at" TIMESTAMPTZ(6),
    "hourly_start" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "hourly_count" INTEGER NOT NULL DEFAULT 0,
    "minute_start" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "minute_count" INTEGER NOT NULL DEFAULT 0,
    "min_interval_ms" INTEGER NOT NULL DEFAULT 3000,
    "max_per_hour" INTEGER NOT NULL DEFAULT 200,
    "max_per_minute" INTEGER NOT NULL DEFAULT 20,
    "is_paused" BOOLEAN NOT NULL DEFAULT false,
    "pause_reason" TEXT,
    "paused_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_dm_rate_limits_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "auto_dm_queue_jobs_dedupe_key_key" ON "auto_dm_queue_jobs"("dedupe_key");
CREATE UNIQUE INDEX IF NOT EXISTS "auto_dm_rate_limits_instagram_account_id_key" ON "auto_dm_rate_limits"("instagram_account_id");

-- Performance & Queue indexes
CREATE INDEX IF NOT EXISTS "idx_auto_dm_queue_eligible" ON "auto_dm_queue_jobs"("status", "scheduled_at", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "idx_auto_dm_queue_creator_status" ON "auto_dm_queue_jobs"("creator_id", "status");
CREATE INDEX IF NOT EXISTS "idx_auto_dm_queue_account_status" ON "auto_dm_queue_jobs"("instagram_account_id", "status");
CREATE INDEX IF NOT EXISTS "idx_auto_dm_queue_lock_expires" ON "auto_dm_queue_jobs"("lock_expires_at");
CREATE INDEX IF NOT EXISTS "idx_auto_dm_rate_limits_creator" ON "auto_dm_rate_limits"("creator_id");

-- Foreign key constraints safely applied
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auto_dm_queue_jobs_creator_id_fkey'
  ) THEN
    ALTER TABLE "auto_dm_queue_jobs" ADD CONSTRAINT "auto_dm_queue_jobs_creator_id_fkey"
      FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auto_dm_queue_jobs_automation_id_fkey'
  ) THEN
    ALTER TABLE "auto_dm_queue_jobs" ADD CONSTRAINT "auto_dm_queue_jobs_automation_id_fkey"
      FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auto_dm_queue_jobs_instagram_account_id_fkey'
  ) THEN
    ALTER TABLE "auto_dm_queue_jobs" ADD CONSTRAINT "auto_dm_queue_jobs_instagram_account_id_fkey"
      FOREIGN KEY ("instagram_account_id") REFERENCES "instagram_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auto_dm_rate_limits_creator_id_fkey'
  ) THEN
    ALTER TABLE "auto_dm_rate_limits" ADD CONSTRAINT "auto_dm_rate_limits_creator_id_fkey"
      FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auto_dm_rate_limits_instagram_account_id_fkey'
  ) THEN
    ALTER TABLE "auto_dm_rate_limits" ADD CONSTRAINT "auto_dm_rate_limits_instagram_account_id_fkey"
      FOREIGN KEY ("instagram_account_id") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
