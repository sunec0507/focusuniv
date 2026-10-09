import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
  status: text("status").notNull().default("open"),
  confirmedDate: text("confirmed_date"),
  confirmedStart: text("confirmed_start"),
  confirmedEnd: text("confirmed_end"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at"),
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

export const groupTasks = pgTable("group_tasks", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  title: text("title").notNull(),
  note: text("note"),
  assigneeName: text("assignee_name").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("normal"),
  createdBy: text("created_by").notNull(),
  createdByName: text("created_by_name").notNull(),
  assignmentGroupId: text("assignment_group_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const groupPages = pgTable("group_pages", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  type: text("type").notNull(),
  color: text("color"),
  icon: text("icon"),
  payload: jsonb("payload").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedBy: text("updated_by").notNull(),
  updatedByName: text("updated_by_name").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
