import { jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const userStates = pgTable("user_states", {
  userId: text("user_id").primaryKey(),
  payload: jsonb("payload").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  createdBy: text("created_by").notNull(),
  memberIds: jsonb("member_ids").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey(),
  nickname: text("nickname").notNull(),
  busySlots: jsonb("busy_slots"),
});

export const meetingPolls = pgTable("meeting_polls", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  title: text("title").notNull(),
  dates: jsonb("dates").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pollResponses = pgTable(
  "poll_responses",
  {
    id: text("id").primaryKey(),
    pollId: text("poll_id").notNull(),
    userId: text("user_id").notNull(),
    slots: jsonb("slots").notNull(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [uniqueIndex("poll_responses_poll_user").on(table.pollId, table.userId)],
);

export const feedPosts = pgTable("feed_posts", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  authorId: text("author_id").notNull(),
  authorName: text("author_name"),
  categoryId: text("category_id").notNull(),
  imageUri: text("image_uri"),
  caption: text("caption"),
  reactions: jsonb("reactions").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
