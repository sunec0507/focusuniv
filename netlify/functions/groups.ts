import type { Config, Context } from "@netlify/functions";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { groupPages, groupTasks, groups, meetingPolls, pollResponses, profiles } from "../../db/schema.ts";
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

function displayName(user: { email?: string | null }, nickname?: string | null) {
  return String(nickname || "").trim() || String(user.email || "").split("@")[0] || "멤버";
}

function stripHeavyUri(value: unknown) {
  const uri = String(value || "");
  if (!uri) return "";
  if (uri.startsWith("data:") && uri.length > 12000) return "";
  return uri;
}

function sanitizeBlocks(blocks: unknown): unknown[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.slice(0, 400).map((block) => {
    if (!block || typeof block !== "object") return block;
    const next = { ...(block as Record<string, unknown>) };
    if (typeof next.uri === "string") next.uri = stripHeavyUri(next.uri);
    return next;
  });
}

function sanitizeLinkUrl(value: unknown): string {
  const raw = String(value || "").trim().slice(0, 2000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function sanitizePagePayload(input: Record<string, unknown>, type: string) {
  if (type === "link") {
    // 팀플 링크: 외부 문서 주소만 저장한다 (본문·파일 없음).
    return { url: sanitizeLinkUrl(input.url), note: String(input.note || "").slice(0, 300) };
  }
  const tabs = Array.isArray(input.tabs)
    ? input.tabs.slice(0, 20).map((tab) => {
        const row = tab && typeof tab === "object" ? (tab as Record<string, unknown>) : {};
        return {
          id: String(row.id || ""),
          name: String(row.name || "탭"),
          blocks: sanitizeBlocks(row.blocks),
        };
      })
    : [];
  const payload: Record<string, unknown> = {
    tabs,
    activeTabId: String(input.activeTabId || tabs[0]?.id || ""),
    blocks: sanitizeBlocks(input.blocks),
  };
  if (type === "pdf") {
    payload.pdfName = String(input.pdfName || "");
    payload.pdfSize = Math.max(0, Number(input.pdfSize) || 0);
    payload.pdfPage = Math.max(1, Number(input.pdfPage) || 1);
    payload.pdfNotes = String(input.pdfNotes || "").slice(0, 8000);
    payload.pdfAnnotations = input.pdfAnnotations && typeof input.pdfAnnotations === "object" ? input.pdfAnnotations : {};
    payload.pdfFileShared = false;
  }
  return payload;
}

function pageToClient(row: typeof groupPages.$inferSelect) {
  const payload = row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {};
  return {
    id: row.id,
    groupId: row.groupId,
    parentId: row.parentId || null,
    name: row.name,
    type: row.type,
    color: row.color || "#2563eb",
    icon: row.icon || (row.type === "folder" ? "F" : row.type === "pdf" ? "P" : row.type === "link" ? "L" : "N"),
    revision: row.revision,
    updatedBy: row.updatedBy,
    updatedByName: row.updatedByName,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...payload,
    pdfUri: "",
    pdfFileShared: row.type === "pdf" ? false : undefined,
  };
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
    const pages = groupIds.length ? await db.select().from(groupPages).where(inArray(groupPages.groupId, groupIds)) : [];
    return json({
      groups: mine,
      profiles: memberProfiles,
      polls: pollsWithResponses,
      tasks,
      pages: pages.map(pageToClient),
    });
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
    if (!memberIds.length) {
      const polls = await db.select().from(meetingPolls).where(eq(meetingPolls.groupId, groupId));
      const pollIds = polls.map((poll) => poll.id);
      if (pollIds.length) {
        await db.delete(pollResponses).where(inArray(pollResponses.pollId, pollIds));
        await db.delete(meetingPolls).where(eq(meetingPolls.groupId, groupId));
      }
      await db.delete(groupPages).where(eq(groupPages.groupId, groupId));
      await db.delete(groupTasks).where(eq(groupTasks.groupId, groupId));
      await db.delete(groups).where(eq(groups.id, groupId));
      return json({ ok: true, id: groupId, deleted: true });
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
      id: `gtask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      groupId,
      title,
      note: String(body.note || "").trim() || null,
      assigneeName: String(body.assigneeName || "").trim(),
      dueDate: DATE_RE.test(String(body.dueDate || "")) ? String(body.dueDate) : "",
      status: "todo",
      priority: body.priority === "high" || body.priority === "low" ? String(body.priority) : "normal",
      createdBy: user.id,
      createdByName,
      assignmentGroupId: String(body.assignmentGroupId || "").trim() || null,
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

  if (body.action === "upsert-page") {
    const groupId = String(body.groupId || "");
    const pageId = String(body.id || body.pageId || "");
    const type =
      body.type === "folder" || body.type === "pdf" || body.type === "link" ? String(body.type) : "page";
    if (!groupId || !pageId) return json({ error: "missing" }, 400);
    if (type === "link" && !sanitizeLinkUrl(body.url)) return json({ error: "invalid-url" }, 400);
    const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (!group || !isMember(group, user.id)) return json({ error: "forbidden" }, 403);
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
    const actorName = displayName(user, profile?.nickname);
    const payload = sanitizePagePayload(body && typeof body === "object" ? (body as Record<string, unknown>) : {}, type);
    const name =
      String(body.name || "").trim().slice(0, 120) ||
      (type === "folder" ? "새로운 폴더" : type === "pdf" ? "PDF" : type === "link" ? "링크" : "새로운 페이지");
    const [existing] = await db.select().from(groupPages).where(eq(groupPages.id, pageId)).limit(1);
    if (existing) {
      if (existing.groupId !== groupId || !isMember(group, user.id)) return json({ error: "forbidden" }, 403);
      const incomingRev = Number(body.revision);
      if (Number.isFinite(incomingRev) && incomingRev !== existing.revision) {
        return json({ error: "conflict", page: pageToClient(existing) }, 409);
      }
      const revision = existing.revision + 1;
      await db
        .update(groupPages)
        .set({
          parentId: body.parentId == null ? existing.parentId : String(body.parentId || "") || null,
          name,
          type,
          color: String(body.color || existing.color || "#2563eb"),
          icon: String(body.icon || existing.icon || ""),
          payload,
          revision,
          updatedBy: user.id,
          updatedByName: actorName,
          updatedAt: new Date(),
        })
        .where(eq(groupPages.id, pageId));
      const [saved] = await db.select().from(groupPages).where(eq(groupPages.id, pageId)).limit(1);
      return json({ page: saved ? pageToClient(saved) : pageToClient({ ...existing, revision, payload, name, type }) });
    }
    const row = {
      id: pageId,
      groupId,
      parentId: String(body.parentId || "") || null,
      name,
      type,
      color: String(body.color || "#2563eb"),
      icon: String(body.icon || (type === "folder" ? "F" : type === "pdf" ? "P" : type === "link" ? "L" : "N")),
      payload,
      revision: 1,
      updatedBy: user.id,
      updatedByName: actorName,
      createdBy: user.id,
    };
    await db.insert(groupPages).values(row);
    return json({ page: pageToClient({ ...row, createdAt: new Date(), updatedAt: new Date() }) });
  }

  if (body.action === "delete-page") {
    const pageId = String(body.pageId || body.id || "");
    if (!pageId) return json({ error: "missing" }, 400);
    const [page] = await db.select().from(groupPages).where(eq(groupPages.id, pageId)).limit(1);
    if (!page) return json({ error: "missing" }, 404);
    const [group] = await db.select().from(groups).where(eq(groups.id, page.groupId)).limit(1);
    if (!group || !isMember(group, user.id)) return json({ error: "forbidden" }, 403);
    const all = await db.select().from(groupPages).where(eq(groupPages.groupId, page.groupId));
    const remove = new Set<string>([pageId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const item of all) {
        if (item.parentId && remove.has(item.parentId) && !remove.has(item.id)) {
          remove.add(item.id);
          grew = true;
        }
      }
    }
    await db.delete(groupPages).where(inArray(groupPages.id, [...remove]));
    return json({ ok: true, ids: [...remove] });
  }

  if (body.action === "confirm-poll" || body.action === "unconfirm-poll") {
    const pollId = String(body.pollId || body.id || "");
    if (!pollId) return json({ error: "missing" }, 400);
    const [poll] = await db.select().from(meetingPolls).where(eq(meetingPolls.id, pollId)).limit(1);
    if (!poll) return json({ error: "missing" }, 404);
    const [group] = await db.select().from(groups).where(eq(groups.id, poll.groupId)).limit(1);
    if (!group || !isMember(group, user.id)) return json({ error: "forbidden" }, 403);
    if (group.createdBy !== user.id) return json({ error: "forbidden" }, 403);
    if (body.action === "unconfirm-poll") {
      await db
        .update(meetingPolls)
        .set({
          status: "cancelled",
          confirmedDate: null,
          confirmedStart: null,
          confirmedEnd: null,
          confirmedBy: user.id,
          confirmedAt: new Date(),
        })
        .where(eq(meetingPolls.id, pollId));
      return json({
        poll: {
          ...poll,
          status: "cancelled",
          confirmedDate: null,
          confirmedStart: null,
          confirmedEnd: null,
          confirmedBy: user.id,
        },
      });
    }
    const slot = String(body.slot || "");
    const match = slot.match(/^(\d{4}-\d{2}-\d{2})-(\d{2}:\d{2})$/);
    const date = DATE_RE.test(String(body.date || "")) ? String(body.date) : match?.[1] || "";
    const startTime = TIME_RE.test(String(body.startTime || "")) ? String(body.startTime) : match?.[2] || "";
    let endTime = TIME_RE.test(String(body.endTime || "")) ? String(body.endTime) : "";
    if (!endTime && startTime) {
      const [hours, minutes] = startTime.split(":").map(Number);
      const total = (hours || 0) * 60 + (minutes || 0) + 30;
      endTime = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    }
    if (!date || !startTime || !endTime) return json({ error: "slot-required" }, 400);
    await db
      .update(meetingPolls)
      .set({
        status: "confirmed",
        confirmedDate: date,
        confirmedStart: startTime,
        confirmedEnd: endTime,
        confirmedBy: user.id,
        confirmedAt: new Date(),
      })
      .where(eq(meetingPolls.id, pollId));
    return json({
      poll: {
        ...poll,
        status: "confirmed",
        confirmedDate: date,
        confirmedStart: startTime,
        confirmedEnd: endTime,
        confirmedBy: user.id,
      },
    });
  }

  return json({ error: "unknown action" }, 400);
};

export const config: Config = {
  path: "/api/groups",
};
