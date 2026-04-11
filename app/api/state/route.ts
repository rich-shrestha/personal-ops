import { NextResponse } from "next/server";
import { loadAppState, saveAppState } from "@/lib/server/state-store";
import { AgentJob, Capture, IdeaCard, TaskCard } from "@/lib/types";

export async function GET() {
  const state = await loadAppState();
  return NextResponse.json(state);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    captures?: Capture[];
    tasks?: TaskCard[];
    jobs?: AgentJob[];
    ideas?: IdeaCard[];
  };

  const result = await saveAppState({
    captures: body.captures ?? [],
    tasks: body.tasks ?? [],
    jobs: body.jobs ?? [],
    ideas: body.ideas ?? [],
  });

  return NextResponse.json(result);
}
