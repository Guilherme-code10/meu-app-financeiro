-- MEU FINANCEIRO - TELA "MEU DIA" (tarefas de hoje, rotina e anotações)
create table if not exists public.dia_usuario (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.dia_usuario enable row level security;
