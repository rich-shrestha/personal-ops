function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export const config = {
  supabaseUrl: requireEnv("SUPABASE_URL"),
  supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000),
  playwrightHeadless: process.env.PLAYWRIGHT_HEADLESS !== "false",
  target: process.env.PERSONAL_OPS_TARGET ?? "freetaxusa",
};
