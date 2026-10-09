ALTER TABLE "meeting_polls" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'open' NOT NULL;
ALTER TABLE "meeting_polls" ADD COLUMN IF NOT EXISTS "confirmed_date" text;
ALTER TABLE "meeting_polls" ADD COLUMN IF NOT EXISTS "confirmed_start" text;
ALTER TABLE "meeting_polls" ADD COLUMN IF NOT EXISTS "confirmed_end" text;
ALTER TABLE "meeting_polls" ADD COLUMN IF NOT EXISTS "confirmed_by" text;
ALTER TABLE "meeting_polls" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp;

ALTER TABLE "group_tasks" ADD COLUMN IF NOT EXISTS "assignment_group_id" text;

CREATE TABLE IF NOT EXISTS "group_pages" (
	"id" text PRIMARY KEY,
	"group_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"color" text,
	"icon" text,
	"payload" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_by_name" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
