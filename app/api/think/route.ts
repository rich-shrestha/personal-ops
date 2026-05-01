import { NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/server/auth";
import { processThinkEntry } from "@/lib/server/personal-ops-ai";
import { ThinkEntry } from "@/lib/types";

export async function POST(request: Request) {
  const auth = await requireAuthorizedUser();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json()) as { text?: string; area?: string };

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const area: ThinkEntry["area"] =
    body.area === "work" || body.area === "personal" ? body.area : "all";

  const result = await processThinkEntry(text, area);
  return NextResponse.json({ entry: result.entry, provider: result.provider });
}
