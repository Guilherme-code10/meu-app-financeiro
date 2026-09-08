# Meu Financeiro

Aplicativo pessoal de gerenciamento financeiro desenvolvido para centralizar e organizar informações sobre contas bancárias, transações, cartões, contas fixas, parcelamentos, caixinhas e investimentos.

O projeto utiliza Node.js, Express, Supabase e integração com Open Finance através da API do Pierre.

## Funcionalidades

### Dashboard

* Visualização do saldo total.
* Total de entradas.
* Total de saídas.
* Visualização de contas fixas.
* Resumo financeiro.
* Gastos agrupados por categoria.
* Visualização das caixinhas.

### Contas

* Consulta de contas bancárias.
* Consulta de saldos.
* Lista de contas conectadas.
* Integração com Open Finance.
* Atualização das informações das contas.

### Cartões

* Cadastro e gerenciamento de cartões.
* Visualização das informações dos cartões.
* Organização das faturas.

### Transações

* Consulta de transações bancárias.
* Histórico dos últimos 3 meses.
* Filtro de transações por período.
* Organização dos gastos por categoria.

### Parcelamentos

* Controle de compras parceladas.
* Visualização das parcelas.
* Acompanhamento dos valores futuros.

### Contas Fixas

* Cadastro de contas fixas.
* Edição de contas fixas.
* Exclusão de contas fixas.
* Controle de contas pagas e pendentes.
* Persistência das informações no banco de dados.
* Associação das informações ao usuário.

### Caixinhas

* Organização de dinheiro por objetivos.
* Visualização das caixinhas no dashboard.
* Controle dos valores destinados a cada objetivo.

### Autenticação

* Sistema de autenticação de usuários.
* Controle de acesso à aplicação.
* Dados financeiros associados ao usuário autenticado.
* Sessões de usuário.

### Responsividade

* Interface adaptada para computadores, tablets e celulares.
* Menu lateral para desktop.
* Menu lateral responsivo para dispositivos móveis.
* Abertura e fechamento do menu no celular.
* Interface adaptada para telas menores.

## Integração com Open Finance

O aplicativo utiliza a API do Pierre para realizar a integração com instituições financeiras.

O fluxo da aplicação é:

```text
Banco
  ↓
Open Finance / Pierre
  ↓
Backend Node.js + Express
  ↓
Frontend
  ↓
Dashboard do usuário
```

A comunicação com a API do Pierre é realizada pelo backend.

A API Key do Pierre não é enviada para o navegador e permanece armazenada em variável de ambiente no servidor.

## Segurança

A segurança da aplicação é uma das principais preocupações do projeto.

As credenciais utilizadas para acessar serviços externos não ficam expostas no código do frontend.

O fluxo de comunicação é:

```text
Usuário
  ↓
Frontend
  ↓
Backend
  ↓
API externa / Banco de dados
```

O frontend não possui acesso direto à API Key do Pierre.

As informações sensíveis utilizadas pelo backend são armazenadas em variáveis de ambiente através do arquivo `.env`.

O arquivo `.env` não deve ser enviado para o GitHub.

### Autenticação

O sistema possui autenticação de usuários.

As informações financeiras são vinculadas ao usuário autenticado, permitindo que o backend identifique quem está realizando cada operação.

A autenticação utiliza sessões/tokens para controlar o acesso às funcionalidades protegidas.

### Banco de dados

O projeto utiliza Supabase para persistência dos dados.

As informações armazenadas incluem dados relacionados a:

* Usuários.
* Contas.
* Contas fixas.
* Pagamentos.
* Cartões.
* Parcelamentos.
* Outras informações financeiras da aplicação.

O acesso aos dados deve ser protegido por autenticação e políticas de acesso no banco de dados.

Quando utilizado corretamente, o Row Level Security (RLS) do Supabase permite restringir o acesso às informações de acordo com o usuário autenticado.

### Credenciais

Nunca devem ser publicadas:

* API Keys.
* Senhas.
* Tokens.
* Chaves secretas do Supabase.
* Arquivo `.env`.
* Credenciais de bancos ou serviços externos.

As chaves secretas do Supabase, como `service_role` ou `secret keys`, devem permanecer exclusivamente no backend e nunca ser expostas no navegador.

## Tecnologias utilizadas

* HTML5
* CSS3
* JavaScript
* Node.js
* Express
* Supabase
* Open Finance
* API Pierre
* Git
* GitHub

## Estrutura do projeto

```text
meu-app-financeiro-v2/
│
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
│
├── server.js
├── package.json
├── .env
├── .env.example
└── README.md
```

## Como instalar

### 1. Clone o repositório

```bash
git clone https://github.com/Guilherme-code10/meu-app-financeiro.git
```

### 2. Entre na pasta

```bash
cd meu-app-financeiro
```

### 3. Instale as dependências

```bash
npm install
```

### 4. Configure as variáveis de ambiente

Crie um arquivo `.env` baseado no `.env.example`.

Configure as credenciais necessárias no arquivo `.env`.

Nunca coloque credenciais diretamente no código do frontend.

### 5. Inicie o servidor

```bash
npm start
```

### 6. Acesse a aplicação

```text
http://localhost:3000
```

## Próximas versões

* Investimentos.
* Rendimentos.
* Gráficos financeiros.
* Planejamento financeiro mensal.
* Metas financeiras.
* Conciliação automática entre contas fixas e transações bancárias.
* Notificações de contas próximas do vencimento.
* Relatórios financeiros.
* Melhorias na experiência mobile.
* Melhorias no sistema de autenticação.
* Deploy da aplicação.

## Status do projeto

Em desenvolvimento.

O projeto está sendo desenvolvido gradualmente, com novas funcionalidades sendo adicionadas conforme a evolução da aplicação.

## Desenvolvimento

Projeto desenvolvido para estudos e prática de desenvolvimento web, integração com APIs, Open Finance, autenticação, banco de dados e gerenciamento financeiro.

## Licença

Este projeto foi desenvolvido para fins pessoais e educacionais.
