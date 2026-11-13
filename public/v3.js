/* =========================================================
   MEU FINANCEIRO V3 — BLACK PREMIUM
   Camada aditiva: não substitui o núcleo Pierre existente.
   ========================================================= */

const v3State = {
  investimentos: { posicoes: [], operacoes: [], dividendos: [], cotacoes: new Map() },
  moedas: { contas: [], ptax: null },
  mercado: { ticker: "MXRF11", periodo: "1M", dados: null },
  integracoes: null,
  atualizacao: {
    investimentosEm: null,
    cambioEm: null,
  },
};

let v3TimerCambio = null;
let v3TimerInvestimentos = null;

function v3Dinheiro(valor, moeda = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda,
    minimumFractionDigits: 2,
  }).format(Number(valor || 0));
}

function v3Numero(valor, casas = 2) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(Number(valor || 0));
}

function v3Escapar(valor) {
  const div = document.createElement("div");
  div.textContent = String(valor ?? "");
  return div.innerHTML;
}

function v3ClasseVariacao(valor) {
  const n = Number(valor || 0);
  if (n > 0) return "v3-positive";
  if (n < 0) return "v3-negative";
  return "";
}

async function v3Api(url, opcoes = {}) {
  if (typeof buscarDados !== "function") {
    throw new Error("Cliente autenticado indisponível.");
  }
  return buscarDados(url, opcoes);
}

function v3InjetarNavegacao() {
  const nav = document.querySelector(".sidebar nav");
  if (!nav || nav.querySelector('[data-section="investimentos"]')) return;

  const parcelas = nav.querySelector('[data-section="parcelas"]');

  const btnInvest = document.createElement("button");
  btnInvest.className = "nav-item";
  btnInvest.dataset.section = "investimentos";
  btnInvest.innerHTML = '📈 <span>Investimentos Nubank</span>';

  const btnMoedas = document.createElement("button");
  btnMoedas.className = "nav-item";
  btnMoedas.dataset.section = "moedas";
  btnMoedas.innerHTML = '🌎 <span>Bancos internacionais</span>';

  if (parcelas?.nextSibling) {
    nav.insertBefore(btnInvest, parcelas.nextSibling);
    nav.insertBefore(btnMoedas, btnInvest.nextSibling);
  } else {
    nav.append(btnInvest, btnMoedas);
  }
}

function v3InjetarSecoes() {
  const main = document.querySelector(".main");
  if (!main || document.querySelector("#investimentos")) return;

  const investimentos = document.createElement("section");
  investimentos.id = "investimentos";
  investimentos.className = "section";
  investimentos.innerHTML = `
    <div class="section-title">
      <div>
        <p class="eyebrow">NUBANK · BOLSA</p>
        <h2>Investimentos Nubank</h2>
        <p>Sua carteira de bolsa na Nubank, com ações, FIIs e ETFs, preço médio, histórico e dados de mercado identificados pela fonte.</p>
      </div>
    </div>

    <div id="v3InvestStatus" class="v3-note">Carregando carteira Nubank...</div>

    <div class="v3-integration-strip" id="v3InvestIntegration">
      <div>
        <span class="v3-integration-label">Open Finance · Nubank</span>
        <strong id="v3BelvoStatus">Verificando integração...</strong>
        <small id="v3BelvoDetail">A carteira manual continua funcionando mesmo sem conector.</small>
      </div>
      <button type="button" id="v3SyncBelvo" class="v3-sync-btn" disabled>Sincronizar Nubank</button>
    </div>

    <div class="v3-panel" style="margin-top:14px" id="v3PortfolioReconcilePanel">
      <div class="v3-row-between">
        <div>
          <h3>Conferência automática da carteira</h3>
          <p>Compara dados do conector disponível com suas posições cadastradas. Nunca substitui quantidades, custos ou preços médios.</p>
        </div>
        <button type="button" id="v3PortfolioReconcileRefresh" class="v3-sync-btn">Conferir agora</button>
      </div>
      <div id="v3PortfolioReconcileStatus" class="v3-note" aria-live="polite">Aguardando consulta da integração.</div>
      <div id="v3BrokerTransactionPreview" class="v3-note" aria-live="polite"></div>
    </div>

    <div class="v3-panel" id="v3B3ImportPanel" style="margin-top:14px">
      <h3>Conferir extrato da B3</h3>
      <p>Selecione as notas de corretagem da Nubank em PDF (vários arquivos ao mesmo tempo) ou um CSV da B3. Compare o custo das compras com suas posições cadastradas, sem sobrescrever dados.</p>
      <label class="v3-b3-upload"><span>Selecionar PDFs Nubank ou CSV B3</span><input id="v3B3File" type="file" accept=".csv,.pdf,text/csv,application/pdf" multiple></label>
      <div id="v3B3Preview" class="v3-note" aria-live="polite">Nenhum arquivo selecionado. Selecione as notas PDF da Nubank para conferir quanto pagou por ativo.</div>
      <small>O arquivo é analisado localmente neste navegador e não é enviado ao servidor.</small>
    </div>
    <div class="v3-kpis" style="margin-top:18px">
      <div class="v3-kpi"><span>Patrimônio investido</span><strong id="v3InvestTotal">—</strong></div>
      <div class="v3-kpi"><span>Custo da carteira</span><strong id="v3InvestCost">—</strong></div>
      <div class="v3-kpi"><span>Rentabilidade</span><strong id="v3InvestReturn">—</strong></div>
      <div class="v3-kpi"><span>Dividendos recebidos</span><strong id="v3InvestDividends">—</strong></div>
      <div class="v3-kpi"><span>Dividendos reinvestidos</span><strong id="v3InvestReinvested">—</strong></div>
      <div class="v3-kpi"><span>Disponível para reinvestir</span><strong id="v3InvestAvailable">—</strong></div>
    </div>
    <div class="v3-panel v3-reinvest-panel" style="margin-top:14px">
      <h3>Plano de aposentadoria · reinvestimento</h3>
      <p>Meta: reinvestir 100% dos dividendos efetivamente recebidos e aportar pelo menos R$ 100 por mês. Compre pela corretora e marque a operação como “Dividendos recebidos” abaixo para acompanhar. Este painel não movimenta seu dinheiro nem executa ordens na Nubank.</p>
      <div class="v3-reinvest-progress" role="progressbar" aria-label="Percentual de dividendos reinvestidos" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="v3ReinvestBar"></span></div>
      <small id="v3ReinvestHint">O acompanhamento começa quando você registrar dividendos efetivamente recebidos.</small>
    </div>

    <div class="v3-panel v3-live-table-panel" style="margin-top:18px">
      <div class="v3-row-between">
        <div>
          <h3>Cotações da carteira</h3>
          <p>Preço de mercado, valor atual e resultado por ativo.</p>
        </div>
        <span class="v3-auto-badge" id="v3InvestAutoStatus">● Atualização automática · 15 min</span>
      </div>
      <div id="v3InvestmentTable" class="v3-scroll">
        <div class="v3-skeleton"></div>
      </div>
    </div>

    <div class="v3-grid">
      <div class="v3-panel v3-span-8">
        <div class="v3-row-between">
          <div>
            <h3 id="v3MarketTitle">MXRF11</h3>
            <p id="v3MarketMeta">Consulte um ativo para ver o histórico.</p>
          </div>
          <strong id="v3MarketPrice">—</strong>
        </div>

        <div class="v3-toolbar" style="margin-top:14px">
          <label>
            <span>Ticker</span>
            <input id="v3TickerInput" value="MXRF11" maxlength="16" autocomplete="off">
          </label>
          <button type="button" id="v3TickerSearch">Buscar</button>
        </div>

        <div class="v3-periods" id="v3Periods">
          ${["1D","7D","1M","3M","6M","1A","5A","MAX"].map(p => `<button type="button" class="v3-period ${p === "1M" ? "active" : ""}" data-periodo="${p}">${p}</button>`).join("")}
        </div>

        <div class="v3-chart" id="v3MarketChart">
          <div class="v3-chart-empty">Carregando gráfico...</div>
        </div>
      </div>

      <div class="v3-panel v3-span-4">
        <div class="v3-row-between"><h3>Carteira Nubank</h3><span class="v3-bank-badge v3-bank-nubank">Nubank</span></div>
        <p>Clique no ticker para abrir o gráfico.</p>
        <div id="v3Holdings" class="v3-holdings"><div class="v3-skeleton"></div></div>
      </div>

      <div class="v3-panel v3-span-6">
        <h3>Adicionar/ajustar posição</h3>
        <p>Use para cadastrar uma posição que você já possui na Nubank, sem inventar histórico de operações.</p>
        <form id="v3PositionForm" class="v3-form-grid">
          <label><span>Ticker</span><input name="ticker" required placeholder="ITUB4"></label>
          <label><span>Classe</span>
            <select name="classe"><option>AÇÃO</option><option>FII</option><option>ETF</option><option>BDR</option><option>OUTRO</option></select>
          </label>
          <label><span>Quantidade</span><input name="quantidade" type="number" step="0.000001" min="0.000001" required></label>
          <label><span>Preço médio</span><input name="precoMedio" type="number" step="0.01" min="0.01" required></label>
          <button class="full" type="submit">Salvar posição</button>
        </form>
      </div>

      <div class="v3-panel v3-span-6">
        <h3>Registrar compra ou venda</h3>
        <p>Registre as compras e vendas feitas pela Nubank. O preço médio é recalculado automaticamente nas compras.</p>
        <form id="v3OperationForm" class="v3-form-grid">
          <label><span>Ticker</span><input name="ticker" required placeholder="MXRF11"></label>
          <label><span>Tipo</span><select name="tipo"><option>COMPRA</option><option>VENDA</option></select></label>
          <label><span>Quantidade</span><input name="quantidade" type="number" step="0.000001" min="0.000001" required></label>
          <label><span>Preço unitário</span><input name="precoUnitario" type="number" step="0.01" min="0.01" required></label>
          <label><span>Taxas</span><input name="taxas" type="number" step="0.01" min="0" value="0"></label>
          <label><span>Data</span><input name="data" type="date"></label>
          <label><span>Origem do dinheiro (compras)</span><select name="origemRecursos"><option value="APORTE">Aporte próprio</option><option value="DIVIDENDOS">Dividendos recebidos · reinvestimento</option></select></label>
          <button class="full" type="submit">Registrar operação</button>
        </form>
      </div>


      <div class="v3-panel v3-span-6">
        <h3>Distribuição da carteira</h3>
        <p id="v3AllocationMeta">Aguardando posições.</p>
        <div id="v3PortfolioDistribution" class="v3-allocation"></div>
      </div>

      <div class="v3-panel v3-span-6">
        <h3>Dividendos</h3>
        <p>Registre recebidos ou anunciados. Eventos da Brapi aparecem separados quando disponíveis.</p>
        <div class="v3-import-actions">
          <button type="button" id="v3FindPierreDividends">Procurar proventos no Pierre</button>
          <small>Pré-análise do extrato bancário dos últimos 90 dias. Confira os resultados com o extrato da Nubank antes de registrar. Nenhum lançamento é criado automaticamente.</small>
        </div>
        <div id="v3PierreDividendCandidates" aria-live="polite"></div>
        <form id="v3DividendForm" class="v3-form-grid">
          <label><span>Ticker</span><input name="ticker" required placeholder="MXRF11"></label>
          <label><span>Valor total (R$)</span><input name="valor" type="number" step="0.01" min="0.01" required></label>
          <label><span>Data de pagamento</span><input name="dataPagamento" type="date" required></label>
          <label><span>Status</span>
            <select name="status"><option value="RECEBIDO">Recebido</option><option value="ANUNCIADO">Anunciado</option></select>
          </label>
          <button class="full" type="submit">Registrar dividendo</button>
        </form>
        <div id="v3DividendHistory" style="margin-top:16px"></div>
      </div>

      <div class="v3-panel v3-span-12">
        <h3>Histórico de compras e vendas</h3>
        <div id="v3OperationHistory" class="v3-scroll"></div>
      </div>

      <div class="v3-panel v3-span-12">
        <h3>Evolução dos aportes registrados</h3>
        <p>Mostra capital líquido aportado a partir das operações salvas. O patrimônio histórico só será exibido quando houver snapshots reais.</p>
        <div id="v3ContributionEvolution"></div>
      </div>

      <div class="v3-panel v3-span-12">
        <h3>Simulador de investimentos</h3>
        <p>Projeção hipotética. A taxa não é promessa de rentabilidade.</p>
        <div class="v3-form-grid" id="v3SimulatorForm">
          <label><span>Aporte inicial</span><input id="v3SimInitial" type="number" step="100" value="1000"></label>
          <label><span>Aporte mensal</span><input id="v3SimMonthly" type="number" step="10" value="100"></label>
          <label><span>Prazo (anos)</span><input id="v3SimYears" type="number" step="1" value="10"></label>
          <label><span>Taxa hipotética anual (%)</span><input id="v3SimRate" type="number" step="0.1" value="8"></label>
          <label class="full"><input id="v3SimReinvest" type="checkbox" checked> Reinvestir rendimentos na simulação</label>
        </div>
        <div class="v3-kpis" style="margin-top:16px">
          <div class="v3-kpi"><span>Total aportado</span><strong id="v3SimContributed">—</strong></div>
          <div class="v3-kpi"><span>Patrimônio projetado</span><strong id="v3SimFinal">—</strong></div>
          <div class="v3-kpi"><span>Rendimento hipotético</span><strong id="v3SimYield">—</strong></div>
          <div class="v3-kpi"><span>Premissa</span><strong id="v3SimAssumption">8% a.a.</strong></div>
        </div>
      </div>
    </div>
  `;

  const moedas = document.createElement("section");
  moedas.id = "moedas";
  moedas.className = "section";
  moedas.innerHTML = `
    <div class="section-title">
      <div>
        <p class="eyebrow">DÓLARES · VIAGENS</p>
        <h2>Bancos internacionais</h2>
        <p>Controle seus dólares separadamente por banco internacional, sem alterar o custo histórico quando a cotação muda.</p>
      </div>
    </div>

    <div id="v3FxStatus" class="v3-note">Carregando cotação USD/BRL e bancos internacionais...</div>

    <div class="v3-integration-strip" id="v3WiseIntegration">
      <div>
        <span class="v3-integration-label">Wise</span>
        <strong id="v3WiseStatus">Verificando integração...</strong>
        <small id="v3WiseDetail">Se não houver credencial compatível, a conta permanece manual.</small>
      </div>
      <button type="button" id="v3SyncWise" class="v3-sync-btn" disabled>Sincronizar Wise</button>
    </div>

    <div class="v3-kpis" style="margin-top:18px">
      <div class="v3-kpi"><span>Saldo total</span><strong id="v3UsdTotal">—</strong></div>
      <div class="v3-kpi"><span>Valor estimado hoje</span><strong id="v3UsdBrlToday">—</strong></div>
      <div class="v3-kpi"><span>Custo histórico</span><strong id="v3UsdCost">—</strong></div>
      <div class="v3-kpi"><span>Variação cambial estimada</span><strong id="v3UsdVariation">—</strong></div>
    </div>

    <div class="v3-panel v3-live-table-panel" style="margin-top:18px">
      <div class="v3-row-between">
        <div>
          <h3>Resumo dos bancos internacionais</h3>
          <p>Saldo, custo médio e valor em reais usando a cotação comercial atual.</p>
        </div>
        <span class="v3-auto-badge" id="v3FxAutoStatus">● Atualização automática · 1 min</span>
      </div>
      <div id="v3FxTable" class="v3-scroll">
        <div class="v3-skeleton"></div>
      </div>
    </div>

    <div class="v3-grid">
      <div class="v3-panel v3-span-7">
        <div class="v3-row-between">
          <div><h3>Meus bancos internacionais</h3><p id="v3PtaxMeta">Cotação USD/BRL: carregando...</p></div>
          <strong id="v3PtaxValue">—</strong>
        </div>
        <div id="v3FxAccounts" class="v3-fx-accounts"><div class="v3-skeleton"></div></div>
      </div>

      <div class="v3-panel v3-span-5">
        <h3>Adicionar banco internacional</h3>
        <p>Cadastre cada banco separadamente. Nenhum saldo é inventado.</p>
        <div class="v3-bank-presets" aria-label="Bancos internacionais sugeridos">
          <button type="button" class="v3-bank-preset" data-v3-bank="Revolut">Revolut</button>
          <button type="button" class="v3-bank-preset" data-v3-bank="Wise">Wise</button>
          <button type="button" class="v3-bank-preset" data-v3-bank="Nomad">Nomad</button>
        </div>
        <form id="v3FxAccountForm" class="v3-form-grid">
          <label class="full"><span>Banco / instituição</span><input name="instituicao" required placeholder="Revolut, Wise, Nomad..."></label>
          <label class="full"><span>Nome personalizado</span><input name="nome" placeholder="Ex.: Dólares da viagem"></label>
          <button class="full" type="submit">Adicionar conta</button>
        </form>
      </div>

      <div class="v3-panel v3-span-6">
        <div class="v3-row-between">
          <div>
            <h3 id="v3FxMovementTitle">Registrar compra de dólar</h3>
            <p id="v3FxMovementHelp">Informe exatamente os valores da compra. O app calcula o custo efetivo e o novo preço médio.</p>
          </div>
          <span class="v3-source-pill manual">Manual</span>
        </div>

        <form id="v3FxMovementForm" class="v3-form-grid">
          <label class="full"><span>Banco</span><select name="contaId" id="v3FxMovementAccount" required></select></label>

          <label>
            <span>Movimentação</span>
            <select name="tipo" id="v3FxMovementType">
              <option value="COMPRA">Compra de dólar</option>
              <option value="VENDA">Venda de dólar</option>
              <option value="GASTO">Gasto em dólar</option>\n              <option value="RENDIMENTO">Rendimento em USD (Wise / Revolut)</option>
              <option value="AJUSTE_ENTRADA">Ajuste de entrada</option>
              <option value="AJUSTE_SAIDA">Ajuste de saída</option>
            </select>
          </label>

          <label><span>Data</span><input name="data" type="date"></label>

          <label>
            <span>Quantidade em USD</span>
            <input name="quantidadeUsd" type="number" step="0.01" min="0.01" placeholder="Ex.: 1000,00" required>
          </label>

          <label id="v3FxBrlField">
            <span id="v3FxBrlLabel">Valor convertido em R$</span>
            <input name="totalBrl" type="number" step="0.01" min="0" value="0">
            <small id="v3FxBrlHint">Valor da conversão antes de IOF e tarifas.</small>
          </label>

          <label>
            <span>IOF (R$)</span>
            <input name="iof" type="number" step="0.01" min="0" value="0">
          </label>

          <label>
            <span>Tarifas (R$)</span>
            <input name="tarifas" type="number" step="0.01" min="0" value="0">
          </label>

          <div class="v3-fx-preview full" id="v3FxPurchasePreview">
            <div><span>Custo total</span><strong id="v3FxPreviewTotal">R$ 0,00</strong></div>
            <div><span>Cotação efetiva</span><strong id="v3FxPreviewRate">—</strong></div>
            <div><span>Novo custo médio estimado</span><strong id="v3FxPreviewAverage">—</strong></div>
          </div>

          <button class="full" type="submit" id="v3FxMovementSubmit">Registrar compra de dólar</button>
        </form>
      </div>

      <div class="v3-panel v3-span-6">
        <h3>Transferir entre contas</h3>
        <p>A transferência preserva o custo médio histórico do saldo transferido.</p>
        <form id="v3FxTransferForm" class="v3-form-grid">
          <label><span>Origem</span><select name="origemId" id="v3FxTransferFrom" required></select></label>
          <label><span>Destino</span><select name="destinoId" id="v3FxTransferTo" required></select></label>
          <label><span>USD</span><input name="quantidadeUsd" type="number" step="0.01" min="0.01" required></label>
          <label><span>Data</span><input name="data" type="date"></label>
          <button class="full" type="submit">Transferir USD</button>
        </form>
      </div>
      <div class="v3-panel v3-span-12">
        <h3>Histórico em dólar</h3>
        <p>Compras, vendas, gastos, ajustes e transferências por instituição.</p>
        <div id="v3FxHistory" class="v3-scroll"></div>
      </div>
    </div>
  `;

  main.append(investimentos, moedas);
}

function v3InjetarDashboard() {
  const dashboard = document.querySelector("#dashboard");
  const cards = dashboard?.querySelector(".cards");
  if (!dashboard || !cards || document.querySelector("#v3NetWorthCard")) return;

  const html = `
    <article class="card highlight" id="v3NetWorthCard">
      <span>Patrimônio líquido estimado</span>
      <strong id="v3NetWorth">—</strong>
      <small>Contas + investimentos + dólares − faturas atuais. Limites não entram.</small>
    </article>
    <article class="card">
      <span>Investimentos Nubank</span>
      <strong id="v3DashboardInvestments">—</strong>
      <small>Cotações de mercado disponíveis, sem valores fictícios.</small>
    </article>
    <article class="card">
      <span>Bancos internacionais</span>
      <strong id="v3DashboardUsd">—</strong>
      <small>Convertidos pela cotação disponível, com fonte e data na área internacional.</small>
    </article>
  `;
  cards.insertAdjacentHTML("beforeend", html);

  const painel = document.createElement("div");
  painel.className = "v3-dashboard-row";
  painel.innerHTML = `
    <div class="v3-panel">
      <h3>Distribuição patrimonial</h3>
      <p id="v3DistributionText">Aguardando os dados do V3.</p>
      <div class="v3-distribution-bar">
        <span id="v3DistAccounts" style="width:0"></span>
        <span id="v3DistInvest" style="width:0"></span>
        <span id="v3DistUsd" style="width:0"></span>
      </div>
      <small style="color:var(--muted)">Roxo: contas · Verde: investimentos · Azul: dólares</small>
    </div>
    <div class="v3-panel">
      <h3>Histórico patrimonial</h3>
      <p>O histórico começa quando os snapshots do V3 forem ativados. Nenhum valor passado será inventado.</p>
      <div class="v3-note">Sem série histórica suficiente para desenhar uma evolução real.</div>
    </div>
  `;
  dashboard.appendChild(painel);
}

function v3BancoClasse(cartao) {
  const texto = `${cartao?.banco || ""} ${cartao?.nome || ""}`.toLowerCase();
  if (texto.includes("nubank")) return "bank-nubank";
  if (texto.includes("itaú") || texto.includes("itau")) return "bank-itau";
  if (texto.includes("inter")) return "bank-inter";
  if (texto.includes("c6")) return "bank-c6";
  if (texto.includes("mercado pago")) return "bank-mercado-pago";
  return "";
}

function v3DecorarCartoes() {
  if (typeof state === "undefined") return;

  document.querySelectorAll(".credit-card-item[data-card-id]").forEach((elemento) => {
    const cartao = (state.cartoes || []).find(
      (item) => String(item.id) === String(elemento.dataset.cardId),
    );
    if (!cartao) return;

    const classe = v3BancoClasse(cartao);
    if (classe) elemento.classList.add(classe);
    if (elemento.querySelector(".v3-card-brandline")) return;

    const ultimos4 = cartao.ultimos4 ? `•••• ${v3Escapar(cartao.ultimos4)}` : "";
    const badge = [cartao.bandeira, cartao.modalidade].filter(Boolean).map(v3Escapar).join(" · ");

    elemento.insertAdjacentHTML(
      "afterbegin",
      `<div class="v3-card-brandline">
        <div class="v3-card-chip" aria-hidden="true"></div>
        <div style="text-align:right">
          ${ultimos4 ? `<div class="v3-card-mask">${ultimos4}</div>` : ""}
          ${badge ? `<div class="v3-card-badge">${badge}</div>` : ""}
        </div>
      </div>`,
    );
  });
}

function v3RenderizarGrafico(dados) {
  const alvo = document.querySelector("#v3MarketChart");
  if (!alvo) return;

  const pontos = Array.isArray(dados?.historico) ? dados.historico.filter(p => Number.isFinite(Number(p.fechamento))) : [];
  if (pontos.length < 2) {
    alvo.innerHTML = '<div class="v3-chart-empty">Sem histórico disponível para este período/plano. O app não preenche dados fictícios.</div>';
    return;
  }

  const valores = pontos.map(p => Number(p.fechamento));
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const largura = 1000;
  const altura = 280;
  const margem = 24;
  const faixa = max - min || 1;

  const coords = pontos.map((p, i) => {
    const x = margem + (i / (pontos.length - 1)) * (largura - margem * 2);
    const y = altura - margem - ((Number(p.fechamento) - min) / faixa) * (altura - margem * 2);
    return { x, y, ponto: p };
  });

  const path = coords.map((c, i) => `${i ? "L" : "M"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(" ");
  const positiva = valores[valores.length - 1] >= valores[0];

  alvo.innerHTML = `
    <svg viewBox="0 0 ${largura} ${altura}" preserveAspectRatio="none" aria-label="Gráfico de preço">
      <defs>
        <linearGradient id="v3AreaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${positiva ? "#27d17f" : "#ff5f70"}" stop-opacity=".28"/>
          <stop offset="100%" stop-color="${positiva ? "#27d17f" : "#ff5f70"}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${path} L ${coords[coords.length - 1].x} ${altura} L ${coords[0].x} ${altura} Z" fill="url(#v3AreaGradient)"></path>
      <path d="${path}" fill="none" stroke="${positiva ? "#27d17f" : "#ff5f70"}" stroke-width="4" vector-effect="non-scaling-stroke"></path>
      <line id="v3ChartCursor" x1="0" x2="0" y1="0" y2="${altura}" stroke="rgba(255,255,255,.22)" stroke-width="1" style="display:none"></line>
      <circle id="v3ChartPoint" cx="0" cy="0" r="6" fill="${positiva ? "#27d17f" : "#ff5f70"}" style="display:none"></circle>
    </svg>
    <div class="v3-chart-tooltip" id="v3ChartTooltip"></div>
  `;

  const svg = alvo.querySelector("svg");
  const cursor = alvo.querySelector("#v3ChartCursor");
  const point = alvo.querySelector("#v3ChartPoint");
  const tooltip = alvo.querySelector("#v3ChartTooltip");

  svg.addEventListener("pointermove", (evento) => {
    const rect = svg.getBoundingClientRect();
    const rel = Math.max(0, Math.min(1, (evento.clientX - rect.left) / rect.width));
    const idx = Math.round(rel * (coords.length - 1));
    const c = coords[idx];
    const p = c.ponto;
    cursor.setAttribute("x1", c.x);
    cursor.setAttribute("x2", c.x);
    point.setAttribute("cx", c.x);
    point.setAttribute("cy", c.y);
    cursor.style.display = "";
    point.style.display = "";
    tooltip.style.display = "block";
    tooltip.style.left = `${rel * 100}%`;
    tooltip.style.top = `${(c.y / altura) * 100}%`;
    tooltip.textContent = `${v3Dinheiro(p.fechamento)} · ${new Date(p.timestamp * 1000).toLocaleDateString("pt-BR")}`;
  });

  svg.addEventListener("pointerleave", () => {
    cursor.style.display = "none";
    point.style.display = "none";
    tooltip.style.display = "none";
  });
}

async function v3BuscarMercado(ticker = v3State.mercado.ticker, periodo = v3State.mercado.periodo) {
  const simbolo = String(ticker || "").toUpperCase().trim();
  if (!simbolo) return;

  v3State.mercado.ticker = simbolo;
  v3State.mercado.periodo = periodo;

  const chart = document.querySelector("#v3MarketChart");
  if (chart) chart.innerHTML = '<div class="v3-chart-empty">Carregando dados reais...</div>';

  try {
    const dados = await v3Api(`/api/v3/mercado/${encodeURIComponent(simbolo)}?periodo=${encodeURIComponent(periodo)}`);
    v3State.mercado.dados = dados;
    v3State.investimentos.cotacoes.set(simbolo, dados);

    const titulo = document.querySelector("#v3MarketTitle");
    const meta = document.querySelector("#v3MarketMeta");
    const preco = document.querySelector("#v3MarketPrice");
    if (titulo) titulo.textContent = `${dados.ticker} · ${dados.nome}`;
    if (preco) {
      preco.textContent = v3Dinheiro(dados.precoAtual);
      preco.className = v3ClasseVariacao(dados.variacaoPercentual);
    }
    if (meta) {
      const data = dados.atualizadoEm ? new Date(dados.atualizadoEm).toLocaleString("pt-BR") : "horário não informado";
      const aviso = dados.avisoPlano ? ` · ${dados.avisoPlano}` : "";
      meta.textContent = `${dados.fonte} · atualização ${data} · atraso informado ~${dados.atrasoMinutos} min${aviso}`;
    }
    v3RenderizarGrafico(dados);
    v3RenderizarInvestimentos();
  } catch (erro) {
    if (chart) chart.innerHTML = `<div class="v3-chart-empty">${v3Escapar(erro.message)}</div>`;
    const meta = document.querySelector("#v3MarketMeta");
    if (meta) meta.textContent = erro.message;
  }
}


async function v3ConferirOperacoesBelvo() {
  const alvo = document.querySelector("#v3BrokerTransactionPreview");
  if (!alvo) return;
  if (v3State.integracoes?.belvo?.configurada !== true) {
    alvo.textContent = "Compras e proventos automáticos: aguardando autorização de integração Nubank/Belvo.";
    return;
  }
  alvo.textContent = "Consultando transações de investimentos da corretora (somente leitura)…";
  try {
    const dados = await v3Api("/api/v3/integracoes/belvo/transacoes-investimentos/preview");
    const externas = Array.isArray(dados.transacoes) ? dados.transacoes : [];
    const operacoes = v3State.investimentos.operacoes || [];
    const dividendos = v3State.investimentos.dividendos || [];
    const lista = externas.map(item => {
      const compraVenda = item.tipo === "COMPRA" || item.tipo === "VENDA";
      const provento = item.tipo === "DIVIDENDOS" || item.tipo === "JCP";
      const quantidadeValida = Number(item.quantidade) > 0 && Number(item.precoUnitario) > 0;
      const valor = Number.isFinite(Number(item.valorLiquido)) ? Number(item.valorLiquido) : Number(item.valorBruto || 0);
      const duplicada = compraVenda && item.ticker && quantidadeValida && operacoes.some(op =>
        op.ticker === item.ticker && op.tipo === item.tipo && op.data === item.data &&
        Math.abs(Number(op.quantidade) - Number(item.quantidade)) < 0.000001 &&
        Math.abs(Number(op.preco_unitario) - Number(item.precoUnitario)) < 0.011);
      const recebidoRegistrado = provento && item.ticker && dividendos.some(d =>
        d.ticker === item.ticker && d.data_pagamento === item.data &&
        Math.abs(Number(d.valor) - Math.abs(valor)) < 0.011);
      const status = duplicada || recebidoRegistrado ? "Possivelmente já registrado"
        : !item.ticker ? "Ticker não identificado"
        : compraVenda && !quantidadeValida ? "Quantidade/preço incompletos"
        : provento && !(valor > 0) ? "Valor do provento incompleto"
        : compraVenda ? "Compra/venda nova: conferir com posição"
        : provento ? "Provento possível: conferir recebimento"
        : "Outros movimentos";
      return { ...item, status };
    });
    const pendentes = lista.filter(x => x.status.startsWith("Compra/venda nova") || x.status.startsWith("Provento possível"));
    const jaRegistrados = lista.filter(x => x.status === "Possivelmente já registrado").length;
    alvo.innerHTML = `<strong>Transações da corretora · prévia automática</strong>
      <div class="v3-reconcile-results">
        <span>${lista.length} movimento(s) retornado(s)</span>
        <span>${pendentes.length} exigem conferência</span>
        <span>${jaRegistrados} possivelmente já cadastrado(s)</span>
      </div>
      ${dados.incompleto ? '<p>A consulta alcançou o limite de páginas; o histórico pode estar incompleto.</p>' : ""}
      <div class="v3-scroll"><table class="v3-mini-table">
        <thead><tr><th>Data</th><th>Tipo</th><th>Ativo</th><th>Valor</th><th>Situação</th></tr></thead>
        <tbody>${lista.slice(0,60).map(x => `<tr><td>${v3Escapar(x.data)}</td>
          <td>${v3Escapar(x.tipo)}</td><td>${v3Escapar(x.ticker || x.produto || "Não identificado")}</td>
          <td>${Number.isFinite(Number(x.valorLiquido)) && x.valorLiquido !== null ? v3Dinheiro(x.valorLiquido) : x.valorBruto !== null ? v3Dinheiro(x.valorBruto) : "—"}</td>
          <td>${v3Escapar(x.status)}</td></tr>`).join("") || '<tr><td colspan="5">Nenhuma transação disponível na fonte.</td></tr>'}</tbody>
      </table></div>
      <small>Não há importação automática de operações nesta etapa. Uma transação identificada como nova pode já estar incluída em uma posição cadastrada; a conciliação precisa validar o histórico completo antes de gravar.</small>`;
  } catch (erro) {
    alvo.textContent = "Histórico detalhado indisponível: " + erro.message + ". Nenhum lançamento foi alterado.";
  }
}

async function v3ConferirPosicoesSemAlterar() {
  const alvo = document.querySelector("#v3PortfolioReconcileStatus");
  const btn = document.querySelector("#v3PortfolioReconcileRefresh");
  if (!alvo) return;
  if (btn) btn.disabled = true;
  try {
    const configurada = v3State.integracoes?.belvo?.configurada === true;
    if (!configurada) {
      alvo.textContent = "Belvo não configurada. Verificando o que o Pierre disponibiliza, sem alterar a carteira…";
      try {
        const diagnostico = await v3Api("/api/investments/pierre-capabilities");
        alvo.innerHTML = `<strong>Pierre — conferência automática</strong>
          <div class="v3-reconcile-results">
            <span>${Number(diagnostico.contasInvestimento || 0)} conta(s) de investimento</span>
            <span>${Number(diagnostico.contasComSaldo || 0)} conta(s) com saldo</span>
            <span>${Number(diagnostico.posicoesDetalhadas || 0)} posição(ões) detalhadas</span>
          </div>
          <p>${v3Escapar(diagnostico.diagnostico || "Disponibilidade desconhecida.")}</p>
          <small>Conexão Nubank/Belvo não configurada. Nenhuma quantidade, preço médio, compra ou dividendo foi modificado. A busca de proventos é uma conferência assistida no botão “Procurar proventos no Pierre”.</small>`;
      } catch (erroPierre) {
        alvo.textContent = "Sem conexão detalhada Nubank/Belvo. Diagnóstico Pierre indisponível: " + erroPierre.message + ". Todos os dados cadastrados foram preservados.";
      }
      return;
    }
    alvo.textContent = "Conferindo posições do conector, sem gravar alterações…";
    const dados = await v3Api("/api/v3/integracoes/belvo/investimentos/preview");
    const remotas = Array.isArray(dados.reconhecidos) ? dados.reconhecidos : [];
    const locais = v3State.investimentos.posicoes || [];
    const divergentes = [];
    const novos = [];
    let iguais = 0;
    for (const item of remotas) {
      if (!item.ticker || !Number.isFinite(Number(item.quantidade)) || Number(item.quantidade) <= 0) continue;
      const atual = locais.find(p => String(p.ticker).toUpperCase() === String(item.ticker).toUpperCase());
      if (!atual) { novos.push(item.ticker); continue; }
      if (Math.abs(Number(atual.quantidade) - Number(item.quantidade)) > 0.000001) {
        divergentes.push({ticker:item.ticker,local:Number(atual.quantidade),remota:Number(item.quantidade)});
      } else iguais++;
    }
    const pendentes = Array.isArray(dados.pendentesMapeamento) ? dados.pendentesMapeamento.length : 0;
    alvo.innerHTML = `<strong>Última conferência: ${v3Escapar(new Date().toLocaleString("pt-BR"))}</strong>
      <div class="v3-reconcile-results">
      <span>${iguais} posição(ões) compatíveis</span>
      <span>${divergentes.length} divergência(s)</span>
      <span>${novos.length} ativo(s) não cadastrado(s)</span>
      <span>${pendentes} sem identificação suficiente</span></div>
      ${divergentes.length ? `<p>Diferenças (sem alterações): ${divergentes.slice(0, 12).map(d => `${v3Escapar(d.ticker)} — cadastrado ${v3Numero(d.local,4)}, fonte ${v3Numero(d.remota,4)}`).join("; ")}</p>` : ""}
      ${novos.length ? `<p>Encontrados apenas na fonte: ${novos.slice(0, 12).map(v3Escapar).join(", ")}.</p>` : ""}
      <small>Conferência de quantidade, não de compras históricas, custo ou dividendos. Nada foi salvo.</small>`;
  } catch (erro) {
    alvo.textContent = "Conferência indisponível: " + erro.message + ". Seus registros foram mantidos.";
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function v3CarregarInvestimentos() {
  const status = document.querySelector("#v3InvestStatus");
  try {
    try {
      await v3Api("/api/v3/investimentos/bootstrap", { method: "POST" });
    } catch (erroBootstrap) {
      if (!String(erroBootstrap.message).includes("schema")) throw erroBootstrap;
    }

    const dados = await v3Api("/api/v3/investimentos");
    v3State.investimentos.posicoes = dados.posicoes || [];
    v3State.investimentos.operacoes = dados.operacoes || [];
    v3State.investimentos.dividendos = dados.dividendos || [];

    if (status) {
      status.className = "v3-note";
      status.textContent = "Carteira Nubank carregada. Cotações são consultadas separadamente e nunca substituídas por valores fictícios.";
    }

    const tickers = [...new Set(v3State.investimentos.posicoes.map(p => p.ticker).filter(Boolean))];
    // Preserve the last valid quotes when the provider is temporarily unavailable.
    const cotacoesAnteriores = new Map(v3State.investimentos.cotacoes);

    if (tickers.length) {
      const falhas = [];
      try {
        const lote = await v3Api(`/api/v3/mercado-cotacoes?tickers=${encodeURIComponent(tickers.join(","))}`);
        (lote.cotacoes || []).forEach(cotacao => {
          if (cotacao?.ticker && Number(cotacao.precoAtual) > 0) {
            v3State.investimentos.cotacoes.set(cotacao.ticker, cotacao);
          }
        });
      } catch (erroLote) {
        console.warn("Consulta em lote indisponível; tentando ativos separadamente:", erroLote);
      }
      const pendentes = tickers.filter(t => !Number(v3State.investimentos.cotacoes.get(t)?.precoAtual));
      const resultados = await Promise.allSettled(
        pendentes.map(t => v3Api(`/api/v3/mercado/${encodeURIComponent(t)}?periodo=1M`)),
      );
      resultados.forEach((resultado, i) => {
        const ticker = pendentes[i];
        if (resultado.status === "fulfilled" && Number(resultado.value?.precoAtual) > 0) {
          v3State.investimentos.cotacoes.set(ticker, resultado.value);
        } else {
          const anterior = cotacoesAnteriores.get(ticker);
          if (Number(anterior?.precoAtual) > 0) {
            v3State.investimentos.cotacoes.set(ticker, { ...anterior, atrasada: true });
          }
          falhas.push(ticker);
        }
      });
      if (falhas.length && status) {
        status.className = "v3-note v3-warning";
        status.textContent = `Cotações pendentes: ${falhas.join(", ")}. Os demais ativos foram atualizados; preços anteriores, quando disponíveis, estão marcados como atrasados.`;
      }
    }

    v3State.atualizacao.investimentosEm = new Date().toISOString();
    v3RenderizarInvestimentos();
    await v3AtualizarDashboard();
  } catch (erro) {
    if (status) {
      status.className = "v3-note v3-warning";
      status.textContent = erro.message.includes("schema")
        ? "A estrutura de investimentos não está disponível no banco. Nenhum valor foi inventado."
        : erro.message;
    }
    v3RenderizarInvestimentos();
  }
}


function v3DataCurta(valor) {
  if (!valor) return "—";
  const data = new Date(String(valor).length === 10 ? `${valor}T12:00:00` : valor);
  return Number.isNaN(data.getTime()) ? String(valor) : data.toLocaleDateString("pt-BR");
}

function v3RenderizarDistribuicaoInvestimentos() {
  const alvo = document.querySelector("#v3PortfolioDistribution");
  const meta = document.querySelector("#v3AllocationMeta");
  if (!alvo) return;

  const posicoes = v3State.investimentos.posicoes || [];
  if (!posicoes.length) {
    alvo.innerHTML = '<div class="v3-history-empty">Nenhuma posição para distribuir.</div>';
    if (meta) meta.textContent = "Cadastre posições para visualizar a distribuição.";
    return;
  }

  const todasComCotacao = posicoes.every(p =>
    Number(v3State.investimentos.cotacoes.get(p.ticker)?.precoAtual || 0) > 0
  );

  const itens = posicoes.map(p => {
    const quantidade = Number(p.quantidade || 0);
    const cotacao = Number(v3State.investimentos.cotacoes.get(p.ticker)?.precoAtual || 0);
    const precoBase = todasComCotacao ? cotacao : Number(p.preco_medio || 0);
    return {
      ticker: p.ticker,
      classe: p.classe || "OUTRO",
      valor: Math.max(0, quantidade * precoBase),
    };
  });

  const total = itens.reduce((soma, item) => soma + item.valor, 0);
  const classes = new Map();
  itens.forEach(item => classes.set(item.classe, (classes.get(item.classe) || 0) + item.valor));

  const linha = (nome, valor) => {
    const percentual = total > 0 ? (valor / total) * 100 : 0;
    return `<div class="v3-allocation-row">
      <strong>${v3Escapar(nome)}</strong>
      <div class="v3-allocation-track"><div class="v3-allocation-fill" style="width:${percentual.toFixed(2)}%"></div></div>
      <span class="meta">${percentual.toFixed(1)}% · ${v3Dinheiro(valor)}</span>
    </div>`;
  };

  alvo.innerHTML =
    '<div class="v3-subtitle">Por classe</div>' +
    [...classes.entries()].sort((a,b) => b[1]-a[1]).map(([nome,valor]) => linha(nome,valor)).join("") +
    '<div class="v3-subtitle">Por ativo</div>' +
    itens.sort((a,b) => b.valor-a.valor).map(item => linha(item.ticker,item.valor)).join("");

  if (meta) {
    meta.textContent = todasComCotacao
      ? "Distribuição pelo valor de mercado disponível."
      : "Nem todos os ativos têm cotação disponível; distribuição usando custo cadastrado para manter consistência.";
  }
}

function v3RenderizarHistoricoInvestimentos() {
  const operacoesAlvo = document.querySelector("#v3OperationHistory");
  const dividendosAlvo = document.querySelector("#v3DividendHistory");

  const operacoes = [...(v3State.investimentos.operacoes || [])]
    .sort((a,b) => String(b.data || "").localeCompare(String(a.data || "")))
    .slice(0, 30);

  if (operacoesAlvo) {
    operacoesAlvo.innerHTML = operacoes.length
      ? `<table class="v3-mini-table">
          <thead><tr><th>Data</th><th>Ticker</th><th>Tipo</th><th>Origem</th><th>Quantidade</th><th>Preço</th><th>Taxas</th><th>Total</th></tr></thead>
          <tbody>${operacoes.map(op => {
            const qtd = Number(op.quantidade || 0);
            const preco = Number(op.preco_unitario || 0);
            const taxas = Number(op.taxas || 0);
            const total = qtd * preco + (String(op.tipo).toUpperCase() === "COMPRA" ? taxas : -taxas);
            return `<tr>
              <td>${v3DataCurta(op.data)}</td>
              <td><strong>${v3Escapar(op.ticker)}</strong></td>
              <td>${v3Escapar(op.tipo)}</td>
              <td>${op.origem_recursos === "DIVIDENDOS" ? "♻ Dividendos" : "Aporte"}</td>
              <td>${v3Numero(qtd,4)}</td>
              <td>${v3Dinheiro(preco)}</td>
              <td>${v3Dinheiro(taxas)}</td>
              <td>${v3Dinheiro(total)}</td>
            </tr>`;
          }).join("")}</tbody>
        </table>`
      : '<div class="v3-history-empty">Nenhuma compra ou venda registrada ainda.</div>';
  }

  if (dividendosAlvo) {
    const manuais = [...(v3State.investimentos.dividendos || [])]
      .sort((a,b) => String(b.data_pagamento || "").localeCompare(String(a.data_pagamento || "")))
      .slice(0, 20);

    const eventosMercado = Array.isArray(v3State.mercado.dados?.dividendos)
      ? v3State.mercado.dados.dividendos.slice(0, 8)
      : [];

    const manualHtml = manuais.length
      ? `<div class="v3-subtitle">Registrados no Meu Financeiro</div>
        <div class="v3-scroll"><table class="v3-mini-table">
          <thead><tr><th>Data</th><th>Ticker</th><th>Valor</th><th>Status</th></tr></thead>
          <tbody>${manuais.map(d => {
            const recebido = d.recebido !== false;
            const status = recebido ? "Recebido" : "Anunciado";
            return `<tr>
              <td>${v3DataCurta(d.data_pagamento)}</td>
              <td><strong>${v3Escapar(d.ticker)}</strong></td>
              <td>${v3Dinheiro(d.valor)}</td>
              <td><span class="v3-status-pill ${recebido ? "received" : "announced"}">${status}</span></td>
            </tr>`;
          }).join("")}</tbody>
        </table></div>`
      : '<div class="v3-history-empty">Nenhum dividendo manual registrado.</div>';

    const avisoMercado = v3State.mercado.dados?.avisoPlano || "";
    const mercadoHtml = eventosMercado.length
      ? `<div class="v3-subtitle">Eventos retornados pela Brapi · ${v3Escapar(v3State.mercado.ticker)}</div>
        <div class="v3-scroll"><table class="v3-mini-table">
          <thead><tr><th>Data</th><th>Valor por cota/ação</th><th>Observação</th></tr></thead>
          <tbody>${eventosMercado.map(e => {
            const data = e.paymentDate || e.lastDatePrior || e.approvedOn || e.date || null;
            const valor = Number(e.rate ?? e.value ?? e.cashAmount ?? e.dividend ?? 0);
            const nota = e.label || e.type || e.relatedTo || "Evento de provento";
            return `<tr><td>${v3DataCurta(data)}</td><td>${valor ? v3Dinheiro(valor) : "Não informado"}</td><td>${v3Escapar(nota)}</td></tr>`;
          }).join("")}</tbody>
        </table></div>`
      : `<div class="v3-note" style="margin-top:12px">${v3Escapar(
          avisoMercado ||
          "Dividendos automáticos não estão disponíveis na fonte/plano atual. Você ainda pode registrar os dividendos manualmente."
        )}</div>`;

    dividendosAlvo.innerHTML = manualHtml + mercadoHtml;
  }
}

function v3RenderizarEvolucaoAportes() {
  const alvo = document.querySelector("#v3ContributionEvolution");
  if (!alvo) return;

  const operacoes = [...(v3State.investimentos.operacoes || [])]
    .sort((a,b) => String(a.data || "").localeCompare(String(b.data || "")));

  if (!operacoes.length) {
    alvo.innerHTML = '<div class="v3-history-empty">Sem operações suficientes para calcular a evolução dos aportes.</div>';
    return;
  }

  let acumulado = 0;
  const pontos = operacoes.map(op => {
    const bruto = Number(op.quantidade || 0) * Number(op.preco_unitario || 0);
    const taxas = Number(op.taxas || 0);
    if (String(op.tipo).toUpperCase() === "COMPRA") acumulado += bruto + taxas;
    if (String(op.tipo).toUpperCase() === "VENDA") acumulado -= Math.max(0, bruto - taxas);
    return { data: op.data, valor: acumulado };
  });

  const max = Math.max(1, ...pontos.map(p => Math.max(0,p.valor)));
  alvo.innerHTML = `
    <div class="v3-row-between"><span class="meta">Capital líquido registrado</span><strong>${v3Dinheiro(acumulado)}</strong></div>
    <div class="v3-contribution-bars" aria-label="Evolução dos aportes">
      ${pontos.map(p => `<span title="${v3DataCurta(p.data)} · ${v3Dinheiro(p.valor)}" style="height:${Math.max(3,(Math.max(0,p.valor)/max)*100)}%"></span>`).join("")}
    </div>`;
}

function v3RenderizarHistoricoMoedas() {
  const alvo = document.querySelector("#v3FxHistory");
  if (!alvo) return;

  const linhas = [];
  for (const conta of v3State.moedas.contas || []) {
    for (const tx of conta.transacoes || []) {
      linhas.push({ ...tx, contaNome: conta.nome || conta.instituicao });
    }
  }

  linhas.sort((a,b) => String(b.data || "").localeCompare(String(a.data || "")));
  alvo.innerHTML = linhas.length
    ? `<table class="v3-mini-table">
        <thead><tr><th>Data</th><th>Conta</th><th>Tipo</th><th>USD</th><th>R$ histórico</th><th>Cotação efetiva</th><th>IOF + tarifas</th></tr></thead>
        <tbody>${linhas.slice(0,40).map(tx => `<tr>
          <td>${v3DataCurta(tx.data)}</td>
          <td>${v3Escapar(tx.contaNome)}</td>
          <td>${v3Escapar(String(tx.tipo || "").replaceAll("_"," "))}</td>
          <td>${v3Dinheiro(tx.quantidade_usd || 0,"USD")}</td>
          <td>${v3Dinheiro(tx.total_brl || 0)}</td>
          <td>${tx.cotacao_efetiva ? `R$ ${v3Numero(tx.cotacao_efetiva,4)}` : "—"}</td>
          <td>${v3Dinheiro(Number(tx.iof || 0)+Number(tx.tarifas || 0))}</td>
        </tr>`).join("")}</tbody>
      </table>`
    : '<div class="v3-history-empty">Nenhuma movimentação em dólar registrada.</div>';
}

function v3RenderizarTabelaInvestimentos() {
  const alvo = document.querySelector("#v3InvestmentTable");
  const status = document.querySelector("#v3InvestAutoStatus");
  if (!alvo) return;

  const posicoes = v3State.investimentos.posicoes || [];

  if (!posicoes.length) {
    alvo.innerHTML = '<div class="v3-history-empty">Nenhuma posição cadastrada.</div>';
    return;
  }

  alvo.innerHTML = `
    <table class="v3-mini-table v3-market-table">
      <thead>
        <tr>
          <th>Ativo</th>
          <th>Classe</th>
          <th>Qtd.</th>
          <th>Preço médio</th>
          <th>Total investido</th>
          <th>Cotação</th>
          <th>Var. dia</th>
          <th>Valor atual</th>
          <th>Resultado</th>
          <th>Atualização</th>
        </tr>
      </thead>
      <tbody>
        ${posicoes.map((posicao) => {
          const qtd = Number(posicao.quantidade || 0);
          const pm = Number(posicao.preco_medio || 0);
          const cotacao = v3State.investimentos.cotacoes.get(posicao.ticker);
          const preco = Number(cotacao?.precoAtual || 0);
          const valorAtual = preco > 0 ? qtd * preco : 0;
          const custo = qtd * pm;
          const resultado = preco > 0 ? valorAtual - custo : null;
          const variacaoPct = Number(cotacao?.variacaoPercentual || 0);
          const atualizado = cotacao?.atualizadoEm
            ? new Date(cotacao.atualizadoEm).toLocaleString("pt-BR")
            : "—";

          return `
            <tr>
              <td><button type="button" class="v3-table-ticker" data-v3-table-ticker="${v3Escapar(posicao.ticker)}"><strong>${v3Escapar(posicao.ticker)}</strong></button></td>
              <td>${v3Escapar(posicao.classe || "OUTRO")}</td>
              <td>${v3Numero(qtd, 4)}</td>
              <td>${v3Dinheiro(pm)}</td>
              <td class="v3-cost-cell">${v3Dinheiro(custo)}</td>
              <td>${preco > 0 ? v3Dinheiro(preco) : "Indisponível"}</td>
              <td class="${preco > 0 ? v3ClasseVariacao(variacaoPct) : ""}">
                ${preco > 0 ? `${variacaoPct >= 0 ? "+" : ""}${v3Numero(variacaoPct, 2)}%` : "—"}
              </td>
              <td>${preco > 0 ? v3Dinheiro(valorAtual) : "—"}</td>
              <td class="${resultado == null ? "" : v3ClasseVariacao(resultado)}">
                ${resultado == null ? "—" : `${resultado >= 0 ? "+" : ""}${v3Dinheiro(resultado)}`}
              </td>
              <td class="meta">${v3Escapar(atualizado)}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

  alvo.querySelectorAll("[data-v3-table-ticker]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ticker = btn.dataset.v3TableTicker;
      const input = document.querySelector("#v3TickerInput");
      if (input) input.value = ticker;
      v3BuscarMercado(ticker, v3State.mercado.periodo);
    });
  });

  if (status) {
    const data = v3State.atualizacao.investimentosEm
      ? new Date(v3State.atualizacao.investimentosEm).toLocaleTimeString("pt-BR")
      : "—";
    status.textContent = `● Automática · 15 min · última ${data} · Brapi ~30 min de atraso no plano atual`;
  }
}

function v3RenderizarInvestimentos() {
  const posicoes = v3State.investimentos.posicoes || [];
  let custo = 0;
  let mercado = 0;

  const lista = document.querySelector("#v3Holdings");
  if (lista) {
    lista.innerHTML = posicoes.length
      ? posicoes.map(posicao => {
          const qtd = Number(posicao.quantidade || 0);
          const pm = Number(posicao.preco_medio || 0);
          const quote = v3State.investimentos.cotacoes.get(posicao.ticker);
          const atual = Number(quote?.precoAtual || 0);
          const valorCusto = qtd * pm;
          const valorAtual = atual ? qtd * atual : 0;
          custo += valorCusto;
          if (atual) mercado += valorAtual;
          const retorno = atual ? valorAtual - valorCusto : null;
          return `
            <div class="v3-holding">
              <div class="v3-holding-head">
                <div><button type="button" data-v3-ticker="${v3Escapar(posicao.ticker)}"><strong>${v3Escapar(posicao.ticker)}</strong></button><div class="meta">${v3Escapar(posicao.classe || "OUTRO")} · Nubank</div></div>
                <div style="text-align:right"><strong>${atual ? v3Dinheiro(valorAtual) : "Cotação indisponível"}</strong><div class="meta ${retorno == null ? "" : v3ClasseVariacao(retorno)}">${retorno == null ? "" : `${retorno >= 0 ? "+" : ""}${v3Dinheiro(retorno)}`}</div></div>
              </div>
              <div class="meta" style="margin-top:8px">${v3Numero(qtd, 4)} cota(s) · PM ${v3Dinheiro(pm)} · <strong class="v3-holding-paid">Total investido ${v3Dinheiro(valorCusto)}</strong>${atual ? ` · Cotação ${v3Dinheiro(atual)}` : ""}</div>
            </div>`;
        }).join("")
      : '<div class="v3-note">Nenhuma posição cadastrada.</div>';

    lista.querySelectorAll("[data-v3-ticker]").forEach(btn => btn.addEventListener("click", () => {
      const ticker = btn.dataset.v3Ticker;
      const input = document.querySelector("#v3TickerInput");
      if (input) input.value = ticker;
      v3BuscarMercado(ticker, v3State.mercado.periodo);
    }));
  } else {
    posicoes.forEach(posicao => {
      const qtd = Number(posicao.quantidade || 0);
      const pm = Number(posicao.preco_medio || 0);
      const quote = v3State.investimentos.cotacoes.get(posicao.ticker);
      custo += qtd * pm;
      if (quote?.precoAtual) mercado += qtd * Number(quote.precoAtual);
    });
  }

  const dividendos = (v3State.investimentos.dividendos || [])
    .filter(d => d.recebido !== false)
    .reduce((s, d) => s + Number(d.valor || 0), 0);

  const completas = posicoes.length > 0 && posicoes.every(p => Number(v3State.investimentos.cotacoes.get(p.ticker)?.precoAtual || 0) > 0);
  const total = completas ? mercado : null;
  const retorno = completas ? mercado - custo : null;
  const retornoPct = completas && custo ? (retorno / custo) * 100 : null;

  const totalEl = document.querySelector("#v3InvestTotal");
  const costEl = document.querySelector("#v3InvestCost");
  const returnEl = document.querySelector("#v3InvestReturn");
  const divEl = document.querySelector("#v3InvestDividends");

  if (totalEl) totalEl.textContent = completas ? v3Dinheiro(total) : "Parcial · cotações pendentes";
  if (costEl) costEl.textContent = v3Dinheiro(custo);
  if (returnEl) {
    returnEl.textContent = completas ? `${v3Dinheiro(retorno)} (${retornoPct.toFixed(2)}%)` : "Indisponível · cotações pendentes";
    returnEl.className = completas ? v3ClasseVariacao(retorno) : "";
  }
  if (divEl) divEl.textContent = v3Dinheiro(dividendos);

  // Reinvestimento é uma compra REAL registrada como paga com proventos,
  // não valorização de mercado, promessa de rendimento ou ordem automática.
  const reinvestido = (v3State.investimentos.operacoes || [])
    .filter(op => op.tipo === "COMPRA" && op.origem_recursos === "DIVIDENDOS")
    .reduce((s, op) => s + Number(op.quantidade || 0) * Number(op.preco_unitario || 0) + Number(op.taxas || 0), 0);
  const disponivel = Math.max(0, dividendos - reinvestido);
  const percentual = dividendos > 0 ? Math.min(100, Math.round(reinvestido / dividendos * 100)) : 0;
  const reinvestEl = document.querySelector("#v3InvestReinvested");
  const availableEl = document.querySelector("#v3InvestAvailable");
  const barEl = document.querySelector("#v3ReinvestBar");
  const barContainer = barEl?.parentElement;
  const hintEl = document.querySelector("#v3ReinvestHint");
  if (reinvestEl) reinvestEl.textContent = v3Dinheiro(reinvestido);
  if (availableEl) availableEl.textContent = v3Dinheiro(disponivel);
  if (barEl) barEl.style.width = percentual + "%";
  if (barContainer) barContainer.setAttribute("aria-valuenow", String(percentual));
  if (hintEl) hintEl.textContent = dividendos > 0
    ? `${percentual}% dos dividendos recebidos foram reinvestidos em compras registradas. Saldo informativo, não saldo bancário disponível.`
    : "Ainda não há dividendos recebidos registrados. Eventos anunciados não entram nesse total.";

  v3RenderizarTabelaInvestimentos();
  v3RenderizarDistribuicaoInvestimentos();
  v3RenderizarHistoricoInvestimentos();
  v3RenderizarEvolucaoAportes();
}

async function v3CarregarIntegracoes() {
  try {
    v3State.integracoes = await v3Api("/api/v3/integracoes");
  } catch (erro) {
    v3State.integracoes = {
      erro: erro.message,
      wise: { configurada: false, modo: "MANUAL" },
      belvo: { configurada: false, modo: "MANUAL" },
    };
  }

  v3RenderizarIntegracoes();
}

function v3RenderizarIntegracoes() {
  const dados = v3State.integracoes || {};
  const wise = dados.wise || {};
  const belvo = dados.belvo || {};

  const wiseStatus = document.querySelector("#v3WiseStatus");
  const wiseDetail = document.querySelector("#v3WiseDetail");
  const wiseBtn = document.querySelector("#v3SyncWise");

  if (wiseStatus) {
    wiseStatus.textContent = wise.configurada
      ? "API configurada"
      : "Modo manual";
    wiseStatus.className = wise.configurada ? "v3-positive" : "";
  }
  if (wiseDetail) {
    wiseDetail.textContent = wise.observacao ||
      "Sem credencial compatível; o saldo pode ser controlado manualmente.";
  }
  if (wiseBtn) {
    wiseBtn.disabled = !wise.configurada;
    wiseBtn.textContent = wise.configurada ? "Sincronizar Wise" : "Wise manual";
  }

  const belvoStatus = document.querySelector("#v3BelvoStatus");
  const belvoDetail = document.querySelector("#v3BelvoDetail");
  const belvoBtn = document.querySelector("#v3SyncBelvo");

  if (belvoStatus) {
    belvoStatus.textContent = belvo.configurada
      ? "Belvo configurada"
      : "Carteira manual";
    belvoStatus.className = belvo.configurada ? "v3-positive" : "";
  }
  if (belvoDetail) {
    belvoDetail.textContent = belvo.observacao ||
      "Sem conector Open Finance; posições continuam no Supabase e cotações na Brapi.";
  }
  if (belvoBtn) {
    belvoBtn.disabled = !belvo.configurada;
    belvoBtn.textContent = belvo.configurada ? "Sincronizar Nubank" : "Nubank manual";
  }
}

async function v3SincronizarWise() {
  const botao = document.querySelector("#v3SyncWise");
  if (!botao || botao.disabled) return;

  const texto = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Sincronizando...";

  try {
    const resultado = await v3Api("/api/v3/integracoes/wise/sincronizar", {
      method: "POST",
    });

    const quantidade = Array.isArray(resultado.contas) ? resultado.contas.length : 0;
    const status = document.querySelector("#v3FxStatus");
    if (status) {
      status.className = "v3-note";
      status.textContent = `Wise sincronizada: ${quantidade} saldo(s) USD atualizado(s) sem alterar o custo histórico.`;
    }

    await v3CarregarMoedas();
  } catch (erro) {
    alert(`Não foi possível sincronizar a Wise:\n\n${erro.message}`);
  } finally {
    botao.disabled = false;
    botao.textContent = texto;
    v3RenderizarIntegracoes();
  }
}

async function v3SincronizarBelvo() {
  const botao = document.querySelector("#v3SyncBelvo");
  if (!botao || botao.disabled) return;

  const texto = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Sincronizando...";

  try {
    const resultado = await v3Api("/api/v3/integracoes/belvo/investimentos/sincronizar", {
      method: "POST",
    });

    const sincronizados = Array.isArray(resultado.sincronizados)
      ? resultado.sincronizados.length
      : 0;
    const pendentes = Array.isArray(resultado.pendentesMapeamento)
      ? resultado.pendentesMapeamento.length
      : 0;

    const status = document.querySelector("#v3InvestStatus");
    if (status) {
      status.className = pendentes ? "v3-note v3-warning" : "v3-note";
      status.textContent =
        `Belvo: ${sincronizados} posição(ões) sincronizada(s)` +
        (pendentes ? ` · ${pendentes} investimento(s) aguardando identificação segura do ticker.` : ".");
    }

    await v3CarregarInvestimentos();
  } catch (erro) {
    alert(`Não foi possível sincronizar os investimentos da Nubank:\n\n${erro.message}`);
  } finally {
    botao.disabled = false;
    botao.textContent = texto;
    v3RenderizarIntegracoes();
  }
}

async function v3CarregarMoedas() {
  const status = document.querySelector("#v3FxStatus");
  const [ptax, contas] = await Promise.allSettled([
    v3Api("/api/v3/moedas/usdbrl"),
    v3Api("/api/v3/moedas/contas"),
  ]);

  if (ptax.status === "fulfilled") v3State.moedas.ptax = ptax.value.cotacao;
  if (contas.status === "fulfilled") v3State.moedas.contas = contas.value.contas || [];

  if (status) {
    if (contas.status === "rejected") {
      status.className = "v3-note v3-warning";
      status.textContent = contas.reason.message.includes("schema")
        ? "Cotação USD/BRL disponível, mas a estrutura dos bancos internacionais não está disponível no banco."
        : contas.reason.message;
    } else {
      status.className = "v3-note";
      status.textContent = "Bancos internacionais carregados. O saldo é manual, o custo histórico fica preservado e o valor em reais acompanha a cotação USD/BRL.";
    }
  }

  v3State.atualizacao.cambioEm = new Date().toISOString();
  v3RenderizarMoedas();
  await v3AtualizarDashboard();
}

function v3ClasseBancoInternacional(instituicao) {
  const banco = String(instituicao || "").trim().toLowerCase();
  if (banco.includes("revolut")) return "v3-bank-revolut";
  if (banco.includes("wise")) return "v3-bank-wise";
  if (banco.includes("nomad")) return "v3-bank-nomad";
  return "v3-bank-generic";
}

function v3ContaMoedaSelecionada() {
  const contaId = document.querySelector("#v3FxMovementAccount")?.value;
  return (v3State.moedas.contas || []).find(
    (conta) => String(conta.id) === String(contaId),
  ) || null;
}

function v3AtualizarFormularioMoeda() {
  const form = document.querySelector("#v3FxMovementForm");
  if (!form) return;

  const tipo = String(form.elements.tipo?.value || "COMPRA").toUpperCase();
  const titulo = document.querySelector("#v3FxMovementTitle");
  const ajuda = document.querySelector("#v3FxMovementHelp");
  const labelBrl = document.querySelector("#v3FxBrlLabel");
  const hintBrl = document.querySelector("#v3FxBrlHint");
  const botao = document.querySelector("#v3FxMovementSubmit");

  const textos = {
    COMPRA: {
      titulo: "Registrar compra de dólar",
      ajuda: "Informe exatamente os valores da compra. O app calcula o custo efetivo e o novo preço médio.",
      label: "Valor convertido em R$",
      hint: "Valor da conversão antes de IOF e tarifas.",
      botao: "Registrar compra de dólar",
    },
    VENDA: {
      titulo: "Registrar venda de dólar",
      ajuda: "Informe quantos dólares vendeu e quanto recebeu em reais.",
      label: "Valor recebido em R$",
      hint: "Valor recebido pela venda. IOF/tarifas podem ser informados separadamente.",
      botao: "Registrar venda",
    },
    GASTO: {
      titulo: "Registrar gasto em dólar",
      ajuda: "Informe apenas os dólares gastos. O saldo e o custo histórico são reduzidos pelo custo médio atual.",
      label: "Valor de referência em R$",
      hint: "Opcional para gastos. Pode deixar R$ 0,00.",
      botao: "Registrar gasto",
    },
    AJUSTE_ENTRADA: {
      titulo: "Ajustar saldo para cima",
      ajuda: "Use somente para corrigir um saldo que não veio de uma compra registrada.",
      label: "Custo histórico em R$",
      hint: "Informe o custo histórico correspondente aos dólares adicionados.",
      botao: "Adicionar ajuste",
    },
    AJUSTE_SAIDA: {
      titulo: "Ajustar saldo para baixo",
      ajuda: "Use somente para corrigir uma diferença de saldo.",
      label: "Valor de referência em R$",
      hint: "Opcional para ajuste de saída.",
      botao: "Remover ajuste",
    },
  };

  const texto = textos[tipo] || textos.COMPRA;
  if (titulo) titulo.textContent = texto.titulo;
  if (ajuda) ajuda.textContent = texto.ajuda;
  if (labelBrl) labelBrl.textContent = texto.label;
  if (hintBrl) hintBrl.textContent = texto.hint;
  if (botao) botao.textContent = texto.botao;

  v3AtualizarPreviewCompraDolar();
}

function v3AtualizarPreviewCompraDolar() {
  const form = document.querySelector("#v3FxMovementForm");
  const preview = document.querySelector("#v3FxPurchasePreview");
  if (!form || !preview) return;

  const tipo = String(form.elements.tipo?.value || "COMPRA").toUpperCase();
  const quantidadeUsd = Math.max(0, Number(form.elements.quantidadeUsd?.value || 0));
  const totalBrl = Math.max(0, Number(form.elements.totalBrl?.value || 0));
  const iof = Math.max(0, Number(form.elements.iof?.value || 0));
  const tarifas = Math.max(0, Number(form.elements.tarifas?.value || 0));

  const totalEl = document.querySelector("#v3FxPreviewTotal");
  const rateEl = document.querySelector("#v3FxPreviewRate");
  const averageEl = document.querySelector("#v3FxPreviewAverage");

  const conta = v3ContaMoedaSelecionada();
  const saldoAtual = Number(conta?.saldoUsd || 0);
  const custoAtual = Number(conta?.custoBaseBrl || 0);

  if (tipo !== "COMPRA" && tipo !== "AJUSTE_ENTRADA") {
    preview.classList.add("is-secondary");

    if (totalEl) totalEl.textContent =
      totalBrl > 0 ? v3Dinheiro(totalBrl) : "—";
    if (rateEl) rateEl.textContent =
      quantidadeUsd > 0 && totalBrl > 0
        ? `R$ ${v3Numero(totalBrl / quantidadeUsd, 4)}/USD`
        : "—";
    if (averageEl) averageEl.textContent =
      conta ? `Atual: R$ ${v3Numero(conta.custoMedio || 0, 4)}/USD` : "—";
    return;
  }

  preview.classList.remove("is-secondary");

  const custoCompra = totalBrl + iof + tarifas;
  const cotacaoEfetiva =
    quantidadeUsd > 0 && custoCompra > 0
      ? custoCompra / quantidadeUsd
      : 0;
  const novoSaldo = saldoAtual + quantidadeUsd;
  const novoCusto = custoAtual + custoCompra;
  const novoCustoMedio =
    novoSaldo > 0 && novoCusto > 0
      ? novoCusto / novoSaldo
      : 0;

  if (totalEl) totalEl.textContent = v3Dinheiro(custoCompra);
  if (rateEl) rateEl.textContent =
    cotacaoEfetiva > 0
      ? `R$ ${v3Numero(cotacaoEfetiva, 4)}/USD`
      : "—";
  if (averageEl) averageEl.textContent =
    novoCustoMedio > 0
      ? `R$ ${v3Numero(novoCustoMedio, 4)}/USD`
      : "—";
}

function v3RenderizarTabelaMoedas() {
  const alvo = document.querySelector("#v3FxTable");
  const status = document.querySelector("#v3FxAutoStatus");
  if (!alvo) return;

  const contas = v3State.moedas.contas || [];
  const cotacaoDados = v3State.moedas.ptax;
  const cotacao = Number(cotacaoDados?.meio || 0);

  if (!contas.length) {
    alvo.innerHTML = '<div class="v3-history-empty">Nenhum banco internacional cadastrado.</div>';
  } else {
    alvo.innerHTML = `
      <table class="v3-mini-table v3-market-table">
        <thead>
          <tr>
            <th>Banco</th>
            <th>Saldo USD</th>
            <th>Custo médio</th>
            <th>Custo histórico</th>
            <th>USD/BRL atual</th>
            <th>Valor atual em R$</th>
            <th>Variação</th>
            <th>Fonte</th>
          </tr>
        </thead>
        <tbody>
          ${contas.map((conta) => {
            const saldo = Number(conta.saldoUsd || 0);
            const custoMedio = Number(conta.custoMedio || 0);
            const custoHistorico = Number(conta.custoBaseBrl || 0);
            const custoCompleto = conta.custoHistoricoCompleto !== false;
            const valorAtual = cotacao > 0 ? saldo * cotacao : 0;
            const variacao = cotacao > 0 && custoCompleto
              ? valorAtual - custoHistorico
              : null;

            return `
              <tr>
                <td>
                  <strong>${v3Escapar(conta.nome || conta.instituicao)}</strong>
                  <div class="meta">${v3Escapar(conta.instituicao)}</div>
                </td>
                <td>${v3Dinheiro(saldo, "USD")}</td>
                <td>${custoCompleto ? `R$ ${v3Numero(custoMedio, 4)}` : "Parcial"}</td>
                <td>${custoCompleto ? v3Dinheiro(custoHistorico) : "Parcial"}</td>
                <td>${cotacao > 0 ? `R$ ${v3Numero(cotacao, 4)}` : "—"}</td>
                <td>${cotacao > 0 ? v3Dinheiro(valorAtual) : "—"}</td>
                <td class="${variacao == null ? "" : v3ClasseVariacao(variacao)}">
                  ${variacao == null ? "—" : `${variacao >= 0 ? "+" : ""}${v3Dinheiro(variacao)}`}
                </td>
                <td class="meta">${v3Escapar(cotacaoDados?.fonte || "—")}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  if (status) {
    const data = cotacaoDados?.atualizadoEm
      ? new Date(cotacaoDados.atualizadoEm).toLocaleTimeString("pt-BR")
      : "—";
    const fallback = cotacaoDados?.fallback ? " · fallback PTAX" : "";
    status.textContent = `● Automática · 1 min · cotação ${data}${fallback}`;
  }
}

function v3RenderizarMoedas() {
  const contas = v3State.moedas.contas || [];
  const ptax = v3State.moedas.ptax;
  const cotacao = Number(ptax?.meio || 0);

  let usd = 0;
  let custo = 0;
  let custoCompleto = true;

  contas.forEach(c => {
    usd += Number(c.saldoUsd || 0);
    custo += Number(c.custoBaseBrl || 0);
    if (c.custoHistoricoCompleto === false) custoCompleto = false;
  });

  const hoje = usd * cotacao;
  const variacao = cotacao && custoCompleto ? hoje - custo : null;

  const total = document.querySelector("#v3UsdTotal");
  const hojeEl = document.querySelector("#v3UsdBrlToday");
  const custoEl = document.querySelector("#v3UsdCost");
  const varEl = document.querySelector("#v3UsdVariation");
  const ptaxValue = document.querySelector("#v3PtaxValue");
  const ptaxMeta = document.querySelector("#v3PtaxMeta");

  if (total) total.textContent = v3Dinheiro(usd, "USD");
  if (hojeEl) hojeEl.textContent = cotacao ? v3Dinheiro(hoje) : "—";
  if (custoEl) custoEl.textContent = custoCompleto ? v3Dinheiro(custo) : "Parcial";
  if (varEl) {
    varEl.textContent = variacao == null ? "—" : v3Dinheiro(variacao);
    varEl.className = variacao == null ? "" : v3ClasseVariacao(variacao);
  }
  if (ptaxValue) ptaxValue.textContent = cotacao ? `R$ ${v3Numero(cotacao, 4)}` : "—";
  if (ptaxMeta) {
    const data = ptax?.atualizadoEm ? new Date(ptax.atualizadoEm).toLocaleString("pt-BR") : "indisponível";
    const aviso = ptax?.aviso ? ` · ${ptax.aviso}` : "";
    ptaxMeta.textContent = ptax ? `${ptax.fonte} · ${ptax.frequencia} · ${data}${aviso}` : "Cotação indisponível.";
  }

  const container = document.querySelector("#v3FxAccounts");
  if (container) {
    container.innerHTML = contas.length
      ? contas.map(conta => {
          const saldo = Number(conta.saldoUsd || 0);
          const valor = saldo * cotacao;
          const custoConta = Number(conta.custoBaseBrl || 0);
          const custoConhecido = conta.custoHistoricoCompleto !== false;
          const variacaoConta = cotacao && custoConhecido ? valor - custoConta : null;
          const sincronizada = String(conta.modoSaldo || "") === "SINCRONIZADO";
          const sincronizadoEm = conta.sincronizado_em
            ? new Date(conta.sincronizado_em).toLocaleString("pt-BR")
            : null;

          return `
            <div class="v3-fx-account ${v3ClasseBancoInternacional(conta.instituicao)}">
              <div class="v3-fx-head">
                <div>
                  <strong>${v3Escapar(conta.nome || conta.instituicao)}</strong>
                  <div class="meta">
                    ${v3Escapar(conta.instituicao)} · USD
                    <span class="v3-source-pill ${sincronizada ? "synced" : "manual"}">
                      ${sincronizada ? "Sincronizado" : "Manual"}
                    </span>
                  </div>
                </div>
                <div style="text-align:right">
                  <strong>${v3Dinheiro(saldo, "USD")}</strong>
                  <div class="meta">${cotacao ? v3Dinheiro(valor) : ""}</div>
                </div>
              </div>
              <div class="meta" style="margin-top:8px">
                ${custoConhecido
                  ? `Custo médio: R$ ${v3Numero(conta.custoMedio || 0, 4)} · Custo histórico: ${v3Dinheiro(custoConta)} · <span class="${variacaoConta == null ? "" : v3ClasseVariacao(variacaoConta)}">Variação: ${variacaoConta == null ? "—" : v3Dinheiro(variacaoConta)}</span>`
                  : "Saldo sincronizado pela instituição · custo histórico parcial, portanto a variação não é estimada."}
                ${sincronizadoEm ? ` · Atualizado ${v3Escapar(sincronizadoEm)}` : ""}
              </div>
            </div>`;
        }).join("")
      : '<div class="v3-note">Nenhuma conta em dólar cadastrada.</div>';
  }

  const options = contas.map(c => `<option value="${v3Escapar(c.id)}">${v3Escapar(c.nome || c.instituicao)}</option>`).join("");
  ["#v3FxMovementAccount","#v3FxTransferFrom","#v3FxTransferTo"].forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.innerHTML = options;
  });

  v3AtualizarPreviewCompraDolar();
  v3RenderizarTabelaMoedas();
  v3RenderizarHistoricoMoedas();
}

function v3Simular() {
  const inicial = Math.max(0, Number(document.querySelector("#v3SimInitial")?.value || 0));
  const mensal = Math.max(0, Number(document.querySelector("#v3SimMonthly")?.value || 0));
  const anos = Math.max(0, Number(document.querySelector("#v3SimYears")?.value || 0));
  const taxa = Number(document.querySelector("#v3SimRate")?.value || 0) / 100;
  const reinvestir = document.querySelector("#v3SimReinvest")?.checked !== false;
  const meses = Math.round(anos * 12);
  const taxaMensal = Math.pow(1 + taxa, 1 / 12) - 1;

  let patrimonio = inicial;
  let aportado = inicial;
  for (let i = 1; i <= meses; i += 1) {
    if (reinvestir) patrimonio *= 1 + taxaMensal;
    patrimonio += mensal;
    aportado += mensal;
  }

  const final = document.querySelector("#v3SimFinal");
  const contributed = document.querySelector("#v3SimContributed");
  const yieldEl = document.querySelector("#v3SimYield");
  const assumption = document.querySelector("#v3SimAssumption");
  if (final) final.textContent = v3Dinheiro(patrimonio);
  if (contributed) contributed.textContent = v3Dinheiro(aportado);
  if (yieldEl) yieldEl.textContent = v3Dinheiro(patrimonio - aportado);
  if (assumption) assumption.textContent = `${(taxa * 100).toFixed(1)}% a.a.`;
}

function v3FaturasAtuais() {
  if (typeof state === "undefined") return 0;
  const resumos = Array.isArray(state.resumos) ? state.resumos : [];
  if (resumos.length) {
    return resumos.reduce((s, r) => s + Math.abs(Number(r.approx_current_bill_amount ?? r.approxCurrentBillAmount ?? 0)), 0);
  }
  return 0;
}

async function v3AtualizarDashboard() {
  if (typeof state === "undefined") return;

  const contas = (state.contas || []).reduce((s, c) => s + Number(c.saldo || 0), 0);

  let investimentos = 0;
  for (const p of v3State.investimentos.posicoes || []) {
    const cot = v3State.investimentos.cotacoes.get(p.ticker);
    if (cot?.precoAtual) investimentos += Number(p.quantidade || 0) * Number(cot.precoAtual);
  }

  const usd = (v3State.moedas.contas || []).reduce((s, c) => s + Number(c.saldoUsd || 0), 0);
  const cambioDisponivel = Number(v3State.moedas.ptax?.meio || 0) > 0;
  const dolares = cambioDisponivel ? usd * Number(v3State.moedas.ptax.meio) : null;
  const faturas = v3FaturasAtuais();
  const cotacoesCompletas = (v3State.investimentos.posicoes || []).every(p => Number(v3State.investimentos.cotacoes.get(p.ticker)?.precoAtual || 0) > 0);
  // Mostra o subtotal verificável mesmo quando uma API de mercado falha.
  // Valores ausentes nunca são tratados como zero no rótulo de patrimônio completo.
  const dadosPendentes = !cotacoesCompletas || (usd !== 0 && !cambioDisponivel);
  const patrimonioConhecido = contas + investimentos + (dolares || 0) - faturas;

  const net = document.querySelector("#v3NetWorth");
  const inv = document.querySelector("#v3DashboardInvestments");
  const usdEl = document.querySelector("#v3DashboardUsd");
  if (net) net.textContent = `${v3Dinheiro(patrimonioConhecido)}${dadosPendentes ? " · parcial" : ""}`;
  if (inv) inv.textContent = cotacoesCompletas ? v3Dinheiro(investimentos) : "Parcial · cotações pendentes";
  if (usdEl) usdEl.textContent = usd && !cambioDisponivel ? `${v3Dinheiro(usd)} USD · câmbio pendente` : v3Dinheiro(dolares || 0);

  const ativos = Math.max(0, contas) + Math.max(0, investimentos) + Math.max(0, dolares || 0);
  const pct = valor => ativos > 0 ? (Math.max(0, valor) / ativos) * 100 : 0;
  const a = document.querySelector("#v3DistAccounts");
  const i = document.querySelector("#v3DistInvest");
  const d = document.querySelector("#v3DistUsd");
  if (a) a.style.width = `${pct(contas)}%`;
  if (i) i.style.width = `${pct(investimentos)}%`;
  if (d) d.style.width = `${pct(dolares)}%`;

  const texto = document.querySelector("#v3DistributionText");
  if (texto) texto.textContent = `Contas ${v3Dinheiro(contas)} · Investimentos ${v3Dinheiro(investimentos)} · Dólares ${(cambioDisponivel ? v3Dinheiro(dolares) : "Cotação indisponível")} · Faturas consideradas ${v3Dinheiro(faturas)}.`;
}

function v3IniciarAtualizacaoAutomatica() {
  if (v3TimerCambio) clearInterval(v3TimerCambio);
  if (v3TimerInvestimentos) clearInterval(v3TimerInvestimentos);

  v3TimerCambio = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    if (!document.querySelector("#moedas")?.classList.contains("active")) return;

    v3CarregarMoedas().catch((erro) => {
      console.warn("Falha na atualização automática do câmbio:", erro);
    });
  }, 60 * 1000);

  v3TimerInvestimentos = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    if (!document.querySelector("#investimentos")?.classList.contains("active")) return;

    v3CarregarInvestimentos().catch((erro) => {
      console.warn("Falha na atualização automática dos investimentos:", erro);
    });
  }, 15 * 60 * 1000);
}

/* Pré-conciliação não destrutiva: o Pierre entrega transações bancárias,
   não garante identificação inequívoca do ativo que pagou cada provento. */
async function v3ProcurarProventosPierre() {
  const alvo = document.querySelector("#v3PierreDividendCandidates");
  const botao = document.querySelector("#v3FindPierreDividends");
  if (!alvo) return;
  if (botao) botao.disabled = true;
  alvo.innerHTML = '<p class="v3-note">Consultando lançamentos bancários no Pierre…</p>';
  try {
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 90);
    const dataInicio = inicio.toISOString().slice(0, 10);
    const dataFim = new Date(hoje.getTime() + 86400000).toISOString().slice(0, 10);
    const dados = await v3Api(`/api/transactions?startDate=${dataInicio}&endDate=${dataFim}`);
    const regex = /dividend|dividendo|provento|rendimento(s)?\s+(fii|fundo imobili|a[cç][aã]o)|juros\s+sobre\s+capital|\bjcp\b|\bjs?cp\b/i;
    const proibidos = /pix|transfer[eê]ncia|resgate|aporte|sal[aá]rio|estorno|cashback/i;
    const candidatos = (dados.transacoes || []).filter(t => {
      const desc = [t.descricao, t.originalDescription, t.categoria].filter(Boolean).join(" ");
      const tipo = String(t.tipo || "").toUpperCase();
      const valor = Number(t.valor || 0);
      return valor > 0 && !["DEBITO", "DEBIT", "OUT"].includes(tipo)
        && regex.test(desc) && !proibidos.test(desc)
        && !/CREDIT_CARD|CREDIT/.test(String(t.tipoConta || "").toUpperCase());
    });
    if (!candidatos.length) {
      alvo.innerHTML = '<div class="v3-note">Nenhum possível provento foi identificado nos últimos 90 dias. Isso não confirma ausência de rendimentos: a Nubank pode não enviar a descrição ou os créditos podem não estar disponíveis no Pierre.</div>';
      return;
    }
    alvo.innerHTML = `<p class="v3-subtitle">${candidatos.length} lançamento(s) possível(is), aguardando conferência</p>
      <div class="v3-scroll"><table class="v3-mini-table">
        <thead><tr><th>Data</th><th>Descrição do extrato</th><th>Valor</th><th>Ação</th></tr></thead>
        <tbody>${candidatos.slice(0, 50).map((t,i) => `<tr>
          <td>${v3Escapar(v3DataCurta(t.data))}</td>
          <td>${v3Escapar(t.descricao || t.originalDescription || "Crédito")}</td>
          <td>${v3Dinheiro(t.valor)}</td>
          <td><button type="button" data-v3-pierre-candidate="${i}">Conferir</button></td>
        </tr>`).join("")}</tbody></table></div>
      <small>Os possíveis proventos ainda não entram nos totais. Informe o ticker correto após conferir na Nubank; não registre o mesmo pagamento duas vezes.</small>`;
    alvo.querySelectorAll("[data-v3-pierre-candidate]").forEach(botao => {
      botao.addEventListener("click", () => {
        const t = candidatos[Number(botao.dataset.v3PierreCandidate)];
        if (!t) return;
        const form = document.querySelector("#v3DividendForm");
        if (!form) return;
        const tickerMatch = String(t.descricao || "").toUpperCase().match(/\b[A-Z]{4}\d{1,2}\b/);
        form.elements.ticker.value = tickerMatch?.[0] || "";
        form.elements.valor.value = Number(t.valor).toFixed(2);
        form.elements.dataPagamento.value = String(t.data || "").slice(0,10);
        form.elements.status.value = "RECEBIDO";
        form.scrollIntoView({ behavior: "smooth", block: "center" });
        form.elements.ticker.focus();
        alvo.insertAdjacentHTML("afterbegin", '<p class="v3-note">Confira o ticker, a data e o valor na Nubank antes de clicar em “Registrar dividendo”. A sugestão não foi salva.</p>');
      });
    });
  } catch (erro) {
    alvo.innerHTML = `<div class="v3-note">Não foi possível consultar o Pierre: ${v3Escapar(erro.message)}. Nenhum dado foi alterado.</div>`;
  } finally {
    if (botao) botao.disabled = false;
  }
}

function v3B3Normalizar(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function v3B3Csv(text) {
  const content = String(text || "").replace(/^\uFEFF/, "");
  const first = content.split(/\r?\n/).find(x => x.trim()) || "";
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";
  let cell = "", row = [], quoted = false;
  const rows = [];
  for (let i=0;i<content.length;i++) {
    const char=content[i];
    if (char === '"') {
      if (quoted && content[i+1] === '"') {cell += '"';i++;} else quoted=!quoted;
    } else if (char === sep && !quoted) {row.push(cell.trim());cell="";}
    else if ((char === "\n" || char === "\r") && !quoted) {
      if(char==="\r" && content[i+1]==="\n")i++;
      row.push(cell.trim());cell="";
      if(row.some(Boolean))rows.push(row);
      row=[];
    } else cell+=char;
  }
  row.push(cell.trim());if(row.some(Boolean))rows.push(row);
  return rows;
}

function v3B3Numero(value) {
  let str=String(value || "").replace(/R\$|\s/g,"");
  if(!str)return null;
  if(str.includes(",")&&str.includes(".")) str=str.lastIndexOf(",")>str.lastIndexOf(".")?str.replace(/\./g,"").replace(",","."):str.replace(/,/g,"");
  else if(str.includes(","))str=str.replace(",",".");
  const n=Number(str);return Number.isFinite(n)?n:null;
}


/* Interpretação local de notas de corretagem Nu com PDF.js. Nenhum arquivo é transmitido. */
async function v3NuNotasPDF(files) {
  const alvo = document.querySelector("#v3B3Preview");
  if (!alvo || !files?.length) return;
  const documentos = [...files];
  if (documentos.some(f => !/\.pdf$/i.test(f.name) || f.size > 8 * 1024 * 1024)) {
    alvo.textContent = "Envie somente notas PDF com até 8 MB por arquivo."; return;
  }
  alvo.textContent = "Lendo notas da Nubank localmente, sem alterar seus dados…";
  try {
    const pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
    const nomes = [
      ["FII MAXI REN", "MXRF11"], ["FII XP MALLS", "XPML11"],
      ["BBSEGURIDADE", "BBSE3"], ["ITAUUNIBANCO", "ITUB4"],
      ["TAESA", "TAEE11"], ["INVESTO WRLD", "WRLD11"],
    ];
    const todos = [];
    const problemas = [];
    const notasLidas = new Set();
    const parseValor = t => Number(String(t || "").replace(/\./g, "").replace(",", "."));
    for (const arquivo of documentos) {
      const data = new Uint8Array(await arquivo.arrayBuffer());
      const doc = await pdfjs.getDocument({data}).promise;
      for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
        const page = await doc.getPage(pageNo);
        const textContent = await page.getTextContent();
        const rows = [];
        const items = textContent.items.filter(t => typeof t.str === "string")
          .map(t => ({x:Number(t.transform?.[4] || 0), y:Number(t.transform?.[5] || 0), s:t.str.trim()}))
          .filter(t => t.s).sort((a,b) => b.y - a.y || a.x-b.x);
        for(const item of items) {
          let row = rows.find(r => Math.abs(r.y - item.y) <= 2);
          if(!row) {row={y:item.y,parts:[]};rows.push(row);}
          row.parts.push(item);
        }
        rows.sort((a,b)=>b.y-a.y);
        const lines = rows.map(r=>r.parts.sort((a,b)=>a.x-b.x).map(x=>x.s).join(" "));
        const full = lines.join("\n");
        const numero = full.match(/(?:Nr\.?\s*Nota|N[º°]\s*Nota)[\s\S]{0,140}?(\d{4,9})/i)?.[1] || "";
        const dataNota = full.match(/\b\d{2}\/\d{2}\/\d{4}\b/)?.[0] || "";
        const identidade = numero ? numero+":"+dataNota : arquivo.name+":"+pageNo;
        if(notasLidas.has(identidade)) continue;
        notasLidas.add(identidade);
        let encontradas = 0;
        for(const linha of lines) {
          const match = linha.match(/B3\s+RV\s+LISTADO\s+([CV])\s+(?:VISTA|FRACIONARIO)\s+(.+?)\s+[@#]\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)\s+[DC]\b/i);
          if(!match) continue;
          const produto = match[2].toUpperCase().replace(/\s+/g," ").trim();
          const ticker = nomes.find(n=>produto.includes(n[0]))?.[1] || produto.match(/\b[A-Z]{4}\d{1,2}\b/)?.[0] || null;
          const qtd = Number(match[3]);const preco=parseValor(match[4]);const valor=parseValor(match[5]);
          if(!ticker || !Number.isFinite(qtd) || qtd<=0 || !Number.isFinite(valor) || valor<=0) {
            problemas.push("Linha sem ticker ou valores verificáveis: "+produto);continue;
          }
          todos.push({ticker, qtd, preco, valor, tipo:match[1]==="C"?"COMPRA":"VENDA", data:dataNota, numero, arquivo:arquivo.name});
          encontradas++;
        }
        if(!encontradas) problemas.push("Nenhuma operação reconhecida em "+arquivo.name+" (página "+pageNo+")");
      }
    }
    const locais = new Map((v3State.investimentos.posicoes || []).map(p => [String(p.ticker).toUpperCase(),p]));
    const grupos = new Map();
    for(const op of todos) {
      const chave = op.ticker;
      const total = grupos.get(chave) || {ticker:chave, quantidade:0, custo:0, compras:0, vendas:0};
      total.quantidade += op.tipo === "COMPRA" ? op.qtd : -op.qtd;
      if(op.tipo === "COMPRA") {total.custo+=op.valor;total.compras++;}
      else total.vendas++;
      grupos.set(chave,total);
    }
    const lista=[...grupos.values()];
    const linhas=lista.map(g=>{
      const local=locais.get(g.ticker);
      const qtdLocal=local ? Number(local.quantidade) : null;
      const qtdDiferente=qtdLocal!==null && Math.abs(qtdLocal-g.quantidade)>0.000001;
      const custoLocal=qtdLocal!==null ? qtdLocal*Number(local.preco_medio||0) : null;
      const diferenca=custoLocal!==null ? custoLocal-g.custo : null;
      return `<tr><td>${v3Escapar(g.ticker)}</td><td>${v3Numero(g.quantidade,4)}</td>
        <td>${v3Dinheiro(g.custo)}</td><td>${qtdLocal===null?"Sem posição":v3Numero(qtdLocal,4)}</td>
        <td>${diferenca===null?"—":v3Dinheiro(diferenca)}</td>
        <td>${qtdDiferente?"Conferir quantidade":g.vendas?"Vendas: conferir custo":"Prévia compatível; conferir taxas"}</td></tr>`;
    }).join("");
    const totalCompras=todos.filter(x=>x.tipo==="COMPRA").reduce((a,b)=>a+b.valor,0);
    alvo.innerHTML = `<strong>Notas conferidas localmente: ${notasLidas.size}</strong>
      <div class="v3-reconcile-results"><span>${todos.filter(x=>x.tipo==="COMPRA").length} compras</span>
      <span>${todos.filter(x=>x.tipo==="VENDA").length} vendas</span>
      <span>${v3Dinheiro(totalCompras)} em compras, sem taxas</span></div>
      <div class="v3-scroll"><table class="v3-mini-table"><thead><tr><th>Ativo</th><th>Qtd. notas</th><th>Custo compras</th><th>Qtd. cadastrada</th><th>Diferença de custo*</th><th>Conferência</th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="6">Nenhum negócio identificado.</td></tr>'}</tbody></table></div>
      ${problemas.length?`<p>${v3Escapar(problemas.slice(0,4).join("; "))}</p>`:""}
      <small>*Diferença entre custo cadastrado (quantidade × preço médio arredondado) e compras encontradas nestas notas; não considera taxas ou notas ausentes. Não altera o Supabase. Reenvie as mesmas notas quando quiser: a conferência não cria lançamentos duplicados.</small>`;
  } catch (erro) {
    alvo.textContent = "Não foi possível ler o PDF. Confira sua conexão com o carregador de PDF e tente novamente. Detalhes: "+erro.message;
  }
}

async function v3B3PreviewFile(file) {
  const alvo=document.querySelector("#v3B3Preview");
  if(!file||!alvo)return;
  if(!/\.csv$/i.test(file.name)||file.size>5*1024*1024){
    alvo.textContent="Selecione um CSV UTF-8 com até 5 MB. Também aceitamos notas de corretagem em PDF.";return;
  }
  try{
    const rows=v3B3Csv(await file.text());
    const index=rows.findIndex(row=>row.some(c=>["data","datadonegocio","movimentacao","tipodemovimentacao","codigodenegociacao","produto"].includes(v3B3Normalizar(c))));
    if(index<0){alvo.textContent="Não encontrei cabeçalho B3 reconhecível. Verifique o CSV.";return;}
    const header=rows[index].map(v3B3Normalizar);
    const col=(r,names)=>{for(const n of names){const i=header.indexOf(n);if(i>=0)return r[i]||"";}return "";};
    const records=rows.slice(index+1,10001).map(row=>{
      const produto=col(row,["produto","codigodenegociacao"]);
      const descricao=col(row,["movimentacao","tipodemovimentacao","entradaesaida"]);
      const mov=v3B3Normalizar(descricao);
      const type=/dividendo|rendimento|jcp|jurossobrecapital/.test(mov)?"PROVENTO":/compra/.test(mov)?"COMPRA":/venda/.test(mov)?"VENDA":"OUTRO";
      const ticker=String(produto).toUpperCase().match(/\b[A-Z]{4}\d{1,2}\b/)?.[0]||null;
      return {type,ticker,produto,data:col(row,["data","datadonegocio"]),q:v3B3Numero(col(row,["quantidade"])),valor:v3B3Numero(col(row,["valordaoperacao","valor"]))};
    }).filter(r=>r.type!=="OUTRO");
    const count=t=>records.filter(r=>r.type===t).length;
    const local=new Set((v3State.investimentos.posicoes||[]).map(p=>String(p.ticker).toUpperCase()));
    const newly=[...new Set(records.map(r=>r.ticker).filter(Boolean))].filter(t=>!local.has(t));
    const table=records.slice(0,100).map(r=>`<tr><td>${v3Escapar(r.data)}</td><td>${v3Escapar(r.type)}</td><td>${v3Escapar(r.ticker||r.produto)}</td><td>${r.q===null?"—":v3Numero(r.q,4)}</td><td>${r.valor===null?"—":v3Dinheiro(r.valor)}</td><td>${r.ticker?(local.has(r.ticker)?"Já existe posição":"Ainda não cadastrado"):"Ticker não identificado"}</td></tr>`).join("");
    alvo.innerHTML=`<strong>Prévia local: ${v3Escapar(file.name)}</strong>
      <div class="v3-reconcile-results"><span>${count("COMPRA")} compras</span><span>${count("VENDA")} vendas</span><span>${count("PROVENTO")} possíveis proventos</span><span>${newly.length} ativos novos</span></div>
      <div class="v3-scroll"><table class="v3-mini-table"><thead><tr><th>Data</th><th>Tipo</th><th>Ativo</th><th>Qtd.</th><th>Valor</th><th>Conferência</th></tr></thead><tbody>${table}</tbody></table></div>
      <small>Prévia limitada a 100 linhas. Sem gravação. Para apurar custo real, confira taxas e notas de corretagem; compras antigas podem já estar na carteira.</small>`;
  }catch(err){alvo.textContent="Não foi possível ler o arquivo: "+err.message;}
}

function v3ConfigurarEventos() {
  v3IniciarAtualizacaoAutomatica();
  document.querySelector("#v3FindPierreDividends")?.addEventListener("click", v3ProcurarProventosPierre);
  document.querySelector("#v3PortfolioReconcileRefresh")?.addEventListener("click", async () => { await v3ConferirPosicoesSemAlterar(); await v3ConferirOperacoesBelvo(); });
  document.querySelector("#v3B3File")?.addEventListener("change", e => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    if (files.every(f => /\.pdf$/i.test(f.name))) v3NuNotasPDF(files);
    else if (files.length === 1 && /\.csv$/i.test(files[0].name)) v3B3PreviewFile(files[0]);
    else {
      const alvo = document.querySelector("#v3B3Preview");
      if (alvo) alvo.textContent = "Selecione somente PDFs da Nubank ou apenas um CSV da B3 por vez.";
    }
  });

  const hoje = new Date().toISOString().slice(0, 10);
  ["#v3OperationForm input[name='data']", "#v3DividendForm input[name='dataPagamento']", "#v3FxMovementForm input[name='data']", "#v3FxTransferForm input[name='data']"].forEach(seletor => {
    const campo = document.querySelector(seletor);
    if (campo && !campo.value) campo.value = hoje;
  });
  document.querySelector("#v3TickerSearch")?.addEventListener("click", () => {
    v3BuscarMercado(document.querySelector("#v3TickerInput")?.value, v3State.mercado.periodo);
  });

  document.querySelector("#v3TickerInput")?.addEventListener("keydown", evento => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      v3BuscarMercado(evento.currentTarget.value, v3State.mercado.periodo);
    }
  });

  document.querySelectorAll(".v3-period").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".v3-period").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    v3BuscarMercado(v3State.mercado.ticker, btn.dataset.periodo);
  }));

  document.querySelector("#v3PositionForm")?.addEventListener("submit", async evento => {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const form = new FormData(formulario);
    try {
      await v3Api("/api/v3/investimentos/posicoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      formulario.reset();
      await v3CarregarInvestimentos();
    } catch (erro) {
      alert(erro.message);
    }
  });

  document.querySelector("#v3OperationForm")?.addEventListener("submit", async evento => {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const form = new FormData(formulario);
    try {
      await v3Api("/api/v3/investimentos/operacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      formulario.reset();
      await v3CarregarInvestimentos();
    } catch (erro) {
      alert(erro.message);
    }
  });

  document.querySelector("#v3DividendForm")?.addEventListener("submit", async evento => {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const form = new FormData(formulario);
    const bruto = Object.fromEntries(form.entries());
    const status = String(bruto.status || "RECEBIDO").toUpperCase();

    try {
      await v3Api("/api/v3/investimentos/dividendos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: bruto.ticker,
          valor: bruto.valor,
          dataPagamento: bruto.dataPagamento,
          anunciado: status === "ANUNCIADO",
          recebido: status === "RECEBIDO",
          origem: "MANUAL",
        }),
      });
      formulario.reset();
      await v3CarregarInvestimentos();
    } catch (erro) {
      alert(erro.message);
    }
  });

  document.querySelectorAll("#v3SimulatorForm input").forEach(input => input.addEventListener("input", v3Simular));
  document.querySelector("#v3SimReinvest")?.addEventListener("change", v3Simular);

  document.querySelector("#v3SyncWise")?.addEventListener("click", v3SincronizarWise);
  document.querySelector("#v3SyncBelvo")?.addEventListener("click", v3SincronizarBelvo);

  const fxMovementForm = document.querySelector("#v3FxMovementForm");
  fxMovementForm?.querySelector("[name='tipo']")?.addEventListener("change", v3AtualizarFormularioMoeda);
  fxMovementForm?.querySelector("[name='contaId']")?.addEventListener("change", v3AtualizarPreviewCompraDolar);
  ["quantidadeUsd", "totalBrl", "iof", "tarifas"].forEach((nome) => {
    fxMovementForm?.querySelector(`[name='${nome}']`)?.addEventListener("input", v3AtualizarPreviewCompraDolar);
  });
  v3AtualizarFormularioMoeda();

  document.querySelectorAll("[data-v3-bank]").forEach(btn => btn.addEventListener("click", () => {
    const form = document.querySelector("#v3FxAccountForm");
    const instituicao = form?.querySelector('input[name="instituicao"]');
    const nome = form?.querySelector('input[name="nome"]');
    const banco = btn.dataset.v3Bank || "";
    if (instituicao) instituicao.value = banco;
    if (nome) nome.value = `${banco} · Dólares`;
    instituicao?.focus();
  }));

  document.querySelector("#v3FxAccountForm")?.addEventListener("submit", async evento => {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const form = new FormData(formulario);
    try {
      await v3Api("/api/v3/moedas/contas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      formulario.reset();
      await v3CarregarMoedas();
    } catch (erro) {
      alert(erro.message);
    }
  });

  document.querySelector("#v3FxMovementForm")?.addEventListener("submit", async evento => {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const form = new FormData(formulario);
    try {
      await v3Api("/api/v3/moedas/movimentacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      formulario.reset();
      formulario.elements.tipo.value = "COMPRA";
      const campoData = formulario.querySelector("input[name='data']");
      if (campoData) campoData.value = new Date().toISOString().slice(0, 10);
      v3AtualizarFormularioMoeda();
      await v3CarregarMoedas();
    } catch (erro) {
      alert(erro.message);
    }
  });

  document.querySelector("#v3FxTransferForm")?.addEventListener("submit", async evento => {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const form = new FormData(formulario);
    try {
      await v3Api("/api/v3/moedas/transferencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      formulario.reset();
      await v3CarregarMoedas();
    } catch (erro) {
      alert(erro.message);
    }
  });
}

async function v3CarregarTudo() {
  v3DecorarCartoes();
  v3Simular();

  await v3CarregarIntegracoes();

  await Promise.allSettled([
    v3CarregarInvestimentos(),
    v3CarregarMoedas(),
    v3BuscarMercado(v3State.mercado.ticker, v3State.mercado.periodo),
  ]);

  await v3ConferirPosicoesSemAlterar();
  await v3ConferirOperacoesBelvo();
  await v3AtualizarDashboard();
}

v3InjetarNavegacao();
v3InjetarSecoes();
v3InjetarDashboard();
v3ConfigurarEventos();
v3Simular();

if (typeof navegar === "function") {
  const v3NavegarBase = navegar;
  navegar = function v3Navegar(secao) {
    v3NavegarBase(secao);
    const titulo = document.querySelector("#pageTitle");
    if (titulo && secao === "investimentos") titulo.textContent = "Investimentos Nubank";
    if (titulo && secao === "moedas") titulo.textContent = "Bancos internacionais";
  };
}

if (typeof mostrarCartoesEFaturas === "function") {
  const v3MostrarCartoesBase = mostrarCartoesEFaturas;
  mostrarCartoesEFaturas = function v3MostrarCartoes() {
    const resultado = v3MostrarCartoesBase();
    queueMicrotask(v3DecorarCartoes);
    return resultado;
  };
}

if (typeof carregarDados === "function") {
  const v3CarregarDadosBase = carregarDados;
  carregarDados = async function v3CarregarDados() {
    const resultado = await v3CarregarDadosBase();
    await v3CarregarTudo();
    return resultado;
  };
}
