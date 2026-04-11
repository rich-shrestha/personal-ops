import OpenAI from "openai";

export function hasOpenAI() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}
