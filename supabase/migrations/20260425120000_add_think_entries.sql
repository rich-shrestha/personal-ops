create table if not exists public.think_entries (
  id text primary key,
  text text not null,
  claude_response text not null default '',
  extracted_tasks jsonb not null default '[]'::jsonb,
  confirmed_task_ids jsonb not null default '[]'::jsonb,
  area text not null default 'all',
  created_at timestamptz not null default now()
);

create index if not exists idx_think_entries_created_at on public.think_entries(created_at desc);
