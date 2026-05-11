alter table public.task_cards
  add column if not exists effort text check (effort in ('quick', 'medium', 'deep', 'project'));
