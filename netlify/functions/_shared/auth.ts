import { getUser } from "@netlify/identity";

export async function requireUser() {
  const user = await getUser();
  if (!user) {
    return { user: null, response: new Response("Unauthorized", { status: 401 }) };
  }
  return { user, response: null };
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}
