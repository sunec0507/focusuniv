import type { Config, Context } from "@netlify/functions";
import { db } from "../../db/index.ts";
import { profiles } from "../../db/schema.ts";
import { json, requireUser } from "./_shared/auth.ts";

export default async (req: Request, _context: Context) => {
  const { user, response } = await requireUser();
  if (!user) return response;
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const body = await req.json().catch(() => ({}));
  const nickname = String(body.nickname || "").trim();
  await db
    .insert(profiles)
    .values({ userId: user.id, nickname })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { nickname },
    });
  return json({ ok: true, profile: { userId: user.id, nickname } });
};

export const config: Config = {
  path: "/api/profile",
};
