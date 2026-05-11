import { NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/server/auth";
import Anthropic from "@anthropic-ai/sdk";

interface RankRequest {
  tasks: { id: string; title: string; context: string; effort?: string }[];
}

interface RankResponse {
  rankedIds: string[];
  topReason: string;
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response");
  return JSON.parse(match[0]);
}

export async function POST(request: Request) {
  const auth = await requireAuthorizedUser();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json()) as RankRequest;
  const tasks = Array.isArray(body.tasks) ? body.tasks : [];

  if (tasks.length === 0) {
    return NextResponse.json({ rankedIds: [], topReason: "" } satisfies RankResponse);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      rankedIds: tasks.map((t) => t.id),
      topReason: "No AI key configured — order unchanged.",
    } satisfies RankResponse);
  }

  const client = new Anthropic({ apiKey });

  const taskList = tasks
    .map(
      (t, i) =>
        `${i + 1}. ID: ${t.id}\n   Title: ${t.title}\n   Context: ${t.context || "(none)"}\n   Effort: ${t.effort ?? "unknown"}`,
    )
    .join("\n\n");

  const prompt = `Rank these tasks by urgency and impact. Factor in effort — prefer quick wins when urgency is equal. Return only valid JSON with two keys:
- "rankedIds": array of task IDs, highest priority first
- "topReason": one sentence explaining why the first task is most urgent

Tasks:
${taskList}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  const result = extractJson(text) as RankResponse;

  return NextResponse.json({
    rankedIds: Array.isArray(result.rankedIds) ? result.rankedIds : tasks.map((t) => t.id),
    topReason: typeof result.topReason === "string" ? result.topReason : "",
  } satisfies RankResponse);
}
