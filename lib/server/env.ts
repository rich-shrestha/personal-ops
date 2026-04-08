export function hasAnthropic() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function phaseTwoEnvSummary() {
  return {
    anthropic: hasAnthropic(),
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}
