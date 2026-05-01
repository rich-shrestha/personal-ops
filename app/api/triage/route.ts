import { NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/server/auth";
import { triageCapture } from "@/lib/server/personal-ops-ai";

export async function POST(request: Request) {
  const auth = await requireAuthorizedUser();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json()) as { rawText?: string };
  const rawText = body.rawText?.trim();

  if (!rawText) {
    return NextResponse.json({ error: "rawText is required" }, { status: 400 });
  }

  const result = await triageCapture(rawText);
  return NextResponse.json(result);
}
