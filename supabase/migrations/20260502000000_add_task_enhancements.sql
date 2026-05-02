alter table public.task_cards
  add column if not exists notes text,
  add column if not exists sort_order integer,
  add column if not exists horizon text check (horizon in ('today', 'weekend', 'this-week', 'someday'));
