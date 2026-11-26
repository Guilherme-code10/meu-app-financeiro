// =========================================================
// MEU FINANCEIRO V4 — RENDIMENTOS PARA CONFERIR (CAIXINHAS)
// Mostra os "Rendimentos" que chegaram pelo Pierre e ainda não foram
// lançados, já com a caixinha sugerida. Um toque confirma tudo.
// =========================================================

(() => {
  if (typeof buscarDados !== "function") return;

  const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dataBR = (d) => String(d || "").split("-").reverse().join("/");
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  let estado = { pendentes: [], caixinhas: [], carregando: false, erro: null, mensagem: "" };
  const escolhas = new Map(); // transacaoId -> caixinhaId | "__ignorar__"

  function montar() {
    let painel = document.querySelector("#v4Rend");
    if (painel) return painel;
    const secao = document.querySelector("#caixinhas");
    const titulo = secao?.querySelector(":scope > .section-title");
    if (!secao || !titulo) return null;

    painel = document.createElement("article");
    painel.id = "v4Rend";
    painel.className = "panel v4r";
    painel.hidden = true;
    titulo.insertAdjacentElement("afterend", painel);

    painel.addEventListener("change", (e) => {
      const sel = e.target.closest("select[data-rend]");
      if (sel) escolhas.set(sel.dataset.rend, sel.value);
    });

    painel.addEventListener("click", async (e) => {
      const um = e.target.closest("[data-confirmar-um]");
      const todos = e.target.closest("[data-confirmar-todos]");
      if (!um && !todos) return;
      const ids = um ? [um.dataset.confirmarUm] : estado.pendentes.map((p) => p.transacaoId);
      await confirmar(ids);
    });
    return painel;
  }

  function escolhaDe(p) {
    return escolhas.get(p.transacaoId) ?? p.caixinhaSugerida ?? "";
  }

  function desenhar() {
    const painel = montar();
    if (!painel) return;

    const n = estado.pendentes.length;
    atualizarSelo(n);

    if (!n && !estado.mensagem && !estado.erro) {
      painel.hidden = true;
      return;
    }
    painel.hidden = false;

    if (!n) {
      painel.innerHTML = `<p class="v4r-ok">${esc(estado.erro || estado.mensagem)}</p>`;
      return;
    }

    const total = estado.pendentes.reduce((s, p) => s + p.valor, 0);
    const opcoes = (atual) =>
      `<option value="" ${atual === "" ? "selected" : ""} disabled>Escolha a caixinha</option>` +
      estado.caixinhas
        .map((c) => `<option value="${esc(c.id)}" ${atual === c.id ? "selected" : ""}>${esc(c.nome)}</option>`)
        .join("") +
      `<option value="__ignorar__" ${atual === "__ignorar__" ? "selected" : ""}>Não é de caixinha (ignorar)</option>`;

    let diaAnterior = "";
    const linhas = estado.pendentes
      .map((p) => {
        const cabecalho = p.data !== diaAnterior ? `<li class="v4r-dia">${esc(dataBR(p.data))}</li>` : "";
        diaAnterior = p.data;
        return `${cabecalho}<li class="v4r-item">
          <div class="v4r-info"><strong>+ ${esc(brl(p.valor))}</strong><small>${esc(p.descricao)}${p.banco ? " · " + esc(p.banco) : ""}</small></div>
          <select data-rend="${esc(p.transacaoId)}" aria-label="Caixinha do rendimento de ${esc(brl(p.valor))}">${opcoes(escolhaDe(p))}</select>
          <button type="button" class="v4r-btn" data-confirmar-um="${esc(p.transacaoId)}">Lançar</button>
        </li>`;
      })
      .join("");

    painel.innerHTML = `
      <div class="v4r-head">
        <div>
          <h2>Rendimentos para conferir</h2>
          <p>${n} rendimento${n === 1 ? "" : "s"} · ${esc(brl(total))}. A caixinha já vem sugerida pelo tamanho do saldo; troque se precisar.</p>
        </div>
        <button type="button" class="primary" data-confirmar-todos>Lançar todos</button>
      </div>
      ${estado.erro ? `<p class="v4r-erro">${esc(estado.erro)}</p>` : ""}
      <ul class="v4r-lista">${linhas}</ul>
    `;
  }

  function atualizarSelo(n) {
    const botao = document.querySelector('.nav-item[data-section="caixinhas"]');
    if (!botao) return;
    let selo = botao.querySelector(".v4r-selo");
    if (!n) return selo?.remove();
    if (!selo) {
      selo = document.createElement("b");
      selo.className = "v4r-selo";
      botao.appendChild(selo);
    }
    selo.textContent = String(n);
    selo.setAttribute("aria-label", `${n} rendimentos para conferir`);
  }

  async function carregar() {
    if (estado.carregando) return;
    estado.carregando = true;
    try {
      const r = await buscarDados("/api/caixinhas/rendimentos-pendentes");
      estado.pendentes = r.pendentes || [];
      estado.caixinhas = r.caixinhas || [];
      estado.erro = null;
    } catch (erro) {
      console.warn("Rendimentos pendentes:", erro.message);
    } finally {
      estado.carregando = false;
      desenhar();
    }
  }

  async function confirmar(ids) {
    const itens = [];
    for (const id of ids) {
      const p = estado.pendentes.find((x) => x.transacaoId === id);
      if (!p) continue;
      const escolha = escolhaDe(p);
      if (!escolha) continue;
      itens.push(escolha === "__ignorar__" ? { transacaoId: id, ignorar: true } : { transacaoId: id, caixinhaId: escolha });
    }
    if (!itens.length) {
      estado.erro = "Escolha a caixinha de cada rendimento antes de lançar.";
      return desenhar();
    }

    document.querySelectorAll("#v4Rend button").forEach((b) => (b.disabled = true));
    try {
      const r = await buscarDados("/api/caixinhas/rendimentos-pendentes/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens }),
      });
      const feitos = new Set([...(r.lancados || []).map((l) => l.transacaoId), ...(r.ignorados || [])]);
      estado.pendentes = estado.pendentes.filter((p) => !feitos.has(p.transacaoId));
      const soma = (r.lancados || []).reduce((s, l) => s + Number(l.valor || 0), 0);
      estado.erro = (r.recusados || []).length ? `${r.recusados.length} não foram lançados: ${r.recusados[0].motivo}` : null;
      estado.mensagem = r.lancados?.length
        ? `Pronto: ${r.lancados.length} rendimento${r.lancados.length === 1 ? "" : "s"} lançado${r.lancados.length === 1 ? "" : "s"} (${brl(soma)}).`
        : "Tudo em dia.";
      desenhar();
      if (typeof carregarCaixinhas === "function") await carregarCaixinhas();
    } catch (erro) {
      estado.erro = erro.message || "Não foi possível lançar agora.";
      desenhar();
    }
  }

  // Recarrega a lista sempre que as caixinhas forem carregadas (abertura,
  // botão Atualizar, depois de lançar algo) e ao abrir a tela Caixinhas.
  if (typeof carregarCaixinhas === "function") {
    const original = carregarCaixinhas;
    carregarCaixinhas = async function v4CarregarCaixinhas(...args) {
      const r = await original.apply(this, args);
      carregar();
      return r;
    };
  }
  if (typeof navegar === "function") {
    const anterior = navegar;
    navegar = function v4NavegarRend(secao) {
      anterior(secao);
      if (secao === "caixinhas") carregar();
    };
  }

  montar();
})();
