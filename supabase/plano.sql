-- MEU FINANCEIRO V4 - TELA "PLANO" (checklist e ideias da empresa de sites)
-- Rode uma vez no SQL Editor do Supabase.
-- Um registro por usuário com o estado do plano (tarefas marcadas, tarefas e ideias criadas).
-- O backend acessa com a service role e sempre filtra pelo usuário autenticado.

create table if not exists public.plano_usuario (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- RLS ligado e sem policies: ninguém acessa pelo navegador com a chave pública.
-- Só o backend (service role) lê e grava.
alter table public.plano_usuario enable row level security;
