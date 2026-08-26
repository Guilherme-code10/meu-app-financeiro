# Meu App Financeiro — V2

Versão inicial do seu app financeiro pessoal.

## O que já funciona

- Conexão segura com a API do Pierre pelo backend.
- Consulta de contas/saldos.
- Consulta de transações dos últimos 3 meses.
- Filtro de transações por período.
- Dashboard com saldo, entradas, saídas e contas fixas.
- Gastos agrupados por categoria.
- Lista de contas.
- Cadastro local de contas fixas.
- Layout responsivo.

## Como instalar

1. Abra esta pasta no VS Code.
2. No terminal, rode:

   `npm install`

3. Crie `.env` copiando `.env.example`.
4. Coloque sua API Key do Pierre somente no `.env`.
5. Rode:

   `npm start`

6. Abra no navegador:

   `http://localhost:3000`

## Segurança

A API Key NÃO vai para o frontend. O navegador fala com o backend (`/api/...`) e somente o backend conversa com o Pierre.

Nunca compartilhe o `.env` e não coloque sua API Key no GitHub.

## Próximas versões

- Cartões e faturas.
- Parcelas.
- Caixinhas.
- Investimentos.
- Rendimentos.
- Persistência das contas fixas em banco de dados.
- Conciliação automática entre contas fixas e transações bancárias.
- Autenticação de usuário.
