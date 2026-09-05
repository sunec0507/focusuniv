import type { Config, Context } from "@netlify/functions";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { groupTasks, groups, meetingPolls, pollResponses, profiles } from "../../db/schema.ts";
import { json, requireUser } from "./_shared/auth.ts";

const MAX_MEMBERS = 8;
const TIME_RE = /^\d{2}:\d{2}$/;
const SLOT_RE = /^\d{4}-\d{2}-\d{2}-\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isMember(group: { memberIds: unknown }, userId: string) {
  return Array.isArray(group.memberIds) && group.memberIds.includes(userId);
}

function toBusySlots(courses: unknown) {
  if (!Array.isArray(courses)) return [];
  const out: { day: number; startTime: string; endTime: string }[] = [];
  for (const course of courses) {
    const raw = course && typeof course === "object" ? (course as { slots?: unknown; day?: unknown; startTime?: unknown; endTime?: unknown }) : {};
    const slots = Array.isArray(raw.slots) ? raw.slots : [raw];
    for (const item of slots) {
      const slot = item && typeof item === "object" ? (item as { day?: unknown; startTime?: unknown; endTime?: unknown }) : {};
      const day = Math.min(7, Math.max(1, Number(slot.day) || 0));
      const startTime = String(slot.startTime || "").slice(0, 5);
      const endTime = String(slot.endTime || "").slice(0, 5);
      if (!day || !TIME_RE.test(startTime) || !TIME_RE.test(endTime)) continue;
      out.push({ day, startTime, endTime });
    }
  }
  return out;
}

function cleanDates(value: unknown) {
  const list = Array.isArray(value) ? value.map((item) => String(item || "")).filter((item) => DATE_RE.test(item)) : [];
  return [...new Set(list)].sort().slice(0, 14);
}

function cleanPollSlots(value: unknown) {
  const list = Array.isArray(value) ? value.map((item) => String(item || "")).filter((item) => SLOT_RE.test(item)) : [];
  return [...new Set(list)].slice(0, 400);
}

export default async (req: Request, _context: Context) => {
  const { user, response } = await requireUser();
  if (!user) return response;

  if (req.method === "GET") {
    const all = await db.select().from(groups);
    const mine = all.filter((group) => isMember(group, user.id));
    const memberIds = [...new Set(mine.flatMap((group) => (Array.isArray(group.memberIds) ? group.memberIds : [])))];
    const memberProfiles = memberIds.length
      ? await db
          .select({
            userId: profiles.userId,
            nickname: profiles.nickname,
            busySlots: profiles.busySlots,
          })
          .from(profiles)
          .where(inArray(profiles.userId, memberIds))
      : [];
    const groupIds = mine.map((group) => group.id);
    const polls = groupIds.length ? await db.select().from(meetingPolls).where(inArray(meetingPolls.groupId, groupIds)) : [];
    const pollIds = polls.map((poll) => poll.id);
    const responses = pollIds.length
      ? await db.select().from(pollResponses).where(inArray(pollResponses.pollId, pollIds))
      : [];
    const pollsWithResponses = polls.map((poll) => ({
      ...poll,
      responses: responses.filter((item) => item.pollId === poll.id),
    }));
    const tasks = groupIds.length ? await db.select().from(groupTasks).where(inArray(groupTasks.groupId, groupIds)) : [];
    return json({ groups: mine, profiles: memberProfiles, polls: pollsWithResponses, tasks });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const body = await req.json();
  if (body.action === "create") {
    const id = `group-${Date.now()}`;
    const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    const group = {
      id,
      name: String(body.name || "").trim(),
      inviteCode,
      createdBy: user.id,
      memberIds: [user.id],
    };
    await db.insert(groups).values(group);
    return json({ group });
  }

  if (body.action === "join") {
    const code = String(body.code || "").trim().toUpperCase();
    const [group] = await db.select().from(groups).where(eq(groups.inviteCode, code)).limit(1);
    if (!group) return json({ ok: false, reason: "missing" }, 404);
    const memberIds = Array.isArray(group.memberIds) ? [...group.memberIds] : [];
    if (memberIds.includes(user.id)) return json({ ok: true, group });
    if (memberIds.length >= MAX_MEMBERS) return json({ ok: false, reason: "full" }, 409);
    memberIds.push(user.id);
    await db.update(groups).set({ memberIds }).where(eq(groups.id, group.id));
    return json({ ok: true, group: { ...group, memberIds } });
  }

  if (body.action === "leave") {
    const groupId = String(body.groupId || body.id || "");
    if (!groupId) return json({ error: "missing" }, 400);
    const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (!group) return json({ error: "missing" }, 404);
    const memberIds = Array.isArray(group.memberIds) ? group.memberIds.filter((id) => id !== user.id) : [];
    if (memberIds.length === (Array.isArray(group.memberIds) ? group.memberIds.length : 0) && !isMember(group, user.id)) {
      return json({ error: "forbidden" }, 403);
    }
    await db.update(groups).set({ memberIds }).where(eq(groups.id, group.id));
    return json({ ok: true, id: groupId });
  }

  if (body.action === "sync-timetable") {
    const busySlots = toBusySlots(body.courses);
    const [existing] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
    const nickname = existing?.nickname || String(user.email || "").split("@")[0] || "member";
    await db
      .insert(profiles)
      .values({ userId: user.id, nickname, busySlots })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: { busySlots },
      });
    return json({ ok: true, busySlots });
  }

  if (body.action === "create-poll") {
    const groupId = String(body.groupId || "");
    let [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (!group) {
      await db.insert(groups).values({
        id: groupId,
        name: String(body.groupName || "그룹").trim() || "그룹",
        inviteCode: String(body.inviteCode || Math.random().toString(36).slice(2, 8)).trim().toUpperCase() || Math.random().toString(36).slice(2, 8).toUpperCase(),
        createdBy: user.id,
        memberIds: [user.id],
      });
      [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    } else if (!isMember(group, user.id)) {
      const code = String(body.inviteCode || "").trim().toUpperCase();
      const memberIds = Array.isArray(group.memberIds) ? [...group.memberIds] : [];
      if (!code || code !== String(group.inviteCode || "").toUpperCase() || memberIds.length >= MAX_MEMBERS) {
        return json({ error: "forbidden" }, 403);
      }
      memberIds.push(user.id);
      await db.update(groups).set({ memberIds }).where(eq(groups.id, group.id));
      group = { ...group, memberIds };
    }
    if (!group || !isMember(group, user.id)) return json({ error: "forbidden" }, 403);
    const startTime = TIME_RE.test(String(body.startTime || "")) ? String(body.startTime) : "09:00";
    const endTime = TIME_RE.test(String(body.endTime || "")) ? String(body.endTime) : "22:00";
    const dates = cleanDates(body.dates);
    if (!dates.length) return json({ error: "dates-required" }, 400);
    const poll = {
      id: `poll-${Date.now()}`,
      groupId,
      title: String(body.title || "").trim() || "약속 잡기",
      dates,
      startTime,
      endTime,
      createdBy: user.id,
    };
    await db.insert(meetingPolls).values(poll);
    return json({ poll: { ...poll, responses: [] } });
  }

  if (body.action === "update-poll") {
    const pollId = String(body.pollId || body.id || "");
    const title = String(body.title || "").trim();
    if (!pollId || !title) return json({ error: "title-required" }, 400);
    const [poll] = await db.select().from(meetingPolls).where(eq(meetingPolls.id, pollId)).limit(1);
    if (!poll) return json({ error: "missing" }, 404);
    const [group] = await db.select().from(groups).where(eq(groups.id, poll.groupId)).limit(1);
    if (poll.createdBy !== user.id && (!group || !isMember(group, user.id))) return json({ error: "forbidden" }, 403);
    await db.update(meetingPolls).set({ title }).where(eq(meetingPolls.id, pollId));
    return json({ poll: { ...poll, title } });
  }

  if (body.action === "delete-poll") {
    const pollId = String(body.pollId || body.id || "");
    if (!pollId) return json({ error: "missing" }, 400);
    const [poll] = await db.select().from(meetingPolls).where(eq(meetingPolls.id, pollId)).limit(1);
    if (!poll) return json({ error: "missing" }, 404);
    const [group] = await db.select().from(groups).where(eq(groups.id, poll.groupId)).limit(1);
    if (poll.createdBy !== user.id && (!group || !isMember(group, user.id))) return json({ error: "forbidden" }, 403);
    await db.delete(pollResponses).where(eq(pollResponses.pollId, pollId));
    await db.delete(meetingPolls).where(eq(meetingPolls.id, pollId));
    return json({ ok: true, id: pollId });
  }

  if (body.action === "mark-availability") {
    const pollId = String(body.pollId || "");
    const [poll] = await db.select().from(meetingPolls).where(eq(meetingPolls.id, pollId)).limit(1);
    if (!poll) return json({ error: "missing" }, 404);
    let [group] = await db.select().from(groups).where(eq(groups.id, poll.groupId)).limit(1);
    if (!group) return json({ error: "forbidden" }, 403);
    if (!isMember(group, user.id)) {
      const code = String(body.inviteCode || "").trim().toUpperCase();
      const memberIds = Array.isArray(group.memberIds) ? [...group.memberIds] : [];
      if (!code || code !== String(group.inviteCode || "").toUpperCase() || memberIds.length >= MAX_MEMBERS) {
        return json({ error: "forbidden" }, 403);
      }
      memberIds.push(user.id);
      await db.update(groups).set({ memberIds }).where(eq(groups.id, group.id));
      group = { ...group, memberIds };
    }
    const slots = cleanPollSlots(body.slots);
    const [existing] = await db
      .select()
      .from(pollResponses)
      .where(and(eq(pollResponses.pollId, pollId), eq(pollResponses.userId, user.id)))
      .limit(1);
    if (existing) {
      await db.update(pollResponses).set({ slots, updatedAt: new Date() }).where(eq(pollResponses.id, existing.id));
      return json({ response: { ...existing, slots } });
    }
    const row = { id: `presp-${Date.now()}`, pollId, userId: user.id, slots };
    await db.insert(pollResponses).values(row);
    return json({ response: row });
  }

  if (body.action === "add-task") {
    const groupId = String(body.groupId || "");
    const title = String(body.title || "").trim();
    if (!title) return json({ error: "title-required" }, 400);
    const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (!group || !isMember(group, user.id)) return json({ error: "forbidden" }, 403);
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
    const createdByName = profile?.nickname || String(user.email || "").split("@")[0] || "member";
    const task = {
      id: `gtask-${Date.now()}`,
      groupId,
      title,
      note: String(body.note || "").trim() || null,
      assigneeName: String(body.assigneeName || "").trim(),
      dueDate: DATE_RE.test(String(body.dueDate || "")) ? String(body.dueDate) : "",
      status: "todo",
      priority: body.priority === "high" || body.priority === "low" ? String(body.priority) : "normal",
      createdBy: user.id,
      createdByName,
    };
    await db.insert(groupTasks).values(task);
    return json({ task });
  }

  if (body.action === "update-task") {
    const taskId = String(body.taskId || body.id || "");
    if (!taskId) return json({ error: "missing" }, 400);
    const [task] = await db.select().from(groupTasks).where(eq(groupTasks.id, taskId)).limit(1);
    if (!task) return json({ error: "missing" }, 404);
    const [group] = await db.select().from(groups).where(eq(groups.id, task.groupId)).limit(1);
    if (!group || !isMember(group, user.id)) return json({ error: "forbidden" }, 403);
    const patch: {
      title?: string;
      assigneeName?: string;
      dueDate?: string;
      status?: string;
      priority?: string;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if ("title" in body) {
      const title = String(body.title || "").trim();
      if (!title) return json({ error: "title-required" }, 400);
      patch.title = title;
    }
    if ("assigneeName" in body) patch.assigneeName = String(body.assigneeName || "").trim();
    if ("dueDate" in body) {
      const due = String(body.dueDate || "");
      patch.dueDate = DATE_RE.test(due) ? due : "";
    }
    if ("status" in body) {
      const status = String(body.status || "");
      if (status === "todo" || status === "completed") patch.status = status;
    }
    if ("priority" in body) {
      patch.priority = body.priority === "high" || body.priority === "low" ? String(body.priority) : "normal";
    }
    await db.update(groupTasks).set(patch).where(eq(groupTasks.id, taskId));
    return json({ task: { ...task, ...patch } });
  }

  if (body.action === "delete-task") {
    const taskId = String(body.taskId || body.id || "");
    if (!taskId) return json({ error: "missing" }, 400);
    const [task] = await db.select().from(groupTasks).where(eq(groupTasks.id, taskId)).limit(1);
    if (!task) return json({ error: "missing" }, 404);
    const [group] = await db.select().from(groups).where(eq(groups.id, task.groupId)).limit(1);
    if (task.createdBy !== user.id && (!group || !isMember(group, user.id))) return json({ error: "forbidden" }, 403);
    await db.delete(groupTasks).where(eq(groupTasks.id, taskId));
    return json({ ok: true, id: taskId });
  }

  return json({ error: "unknown action" }, 400);
};

export const config: Config = {
  path: "/api/groups",
};
