// =========================================================
// MEU FINANCEIRO V4 — "SEUS CARTÕES"
// Lista todas as contas de cartão que o Pierre trouxe (um banco pode ter
// titular, adicional e virtual separados) e deixa escolher, para cada uma:
// mostrar separado, somar na fatura de outro cartão ou esconder.
// =========================================================

(() => {
  if (typeof mostrarCartoesEFaturas !== "function" || typeof modoCartao !== "function") return;

  const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const nomeCartao = (c) => `${c.nome}${c.ultimos4 ? ` · final ${c.ultimos4}` : ""}`;

  function montar() {
    let painel = document.querySelector("#v4Cartoes");
    if (painel) return painel;
    const titulo = document.querySelector("#cartoes > .section-title");
    if (!titulo) return null;
    painel = document.createElement("details");
    painel.id = "v4Cartoes";
    painel.className = "panel v4c";
    titulo.insertAdjacentElement("afterend", painel);

    painel.addEventListener("change", async (e) => {
      const sel = e.target.closest("select[data-cartao]");
      if (!sel) return;
      const accountId = sel.dataset.cartao;
      const [modo, somarEm] = sel.value.split("|");
      sel.disabled = true;
      try {
        await buscarDados("/api/cartoes/agrupamento", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, modo, somarEm: somarEm || null }),
        });
        agrupamentoCartoes[accountId] = { modo, somarEm: somarEm || null };
        painel.dataset.aberto = "1";
        mostrarCartoesEFaturas();
        if (typeof atualizarCompromissosMes === "function") atualizarCompromissosMes();
      } catch (erro) {
        sel.disabled = false;
        const aviso = painel.querySelector(".v4c-erro");
        if (aviso) aviso.textContent = erro.message || "Não foi possível salvar.";
      }
    });
    return painel;
  }

  function desenhar() {
    const painel = montar();
    if (!painel) return;
    const cartoes = state.cartoes || [];
    if (cartoes.length < 2) {
      painel.hidden = true;
      return;
    }
    painel.hidden = false;
    const aberto = painel.open || painel.dataset.aberto === "1";

    const porBanco = new Map();
    cartoes.forEach((c) => porBanco.set(c.banco, [...(porBanco.get(c.banco) || []), c]));
    const varios = [...porBanco.values()].some((l) => l.length > 1);

    const linhas = cartoes
      .map((c) => {
        const config = agrupamentoCartoes[String(c.id)] || { modo: "SEPARADO" };
        const atual = config.modo === "SOMAR" ? `SOMAR|${config.somarEm}` : config.modo || "SEPARADO";
        const outros = cartoes.filter((o) => o.id !== c.id && (agrupamentoCartoes[String(o.id)]?.modo || "SEPARADO") === "SEPARADO");
        const opcoes = [
          `<option value="SEPARADO" ${atual === "SEPARADO" ? "selected" : ""}>Mostrar separado</option>`,
          ...outros.map(
            (o) => `<option value="SOMAR|${esc(o.id)}" ${atual === `SOMAR|${o.id}` ? "selected" : ""}>Somar na fatura de ${esc(nomeCartao(o))}</option>`,
          ),
          `<option value="ESCONDER" ${atual === "ESCONDER" ? "selected" : ""}>Esconder</option>`,
        ].join("");
        return `<li class="v4c-item">
          <div class="v4c-info">
            <strong>${esc(c.nome)}</strong>
            <small>${esc(c.banco)}${c.ultimos4 ? ` · final ${esc(c.ultimos4)}` : ""}${c.bandeira ? ` · ${esc(c.bandeira)}` : ""}</small>
          </div>
          <span class="v4c-valor" title="Fatura atual só deste cartão">${esc(brl(valorFaturaDoCartao(c)))}</span>
          <select data-cartao="${esc(c.id)}" aria-label="Como mostrar ${esc(c.nome)}">${opcoes}</select>
        </li>`;
      })
      .join("");

    painel.innerHTML = `
      <summary>
        <span>Seus cartões <small>${cartoes.length} contas de cartão${varios ? " · algum banco tem mais de um" : ""}</small></span>
      </summary>
      <p class="v4c-dica">O banco às vezes manda o mesmo cartão em mais de uma conta (titular, adicional, virtual). O valor ao lado é a fatura atual <b>só daquele</b> cartão. Se dois fazem parte da mesma fatura, escolha "Somar na fatura de…". Se um repete o outro, escolha "Esconder".</p>
      <p class="v4c-erro" role="alert"></p>
      <ul class="v4c-lista">${linhas}</ul>
    `;
    painel.open = aberto;
  }

  // Diagnóstico: uma vez por abertura do app, manda o valor mostrado de cada
  // cartão para o servidor comparar com o que o Pierre devolve.
  let diagnosticoEnviado = false;
  function enviarDiagnostico() {
    if (diagnosticoEnviado || !(state.cartoes || []).length || !(state.faturas || []).length) return;
    diagnosticoEnviado = true;
    const cartoes = state.cartoes.map((c) => {
      const config = agrupamentoCartoes[String(c.id)] || { modo: "SEPARADO" };
      const temResumo = (state.resumos || []).some((r) => String(r.account_id || r.accountId || "") === String(c.id));
      return {
        id: c.id,
        modo: modoCartao(c),
        configurado: config.modo || "SEPARADO",
        somarEm: config.somarEm || null,
        valorProprio: Math.round(valorFaturaDoCartao(c) * 100) / 100,
        fonte: temResumo ? "resumo" : "fatura/transacoes",
      };
    });
    buscarDados("/api/cartoes/diagnostico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartoes }),
    }).catch((erro) => console.warn("Diagnóstico das faturas:", erro.message));
  }

  const original = mostrarCartoesEFaturas;
  mostrarCartoesEFaturas = function v4MostrarCartoes(...args) {
    const r = original.apply(this, args);
    try {
      desenhar();
      enviarDiagnostico();
    } catch (erro) {
      console.warn("Seus cartões:", erro);
    }
    return r;
  };
})();
