// =========================================================
// MEU FINANCEIRO V4 — RESUMO VISUAL DOS INVESTIMENTOS
// Um painel no topo da tela Investimentos que responde, em ordem:
//   1. Quanto eu tenho hoje e se estou ganhando ou perdendo?
//   2. Onde está o meu dinheiro?
//   3. Quanto cada ativo vale hoje x quanto eu paguei?
//   4. Quanto eu já coloquei ao longo do tempo?
// Usa só os dados que o V3 já carrega (v3State). Não inventa valores.
// =========================================================

(() => {
  if (typeof v3State === "undefined" || typeof v3RenderizarInvestimentos !== "function") return;

  // Cores por tipo de investimento (fixas por tipo, validadas para fundo escuro)
  const CORES = {
    "AÇÃO": "#9887ef",
    FII: "#00a888",
    ETF: "#e76624",
    BDR: "#338ced",
    OUTRO: "#d28e05",
    "RENDA FIXA": "#e24d8b",
  };
  const NOMES = {
    "AÇÃO": "Ações",
    FII: "Fundos imobiliários",
    ETF: "ETFs",
    BDR: "BDRs",
    OUTRO: "Outros",
    "RENDA FIXA": "Renda fixa / poupança",
  };

  const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pct = (v) => `${v >= 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const sinal = (v) => (v >= 0 ? "+" : "−") + brl(Math.abs(v));
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // -------------------------------------------------------
  // Monta o painel uma vez, logo abaixo do aviso de status
  // -------------------------------------------------------
  function montarPainel() {
    if (document.querySelector("#v4Invest")) return document.querySelector("#v4Invest");
    const ancora = document.querySelector("#v3InvestStatus");
    if (!ancora) return null;
    const painel = document.createElement("div");
    painel.id = "v4Invest";
    painel.className = "v4i";
    painel.innerHTML = `
      <div class="v4i-hero">
        <div>
          <span class="v4i-label">Sua carteira vale hoje</span>
          <strong class="v4i-big" id="v4iTotal">—</strong>
          <span class="v4i-sub" id="v4iTotalSub"></span>
        </div>
        <div class="v4i-facts">
          <div><span>Você colocou na bolsa</span><strong id="v4iCusto">—</strong></div>
          <div><span>Ganho ou perda na bolsa</span><strong id="v4iResultado">—</strong></div>
          <div><span>Proventos recebidos</span><strong id="v4iProventos">—</strong></div>
        </div>
      </div>

      <div class="v4i-grid">
        <section class="v4i-card">
          <h3>Onde está seu dinheiro</h3>
          <p class="v4i-hint">Cada cor é um tipo de investimento.</p>
          <div class="v4i-stack" id="v4iStack" role="img" aria-label="Divisão da carteira por tipo de investimento"></div>
          <ul class="v4i-legend" id="v4iLegend"></ul>
        </section>

        <section class="v4i-card">
          <h3>Cada ativo: quanto vale × quanto você pagou</h3>
          <p class="v4i-hint"><span class="v4i-key-bar"></span> vale hoje <span class="v4i-key-tick"></span> quanto você pagou</p>
          <div id="v4iAtivos" class="v4i-assets"></div>
        </section>
      </div>

      <section class="v4i-card v4i-card-wide" id="v4iEvoCard">
        <h3>Quanto você já colocou ao longo do tempo</h3>
        <p class="v4i-hint">Soma das compras menos as vendas registradas. O ponto final é quanto a bolsa vale hoje.</p>
        <div class="v4i-evo" id="v4iEvo"></div>
      </section>

      <div class="v4i-tip" id="v4iTip" role="status"></div>
    `;
    ancora.insertAdjacentElement("afterend", painel);

    // Tooltip compartilhado (mouse e toque)
    const tip = painel.querySelector("#v4iTip");
    const mostrar = (e) => {
      const alvo = e.target.closest("[data-tip]");
      if (!alvo || !painel.contains(alvo)) return (tip.style.display = "none");
      tip.innerHTML = alvo.dataset.tip;
      tip.style.display = "block";
      const caixa = painel.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - caixa.left;
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - caixa.top;
      const largura = tip.offsetWidth;
      tip.style.left = Math.max(4, Math.min(caixa.width - largura - 4, x - largura / 2)) + "px";
      tip.style.top = Math.max(4, y - tip.offsetHeight - 14) + "px";
    };
    painel.addEventListener("pointermove", mostrar);
    painel.addEventListener("pointerdown", mostrar);
    painel.addEventListener("pointerleave", () => (tip.style.display = "none"));

    new ResizeObserver(() => desenharEvolucao()).observe(painel.querySelector("#v4iEvo"));
    return painel;
  }

  // -------------------------------------------------------
  // Dados
  // -------------------------------------------------------
  function calcular() {
    const inv = v3State.investimentos;
    const ativos = (inv.posicoes || []).map((p) => {
      const qtd = Number(p.quantidade || 0);
      const custo = qtd * Number(p.preco_medio || 0);
      const preco = Number(inv.cotacoes.get(p.ticker)?.precoAtual || 0);
      const temCotacao = preco > 0;
      const valor = temCotacao ? qtd * preco : custo;
      const classe = CORES[p.classe] ? p.classe : "OUTRO";
      return { ticker: p.ticker, classe, custo, valor, temCotacao };
    });

    const externos = Array.isArray(inv.externos)
      ? inv.externos
          .map((x) => ({ nome: [x.produto, x.instituicao].filter(Boolean).join(" · "), valor: Number(x.saldo_observado) }))
          .filter((x) => Number.isFinite(x.valor) && x.valor > 0)
      : [];

    const bolsa = ativos.reduce((s, a) => s + a.valor, 0);
    const custo = ativos.reduce((s, a) => s + a.custo, 0);
    const semCotacao = ativos.filter((a) => !a.temCotacao).length;
    const rendaFixa = externos.reduce((s, x) => s + x.valor, 0);
    const proventos = (inv.dividendos || []).filter((d) => d.recebido !== false).reduce((s, d) => s + Number(d.valor || 0), 0);

    return { ativos, externos, bolsa, custo, semCotacao, rendaFixa, proventos, total: bolsa + rendaFixa };
  }

  // -------------------------------------------------------
  // 1. Número principal
  // -------------------------------------------------------
  function desenharResumo(d) {
    const $ = (id) => document.querySelector(id);
    $("#v4iTotal").textContent = brl(d.total);
    const partes = [`Bolsa ${brl(d.bolsa)}`];
    if (d.rendaFixa) partes.push(`Renda fixa ${brl(d.rendaFixa)}`);
    if (d.semCotacao) partes.push(`${d.semCotacao} ativo(s) sem cotação agora, contados pelo preço pago`);
    $("#v4iTotalSub").textContent = partes.join(" · ");

    $("#v4iCusto").textContent = brl(d.custo);
    const res = $("#v4iResultado");
    if (d.custo > 0 && !d.semCotacao) {
      const r = d.bolsa - d.custo;
      res.innerHTML = `${r >= 0 ? "▲" : "▼"} ${esc(sinal(r))} <small>${esc(pct((r / d.custo) * 100))}</small>`;
      res.className = r >= 0 ? "v4i-pos" : "v4i-neg";
    } else {
      res.textContent = d.custo > 0 ? "Aguardando cotações" : "—";
      res.className = "";
    }
    $("#v4iProventos").textContent = brl(d.proventos);
  }

  // -------------------------------------------------------
  // 2. Onde está o dinheiro (barra única dividida por tipo)
  // -------------------------------------------------------
  function desenharDivisao(d) {
    const grupos = new Map();
    d.ativos.forEach((a) => grupos.set(a.classe, (grupos.get(a.classe) || 0) + a.valor));
    if (d.rendaFixa) grupos.set("RENDA FIXA", d.rendaFixa);
    const itens = [...grupos.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const total = itens.reduce((s, [, v]) => s + v, 0);

    const stack = document.querySelector("#v4iStack");
    const legenda = document.querySelector("#v4iLegend");
    if (!total) {
      stack.innerHTML = "";
      legenda.innerHTML = '<li class="v4i-empty">Cadastre suas posições para ver a divisão.</li>';
      return;
    }
    stack.innerHTML = itens
      .map(([c, v]) => {
        const p = (v / total) * 100;
        return `<span style="flex:${p} 1 0;background:${CORES[c]}" data-tip="<b>${esc(NOMES[c])}</b><br>${esc(brl(v))} · ${esc(p.toFixed(1).replace(".", ","))}%"></span>`;
      })
      .join("");
    legenda.innerHTML = itens
      .map(([c, v]) => {
        const p = (v / total) * 100;
        return `<li data-tip="<b>${esc(NOMES[c])}</b><br>${esc(brl(v))}"><i style="background:${CORES[c]}"></i><span>${esc(NOMES[c])}</span><b>${esc(p.toFixed(0))}%</b><em>${esc(brl(v))}</em></li>`;
      })
      .join("");
  }

  // -------------------------------------------------------
  // 3. Cada ativo: barra = vale hoje, risco = quanto pagou
  // -------------------------------------------------------
  function desenharAtivos(d) {
    const alvo = document.querySelector("#v4iAtivos");
    const ativos = [...d.ativos].sort((a, b) => b.valor - a.valor);
    if (!ativos.length) {
      alvo.innerHTML = '<p class="v4i-empty">Nenhum ativo cadastrado ainda.</p>';
      return;
    }
    const max = Math.max(1, ...ativos.map((a) => Math.max(a.valor, a.custo)));
    alvo.innerHTML = ativos
      .map((a) => {
        const r = a.valor - a.custo;
        const rp = a.custo ? (r / a.custo) * 100 : 0;
        const resultado = a.temCotacao
          ? `<b class="${r >= 0 ? "v4i-pos" : "v4i-neg"}">${r >= 0 ? "▲" : "▼"} ${esc(pct(rp))}</b>`
          : '<b class="v4i-muted">sem cotação</b>';
        const tip = `<b>${esc(a.ticker)}</b> · ${esc(NOMES[a.classe])}<br>Vale hoje: ${esc(brl(a.valor))}<br>Você pagou: ${esc(brl(a.custo))}${
          a.temCotacao ? `<br>Resultado: ${esc(sinal(r))} (${esc(pct(rp))})` : "<br>Sem cotação agora"
        }`;
        return `<div class="v4i-asset" data-tip="${esc(tip)}">
          <span class="v4i-ticker"><i style="background:${CORES[a.classe]}"></i>${esc(a.ticker)}</span>
          <span class="v4i-track">
            <span class="v4i-fill" style="width:${((a.valor / max) * 100).toFixed(2)}%"></span>
            <span class="v4i-tick" style="left:${((a.custo / max) * 100).toFixed(2)}%"></span>
          </span>
          <span class="v4i-val">${esc(brl(a.valor))}</span>
          ${resultado}
        </div>`;
      })
      .join("");
  }

  // -------------------------------------------------------
  // 4. Evolução do dinheiro colocado (linha em degraus)
  // -------------------------------------------------------
  let ultimo = null;
  function desenharEvolucao(d = ultimo) {
    const card = document.querySelector("#v4iEvoCard");
    const s = document.querySelector("#v4iEvo");
    if (!d || !s) return;
    const ops = [...(v3State.investimentos.operacoes || [])]
      .filter((o) => o.data)
      .sort((a, b) => String(a.data).localeCompare(String(b.data)));
    if (!ops.length) {
      card.hidden = true;
      return;
    }
    card.hidden = false;

    let acc = 0;
    const pts = ops.map((o) => {
      const bruto = Number(o.quantidade || 0) * Number(o.preco_unitario || 0);
      const taxas = Number(o.taxas || 0);
      if (String(o.tipo).toUpperCase() === "COMPRA") acc += bruto + taxas;
      else if (String(o.tipo).toUpperCase() === "VENDA") acc -= Math.max(0, bruto - taxas);
      return { t: new Date(String(o.data).slice(0, 10) + "T12:00:00").getTime(), v: Math.max(0, acc) };
    });
    const hoje = Date.now();
    const fim = { t: hoje, v: d.bolsa };

    const W = s.clientWidth;
    const H = s.clientHeight;
    if (!W || !H) return;
    const pad = { l: 8, r: 12, t: 16, b: 26 };
    const t0 = pts[0].t;
    const t1 = Math.max(hoje, t0 + 86400000);
    const vmax = Math.max(1, ...pts.map((p) => p.v), fim.v) * 1.08;
    const X = (t) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - v / vmax) * (H - pad.t - pad.b);

    let caminho = `M${X(pts[0].t)},${Y(0)} L${X(pts[0].t)},${Y(pts[0].v)}`;
    for (let i = 1; i < pts.length; i++) caminho += ` L${X(pts[i].t)},${Y(pts[i - 1].v)} L${X(pts[i].t)},${Y(pts[i].v)}`;
    caminho += ` L${X(hoje)},${Y(pts[pts.length - 1].v)}`;
    const area = `${caminho} L${X(hoje)},${Y(0)} Z`;

    const fmtData = (t) => new Date(t).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    const ticks = W < 480 ? [t0, t1] : [t0, t0 + (t1 - t0) / 2, t1];
    const linhaGrade = [0.5, 1].map((f) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(vmax * f / 1.08)}" y2="${Y(vmax * f / 1.08)}" stroke="rgba(255,255,255,.06)"/>`).join("");
    const rotulosGrade = [0.5, 1].map((f) => `<text x="${pad.l}" y="${Y(vmax * f / 1.08) - 5}" font-size="11" fill="#8f8ca2">${esc(brl(vmax * f / 1.08).replace(/,\d+$/, ""))}</text>`).join("");

    const ganho = fim.v >= pts[pts.length - 1].v;
    s.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dinheiro colocado na bolsa ao longo do tempo">
      ${linhaGrade}
      <path d="${area}" fill="rgba(152,135,239,.14)"/>
      <path d="${caminho}" fill="none" stroke="#9887ef" stroke-width="2" stroke-linejoin="round"/>
      <line x1="${X(hoje)}" x2="${X(hoje)}" y1="${Y(pts[pts.length - 1].v)}" y2="${Y(fim.v)}" stroke="${ganho ? "#0aac23" : "#eb6263"}" stroke-width="2" stroke-dasharray="3 3"/>
      <circle cx="${X(hoje)}" cy="${Y(fim.v)}" r="5" fill="${ganho ? "#0aac23" : "#eb6263"}" stroke="#111118" stroke-width="2"/>
      ${rotulosGrade}
      ${ticks.map((t, i) => `<text x="${X(t)}" y="${H - 6}" font-size="11" fill="#8f8ca2" text-anchor="${i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}">${esc(fmtData(t))}</text>`).join("")}
      <line class="v4i-cross" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" stroke="rgba(255,255,255,.25)" style="display:none"/>
      <circle class="v4i-dot" r="4.5" fill="#9887ef" stroke="#111118" stroke-width="2" style="display:none"/>
      <rect x="0" y="0" width="${W}" height="${H}" fill="transparent" class="v4i-hit"/>
    </svg>`;

    // Cruz + tooltip: mostra o valor colocado até a data
    const svg = s.querySelector("svg");
    const cross = svg.querySelector(".v4i-cross");
    const dot = svg.querySelector(".v4i-dot");
    const hit = svg.querySelector(".v4i-hit");
    const valorEm = (t) => {
      let v = 0;
      for (const p of pts) if (p.t <= t) v = p.v;
      return v;
    };
    const mover = (e) => {
      const box = svg.getBoundingClientRect();
      const x = Math.max(pad.l, Math.min(W - pad.r, (e.touches ? e.touches[0].clientX : e.clientX) - box.left));
      const t = t0 + ((x - pad.l) / (W - pad.l - pad.r)) * (t1 - t0);
      const v = valorEm(t);
      cross.setAttribute("x1", x);
      cross.setAttribute("x2", x);
      cross.style.display = "";
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", Y(v));
      dot.style.display = "";
      const perto = Math.abs(x - X(hoje)) < 14;
      hit.dataset.tip = perto
        ? `<b>Hoje</b><br>Colocado: ${esc(brl(pts[pts.length - 1].v))}<br>Vale: ${esc(brl(fim.v))}`
        : `<b>${esc(new Date(t).toLocaleDateString("pt-BR"))}</b><br>Colocado até aqui: ${esc(brl(v))}`;
    };
    hit.addEventListener("pointermove", mover);
    hit.addEventListener("pointerdown", mover);
    hit.addEventListener("pointerleave", () => {
      cross.style.display = "none";
      dot.style.display = "none";
    });
  }

  // -------------------------------------------------------
  // Liga no V3: toda vez que a carteira é redesenhada, o resumo também
  // -------------------------------------------------------
  function desenhar() {
    if (!montarPainel()) return;
    const d = calcular();
    ultimo = d;
    desenharResumo(d);
    desenharDivisao(d);
    desenharAtivos(d);
    desenharEvolucao(d);
  }

  const original = v3RenderizarInvestimentos;
  v3RenderizarInvestimentos = function v4RenderizarInvestimentos(...args) {
    const r = original.apply(this, args);
    try {
      desenhar();
    } catch (erro) {
      console.warn("Resumo de investimentos:", erro);
    }
    return r;
  };

  desenhar();
})();
