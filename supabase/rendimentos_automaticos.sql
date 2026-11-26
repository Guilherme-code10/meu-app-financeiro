-- MEU FINANCEIRO - RENDIMENTOS AUTOMÁTICOS DAS CAIXINHAS
-- Guarda o id da transação do Pierre em cada rendimento (para nunca lançar duas vezes)
-- e uma lista de rendimentos marcados como "não é de caixinha".

alter table public.rendimentos_caixinhas add column if not exists transacao_pierre_id text;
create unique index if not exists rendimentos_caixinhas_transacao_pierre_id_key
  on public.rendimentos_caixinhas (transacao_pierre_id)
  where transacao_pierre_id is not null;

create table if not exists public.rendimentos_ignorados (
  transacao_pierre_id text primary key,
  created_at timestamptz not null default now()
);
alter table public.rendimentos_ignorados enable row level security;
