// =========================================================
// MEU FINANCEIRO V4 — PLANEJAMENTO: "O QUE É O QUÊ" + EDITAR
// Reorganiza a lista "Parcelas que você já possui" do Planejamento futuro
// em três grupos (contas fixas de todo mês, parceladas manuais e parcelas
// do cartão), com subtotal, e deixa editar as contas manuais ali mesmo.
// Parcelas do cartão vêm do banco e não são editáveis.
// =========================================================

(() => {
  if (typeof renderizarPlanejamentoFuturo !== "function") return;

  const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const dataBRCurta = (iso) => {
    const [a, m, d] = String(iso || "").slice(0, 10).split("-");
    return d && m ? `${d}/${m}` : "";
  };

  let editando = null; // id da conta fixa em edição

  const GRUPOS = [
    {
      chave: "FIXA",
      titulo: "Contas fixas · todo mês",
      explica: "Se repetem todo mês até você encerrar. Vêm de Contas fixas.",
      editavel: true,
    },
    {
      chave: "MANUAL",
      titulo: "Parceladas fora do cartão",
      explica: "Carnê, boleto, empréstimo… cadastradas por você em Contas fixas. Somem depois da última parcela.",
      editavel: true,
    },
    {
      chave: "CARTAO",
      titulo: "Parcelas no cartão",
      explica: "Compras parceladas que o banco informou. O valor vem do banco e já está dentro da fatura.",
      editavel: false,
    },
  ];

  function itensDoMes() {
    const inicio = typeof obterMesInicialPlanejamento === "function" ? obterMesInicialPlanejamento() : new Date();
    const mes = chaveMes(inicio);
    const cartao = typeof obterParcelasCartaoDoMes === "function" ? obterParcelasCartaoDoMes(mes) : [];
    const manuais = typeof obterParcelasManuaisDoMes === "function" ? obterParcelasManuaisDoMes(mes) : [];
    const fixas = typeof obterContasFixasRecorrentesDoMes === "function" ? obterContasFixasRecorrentesDoMes(mes) : [];
    return { mes, itens: [...fixas, ...manuais, ...cartao] };
  }

  function formEdicao(conta) {
    const parcelada = String(conta.tipo || "").toLowerCase() === "parcelada";
    return `<form class="v4pl-form" data-salvar="${esc(conta.id)}">
      <label>Nome<input name="name" type="text" maxlength="120" required value="${esc(conta.name || "")}"></label>
      <label>Valor (R$)<input name="amount" type="number" step="0.01" min="0" required value="${esc(Number(conta.amount || 0))}"></label>
      <label>Dia do vencimento<input name="day" type="number" min="1" max="31" required value="${esc(conta.day || 1)}"></label>
      ${
        parcelada
          ? `<label>Total de parcelas<input name="totalParcelas" type="number" min="1" max="120" required value="${esc(conta.totalParcelas || 1)}"></label>`
          : ""
      }
      <div class="v4pl-acoes">
        <button type="submit" class="primary">Salvar</button>
        <button type="button" class="v4pl-sec" data-cancelar>Cancelar</button>
      </div>
      <p class="v4pl-dica">A mudança vale também na tela Contas fixas.</p>
    </form>`;
  }

  function desenhar() {
    const lista = document.querySelector("#planningCommitmentsList");
    if (!lista) return;
    const { itens } = itensDoMes();
    const contas = new Map((state.contasFixas || []).map((c) => [String(c.id), c]));

    if (!itens.length) {
      lista.innerHTML = '<div class="empty">Nenhuma conta fixa ou parcela encontrada para este mês.</div>';
      return;
    }

    lista.innerHTML = GRUPOS.map((g) => {
      const doGrupo = itens.filter((i) => i.origem === g.chave).sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
      if (!doGrupo.length) return "";
      const subtotal = doGrupo.reduce((s, i) => s + Number(i.valor || 0), 0);
      return `<section class="v4pl-grupo v4pl-${g.chave.toLowerCase()}">
        <header>
          <div><h3>${esc(g.titulo)}</h3><p>${esc(g.explica)}</p></div>
          <strong>${esc(brl(subtotal))}</strong>
        </header>
        <ul>${doGrupo
          .map((i) => {
            const conta = g.editavel ? contas.get(String(i.id)) : null;
            const detalhe =
              g.chave === "FIXA"
                ? `${esc(i.conta || "Conta fixa")} · vence dia ${esc(dataBRCurta(i.vencimento).slice(0, 2))}`
                : `${esc(i.conta || "")} · parcela ${esc(i.parcelaAtual)}/${esc(i.totalParcelas)} · vence ${esc(dataBRCurta(i.vencimento))}`;
            const aberto = conta && editando === String(conta.id);
            return `<li class="${aberto ? "aberto" : ""}">
              <div class="v4pl-linha">
                <div><strong>${esc(i.nome)}</strong><small>${detalhe}</small></div>
                <b>${esc(brl(i.valor))}</b>
                ${
                  conta
                    ? `<button type="button" class="v4pl-editar" data-editar="${esc(conta.id)}">${aberto ? "Fechar" : "Editar"}</button>`
                    : '<span class="v4pl-banco" title="O valor vem do banco">do banco</span>'
                }
              </div>
              ${aberto ? formEdicao(conta) : ""}
            </li>`;
          })
          .join("")}</ul>
      </section>`;
    }).join("");
  }

  async function salvar(form) {
    const id = form.dataset.salvar;
    const conta = (state.contasFixas || []).find((c) => String(c.id) === String(id));
    if (!conta) return;
    const dados = Object.fromEntries(new FormData(form).entries());
    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    botao.textContent = "Salvando…";
    try {
      // O servidor substitui o registro inteiro: manda tudo que já existe + o que mudou
      await buscarDados(`/api/contas-fixas/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: dados.name,
          amount: Number(dados.amount),
          day: Number(dados.day),
          category: conta.category,
          tipo: conta.tipo || "fixa",
          totalParcelas: dados.totalParcelas !== undefined ? Number(dados.totalParcelas) : conta.totalParcelas ?? null,
          parcelaAtual: conta.parcelaAtual ?? null,
          anoInicioParcela: conta.anoInicioParcela ?? null,
          mesInicioParcela: conta.mesInicioParcela ?? null,
          pagamentos: Array.isArray(conta.pagamentos) ? conta.pagamentos : [],
          finalizada: conta.finalizada === true,
        }),
      });
      editando = null;
      if (typeof carregarContasFixas === "function") await carregarContasFixas();
      renderizarPlanejamentoFuturo();
    } catch (erro) {
      botao.disabled = false;
      botao.textContent = "Salvar";
      let aviso = form.querySelector(".v4pl-erro");
      if (!aviso) {
        aviso = document.createElement("p");
        aviso.className = "v4pl-erro";
        form.appendChild(aviso);
      }
      aviso.textContent = erro.message || "Não foi possível salvar.";
    }
  }

  document.addEventListener("click", (e) => {
    const editar = e.target.closest("#planningCommitmentsList [data-editar]");
    if (editar) {
      editando = editando === editar.dataset.editar ? null : editar.dataset.editar;
      desenhar();
      return;
    }
    if (e.target.closest("#planningCommitmentsList [data-cancelar]")) {
      editando = null;
      desenhar();
    }
  });

  document.addEventListener("submit", (e) => {
    const form = e.target.closest("#planningCommitmentsList form[data-salvar]");
    if (!form) return;
    e.preventDefault();
    salvar(form);
  });

  const original = renderizarPlanejamentoFuturo;
  renderizarPlanejamentoFuturo = function v4RenderizarPlanejamento(...args) {
    const r = original.apply(this, args);
    try {
      desenhar();
    } catch (erro) {
      console.warn("Planejamento (grupos):", erro);
    }
    return r;
  };

  // Títulos mais claros na seção
  const secao = document.querySelector("#planningCommitmentsList")?.closest(".panel, article, section");
  const h2 = secao?.querySelector("h2");
  const p = h2?.nextElementSibling?.tagName === "P" ? h2.nextElementSibling : null;
  if (h2 && /Parcelas que você já possui/i.test(h2.textContent)) h2.textContent = "O que já está comprometido no mês";
  if (p) p.textContent = "Separado por tipo. Contas fixas e parceladas manuais podem ser editadas aqui; parcelas do cartão vêm do banco.";
})();
