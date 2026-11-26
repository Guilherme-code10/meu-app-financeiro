// =========================================================
// MEU FINANCEIRO V4 — TELA "MEU DIA"
// Hoje (tarefas + rotina do dia), contas que vencem nos próximos 7 dias,
// próximas tarefas da empresa que estão com você e anotações rápidas.
// Salva por usuário em /api/dia (tabela supabase/dia_usuario.sql),
// com cópia no navegador se o servidor não responder.
// =========================================================

(() => {
  if (typeof buscarDados !== "function") return;

  const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const CHAVE_LOCAL = "meuFinanceiroDia";
  const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hojeISO = () => iso(new Date());

  let st = { tarefas: [], rotina: [], rotinaFeita: {}, notas: [] };
  let modo = "local";
  let carregado = false;
  let timer = null;

  const normalizar = (d) => ({
    tarefas: Array.isArray(d?.tarefas) ? d.tarefas : [],
    rotina: Array.isArray(d?.rotina) ? d.rotina : [],
    rotinaFeita: d?.rotinaFeita && typeof d.rotinaFeita === "object" ? d.rotinaFeita : {},
    notas: Array.isArray(d?.notas) ? d.notas : [],
  });

  function lerLocal() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_LOCAL));
    } catch {
      return null;
    }
  }
  function gravarLocal() {
    try {
      localStorage.setItem(CHAVE_LOCAL, JSON.stringify(st));
    } catch {}
  }

  async function carregar() {
    if (carregado) return;
    carregado = true;
    const local = lerLocal();
    st = normalizar(local);
    try {
      const r = await buscarDados("/api/dia");
      modo = "nuvem";
      if (r.dia) st = normalizar(r.dia);
      else if (local) salvar();
    } catch (erro) {
      console.warn("Meu dia: usando só o navegador.", erro.message);
    }
    desenhar();
  }

  function salvar() {
    gravarLocal();
    if (modo !== "nuvem") return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      buscarDados("/api/dia", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dia: st }),
      }).catch(() => aviso("Não consegui salvar na nuvem agora. Ficou guardado neste aparelho."));
    }, 500);
  }

  function aviso(texto) {
    const el = document.querySelector("#v4dAviso");
    if (el) el.textContent = texto;
  }

  // ---------------------------------------------------------
  // Montagem da tela
  // ---------------------------------------------------------
  const main = document.querySelector(".main");
  if (!main || document.querySelector("#dia")) return;

  const sec = document.createElement("section");
  sec.id = "dia";
  sec.className = "section";
  sec.innerHTML = `
    <div class="v4d-hero">
      <div>
        <span class="v4d-data" id="v4dData"></span>
        <strong class="v4d-big" id="v4dResumo">Seu dia</strong>
        <div class="v4d-bar"><i id="v4dBar"></i></div>
      </div>
      <p class="v4d-aviso" id="v4dAviso"></p>
    </div>

    <div class="v4d-grid">
      <article class="panel v4d-hoje">
        <div class="panel-head"><div><h2>Hoje</h2><p>Tarefas do dia e a sua rotina, em ordem de horário.</p></div></div>
        <ul class="v4d-lista" id="v4dHoje"></ul>
        <form class="v4d-form" id="v4dNova">
          <input type="text" id="v4dTexto" placeholder="O que você precisa fazer?" maxlength="200" required aria-label="Nova tarefa">
          <div class="v4d-linha">
            <input type="time" id="v4dHora" aria-label="Horário (opcional)">
            <select id="v4dQuando" aria-label="Quando">
              <option value="hoje">Só hoje</option>
              <option value="amanha">Amanhã</option>
              <option value="rotina">Rotina (repete)</option>
            </select>
          </div>
          <div class="v4d-dias" id="v4dDias" hidden>
            ${DIAS.map((d, i) => `<label><input type="checkbox" value="${i}" ${i >= 1 && i <= 5 ? "checked" : ""}> ${d}</label>`).join("")}
          </div>
          <button type="submit" class="primary">Adicionar</button>
        </form>
        <details class="v4d-mais">
          <summary>Rotina cadastrada</summary>
          <ul class="v4d-lista" id="v4dRotina"></ul>
        </details>
      </article>

      <div class="v4d-col">
        <article class="panel">
          <div class="panel-head"><div><h2>Contas da semana</h2><p>Vencem nos próximos 7 dias.</p></div></div>
          <ul class="v4d-lista" id="v4dContas"></ul>
        </article>

        <article class="panel">
          <div class="panel-head"><div><h2>Empresa</h2><p>Próximas tarefas do Plano com você.</p></div></div>
          <ul class="v4d-lista" id="v4dEmpresa"></ul>
          <button type="button" class="v4d-link" id="v4dIrPlano">Abrir o Plano →</button>
        </article>

        <article class="panel">
          <div class="panel-head"><div><h2>Anotações</h2><p>Jogue a ideia aqui e organize depois.</p></div></div>
          <form class="v4d-form" id="v4dNotaForm">
            <textarea id="v4dNota" rows="2" maxlength="1000" placeholder="Escreva uma anotação…" aria-label="Nova anotação"></textarea>
            <button type="submit" class="primary">Guardar</button>
          </form>
          <ul class="v4d-notas" id="v4dNotas"></ul>
        </article>
      </div>
    </div>
  `;
  main.appendChild(sec);

  const $ = (id) => sec.querySelector(id);

  $("#v4dQuando").addEventListener("change", (e) => {
    $("#v4dDias").hidden = e.target.value !== "rotina";
  });

  $("#v4dNova").addEventListener("submit", (e) => {
    e.preventDefault();
    const t = $("#v4dTexto").value.trim();
    if (!t) return;
    const hora = $("#v4dHora").value || "";
    const quando = $("#v4dQuando").value;
    const id = "x" + Date.now();
    if (quando === "rotina") {
      const dias = [...$("#v4dDias").querySelectorAll("input:checked")].map((i) => Number(i.value));
      st.rotina.push({ id, t, hora, dias: dias.length ? dias : [0, 1, 2, 3, 4, 5, 6] });
    } else {
      const d = new Date();
      if (quando === "amanha") d.setDate(d.getDate() + 1);
      st.tarefas.push({ id, t, hora, data: iso(d), feito: false });
    }
    $("#v4dTexto").value = "";
    $("#v4dHora").value = "";
    salvar();
    desenhar();
  });

  $("#v4dNotaForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const t = $("#v4dNota").value.trim();
    if (!t) return;
    st.notas.unshift({ id: "n" + Date.now(), t, criado: new Date().toISOString() });
    $("#v4dNota").value = "";
    salvar();
    desenharNotas();
  });

  $("#v4dIrPlano").addEventListener("click", () => typeof navegar === "function" && navegar("plano"));

  sec.addEventListener("change", (e) => {
    const alvo = e.target.closest("[data-feito]");
    if (!alvo) return;
    const [tipo, id] = alvo.dataset.feito.split(":");
    const hoje = hojeISO();
    if (tipo === "t") {
      const t = st.tarefas.find((x) => x.id === id);
      if (t) t.feito = alvo.checked;
    } else {
      const feitas = new Set(st.rotinaFeita[hoje] || []);
      alvo.checked ? feitas.add(id) : feitas.delete(id);
      st.rotinaFeita[hoje] = [...feitas];
    }
    salvar();
    desenharHoje();
  });

  sec.addEventListener("click", (e) => {
    const del = e.target.closest("[data-apagar]");
    if (!del) return;
    const [tipo, id] = del.dataset.apagar.split(":");
    if (tipo === "t") st.tarefas = st.tarefas.filter((x) => x.id !== id);
    if (tipo === "r") st.rotina = st.rotina.filter((x) => x.id !== id);
    if (tipo === "n") st.notas = st.notas.filter((x) => x.id !== id);
    salvar();
    desenhar();
  });

  // ---------------------------------------------------------
  // Desenho
  // ---------------------------------------------------------
  function itensDeHoje() {
    const hoje = hojeISO();
    const dow = new Date().getDay();
    const feitasRotina = new Set(st.rotinaFeita[hoje] || []);
    const tarefas = st.tarefas
      .filter((t) => t.data === hoje || (t.data < hoje && !t.feito))
      .map((t) => ({ tipo: "t", id: t.id, t: t.t, hora: t.hora, feito: t.feito, atrasada: t.data < hoje }));
    const rotina = st.rotina
      .filter((r) => (r.dias || []).includes(dow))
      .map((r) => ({ tipo: "r", id: r.id, t: r.t, hora: r.hora, feito: feitasRotina.has(r.id) }));
    return [...tarefas, ...rotina].sort((a, b) => (a.hora || "99").localeCompare(b.hora || "99"));
  }

  function desenharHoje() {
    const itens = itensDeHoje();
    const feitos = itens.filter((i) => i.feito).length;
    $("#v4dResumo").textContent = itens.length
      ? `${feitos} de ${itens.length} feito${itens.length === 1 ? "" : "s"} hoje`
      : "Dia livre por enquanto";
    $("#v4dBar").style.width = itens.length ? `${(feitos / itens.length) * 100}%` : "0%";
    $("#v4dHoje").innerHTML = itens.length
      ? itens
          .map(
            (i) => `<li class="v4d-item${i.feito ? " feito" : ""}">
              <input type="checkbox" data-feito="${i.tipo}:${esc(i.id)}" ${i.feito ? "checked" : ""} aria-label="${esc(i.t)}">
              <span class="v4d-hora">${esc(i.hora || "—")}</span>
              <span class="v4d-texto">${esc(i.t)}${i.tipo === "r" ? ' <small class="v4d-tag">rotina</small>' : ""}${i.atrasada ? ' <small class="v4d-tag v4d-atrasada">ficou de antes</small>' : ""}</span>
              ${i.tipo === "t" ? `<button type="button" class="v4d-x" data-apagar="t:${esc(i.id)}" aria-label="Apagar">×</button>` : "<span></span>"}
            </li>`,
          )
          .join("")
      : '<li class="v4d-vazio">Nada para hoje. Adicione uma tarefa ou uma rotina abaixo.</li>';

    $("#v4dRotina").innerHTML = st.rotina.length
      ? st.rotina
          .map(
            (r) => `<li class="v4d-item v4d-item-rotina">
              <span class="v4d-hora">${esc(r.hora || "—")}</span>
              <span class="v4d-texto">${esc(r.t)} <small>${esc((r.dias || []).map((d) => DIAS[d]).join(", "))}</small></span>
              <button type="button" class="v4d-x" data-apagar="r:${esc(r.id)}" aria-label="Apagar rotina">×</button>
            </li>`,
          )
          .join("")
      : '<li class="v4d-vazio">Nenhuma rotina ainda. Escolha "Rotina (repete)" ao adicionar.</li>';
  }

  function contasDaSemana() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() + 7);
    const itens = [];

    // Contas fixas (mesma regra de parcelas da tela Contas fixas)
    for (const conta of (typeof state !== "undefined" && state.contasFixas) || []) {
      const dia = Number(conta.day || conta.dia || 0);
      if (!dia) continue;
      for (let m = 0; m <= 1; m++) {
        // dia 31 em mês curto vira o último dia do mês
        const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + m + 1, 0).getDate();
        const venc = new Date(hoje.getFullYear(), hoje.getMonth() + m, Math.min(dia, ultimoDia));
        if (venc < hoje || venc > limite) continue;
        const ano = venc.getFullYear();
        const mes = venc.getMonth();
        const parcelada = conta.tipo === "parcelada" || Number(conta.totalParcelas || 0) > 0;
        if (parcelada) {
          const inicial = Number(conta.parcelaAtual || 1);
          const diff = (ano - Number(conta.anoInicioParcela || ano)) * 12 + (mes - Number(conta.mesInicioParcela ?? mes));
          const parcela = inicial + diff;
          if (parcela < inicial || parcela > Number(conta.totalParcelas || 0)) continue;
        }
        const chave = `${ano}-${String(mes + 1).padStart(2, "0")}`;
        if (Array.isArray(conta.pagamentos) && conta.pagamentos.includes(chave)) continue;
        itens.push({ nome: conta.name || conta.nome || "Conta fixa", valor: Number(conta.amount || 0), venc, tipo: "Conta fixa" });
      }
    }

    // Faturas de cartão (vencimento informado pelo banco)
    for (const cartao of (typeof state !== "undefined" && state.cartoes) || []) {
      if (typeof modoCartao === "function" && modoCartao(cartao) !== "SEPARADO") continue;
      const v = cartao.vencimento ? new Date(String(cartao.vencimento).slice(0, 10) + "T12:00:00") : null;
      if (!v || Number.isNaN(v.getTime())) continue;
      v.setHours(0, 0, 0, 0);
      if (v < hoje || v > limite) continue;
      const valor = typeof valorFaturaDoCartao === "function" ? valorFaturaDoCartao(cartao) : null;
      itens.push({ nome: `Fatura ${cartao.nome}`, valor, venc: v, tipo: "Cartão" });
    }

    return itens.sort((a, b) => a.venc - b.venc);
  }

  function desenharContas() {
    const itens = contasDaSemana();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const quando = (d) => {
      const dif = Math.round((d - hoje) / 86400000);
      if (dif === 0) return "hoje";
      if (dif === 1) return "amanhã";
      return `${DIAS[d.getDay()].toLowerCase()} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    };
    $("#v4dContas").innerHTML = itens.length
      ? itens
          .map(
            (i) => `<li class="v4d-conta">
              <span><strong>${esc(i.nome)}</strong><small>${esc(i.tipo)} · vence ${esc(quando(i.venc))}</small></span>
              <b>${i.valor == null ? "a confirmar" : esc(brl(i.valor))}</b>
            </li>`,
          )
          .join("")
      : '<li class="v4d-vazio">Nenhuma conta vencendo nos próximos 7 dias.</li>';
  }

  async function desenharEmpresa() {
    const el = $("#v4dEmpresa");
    if (!window.v4Plano) {
      el.innerHTML = "";
      return;
    }
    try {
      await window.v4Plano.carregar();
    } catch {}
    const minhas = window.v4Plano
      .pendentes()
      .filter((t) => t.q === "Você" || t.q === "Juntos")
      .sort((a, b) => Number(a.f) - Number(b.f))
      .slice(0, 3);
    el.innerHTML = minhas.length
      ? minhas
          .map(
            (t) => `<li class="v4d-conta"><span><strong>${esc(t.t)}</strong><small>${esc(window.v4Plano.fases[t.f] || "")} · ${esc(t.q)}</small></span></li>`,
          )
          .join("")
      : '<li class="v4d-vazio">Tudo feito na empresa por agora.</li>';
  }

  function desenharNotas() {
    $("#v4dNotas").innerHTML = st.notas.length
      ? st.notas
          .slice(0, 30)
          .map((n) => {
            const d = new Date(n.criado);
            const data = Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
            return `<li><p>${esc(n.t)}</p><small>${esc(data)}</small><button type="button" class="v4d-x" data-apagar="n:${esc(n.id)}" aria-label="Apagar anotação">×</button></li>`;
          })
          .join("")
      : "";
  }

  function desenhar() {
    const agora = new Date();
    const texto = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
    $("#v4dData").textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
    desenharHoje();
    desenharContas();
    desenharEmpresa();
    desenharNotas();
    aviso(modo === "nuvem" ? "Salvo na sua conta." : "Salvo só neste aparelho.");
  }

  if (typeof navegar === "function") {
    const anterior = navegar;
    navegar = function v4NavegarDia(secao) {
      anterior(secao);
      if (secao === "dia") {
        const titulo = document.querySelector("#pageTitle");
        if (titulo) titulo.textContent = "Meu dia";
        carregar().then(desenhar);
        desenhar();
      }
    };
  }
})();
