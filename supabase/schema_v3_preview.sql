-- MEU FINANCEIRO V3 - SCHEMA PROPOSTO
-- NÃO APLICAR DIRETAMENTE EM PRODUÇÃO SEM REVISÃO/APROVAÇÃO.
-- Este arquivo é deliberadamente um plano de schema, não uma migration aplicada.

create table if not exists public.investimentos_posicoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  classe text not null default 'OUTRO',
  quantidade numeric not null check (quantidade >= 0),
  preco_medio numeric not null check (preco_medio >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ticker)
);

create table if not exists public.investimentos_operacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  tipo text not null check (tipo in ('COMPRA', 'VENDA')),
  quantidade numeric not null check (quantidade > 0),
  preco_unitario numeric not null check (preco_unitario > 0),
  taxas numeric not null default 0 check (taxas >= 0),
  data date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.investimentos_dividendos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  valor numeric not null check (valor > 0),
  data_pagamento date not null,
  anunciado boolean not null default false,
  recebido boolean not null default true,
  origem text not null default 'MANUAL',
  created_at timestamptz not null default now()
);

create table if not exists public.moedas_contas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instituicao text not null,
  nome text not null,
  moeda text not null default 'USD' check (moeda = 'USD'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moedas_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conta_id uuid not null references public.moedas_contas(id) on delete cascade,
  moeda text not null default 'USD' check (moeda = 'USD'),
  tipo text not null check (
    tipo in (
      'COMPRA',
      'VENDA',
      'GASTO',
      'TRANSFERENCIA_ENTRADA',
      'TRANSFERENCIA_SAIDA'
    )
  ),
  data date not null,
  quantidade_usd numeric not null check (quantidade_usd > 0),
  total_brl numeric not null default 0 check (total_brl >= 0),
  iof numeric not null default 0 check (iof >= 0),
  tarifas numeric not null default 0 check (tarifas >= 0),
  cotacao_efetiva numeric,
  transferencia_id uuid,
  observacao text,
  created_at timestamptz not null default now()
);

alter table public.investimentos_posicoes enable row level security;
alter table public.investimentos_operacoes enable row level security;
alter table public.investimentos_dividendos enable row level security;
alter table public.moedas_contas enable row level security;
alter table public.moedas_movimentacoes enable row level security;

create policy "investimentos_posicoes_owner_select"
  on public.investimentos_posicoes for select
  to authenticated
  using ((select auth.uid()) = user_id);
create policy "investimentos_posicoes_owner_insert"
  on public.investimentos_posicoes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
create policy "investimentos_posicoes_owner_update"
  on public.investimentos_posicoes for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "investimentos_posicoes_owner_delete"
  on public.investimentos_posicoes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "investimentos_operacoes_owner_all"
  on public.investimentos_operacoes for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "investimentos_dividendos_owner_all"
  on public.investimentos_dividendos for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "moedas_contas_owner_all"
  on public.moedas_contas for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "moedas_movimentacoes_owner_all"
  on public.moedas_movimentacoes for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists investimentos_operacoes_user_ticker_data_idx
  on public.investimentos_operacoes(user_id, ticker, data desc);
create index if not exists investimentos_dividendos_user_ticker_data_idx
  on public.investimentos_dividendos(user_id, ticker, data_pagamento desc);
create index if not exists moedas_movimentacoes_user_conta_data_idx
  on public.moedas_movimentacoes(user_id, conta_id, data desc);
