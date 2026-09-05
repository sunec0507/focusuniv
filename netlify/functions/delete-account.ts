import type { Config, Context } from "@netlify/functions";
import { admin } from "@netlify/identity";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { groups, meetingPolls, pollResponses, profiles, userStates } from "../../db/schema.ts";
import { json, requireUser } from "./_shared/auth.ts";

function memberIdsOf(group: { memberIds: unknown }) {
  return Array.isArray(group.memberIds) ? group.memberIds.map(String) : [];
}

async function deleteGroupCascade(groupId: string) {
  const polls = await db.select().from(meetingPolls).where(eq(meetingPolls.groupId, groupId));
  const pollIds = polls.map((poll) => poll.id);
  if (pollIds.length) {
    await db.delete(pollResponses).where(inArray(pollResponses.pollId, pollIds));
    await db.delete(meetingPolls).where(eq(meetingPolls.groupId, groupId));
  }
  await db.delete(groups).where(eq(groups.id, groupId));
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { user, response } = await requireUser();
  if (!user) return response;

  let body: { email?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const expected = String(user.email || "").trim().toLowerCase();
  const provided = String(body.email || "").trim().toLowerCase();
  if (!expected || provided !== expected) {
    return json({ error: "이메일이 계정과 일치하지 않습니다." }, 400);
  }

  const allGroups = await db.select().from(groups);
  for (const group of allGroups) {
    const ids = memberIdsOf(group);
    if (!ids.includes(user.id)) continue;
    const next = ids.filter((id) => id !== user.id);
    if (!next.length) {
      await deleteGroupCascade(group.id);
    } else {
      await db.update(groups).set({ memberIds: next }).where(eq(groups.id, group.id));
    }
  }

  await db.delete(pollResponses).where(eq(pollResponses.userId, user.id));
  await db.delete(profiles).where(eq(profiles.userId, user.id));
  await db.delete(userStates).where(eq(userStates.userId, user.id));

  try {
    await admin.deleteUser(user.id);
  } catch (err) {
    const status = Number((err as { status?: number })?.status || 0);
    if (status !== 404) {
      const message = err instanceof Error ? err.message : "Identity 계정 삭제에 실패했습니다.";
      return json({ error: message }, 500);
    }
  }

  return json({ ok: true });
};

export const config: Config = {
  path: "/api/delete-account",
};
