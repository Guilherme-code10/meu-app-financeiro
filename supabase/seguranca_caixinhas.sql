-- MEU FINANCEIRO - FECHAR ACESSO PÚBLICO ÀS CAIXINHAS
-- Só rode DEPOIS que o servidor com o commit "backend usa service role nas caixinhas" estiver no ar.
-- O backend passa a acessar essas tabelas com a service role (que ignora RLS),
-- então ligar o RLS sem policies bloqueia apenas o acesso direto com a chave pública.

alter table public.caixinhas enable row level security;
alter table public.movimentacoes_caixinhas enable row level security;
alter table public.rendimentos_caixinhas enable row level security;
alter table public.sincronizacoes enable row level security;
