-- MEU FINANCEIRO - COMO MOSTRAR CADA CARTÃO
-- SEPARADO: aparece sozinho · SOMAR: soma na fatura de outro cartão (somar_em) · ESCONDER: não aparece
create table if not exists public.cartoes_agrupamento (
  account_id text primary key,
  modo text not null default 'SEPARADO' check (modo in ('SEPARADO','SOMAR','ESCONDER')),
  somar_em text,
  updated_at timestamptz not null default now()
);
alter table public.cartoes_agrupamento enable row level security;

-- Mantém o comportamento antigo: o cartão auxiliar do Itaú continua escondido
insert into public.cartoes_agrupamento (account_id, modo)
values ('0881d673-2da4-4eb2-aff3-c2f57e259963', 'ESCONDER')
on conflict (account_id) do nothing;
