alter table public.task_cards
  add column if not exists scheduled_time text;
