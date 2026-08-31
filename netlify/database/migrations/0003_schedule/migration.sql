ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "busy_slots" jsonb;

CREATE TABLE IF NOT EXISTS "meeting_polls" (
  "id" text PRIMARY KEY NOT NULL,
  "group_id" text NOT NULL,
  "title" text NOT NULL,
  "dates" jsonb NOT NULL,
  "start_time" text NOT NULL,
  "end_time" text NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "poll_responses" (
  "id" text PRIMARY KEY NOT NULL,
  "poll_id" text NOT NULL,
  "user_id" text NOT NULL,
  "slots" jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "poll_responses_poll_user" ON "poll_responses" ("poll_id", "user_id");
