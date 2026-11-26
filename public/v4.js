// =========================================================
// MEU FINANCEIRO V4 — NOVO LAYOUT + TELA "PLANO"
// Carrega depois de app.js e v3.js. Não muda nenhuma função
// financeira: só reorganiza o menu, adiciona a barra de abas
// do celular e a tela Plano (checklist e ideias).
// =========================================================

(() => {
  document.body.classList.add("v4");

  const svg = (d) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

  const ICONES = {
    dashboard: svg('<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'),
    contas: svg('<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/>'),
    cartoes: svg('<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/>'),
    transacoes: svg('<path d="M7 4 3 8l4 4"/><path d="M3 8h13"/><path d="m17 20 4-4-4-4"/><path d="M21 16H8"/>'),
    parcelas: svg('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>'),
    investimentos: svg('<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
    moedas: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z"/>'),
    fixas: svg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/>'),
    planejamento: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>'),
    caixinhas: svg('<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M7 7V5.5A1.5 1.5 0 0 1 8.5 4h7A1.5 1.5 0 0 1 17 5.5V7"/><path d="M15.5 13.5h2"/>'),
    plano: svg('<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Z"/><path d="M9 4v13.5M15 6.5V20"/>'),
    mais: svg('<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>'),
  };

  const GRUPOS = [
    ["Visão geral", ["dashboard"]],
    ["Dinheiro", ["contas", "cartoes", "transacoes", "parcelas", "investimentos", "moedas"]],
    ["Planejamento", ["fixas", "planejamento", "caixinhas"]],
    ["Empresa", ["plano"]],
  ];

  // -------------------------------------------------------
  // MENU LATERAL: grupos + ícones + botão Plano
  // -------------------------------------------------------

  const nav = document.querySelector(".sidebar nav");

  if (nav && !nav.querySelector('[data-section="plano"]')) {
    const plano = document.createElement("button");
    plano.className = "nav-item";
    plano.dataset.section = "plano";
    plano.innerHTML = "<span>Plano</span>";
    nav.appendChild(plano);

    const botoes = {};
    nav.querySelectorAll(".nav-item").forEach((b) => {
      botoes[b.dataset.section] = b;
      // tira o emoji (nó de texto) e coloca o ícone
      [...b.childNodes].forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE) n.remove();
      });
      if (ICONES[b.dataset.section]) b.insertAdjacentHTML("afterbegin", ICONES[b.dataset.section]);
    });

    const usados = new Set();
    nav.innerHTML = "";
    GRUPOS.forEach(([titulo, secoes]) => {
      const itens = secoes.map((s) => botoes[s]).filter(Boolean);
      if (!itens.length) return;
      const label = document.createElement("div");
      label.className = "v4-nav-label";
      label.textContent = titulo;
      nav.appendChild(label);
      itens.forEach((b) => {
        nav.appendChild(b);
        usados.add(b.dataset.section);
      });
    });
    // qualquer botão que não esteja nos grupos continua no menu
    Object.entries(botoes).forEach(([s, b]) => {
      if (!usados.has(s)) nav.appendChild(b);
    });
  }

  // -------------------------------------------------------
  // BARRA DE ABAS NO CELULAR
  // -------------------------------------------------------

  const shell = document.querySelector("#appShell");
  const ABAS = [
    ["dashboard", "Início"],
    ["transacoes", "Transações"],
    ["cartoes", "Cartões"],
    ["fixas", "Fixas"],
    ["mais", "Mais"],
  ];

  if (shell && !document.querySelector(".v4-tabbar")) {
    const barra = document.createElement("nav");
    barra.className = "v4-tabbar";
    barra.setAttribute("aria-label", "Navegação principal");
    barra.innerHTML = ABAS.map(
      ([s, nome]) => `<button type="button" data-tab="${s}">${ICONES[s]}<span>${nome}</span></button>`,
    ).join("");
    shell.appendChild(barra);

    barra.addEventListener("click", (e) => {
      const botao = e.target.closest("button[data-tab]");
      if (!botao) return;
      if (botao.dataset.tab === "mais") {
        document.querySelector("#mobileMenuButton")?.click();
      } else if (typeof navegar === "function") {
        navegar(botao.dataset.tab);
        window.scrollTo({ top: 0 });
      }
    });
  }

  function marcarAba(secao) {
    const naBarra = ABAS.some(([s]) => s === secao);
    document.querySelectorAll(".v4-tabbar button").forEach((b) => {
      b.classList.toggle("active", naBarra ? b.dataset.tab === secao : b.dataset.tab === "mais");
    });
  }
  marcarAba("dashboard");

  // -------------------------------------------------------
  // TELA PLANO
  // -------------------------------------------------------

  const FASES = ["Base", "Lançar", "Primeiros clientes", "Central"];
  const AREAS = ["Empresa", "Portfólio", "App financeiro", "Central", "Burocracia"];
  const QUEM = ["Você", "Claude", "Juntos"];

  const TAREFAS = [
    ["Terminar o site dos cílios", 0, "Portfólio", "Juntos", "É o seu primeiro case. Capricha."],
    ["Pegar depoimento + prints do site dos cílios", 0, "Portfólio", "Você", "Um depoimento curto já serve"],
    ["Decidir o nicho (ex.: beleza e estética)", 0, "Empresa", "Você", "Facilita muito a venda e o marketing"],
    ["Definir pacotes e preços (Básico / Completo / Mensalidade)", 0, "Empresa", "Juntos", ""],
    ["Pesquisar quanto a concorrência cobra na sua cidade", 0, "Empresa", "Claude", "Me pede e eu pesquiso"],
    ["App financeiro: separar dinheiro pessoal x empresa", 0, "App financeiro", "Claude", ""],
    ["Escolher o nome da empresa", 0, "Empresa", "Você", "Posso sugerir opções"],
    ["Registrar domínio", 1, "Empresa", "Você", ""],
    ["Criar a página de portfólio", 1, "Portfólio", "Claude", "Com pacotes e botão de WhatsApp"],
    ["Formulário de orçamento no portfólio", 1, "Portfólio", "Claude", ""],
    ["Criar Instagram da empresa", 1, "Empresa", "Você", "Posso montar ideias de posts"],
    ["Template base reaproveitável para o nicho", 1, "Empresa", "Claude", "Entrega mais rápido = ganha mais por hora"],
    ["Modelo de contrato simples", 1, "Burocracia", "Juntos", "Eu faço o rascunho; vale alguém revisar"],
    ["Abrir MEI (confirmar a atividade/CNAE certa)", 1, "Burocracia", "Você", ""],
    ["Conta bancária separada para a empresa", 1, "Burocracia", "Você", ""],
    ["Fazer 1 ou 2 sites barato/grátis para conhecidos", 2, "Portfólio", "Juntos", "Em troca de depoimento"],
    ["Listar 20 negócios locais sem site (ou com site ruim)", 2, "Empresa", "Juntos", "Para abordar direto"],
    ["Central: módulo de clientes e projetos", 3, "Central", "Claude", ""],
    ["Central: orçamento vira cliente, pagamento vira receita", 3, "Central", "Claude", "Liga portfólio + financeiro"],
    ["Central: tarefas do dia a dia", 3, "Central", "Claude", ""],
  ].map((r, i) => ({ id: "b" + i, t: r[0], f: r[1], a: r[2], q: r[3], o: r[4] }));

  const IDEIAS = [
    ["Mensalidade de manutenção e hospedagem", "Renda recorrente: estabilidade todo mês"],
    ["Agendamento online como diferencial", "Salões e estúdios valorizam muito, e você já sabe fazer"],
    ["Pacote site + Google Meu Negócio configurado", "Ajuda o cliente a aparecer no Google Maps"],
    ["Desconto para cliente que indicar outro", "Indicação é o canal mais barato no começo"],
    ["Indicações dentro do nicho de beleza", "Quem já é cliente conhece outras profissionais"],
    ["Mostrar bastidores no Instagram (antes/depois)", "Gera confiança e conteúdo fácil"],
    ["Usar o próprio app como case no portfólio", "Mostra que você constrói sistemas, não só páginas"],
    ["No futuro: vender a central para outros autônomos", "Vira produto, não só serviço"],
  ].map((r, i) => ({ id: "i" + i, t: r[0], p: r[1] }));

  const CHAVE_LOCAL = "meuFinanceiroPlano";
  let st = { done: {}, tasks: [], ideas: [] };
  let filtro = "Todos";
  let modo = "local"; // "nuvem" quando o Supabase responder
  let carregado = false;
  let timerSalvar = null;

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function lerLocal() {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE_LOCAL));
      if (s) return s;
    } catch {}
    return null;
  }
  function gravarLocal() {
    try {
      localStorage.setItem(CHAVE_LOCAL, JSON.stringify(st));
    } catch {}
  }
  const normalizar = (s) => ({
    done: s && typeof s.done === "object" ? s.done : {},
    tasks: Array.isArray(s?.tasks) ? s.tasks : [],
    ideas: Array.isArray(s?.ideas) ? s.ideas : [],
  });

  async function carregarPlano() {
    if (carregado) return;
    carregado = true;
    const local = lerLocal();
    st = normalizar(local);
    try {
      const r = await buscarDados("/api/plano");
      modo = "nuvem";
      if (r.plano) st = normalizar(r.plano);
      else if (local) salvar(); // primeira vez: sobe o que já tinha no navegador
    } catch (erro) {
      console.warn("Plano: usando só o navegador.", erro.message);
      modo = "local";
    }
    desenhar();
  }

  function salvar() {
    gravarLocal();
    if (modo !== "nuvem") return;
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(async () => {
      try {
        await buscarDados("/api/plano", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plano: st }),
        });
        atualizarAviso("Salvo na sua conta.");
      } catch (erro) {
        atualizarAviso("Não consegui salvar na nuvem agora. Ficou guardado neste aparelho.");
      }
    }, 600);
  }

  function atualizarAviso(texto) {
    const el = document.querySelector("#v4pSync");
    if (el) el.textContent = texto;
  }

  const main = document.querySelector(".main");
  if (main && !document.querySelector("#plano")) {
    const sec = document.createElement("section");
    sec.id = "plano";
    sec.className = "section";
    sec.innerHTML = `
      <div class="v4p-hero">
        <div>
          <div class="v4p-big" id="v4pPct">0%</div>
          <div class="v4p-sub" id="v4pCnt">do plano da empresa de sites</div>
          <div class="v4p-bar"><i id="v4pBar"></i></div>
          <div class="v4p-sync" id="v4pSync">Carregando...</div>
        </div>
        <div class="v4p-route"><svg id="v4pRoute" role="img" aria-label="Rota com as quatro fases do plano"></svg></div>
      </div>

      <div class="v4p-chips" id="v4pChips"></div>

      <div class="v4p-cols">
        <article class="panel">
          <div class="panel-head"><div><h2>Checklist</h2><p>Marque o que já fez. Cada fase é uma parada da rota.</p></div></div>
          <div id="v4pFases"></div>
          <form class="v4p-form" id="v4pNovaTarefa">
            <input type="text" id="v4pTarefaNome" placeholder="Nova tarefa" required aria-label="Nova tarefa" maxlength="200">
            <div class="v4p-row">
              <select id="v4pTarefaFase" aria-label="Fase">${FASES.map((f, i) => `<option value="${i}">${f}</option>`).join("")}</select>
              <select id="v4pTarefaArea" aria-label="Área">${AREAS.map((a) => `<option>${a}</option>`).join("")}</select>
              <select id="v4pTarefaQuem" aria-label="Quem faz">${QUEM.map((q) => `<option>${q}</option>`).join("")}</select>
            </div>
            <button type="submit" class="primary">Adicionar tarefa</button>
          </form>
        </article>

        <article class="panel">
          <div class="panel-head"><div><h2>Ideias</h2><p>Para não esquecer.</p></div></div>
          <div id="v4pIdeias"></div>
          <form class="v4p-form" id="v4pNovaIdeia">
            <input type="text" id="v4pIdeiaNome" placeholder="Nova ideia" required aria-label="Nova ideia" maxlength="200">
            <input type="text" id="v4pIdeiaPq" placeholder="Por que vale a pena?" aria-label="Por que vale a pena" maxlength="300">
            <button type="submit" class="primary">Guardar ideia</button>
          </form>
        </article>
      </div>
    `;
    main.appendChild(sec);

    sec.addEventListener("change", (e) => {
      const id = e.target.dataset?.task;
      if (!id) return;
      if (e.target.checked) st.done[id] = true;
      else delete st.done[id];
      salvar();
      desenharTarefas();
      desenharRota();
    });

    sec.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-filtro]");
      if (chip) {
        filtro = chip.dataset.filtro;
        desenharChips();
        desenharTarefas();
      }
      const delT = e.target.closest("[data-del-task]");
      if (delT) {
        st.tasks = st.tasks.filter((t) => t.id !== delT.dataset.delTask);
        delete st.done[delT.dataset.delTask];
        salvar();
        desenharTarefas();
        desenharRota();
      }
      const delI = e.target.closest("[data-del-ideia]");
      if (delI) {
        st.ideas = st.ideas.filter((i) => i.id !== delI.dataset.delIdeia);
        salvar();
        desenharIdeias();
      }
    });

    sec.querySelector("#v4pNovaTarefa").addEventListener("submit", (e) => {
      e.preventDefault();
      const nome = sec.querySelector("#v4pTarefaNome");
      st.tasks.push({
        id: "c" + Date.now(),
        t: nome.value.trim(),
        f: Number(sec.querySelector("#v4pTarefaFase").value),
        a: sec.querySelector("#v4pTarefaArea").value,
        q: sec.querySelector("#v4pTarefaQuem").value,
        o: "",
      });
      nome.value = "";
      salvar();
      desenharTarefas();
      desenharRota();
    });

    sec.querySelector("#v4pNovaIdeia").addEventListener("submit", (e) => {
      e.preventDefault();
      const nome = sec.querySelector("#v4pIdeiaNome");
      const pq = sec.querySelector("#v4pIdeiaPq");
      st.ideas.push({ id: "n" + Date.now(), t: nome.value.trim(), p: pq.value.trim() });
      nome.value = "";
      pq.value = "";
      salvar();
      desenharIdeias();
    });

    new ResizeObserver(() => desenharRota()).observe(sec.querySelector("#v4pRoute"));
  }

  const todas = () => TAREFAS.concat(st.tasks);

  function desenharChips() {
    const el = document.querySelector("#v4pChips");
    if (!el) return;
    const nomes = { Todos: "Todas", Você: "Só você", Claude: "Só Claude", Juntos: "Juntos" };
    el.innerHTML = ["Todos", ...QUEM]
      .map((q) => `<button type="button" data-filtro="${q}" aria-pressed="${q === filtro}">${nomes[q]}</button>`)
      .join("");
  }

  function desenharTarefas() {
    const el = document.querySelector("#v4pFases");
    if (!el) return;
    const ts = todas();
    const html = FASES.map((fase, fi) => {
      const daFase = ts.filter((t) => Number(t.f) === fi);
      const visiveis = daFase.filter((t) => filtro === "Todos" || t.q === filtro);
      if (!visiveis.length) return "";
      const feitas = daFase.filter((t) => st.done[t.id]).length;
      return `<div class="v4p-phase">
        <div class="v4p-phase-head"><b>Parada ${fi + 1}</b><h3>${fase}</h3><small>${feitas} de ${daFase.length}</small></div>
        <ul>${visiveis
          .map((t) => {
            const minha = String(t.id).startsWith("c");
            return `<li class="v4p-task${st.done[t.id] ? " done" : ""}">
              <input type="checkbox" data-task="${esc(t.id)}" ${st.done[t.id] ? "checked" : ""} aria-label="${esc(t.t)}">
              <span class="v4p-name">${esc(t.t)}</span>
              <span class="v4p-tags"><span class="v4p-tag">${esc(t.a)}</span><span class="v4p-tag q-${esc(t.q)}">${esc(t.q)}</span></span>
              ${t.o || minha ? `<span class="v4p-obs">${esc(t.o)}${minha ? ` <button type="button" class="v4p-del" data-del-task="${esc(t.id)}">remover</button>` : ""}</span>` : ""}
            </li>`;
          })
          .join("")}</ul></div>`;
    }).join("");
    el.innerHTML = html || '<p class="v4p-sub">Nenhuma tarefa com esse filtro.</p>';
  }

  function desenharIdeias() {
    const el = document.querySelector("#v4pIdeias");
    if (!el) return;
    el.innerHTML = IDEIAS.concat(st.ideas)
      .map(
        (i) => `<div class="v4p-idea"><b>${esc(i.t)}</b>${i.p ? `<p>${esc(i.p)}</p>` : ""}${
          String(i.id).startsWith("n") ? `<button type="button" class="v4p-del" data-del-ideia="${esc(i.id)}">remover</button>` : ""
        }</div>`,
      )
      .join("");
  }

  function desenharRota() {
    const s = document.querySelector("#v4pRoute");
    if (!s) return;
    const ts = todas();
    const total = ts.length;
    const ok = ts.filter((t) => st.done[t.id]).length;
    const p = total ? ok / total : 0;

    const pct = document.querySelector("#v4pPct");
    if (pct) pct.textContent = Math.round(p * 100) + "%";
    const cnt = document.querySelector("#v4pCnt");
    if (cnt) cnt.textContent = `${ok} de ${total} tarefas do plano da empresa de sites`;
    const bar = document.querySelector("#v4pBar");
    if (bar) bar.style.width = p * 100 + "%";

    const W = s.clientWidth;
    const H = s.clientHeight;
    if (!W || !H) return;
    const pequeno = W < 420;
    const pts = FASES.map((_, i) => [W * (0.09 + i * 0.27), H * (i % 2 ? 0.3 : 0.58)]);
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const mx = (a[0] + b[0]) / 2;
      d += ` C${mx},${a[1]} ${mx},${b[1]} ${b[0]},${b[1]}`;
    }
    const marcos = pts
      .map((q, i) => {
        const daFase = ts.filter((t) => Number(t.f) === i);
        const completa = daFase.length && daFase.every((t) => st.done[t.id]);
        const ly = i % 2 ? q[1] - 24 : q[1] + 34;
        const nome = pequeno && i === 2 ? "Clientes" : FASES[i];
        return `<circle cx="${q[0]}" cy="${q[1]}" r="${pequeno ? 10 : 13}" fill="${completa ? "#8b5cf6" : "#0e0e15"}" stroke="${completa ? "#c4b5fd" : "#5b5470"}" stroke-width="2"/>
          <text x="${q[0]}" y="${q[1] + 4.5}" text-anchor="middle" font-size="${pequeno ? 11 : 12.5}" font-weight="700" fill="#fff">${i + 1}</text>
          <text x="${q[0]}" y="${ly}" text-anchor="middle" font-size="${pequeno ? 11 : 13}" font-weight="600" fill="#c9c6d6">${nome}</text>`;
      })
      .join("");
    s.innerHTML = `<path id="v4pPath" d="${d}" fill="none" stroke="#3a3550" stroke-width="3" stroke-dasharray="2 7" stroke-linecap="round"/>
      <path d="${d}" fill="none" stroke="#8b5cf6" stroke-width="4" stroke-linecap="round" pathLength="100" stroke-dasharray="${p * 100} 100"/>
      ${marcos}<g id="v4pVoce"></g>`;
    const caminho = s.querySelector("#v4pPath");
    const pt = caminho.getPointAtLength(caminho.getTotalLength() * p);
    s.querySelector("#v4pVoce").innerHTML = `<path d="M${pt.x},${pt.y - 6} l-8,-15 a9,9 0 1 1 16,0Z" fill="#a78bfa" stroke="#0e0e15" stroke-width="2"/><circle cx="${pt.x}" cy="${pt.y - 25}" r="3" fill="#0e0e15"/>`;
  }

  function desenhar() {
    desenharChips();
    desenharTarefas();
    desenharIdeias();
    desenharRota();
    atualizarAviso(
      modo === "nuvem"
        ? "Salvo na sua conta: aparece igual no celular e no computador."
        : "Salvo só neste aparelho. Rode supabase/plano.sql para sincronizar.",
    );
  }

  // -------------------------------------------------------
  // NAVEGAÇÃO: título, abas e carregamento do Plano
  // -------------------------------------------------------

  const grupoDe = (secao) => (GRUPOS.find(([, secoes]) => secoes.includes(secao)) || ["Visão geral"])[0];

  // Esconde o título da seção quando ele repete o título do topo
  function marcarTitulosRepetidos() {
    const norm = (t) => String(t || "").trim().toLowerCase();
    document.querySelectorAll(".section").forEach((sec) => {
      const h2 = sec.querySelector(":scope > .section-title h2");
      if (!h2) return;
      const botao = document.querySelector(`.nav-item[data-section="${sec.id}"] span, .nav-item[data-section="${sec.id}"]`);
      const nomeMenu = botao ? norm(botao.textContent) : "";
      const nomes = [nomeMenu, norm(document.querySelector("#pageTitle")?.textContent)];
      if (sec.id === "parcelas") nomes.push("parcelamentos");
      const igual = nomes.some((n) => n && (norm(h2.textContent) === n || norm(h2.textContent).startsWith(n)));
      h2.classList.toggle("v4-dup", igual && sec.classList.contains("active"));
    });
  }

  // Traduz o tipo da conta (CHECKING_ACCOUNT -> Conta corrente)
  const TIPOS = {
    CHECKING_ACCOUNT: "Conta corrente",
    SAVINGS_ACCOUNT: "Poupança",
    PAYMENT_ACCOUNT: "Conta de pagamento",
    CREDIT_CARD: "Cartão de crédito",
    INVESTMENT: "Investimento",
  };
  function traduzirTipos() {
    document.querySelectorAll("#contas .badge").forEach((b) => {
      const t = b.textContent.trim();
      if (TIPOS[t]) b.textContent = TIPOS[t];
    });
  }
  const secContas = document.querySelector("#contas");
  if (secContas) new MutationObserver(traduzirTipos).observe(secContas, { childList: true, subtree: true });

  if (typeof navegar === "function") {
    const navegarAnterior = navegar;
    navegar = function v4Navegar(secao) {
      navegarAnterior(secao);
      marcarAba(secao);
      const titulo = document.querySelector("#pageTitle");
      const eyebrow = document.querySelector(".topbar .eyebrow");
      if (eyebrow) eyebrow.textContent = grupoDe(secao);
      if (secao === "plano") {
        if (titulo) titulo.textContent = "Plano";
        carregarPlano().then(desenharRota);
        requestAnimationFrame(desenharRota);
      }
      marcarTitulosRepetidos();
    };
  }
})();
