import { NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/server/auth";
import { continueAgentJob, startAgentJob } from "@/lib/server/personal-ops-ai";
import { AgentJob, TaskCard } from "@/lib/types";

export async function POST(request: Request) {
  const auth = await requireAuthorizedUser();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json()) as
    | { action: "start"; task?: TaskCard }
    | { action: "continue"; job?: AgentJob; answer?: string };

  if (body.action === "start") {
    if (!body.task) {
      return NextResponse.json({ error: "task is required" }, { status: 400 });
    }

    const result = await startAgentJob(body.task);
    return NextResponse.json(result);
  }

  if (body.action === "continue") {
    if (!body.job || !body.answer?.trim()) {
      return NextResponse.json({ error: "job and answer are required" }, { status: 400 });
    }

    const result = await continueAgentJob(body.job, body.answer);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
