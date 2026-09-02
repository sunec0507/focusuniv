import type { Config, Context } from "@netlify/functions";
import OpenAI from "openai";
import { json } from "./_shared/auth.ts";

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const body = await req.json();
  const client = new OpenAI({
    apiKey: Netlify.env.get("OPENAI_API_KEY"),
    baseURL: Netlify.env.get("OPENAI_BASE_URL"),
  });

  if (body.action === "split") {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "할 일을 30~50분 단위의 작은 한국어 할 일로 나눈다. JSON: { items: string[] }",
        },
        { role: "user", content: String(body.title || "") },
      ],
      response_format: { type: "json_object" },
    });
    return json(JSON.parse(completion.choices[0]?.message?.content || "{\"items\":[]}"));
  }

  if (body.action === "meeting") {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "대학생 팀플 회의록을 분석한다. 한국어로, JSON만 반환: { summary: string(3문장 이내), decisions: string[], tasks: [{ title: string, assigneeName?: string, dueDate?: string(YYYY-MM-DD) }] }. 회의록에 없는 내용은 추측하지 말고 비워둔다.",
        },
        { role: "user", content: String(body.text || "") },
      ],
      response_format: { type: "json_object" },
    });
    return json(JSON.parse(completion.choices[0]?.message?.content || "{}"));
  }

  if (body.action === "availability") {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "여러 명의 바쁜 시간(busySlots)을 분석해서 다같이 비어있는 시간대를 찾는다. 한국어로, JSON만 반환: { summary: string(2~3문장), suggestions: [{ label: string(예: '수요일 14:00~16:00'), day: number, start: string, end: string, availableCount: number }] }. 데이터에 없는 내용은 추측하지 않는다. 멤버 전원이 시간표를 공개하지 않았거나 busySlots가 비어 있거나 겹치는 빈 시간이 애매하면 suggestions는 빈 배열로 두고 summary에 그 이유를 적는다.",
        },
        {
          role: "user",
          content: JSON.stringify({
            members: body.members || [],
            targetDates: body.targetDates || [],
            rangeStart: body.rangeStart || "",
            rangeEnd: body.rangeEnd || "",
          }),
        },
      ],
      response_format: { type: "json_object" },
    });
    return json(JSON.parse(completion.choices[0]?.message?.content || "{\"summary\":\"\",\"suggestions\":[]}"));
  }

  return json({ error: "unknown action" }, 400);
};

export const config: Config = {
  path: "/api/ai",
};
