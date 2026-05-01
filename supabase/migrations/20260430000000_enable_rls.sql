-- Enable RLS on all tables. The app accesses Supabase exclusively via the
-- service role key (server-side), which bypasses RLS. Enabling RLS with no
-- policies fully locks down direct anon/authenticated-key access without
-- affecting any server-side operations.

alter table public.captures enable row level security;
alter table public.task_cards enable row level security;
alter table public.agent_jobs enable row level security;
alter table public.idea_cards enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.think_entries enable row level security;
