/* =========================================================
   MEU FINANCEIRO V3 — BLACK PREMIUM
   Camada aditiva: não substitui o núcleo Pierre existente.
   ========================================================= */

const v3State = {
  investimentos: { posicoes: [], operacoes: [], dividendos: [], cotacoes: new Map() },
  moedas: { contas: [], ptax: null },
  mercado: { ticker: "MXRF11", periodo: "1M", dados: null },
};

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
  btnInvest.innerHTML = '📈 <span>Investimentos</span>';

  const btnMoedas = document.createElement("button");
  btnMoedas.className = "nav-item";
  btnMoedas.dataset.section = "moedas";
  btnMoedas.innerHTML = '💵 <span>Moedas e viagens</span>';

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
        <p class="eyebrow">CARTEIRA</p>
        <h2>Investimentos</h2>
        <p>Ações, FIIs e ETFs com preço médio, histórico e dados de mercado identificados pela fonte.</p>
      </div>
    </div>

    <div id="v3InvestStatus" class="v3-note">Carregando carteira...</div>

    <div class="v3-kpis" style="margin-top:18px">
      <div class="v3-kpi"><span>Patrimônio investido</span><strong id="v3InvestTotal">—</strong></div>
      <div class="v3-kpi"><span>Custo da carteira</span><strong id="v3InvestCost">—</strong></div>
      <div class="v3-kpi"><span>Rentabilidade</span><strong id="v3InvestReturn">—</strong></div>
      <div class="v3-kpi"><span>Dividendos registrados</span><strong id="v3InvestDividends">—</strong></div>
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
        <h3>Minha carteira</h3>
        <p>Clique no ticker para abrir o gráfico.</p>
        <div id="v3Holdings" class="v3-holdings"><div class="v3-skeleton"></div></div>
      </div>

      <div class="v3-panel v3-span-6">
        <h3>Adicionar/ajustar posição</h3>
        <p>Use para cadastrar uma posição existente sem inventar histórico de operações.</p>
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
        <p>O preço médio é recalculado automaticamente nas compras.</p>
        <form id="v3OperationForm" class="v3-form-grid">
          <label><span>Ticker</span><input name="ticker" required placeholder="MXRF11"></label>
          <label><span>Tipo</span><select name="tipo"><option>COMPRA</option><option>VENDA</option></select></label>
          <label><span>Quantidade</span><input name="quantidade" type="number" step="0.000001" min="0.000001" required></label>
          <label><span>Preço unitário</span><input name="precoUnitario" type="number" step="0.01" min="0.01" required></label>
          <label><span>Taxas</span><input name="taxas" type="number" step="0.01" min="0" value="0"></label>
          <label><span>Data</span><input name="data" type="date"></label>
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
        <p class="eyebrow">VIAGENS</p>
        <h2>Moedas e viagens</h2>
        <p>Controle dólares por instituição sem alterar o custo histórico quando a cotação muda.</p>
      </div>
    </div>

    <div id="v3FxStatus" class="v3-note">Carregando PTAX e contas...</div>

    <div class="v3-kpis" style="margin-top:18px">
      <div class="v3-kpi"><span>Saldo total</span><strong id="v3UsdTotal">—</strong></div>
      <div class="v3-kpi"><span>Valor estimado hoje</span><strong id="v3UsdBrlToday">—</strong></div>
      <div class="v3-kpi"><span>Custo histórico</span><strong id="v3UsdCost">—</strong></div>
      <div class="v3-kpi"><span>Variação cambial estimada</span><strong id="v3UsdVariation">—</strong></div>
    </div>

    <div class="v3-grid">
      <div class="v3-panel v3-span-7">
        <div class="v3-row-between">
          <div><h3>Contas em dólar</h3><p id="v3PtaxMeta">Cotação de referência: carregando...</p></div>
          <strong id="v3PtaxValue">—</strong>
        </div>
        <div id="v3FxAccounts" class="v3-fx-accounts"><div class="v3-skeleton"></div></div>
      </div>

      <div class="v3-panel v3-span-5">
        <h3>Adicionar instituição</h3>
        <form id="v3FxAccountForm" class="v3-form-grid">
          <label class="full"><span>Instituição</span><input name="instituicao" required placeholder="Revolut, Wise, Nomad..."></label>
          <label class="full"><span>Nome personalizado</span><input name="nome" placeholder="Ex.: Dólares da viagem"></label>
          <button class="full" type="submit">Adicionar conta</button>
        </form>
      </div>

      <div class="v3-panel v3-span-6">
        <h3>Registrar compra, venda ou gasto</h3>
        <form id="v3FxMovementForm" class="v3-form-grid">
          <label class="full"><span>Conta</span><select name="contaId" id="v3FxMovementAccount" required></select></label>
          <label><span>Tipo</span><select name="tipo"><option>COMPRA</option><option>VENDA</option><option>GASTO</option><option value="AJUSTE_ENTRADA">AJUSTE ENTRADA</option><option value="AJUSTE_SAIDA">AJUSTE SAÍDA</option></select></label>
          <label><span>Data</span><input name="data" type="date"></label>
          <label><span>USD</span><input name="quantidadeUsd" type="number" step="0.01" min="0.01" required></label>
          <label><span>Total pago/recebido em R$</span><input name="totalBrl" type="number" step="0.01" min="0" value="0"></label>
          <label><span>IOF</span><input name="iof" type="number" step="0.01" min="0" value="0"></label>
          <label><span>Tarifas</span><input name="tarifas" type="number" step="0.01" min="0" value="0"></label>
          <button class="full" type="submit">Registrar movimentação</button>
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
      <span>Investimentos V3</span>
      <strong id="v3DashboardInvestments">—</strong>
      <small>Cotações de mercado disponíveis, sem valores fictícios.</small>
    </article>
    <article class="card">
      <span>Dólares</span>
      <strong id="v3DashboardUsd">—</strong>
      <small>Convertidos pela última PTAX disponível.</small>
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
      meta.textContent = `${dados.fonte} · atualização ${data} · atraso informado ~${dados.atrasoMinutos} min`;
    }
    v3RenderizarGrafico(dados);
    v3RenderizarInvestimentos();
  } catch (erro) {
    if (chart) chart.innerHTML = `<div class="v3-chart-empty">${v3Escapar(erro.message)}</div>`;
    const meta = document.querySelector("#v3MarketMeta");
    if (meta) meta.textContent = erro.message;
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
      status.textContent = "Carteira carregada. Cotações são consultadas separadamente e nunca substituídas por valores fictícios.";
    }

    const tickers = v3State.investimentos.posicoes.map(p => p.ticker).filter(Boolean);
    const resultados = await Promise.allSettled(
      tickers.map(t => v3Api(`/api/v3/mercado/${encodeURIComponent(t)}?periodo=1M`)),
    );
    resultados.forEach((r, i) => {
      if (r.status === "fulfilled") v3State.investimentos.cotacoes.set(tickers[i], r.value);
    });

    v3RenderizarInvestimentos();
    await v3AtualizarDashboard();
  } catch (erro) {
    if (status) {
      status.className = "v3-note v3-warning";
      status.textContent = erro.message.includes("schema")
        ? "O código do V3 está pronto, mas o schema de desenvolvimento ainda não foi aplicado ao Supabase. A produção permanece intacta."
        : erro.message;
    }
    v3RenderizarInvestimentos();
  }
}


function v3DataCurta(valor) {
  if (!valor) return "—";
  const data = new Date(String(valor).length === 10 ? \`${valor}T12:00:00\` : valor);
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
    return \`<div class="v3-allocation-row">
      <strong>${v3Escapar(nome)}</strong>
      <div class="v3-allocation-track"><div class="v3-allocation-fill" style="width:${percentual.toFixed(2)}%"></div></div>
      <span class="meta">${percentual.toFixed(1)}% · ${v3Dinheiro(valor)}</span>
    </div>\`;
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
      ? \`<table class="v3-mini-table">
          <thead><tr><th>Data</th><th>Ticker</th><th>Tipo</th><th>Quantidade</th><th>Preço</th><th>Taxas</th><th>Total</th></tr></thead>
          <tbody>${operacoes.map(op => {
            const qtd = Number(op.quantidade || 0);
            const preco = Number(op.preco_unitario || 0);
            const taxas = Number(op.taxas || 0);
            const total = qtd * preco + (String(op.tipo).toUpperCase() === "COMPRA" ? taxas : -taxas);
            return \`<tr>
              <td>${v3DataCurta(op.data)}</td>
              <td><strong>${v3Escapar(op.ticker)}</strong></td>
              <td>${v3Escapar(op.tipo)}</td>
              <td>${v3Numero(qtd,4)}</td>
              <td>${v3Dinheiro(preco)}</td>
              <td>${v3Dinheiro(taxas)}</td>
              <td>${v3Dinheiro(total)}</td>
            </tr>\`;
          }).join("")}</tbody>
        </table>\`
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
      ? \`<div class="v3-subtitle">Registrados no Meu Financeiro</div>
        <div class="v3-scroll"><table class="v3-mini-table">
          <thead><tr><th>Data</th><th>Ticker</th><th>Valor</th><th>Status</th></tr></thead>
          <tbody>${manuais.map(d => {
            const recebido = d.recebido !== false;
            const status = recebido ? "Recebido" : "Anunciado";
            return \`<tr>
              <td>${v3DataCurta(d.data_pagamento)}</td>
              <td><strong>${v3Escapar(d.ticker)}</strong></td>
              <td>${v3Dinheiro(d.valor)}</td>
              <td><span class="v3-status-pill ${recebido ? "received" : "announced"}">${status}</span></td>
            </tr>\`;
          }).join("")}</tbody>
        </table></div>\`
      : '<div class="v3-history-empty">Nenhum dividendo manual registrado.</div>';

    const mercadoHtml = eventosMercado.length
      ? \`<div class="v3-subtitle">Eventos retornados pela Brapi · ${v3Escapar(v3State.mercado.ticker)}</div>
        <div class="v3-scroll"><table class="v3-mini-table">
          <thead><tr><th>Data</th><th>Valor por cota/ação</th><th>Observação</th></tr></thead>
          <tbody>${eventosMercado.map(e => {
            const data = e.paymentDate || e.lastDatePrior || e.approvedOn || e.date || null;
            const valor = Number(e.rate ?? e.value ?? e.cashAmount ?? e.dividend ?? 0);
            const nota = e.label || e.type || e.relatedTo || "Evento de provento";
            return \`<tr><td>${v3DataCurta(data)}</td><td>${valor ? v3Dinheiro(valor) : "Não informado"}</td><td>${v3Escapar(nota)}</td></tr>\`;
          }).join("")}</tbody>
        </table></div>\`
      : '<div class="v3-note" style="margin-top:12px">A fonte de mercado não retornou eventos de dividendos para o ticker/período atual, ou esse dado não está disponível no plano consultado.</div>';

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
  alvo.innerHTML = \`
    <div class="v3-row-between"><span class="meta">Capital líquido registrado</span><strong>${v3Dinheiro(acumulado)}</strong></div>
    <div class="v3-contribution-bars" aria-label="Evolução dos aportes">
      ${pontos.map(p => \`<span title="${v3DataCurta(p.data)} · ${v3Dinheiro(p.valor)}" style="height:${Math.max(3,(Math.max(0,p.valor)/max)*100)}%"></span>\`).join("")}
    </div>\`;
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
    ? \`<table class="v3-mini-table">
        <thead><tr><th>Data</th><th>Conta</th><th>Tipo</th><th>USD</th><th>R$ histórico</th><th>Cotação efetiva</th><th>IOF + tarifas</th></tr></thead>
        <tbody>${linhas.slice(0,40).map(tx => \`<tr>
          <td>${v3DataCurta(tx.data)}</td>
          <td>${v3Escapar(tx.contaNome)}</td>
          <td>${v3Escapar(String(tx.tipo || "").replaceAll("_"," "))}</td>
          <td>${v3Dinheiro(tx.quantidade_usd || 0,"USD")}</td>
          <td>${v3Dinheiro(tx.total_brl || 0)}</td>
          <td>${tx.cotacao_efetiva ? \`R$ ${v3Numero(tx.cotacao_efetiva,4)}\` : "—"}</td>
          <td>${v3Dinheiro(Number(tx.iof || 0)+Number(tx.tarifas || 0))}</td>
        </tr>\`).join("")}</tbody>
      </table>\`
    : '<div class="v3-history-empty">Nenhuma movimentação em dólar registrada.</div>';
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
                <div><button type="button" data-v3-ticker="${v3Escapar(posicao.ticker)}"><strong>${v3Escapar(posicao.ticker)}</strong></button><div class="meta">${v3Escapar(posicao.classe || "OUTRO")}</div></div>
                <div style="text-align:right"><strong>${atual ? v3Dinheiro(valorAtual) : "Cotação indisponível"}</strong><div class="meta ${retorno == null ? "" : v3ClasseVariacao(retorno)}">${retorno == null ? "" : `${retorno >= 0 ? "+" : ""}${v3Dinheiro(retorno)}`}</div></div>
              </div>
              <div class="meta" style="margin-top:8px">${v3Numero(qtd, 4)} cota(s) · PM ${v3Dinheiro(pm)}${atual ? ` · Atual ${v3Dinheiro(atual)}` : ""}</div>
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

  const total = mercado || custo;
  const retorno = mercado ? mercado - custo : 0;
  const retornoPct = custo && mercado ? (retorno / custo) * 100 : 0;

  const totalEl = document.querySelector("#v3InvestTotal");
  const costEl = document.querySelector("#v3InvestCost");
  const returnEl = document.querySelector("#v3InvestReturn");
  const divEl = document.querySelector("#v3InvestDividends");

  if (totalEl) totalEl.textContent = mercado ? v3Dinheiro(total) : "Sem cotação";
  if (costEl) costEl.textContent = v3Dinheiro(custo);
  if (returnEl) {
    returnEl.textContent = mercado ? `${v3Dinheiro(retorno)} (${retornoPct.toFixed(2)}%)` : "—";
    returnEl.className = v3ClasseVariacao(retorno);
  }
  if (divEl) divEl.textContent = v3Dinheiro(dividendos);

  v3RenderizarDistribuicaoInvestimentos();
  v3RenderizarHistoricoInvestimentos();
  v3RenderizarEvolucaoAportes();
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
        ? "PTAX disponível; contas em dólar aguardam o schema V3 de desenvolvimento. Produção não foi alterada."
        : contas.reason.message;
    } else {
      status.className = "v3-note";
      status.textContent = "O custo histórico é calculado pelas compras e não muda quando a PTAX é atualizada.";
    }
  }

  v3RenderizarMoedas();
  await v3AtualizarDashboard();
}

function v3RenderizarMoedas() {
  const contas = v3State.moedas.contas || [];
  const ptax = v3State.moedas.ptax;
  const cotacao = Number(ptax?.meio || 0);

  let usd = 0;
  let custo = 0;
  contas.forEach(c => {
    usd += Number(c.saldoUsd || 0);
    custo += Number(c.custoBaseBrl || 0);
  });

  const hoje = usd * cotacao;
  const variacao = cotacao ? hoje - custo : 0;

  const total = document.querySelector("#v3UsdTotal");
  const hojeEl = document.querySelector("#v3UsdBrlToday");
  const custoEl = document.querySelector("#v3UsdCost");
  const varEl = document.querySelector("#v3UsdVariation");
  const ptaxValue = document.querySelector("#v3PtaxValue");
  const ptaxMeta = document.querySelector("#v3PtaxMeta");

  if (total) total.textContent = v3Dinheiro(usd, "USD");
  if (hojeEl) hojeEl.textContent = cotacao ? v3Dinheiro(hoje) : "—";
  if (custoEl) custoEl.textContent = v3Dinheiro(custo);
  if (varEl) {
    varEl.textContent = cotacao ? v3Dinheiro(variacao) : "—";
    varEl.className = v3ClasseVariacao(variacao);
  }
  if (ptaxValue) ptaxValue.textContent = cotacao ? `R$ ${v3Numero(cotacao, 4)}` : "—";
  if (ptaxMeta) {
    const data = ptax?.atualizadoEm ? new Date(ptax.atualizadoEm).toLocaleString("pt-BR") : "indisponível";
    ptaxMeta.textContent = ptax ? `${ptax.fonte} · ${ptax.frequencia} · ${data}` : "Cotação indisponível.";
  }

  const container = document.querySelector("#v3FxAccounts");
  if (container) {
    container.innerHTML = contas.length
      ? contas.map(conta => {
          const saldo = Number(conta.saldoUsd || 0);
          const valor = saldo * cotacao;
          const custoConta = Number(conta.custoBaseBrl || 0);
          const variacaoConta = cotacao ? valor - custoConta : 0;
          return `
            <div class="v3-fx-account">
              <div class="v3-fx-head">
                <div><strong>${v3Escapar(conta.nome || conta.instituicao)}</strong><div class="meta">${v3Escapar(conta.instituicao)}</div></div>
                <div style="text-align:right"><strong>${v3Dinheiro(saldo, "USD")}</strong><div class="meta">${cotacao ? v3Dinheiro(valor) : ""}</div></div>
              </div>
              <div class="meta" style="margin-top:8px">Custo médio: R$ ${v3Numero(conta.custoMedio || 0, 4)} · Custo histórico: ${v3Dinheiro(custoConta)} · <span class="${v3ClasseVariacao(variacaoConta)}">Variação: ${cotacao ? v3Dinheiro(variacaoConta) : "—"}</span></div>
            </div>`;
        }).join("")
      : '<div class="v3-note">Nenhuma conta em dólar cadastrada.</div>';
  }

  const options = contas.map(c => `<option value="${v3Escapar(c.id)}">${v3Escapar(c.nome || c.instituicao)}</option>`).join("");
  ["#v3FxMovementAccount","#v3FxTransferFrom","#v3FxTransferTo"].forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.innerHTML = options;
  });

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
  const dolares = usd * Number(v3State.moedas.ptax?.meio || 0);
  const faturas = v3FaturasAtuais();
  const patrimonio = contas + investimentos + dolares - faturas;

  const net = document.querySelector("#v3NetWorth");
  const inv = document.querySelector("#v3DashboardInvestments");
  const usdEl = document.querySelector("#v3DashboardUsd");
  if (net) net.textContent = v3Dinheiro(patrimonio);
  if (inv) inv.textContent = investimentos ? v3Dinheiro(investimentos) : "Sem cotação";
  if (usdEl) usdEl.textContent = dolares ? v3Dinheiro(dolares) : v3Dinheiro(0);

  const ativos = Math.max(0, contas) + Math.max(0, investimentos) + Math.max(0, dolares);
  const pct = valor => ativos > 0 ? (Math.max(0, valor) / ativos) * 100 : 0;
  const a = document.querySelector("#v3DistAccounts");
  const i = document.querySelector("#v3DistInvest");
  const d = document.querySelector("#v3DistUsd");
  if (a) a.style.width = `${pct(contas)}%`;
  if (i) i.style.width = `${pct(investimentos)}%`;
  if (d) d.style.width = `${pct(dolares)}%`;

  const texto = document.querySelector("#v3DistributionText");
  if (texto) texto.textContent = `Contas ${v3Dinheiro(contas)} · Investimentos ${v3Dinheiro(investimentos)} · Dólares ${v3Dinheiro(dolares)} · Faturas consideradas ${v3Dinheiro(faturas)}.`;
}

function v3ConfigurarEventos() {
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
    const form = new FormData(evento.currentTarget);
    try {
      await v3Api("/api/v3/investimentos/posicoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      evento.currentTarget.reset();
      await v3CarregarInvestimentos();
    } catch (erro) {
      alert(erro.message);
    }
  });

  document.querySelector("#v3OperationForm")?.addEventListener("submit", async evento => {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    try {
      await v3Api("/api/v3/investimentos/operacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      evento.currentTarget.reset();
      await v3CarregarInvestimentos();
    } catch (erro) {
      alert(erro.message);
    }
  });

  document.querySelectorAll("#v3SimulatorForm input").forEach(input => input.addEventListener("input", v3Simular));
  document.querySelector("#v3SimReinvest")?.addEventListener("change", v3Simular);

  document.querySelector("#v3FxAccountForm")?.addEventListener("submit", async evento => {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    try {
      await v3Api("/api/v3/moedas/contas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      evento.currentTarget.reset();
      await v3CarregarMoedas();
    } catch (erro) {
      alert(erro.message);
    }
  });

  document.querySelector("#v3FxMovementForm")?.addEventListener("submit", async evento => {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    try {
      await v3Api("/api/v3/moedas/movimentacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      evento.currentTarget.reset();
      await v3CarregarMoedas();
    } catch (erro) {
      alert(erro.message);
    }
  });

  document.querySelector("#v3FxTransferForm")?.addEventListener("submit", async evento => {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    try {
      await v3Api("/api/v3/moedas/transferencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      evento.currentTarget.reset();
      await v3CarregarMoedas();
    } catch (erro) {
      alert(erro.message);
    }
  });
}

async function v3CarregarTudo() {
  v3DecorarCartoes();
  v3Simular();

  await Promise.allSettled([
    v3CarregarInvestimentos(),
    v3CarregarMoedas(),
    v3BuscarMercado(v3State.mercado.ticker, v3State.mercado.periodo),
  ]);

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
    if (titulo && secao === "investimentos") titulo.textContent = "Investimentos";
    if (titulo && secao === "moedas") titulo.textContent = "Moedas e viagens";
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
