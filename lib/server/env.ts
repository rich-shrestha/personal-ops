import { hasOpenAI } from "@/lib/server/openai";

export function hasAnthropic() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getTextProvider() {
  const provider = process.env.AI_TEXT_PROVIDER;
  if (provider === "openai" || provider === "anthropic") return provider;
  if (hasAnthropic()) return "anthropic";
  if (hasOpenAI()) return "openai";
  return "heuristic";
}

export function getTranscriptionProvider() {
  const provider = process.env.AI_TRANSCRIPTION_PROVIDER;
  if (provider === "openai") return "openai";
  return "browser";
}

export function phaseTwoEnvSummary() {
  return {
    anthropic: hasAnthropic(),
    openai: hasOpenAI(),
    textProvider: getTextProvider(),
    transcriptionProvider: getTranscriptionProvider(),
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}
