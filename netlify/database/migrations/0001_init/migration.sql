CREATE TABLE IF NOT EXISTS "user_states" (
  "user_id" text PRIMARY KEY NOT NULL,
  "payload" jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "groups" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "invite_code" text NOT NULL UNIQUE,
  "created_by" text NOT NULL,
  "member_ids" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "feed_posts" (
  "id" text PRIMARY KEY NOT NULL,
  "group_id" text NOT NULL,
  "author_id" text NOT NULL,
  "author_name" text,
  "category_id" text NOT NULL,
  "image_uri" text,
  "caption" text,
  "reactions" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now()
);
