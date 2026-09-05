CREATE TABLE IF NOT EXISTS "group_tasks" (
	"id" text PRIMARY KEY,
	"group_id" text NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"assignee_name" text NOT NULL,
	"due_date" text NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"created_by" text NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
