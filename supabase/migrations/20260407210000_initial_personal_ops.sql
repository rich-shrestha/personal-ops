create extension if not exists pgcrypto;

create table if not exists public.captures (
  id text primary key,
  raw_text text not null,
  source text not null check (source in ('text', 'voice', 'splitcheck')),
  created_at timestamptz not null default now()
);

create table if not exists public.task_cards (
  id text primary key,
  title text not null,
  context text not null default '',
  category text not null check (category in ('finance', 'health', 'career', 'admin', 'other', 'splitcheck')),
  complexity text not null check (complexity in ('quick', 'research', 'multi-step')),
  status text not null check (status in ('inbox', 'triaged', 'queued', 'in-progress', 'waiting-on-you', 'done')),
  due_date date,
  source_capture_id text references public.captures(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_jobs (
  id text primary key,
  task_card_id text not null references public.task_cards(id) on delete cascade,
  provider text not null default 'heuristic',
  agent text not null default 'claude-api',
  status text not null check (status in ('pending-confirmation', 'running', 'waiting-on-user', 'completed', 'failed')),
  follow_up_questions jsonb not null default '[]'::jsonb,
  follow_up_answer text,
  output text not null default '',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.idea_cards (
  id text primary key,
  title text not null,
  prompt text not null,
  category text not null check (category in ('finance', 'health', 'career', 'admin', 'other', 'splitcheck')),
  created_at timestamptz not null default now()
);

create table if not exists public.workflow_runs (
  id text primary key,
  task_card_id text references public.task_cards(id) on delete cascade,
  workflow_key text not null,
  execution_level text not null check (execution_level in ('think', 'prepare', 'confirm-act', 'high-trust')),
  status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_task_cards_status on public.task_cards(status);
create index if not exists idx_agent_jobs_task_card_id on public.agent_jobs(task_card_id);
create index if not exists idx_workflow_runs_task_card_id on public.workflow_runs(task_card_id);
