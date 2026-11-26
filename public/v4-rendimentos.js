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

  let estado = { pendentes: [], recentes: [], caixinhas: [], carregando: false, erro: null, mensagem: "" };
  let ultimoAutomatico = 0;
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
      const mover = e.target.closest("select[data-mover]");
      if (mover) moverRendimento(mover.dataset.mover, mover.value, mover);
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

    if (!n && !estado.recentes.length && !estado.erro) {
      painel.hidden = true;
      return;
    }
    painel.hidden = false;

    const nomeCx = new Map(estado.caixinhas.map((c) => [c.id, c.nome]));
    const opcoesCx = (atual, comIgnorar) =>
      `<option value="" ${atual === "" ? "selected" : ""} disabled>Escolha a caixinha</option>` +
      estado.caixinhas
        .map((c) => `<option value="${esc(c.id)}" ${atual === c.id ? "selected" : ""}>${esc(c.nome)}</option>`)
        .join("") +
      (comIgnorar ? `<option value="__ignorar__" ${atual === "__ignorar__" ? "selected" : ""}>Não é de caixinha (ignorar)</option>` : "");

    const blocoPendentes = n
      ? `<div class="v4r-head">
          <div>
            <h3>Para conferir</h3>
            <p>${n} rendimento${n === 1 ? "" : "s"} sem caixinha definida · ${esc(brl(estado.pendentes.reduce((s, p) => s + p.valor, 0)))}</p>
          </div>
          <button type="button" class="primary" data-confirmar-todos>Lançar todos</button>
        </div>
        <ul class="v4r-lista">${agruparPorDia(estado.pendentes, (p) => `<li class="v4r-item">
          <div class="v4r-info"><strong>+ ${esc(brl(p.valor))}</strong><small>${esc(p.descricao)}${p.banco ? " · " + esc(p.banco) : ""}</small></div>
          <select data-rend="${esc(p.transacaoId)}" aria-label="Caixinha do rendimento de ${esc(brl(p.valor))}">${opcoesCx(escolhaDe(p), true)}</select>
          <button type="button" class="v4r-btn" data-confirmar-um="${esc(p.transacaoId)}">Lançar</button>
        </li>`)}</ul>`
      : "";

    const totalRecentes = estado.recentes.reduce((s, r) => s + r.valor, 0);
    const blocoRecentes = estado.recentes.length
      ? `<details class="v4r-recentes" ${n ? "" : "open"}>
          <summary>Lançados automaticamente nos últimos 30 dias · ${esc(brl(totalRecentes))}</summary>
          <p class="v4r-dica">Cada rendimento já entrou na caixinha. Se algum foi para a caixinha errada, troque aqui que os saldos se ajustam.</p>
          <ul class="v4r-lista">${agruparPorDia(estado.recentes, (r) => `<li class="v4r-item v4r-item-ok">
            <div class="v4r-info"><strong>+ ${esc(brl(r.valor))}</strong><small>em ${esc(nomeCx.get(r.caixinhaId) || "caixinha")}</small></div>
            <select data-mover="${esc(r.transacaoId)}" aria-label="Trocar caixinha do rendimento de ${esc(brl(r.valor))}">${opcoesCx(r.caixinhaId, false)}</select>
          </li>`)}</ul>
        </details>`
      : "";

    painel.innerHTML = `
      <h2>Rendimentos das caixinhas</h2>
      ${estado.mensagem ? `<p class="v4r-ok">${esc(estado.mensagem)}</p>` : ""}
      ${estado.erro ? `<p class="v4r-erro">${esc(estado.erro)}</p>` : ""}
      ${blocoPendentes}
      ${blocoRecentes}
      <details class="v4r-recentes" data-brutos>
        <summary>Ver o que o banco manda em cada rendimento</summary>
        <p class="v4r-dica">Mostra os campos que o Pierre envia, para descobrir se dá para saber de qual cofrinho veio.</p>
        <pre class="v4r-brutos">Carregando…</pre>
      </details>
    `;
    const det = painel.querySelector("[data-brutos]");
    det?.addEventListener("toggle", async () => {
      if (!det.open || det.dataset.ok) return;
      det.dataset.ok = "1";
      const pre = det.querySelector("pre");
      try {
        const r = await buscarDados("/api/caixinhas/rendimentos-brutos");
        pre.textContent = (r.rendimentos || []).length
          ? r.rendimentos.map((x) => Object.entries(x).map(([k, v]) => `${k}: ${v}`).join("\n")).join("\n\n──────\n\n")
          : "Nenhum rendimento recebido desde 11/11.";
      } catch (erro) {
        pre.textContent = erro.message;
      }
    });
  }

  function agruparPorDia(lista, linha) {
    let dia = "";
    return lista
      .map((item) => {
        const cab = item.data !== dia ? `<li class="v4r-dia">${esc(dataBR(item.data))}</li>` : "";
        dia = item.data;
        return cab + linha(item);
      })
      .join("");
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
      // Lança sozinho o que tem caixinha sugerida (no máximo a cada 2 min)
      if (Date.now() - ultimoAutomatico > 120000) {
        ultimoAutomatico = Date.now();
        try {
          const auto = await buscarDados("/api/caixinhas/rendimentos-pendentes/automatico", { method: "POST" });
          const lancados = auto.lancados || [];
          if (lancados.length) {
            const soma = lancados.reduce((s, l) => s + Number(l.valor || 0), 0);
            estado.mensagem = `${lancados.length} rendimento${lancados.length === 1 ? "" : "s"} lançado${lancados.length === 1 ? "" : "s"} direto nas caixinhas (${brl(soma)}).`;
            if (typeof carregarCaixinhasOriginal === "function") await carregarCaixinhasOriginal();
          }
        } catch (erro) {
          console.warn("Rendimentos automáticos:", erro.message);
        }
      }

      const [r, rec] = await Promise.all([
        buscarDados("/api/caixinhas/rendimentos-pendentes"),
        buscarDados("/api/caixinhas/rendimentos-recentes").catch(() => ({ recentes: [] })),
      ]);
      estado.pendentes = r.pendentes || [];
      estado.caixinhas = r.caixinhas || [];
      estado.recentes = rec.recentes || [];
      estado.erro = null;
    } catch (erro) {
      console.warn("Rendimentos pendentes:", erro.message);
    } finally {
      estado.carregando = false;
      desenhar();
    }
  }

  async function moverRendimento(transacaoId, caixinhaId, select) {
    select.disabled = true;
    try {
      await buscarDados("/api/caixinhas/rendimentos-recentes/mover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transacaoId, caixinhaId }),
      });
      const item = estado.recentes.find((r) => r.transacaoId === transacaoId);
      if (item) item.caixinhaId = caixinhaId;
      estado.mensagem = "Rendimento trocado de caixinha.";
      estado.erro = null;
      if (typeof carregarCaixinhasOriginal === "function") await carregarCaixinhasOriginal();
    } catch (erro) {
      estado.erro = erro.message || "Não foi possível trocar a caixinha.";
    }
    desenhar();
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
      if (typeof carregarCaixinhasOriginal === "function") await carregarCaixinhasOriginal();
      const rec = await buscarDados("/api/caixinhas/rendimentos-recentes").catch(() => ({ recentes: estado.recentes }));
      estado.recentes = rec.recentes || [];
      desenhar();
    } catch (erro) {
      estado.erro = erro.message || "Não foi possível lançar agora.";
      desenhar();
    }
  }

  // Recarrega a lista sempre que as caixinhas forem carregadas (abertura,
  // botão Atualizar, depois de lançar algo) e ao abrir a tela Caixinhas.
  let carregarCaixinhasOriginal = null;
  if (typeof carregarCaixinhas === "function") {
    const original = carregarCaixinhas;
    carregarCaixinhasOriginal = (...a) => original(...a);
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
