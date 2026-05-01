import { NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/server/auth";
import { TaskCard, WorkflowRun } from "@/lib/types";
import { buildBrowserHandoff } from "@/lib/server/browser-handoff";

export async function POST(request: Request) {
  const auth = await requireAuthorizedUser();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json()) as {
    task?: TaskCard;
    workflow?: WorkflowRun;
  };

  if (!body.task || !body.workflow) {
    return NextResponse.json({ error: "task and workflow are required" }, { status: 400 });
  }

  return NextResponse.json(buildBrowserHandoff(body.task, body.workflow));
}
