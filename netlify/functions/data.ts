import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { userStates } from "../../db/schema.ts";
import { json, requireUser } from "./_shared/auth.ts";

export default async (req: Request, _context: Context) => {
  const { user, response } = await requireUser();
  if (!user) return response;

  if (req.method === "GET") {
    const [row] = await db.select().from(userStates).where(eq(userStates.userId, user.id)).limit(1);
    return json({ payload: row?.payload ?? null });
  }

  if (req.method === "PUT") {
    const payload = await req.json();
    await db
      .insert(userStates)
      .values({ userId: user.id, payload, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userStates.userId,
        set: { payload, updatedAt: new Date() },
      });
    return json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/data",
};
