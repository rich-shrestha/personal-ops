import { NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/server/auth";
import { getTranscriptionProvider } from "@/lib/server/env";
import { getOpenAIClient, hasOpenAI } from "@/lib/server/openai";
import { TranscriptionResult } from "@/lib/types";

export async function POST(request: Request) {
  const auth = await requireAuthorizedUser();
  if (auth instanceof NextResponse) return auth;

  try {
    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "audio file is required" }, { status: 400 });
    }

    const provider = getTranscriptionProvider();
    if (provider !== "openai" || !hasOpenAI()) {
      return NextResponse.json(
        { error: "Server transcription is not configured. Use browser speech capture." },
        { status: 400 },
      );
    }

    const client = getOpenAIClient();
    if (!client) {
      return NextResponse.json({ error: "OpenAI client unavailable" }, { status: 500 });
    }

    const transcription = await client.audio.transcriptions.create({
      file: audio,
      model: "gpt-4o-mini-transcribe",
    });

    const result: TranscriptionResult = {
      text: transcription.text,
      provider: "openai",
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed";
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number" &&
      error.status >= 400 &&
      error.status < 600
        ? error.status
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
