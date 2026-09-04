const state = {
  contas: [],
  cartoes: [],
  investimentos: [],
  transacoes: [],
  transacoesParcelas: [],
  parcelamentos: [],
  faturas: [],
  resumos: [],
  caixinhas: [],
};

// ==========================================
// AUTENTICAÇÃO
// ==========================================

let tokenSessao = null;

function obterToken() {
  return tokenSessao;
}

function salvarToken(token) {
  tokenSessao = token;

  if (token) {
    localStorage.setItem("meuFinanceiroToken", token);
  } else {
    localStorage.removeItem("meuFinanceiroToken");
  }
}

function carregarTokenSalvo() {
  tokenSessao = localStorage.getItem("meuFinanceiroToken");
}

function mostrarLogin() {
  const login = document.querySelector("#loginScreen");

  const app = document.querySelector("#appShell");

  if (login) {
    login.style.display = "flex";
  }

  if (app) {
    app.style.display = "none";
  }
}

function mostrarAplicacao() {
  const login = document.querySelector("#loginScreen");

  const app = document.querySelector("#appShell");

  if (login) {
    login.style.display = "none";
  }

  if (app) {
    app.style.display = "flex";
  }
}

function mostrarErroLogin(mensagem) {
  const elemento = document.querySelector("#loginError");

  if (!elemento) {
    return;
  }

  elemento.textContent = mensagem;

  elemento.style.display = "block";
}

function limparErroLogin() {
  const elemento = document.querySelector("#loginError");

  if (!elemento) {
    return;
  }

  elemento.textContent = "";

  elemento.style.display = "none";
}

function atualizarUsuarioLogado(usuario) {
  const nome = document.querySelector("#loggedUserName");

  const email = document.querySelector("#loggedUserEmail");

  if (nome) {
    nome.textContent = usuario?.nome || usuario?.email || "Usuário";
  }

  if (email) {
    email.textContent = usuario?.email || "";
  }
}

// ==========================================
// LOGIN
// ==========================================

async function realizarLogin(email, senha) {
  const resposta = await fetch("/api/auth/login", {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      email,
      senha,
    }),
  });

  let dados;

  try {
    dados = await resposta.json();
  } catch {
    throw new Error("O servidor retornou uma resposta inválida.");
  }

  if (!resposta.ok || dados.sucesso === false) {
    throw new Error(dados.erro || "E-mail ou senha inválidos.");
  }

  if (!dados.token) {
    throw new Error("O servidor não retornou o token da sessão.");
  }

  salvarToken(dados.token);

  atualizarUsuarioLogado(dados.usuario);

  return dados;
}

// ==========================================
// VERIFICAR SESSÃO
// ==========================================

async function verificarSessao() {
  const token = obterToken();

  if (!token) {
    return false;
  }

  try {
    const resposta = await fetch("/api/auth/me", {
      method: "GET",

      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!resposta.ok) {
      salvarToken(null);

      return false;
    }

    const dados = await resposta.json();

    if (!dados.sucesso || !dados.autenticado || !dados.usuario) {
      salvarToken(null);

      return false;
    }

    atualizarUsuarioLogado(dados.usuario);

    return true;
  } catch (erro) {
    console.error("Erro ao verificar sessão:", erro);

    return false;
  }
}

// ==========================================
// LOGOUT
// ==========================================

async function realizarLogout() {
  try {
    const token = obterToken();

    if (token) {
      await fetch("/api/auth/logout", {
        method: "POST",

        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }
  } catch (erro) {
    console.error("Erro ao fazer logout:", erro);
  } finally {
    salvarToken(null);

    mostrarLogin();

    const email = document.querySelector("#loginEmail");

    const senha = document.querySelector("#loginSenha");

    if (senha) {
      senha.value = "";
    }

    if (email) {
      email.focus();
    }

    limparErroLogin();
  }
}

// ==========================================
// EVENTO DO FORMULÁRIO DE LOGIN
// ==========================================

function configurarLogin() {
  const formulario = document.querySelector("#loginForm");

  const botao = document.querySelector("#loginButton");

  if (!formulario) {
    return;
  }

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    limparErroLogin();

    const email = document
      .querySelector("#loginEmail")
      ?.value.trim()
      .toLowerCase();

    const senha = document.querySelector("#loginSenha")?.value;

    if (!email || !senha) {
      mostrarErroLogin("E-mail e senha são obrigatórios.");

      return;
    }

    try {
      if (botao) {
        botao.disabled = true;

        botao.textContent = "Entrando...";
      }

      await realizarLogin(email, senha);

      mostrarAplicacao();

      await iniciarAplicacao();
    } catch (erro) {
      console.error("Erro ao realizar login:", erro);

      mostrarErroLogin(erro.message || "E-mail ou senha inválidos.");
    } finally {
      if (botao) {
        botao.disabled = false;

        botao.textContent = "Entrar";
      }
    }
  });
}

// ==========================================
// BOTÃO SAIR
// ==========================================

function configurarLogout() {
  const botao = document.querySelector("#logoutBtn");

  if (!botao) {
    return;
  }

  botao.addEventListener("click", async () => {
    const confirmou = confirm("Deseja realmente sair do Meu Financeiro?");

    if (!confirmou) {
      return;
    }

    botao.disabled = true;

    botao.textContent = "Saindo...";

    await realizarLogout();

    botao.disabled = false;

    botao.textContent = "Sair";
  });
}

// ==========================================
// FORMATAÇÃO
// ==========================================

function dinheiro(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));
}

function escapar(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dataBR(data) {
  if (!data) {
    return "—";
  }

  const parte = String(data).substring(0, 10);

  const [ano, mes, dia] = parte.split("-");

  if (!ano || !mes || !dia) {
    return data;
  }

  return `${dia}/${mes}/${ano}`;
}

// ==========================================
// CLASSIFICAÇÃO DAS TRANSAÇÕES
// ==========================================

function analisarTransacao(transacao) {
  const valorOriginal = Number(transacao.valor || 0);

  const tipoConta = String(transacao.tipoConta || "").toUpperCase();

  const tipo = String(transacao.tipo || "").toUpperCase();

  const ehCartao = tipoConta === "CREDIT";

  const ehDebito = tipo === "DEBIT" || tipo === "DÉBITO";

  const ehCredito = tipo === "CREDIT" || tipo === "CRÉDITO";

  // ------------------------------------------
  // CARTÃO
  // ------------------------------------------

  if (ehCartao) {
    if (ehDebito) {
      return {
        tipoVisual: "COMPRA NO CARTÃO",

        classe: "expense",

        sinal: "-",

        valor: Math.abs(valorOriginal),

        ehEntrada: false,

        ehSaida: true,

        ehCartao: true,
      };
    }

    if (ehCredito) {
      return {
        tipoVisual: "CRÉDITO NO CARTÃO",

        classe: "income",

        sinal: "+",

        valor: Math.abs(valorOriginal),

        ehEntrada: false,

        ehSaida: false,

        ehCartao: true,
      };
    }
  }

  // ------------------------------------------
  // CONTA BANCÁRIA
  // ------------------------------------------

  if (ehDebito) {
    return {
      tipoVisual: "SAÍDA",

      classe: "expense",

      sinal: "-",

      valor: Math.abs(valorOriginal),

      ehEntrada: false,

      ehSaida: true,

      ehCartao: false,
    };
  }

  if (ehCredito) {
    return {
      tipoVisual: "ENTRADA",

      classe: "income",

      sinal: "+",

      valor: Math.abs(valorOriginal),

      ehEntrada: true,

      ehSaida: false,

      ehCartao: false,
    };
  }

  // ------------------------------------------
  // FALLBACK
  // ------------------------------------------

  if (valorOriginal < 0) {
    return {
      tipoVisual: "SAÍDA",

      classe: "expense",

      sinal: "-",

      valor: Math.abs(valorOriginal),

      ehEntrada: false,

      ehSaida: true,

      ehCartao: false,
    };
  }

  return {
    tipoVisual: "ENTRADA",

    classe: "income",

    sinal: "+",

    valor: Math.abs(valorOriginal),

    ehEntrada: true,

    ehSaida: false,

    ehCartao: false,
  };
}

// ==========================================
// REQUISIÇÃO AO BACKEND
// ==========================================

async function buscarDados(url, opcoes = {}) {
  const token = obterToken();

  const headers = {
    ...(opcoes.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const resposta = await fetch(url, {
  ...opcoes,
  cache: "no-store",
  headers,
});

  let dados;

  try {
    dados = await resposta.json();
  } catch {
    throw new Error("O servidor retornou uma resposta inválida.");
  }

  // ------------------------------------------
  // SESSÃO EXPIRADA
  // ------------------------------------------

  if (resposta.status === 401) {
    salvarToken(null);

    mostrarLogin();

    throw new Error("Sua sessão expirou. Faça login novamente.");
  }

  if (!resposta.ok || dados.sucesso === false) {
    throw new Error(dados.erro || dados.message || "Erro ao buscar dados.");
  }

  return dados;
}

// ==========================================
// CONTAS
// ==========================================

function mostrarContas() {
  const container = document.querySelector("#accountsGrid");

  if (!container) {
    return;
  }

  if (!state.contas.length) {
    container.innerHTML = `
      <div class="empty">
        Nenhuma conta bancária encontrada.
      </div>
    `;

    return;
  }

  container.innerHTML = state.contas
    .map(
      (conta) => `
          <article class="panel account-card">

            <div class="account-top">

              <div>

                <div class="account-name">
                  ${escapar(conta.nome)}
                </div>

                <div class="account-bank">
                  ${escapar(conta.banco)}
                </div>

              </div>

              <span class="badge">
                ${escapar(conta.subtipo)}
              </span>

            </div>

            <div class="account-balance">
              ${dinheiro(conta.saldo)}
            </div>

            <div class="account-bank">
              ${escapar(conta.moeda)}
            </div>

          </article>
        `,
    )
    .join("");
}

// ==========================================
// TRANSAÇÕES RECENTES
// ==========================================

function mostrarTransacao(transacao) {
  const analise = analisarTransacao(transacao);

  const identificacaoCartao = analise.ehCartao
    ? "💳 Compra no cartão"
    : "🏦 Conta bancária";

  return `
    <div class="transaction">

      <div>

        <div class="desc">
          ${escapar(transacao.descricao)}
        </div>

        <div class="meta">
          ${dataBR(transacao.data)}
          ·
          ${escapar(transacao.categoria)}
          ·
          ${escapar(transacao.conta)}
        </div>

        <div class="meta">
          ${identificacaoCartao}
          ·
          ${analise.tipoVisual}
        </div>

      </div>

      <div class="amount ${analise.classe}">
        ${analise.sinal}
        ${dinheiro(analise.valor)}
      </div>

    </div>
  `;
}

function mostrarRecentes() {
  const container = document.querySelector("#recentTransactions");

  if (!container) {
    return;
  }

  const recentes = [...state.transacoes]
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))
    .slice(0, 7);

  if (!recentes.length) {
    container.innerHTML = `
      <div class="empty">
        Nenhuma movimentação encontrada.
      </div>
    `;

    return;
  }

  container.innerHTML = recentes.map(mostrarTransacao).join("");
}

// ==========================================
// RESUMO DAS CONTAS FIXAS DO MÊS
// ==========================================

function obterResumoContasFixasMes() {
  const contas = pegarContasFixas();

  const ano = mesContasFixas.getFullYear();

  const mes = mesContasFixas.getMonth();

  let total = 0;

  let pago = 0;

  let pendente = 0;

  contas.forEach((conta) => {
    const ehParcelada =
      conta.tipo === "parcelada" || Number(conta.totalParcelas || 0) > 0;

    // ----------------------------------------
    // VERIFICAR SE A CONTA EXISTE NESTE MÊS
    // ----------------------------------------

    if (ehParcelada) {
      const totalParcelas = Number(conta.totalParcelas || 0);

      const parcelaInicial = Number(conta.parcelaAtual || 1);

      const anoInicial = Number(conta.anoInicioParcela || ano);

      const mesInicial = Number(conta.mesInicioParcela ?? mes);

      const diferencaMeses = (ano - anoInicial) * 12 + (mes - mesInicial);

      const parcelaDoMes = parcelaInicial + diferencaMeses;

      if (parcelaDoMes < parcelaInicial || parcelaDoMes > totalParcelas) {
        return;
      }
    }

    // ----------------------------------------
    // VALOR
    // ----------------------------------------

    const valor = Number(conta.amount || 0);

    total += valor;

    // ----------------------------------------
    // PAGO
    // ----------------------------------------

    const chaveMes = `${ano}-${String(mes + 1).padStart(2, "0")}`;

    const foiPaga =
      Array.isArray(conta.pagamentos) && conta.pagamentos.includes(chaveMes);

    if (foiPaga) {
      pago += valor;
    } else {
      pendente += valor;
    }
  });

  return {
    total,
    pago,
    pendente,
  };
}

// ==========================================
// DASHBOARD
// ==========================================

function atualizarDashboard() {
  const saldoContas = state.contas.reduce(
    (total, conta) => total + Number(conta.saldo || 0),
    0,
  );

  const entradas = state.transacoes
    .filter((transacao) => {
      const analise = analisarTransacao(transacao);

      return analise.ehEntrada;
    })
    .reduce((total, transacao) => {
      const analise = analisarTransacao(transacao);

      return total + analise.valor;
    }, 0);

  const saidas = state.transacoes
    .filter((transacao) => {
      const analise = analisarTransacao(transacao);

      return analise.ehSaida;
    })
    .reduce((total, transacao) => {
      const analise = analisarTransacao(transacao);

      return total + analise.valor;
    }, 0);

  // ==========================================
  // CONTAS FIXAS DO MÊS
  // ==========================================

  const resumoFixas = obterResumoContasFixasMes();

  const elementoFixedTotal = document.querySelector("#fixedTotal");

  const elementoFixedPaid = document.querySelector("#fixedPaid");

  const elementoFixedPending = document.querySelector("#fixedPending");

  if (elementoFixedTotal) {
    elementoFixedTotal.textContent = dinheiro(resumoFixas.total);
  }

  if (elementoFixedPaid) {
    elementoFixedPaid.textContent = dinheiro(resumoFixas.pago);
  }

  if (elementoFixedPending) {
    elementoFixedPending.textContent = dinheiro(resumoFixas.pendente);
  }

  const elementoSaldo = document.querySelector("#totalBalance");

  const elementoEntradas = document.querySelector("#totalIncome");

  const elementoSaidas = document.querySelector("#totalExpense");

  if (elementoSaldo) {
    elementoSaldo.textContent = dinheiro(saldoContas);
  }

  if (elementoEntradas) {
    elementoEntradas.textContent = dinheiro(entradas);
  }

  if (elementoSaidas) {
    elementoSaidas.textContent = dinheiro(saidas);
  }

  mostrarRecentes();

  mostrarCategorias();
}

// ==========================================
// CATEGORIAS
// ==========================================

function mostrarCategorias() {
  const container = document.querySelector("#categoryChart");

  if (!container) {
    return;
  }

  const categorias = {};

  state.transacoes.forEach((transacao) => {
    const analise = analisarTransacao(transacao);

    if (!analise.ehSaida) {
      return;
    }

    const categoria = transacao.categoria || "Sem categoria";

    categorias[categoria] = (categorias[categoria] || 0) + analise.valor;
  });

  const lista = Object.entries(categorias)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);

  if (!lista.length) {
    container.innerHTML = `
      <div class="empty">
        Nenhuma saída encontrada.
      </div>
    `;

    return;
  }

  const maior = lista[0][1] || 1;

  container.innerHTML = lista
    .map(([categoria, valor]) => {
      const porcentagem = Math.max(5, (valor / maior) * 100);

      return `
            <div class="bar-row">

              <div class="bar-label">

                <span>
                  ${escapar(categoria)}
                </span>

                <strong>
                  ${dinheiro(valor)}
                </strong>

              </div>

              <div class="bar-track">

                <div
                  class="bar"
                  style="width:${porcentagem}%"
                ></div>

              </div>

            </div>
          `;
    })
    .join("");
}

// ==========================================
// TABELA DE TRANSAÇÕES
// ==========================================

function mostrarTabela() {
  const container = document.querySelector("#transactionTable");

  if (!container) {
    return;
  }

  const transacoes = [...state.transacoes].sort((a, b) =>
    String(b.data).localeCompare(String(a.data)),
  );

  if (!transacoes.length) {
    container.innerHTML = `
      <div class="empty">
        Nenhuma transação encontrada.
      </div>
    `;

    return;
  }

  container.innerHTML = `
    <table>

      <thead>

        <tr>
          <th>Data</th>
          <th>Descrição</th>
          <th>Categoria</th>
          <th>Conta</th>
          <th>Tipo</th>
          <th>Valor</th>
        </tr>

      </thead>

      <tbody>

        ${transacoes
          .map((transacao) => {
            const analise = analisarTransacao(transacao);

            return `
                <tr>

                  <td>
                    ${dataBR(transacao.data)}
                  </td>

                  <td>
                    ${escapar(transacao.descricao)}
                  </td>

                  <td>
                    ${escapar(transacao.categoria)}
                  </td>

                  <td>
                    ${escapar(transacao.conta)}
                  </td>

                  <td>
                    ${analise.ehCartao ? "💳 " : "🏦 "}

                    ${analise.tipoVisual}
                  </td>

                  <td
                    class="${analise.classe}"
                  >
                    ${analise.sinal}
                    ${dinheiro(analise.valor)}
                  </td>

                </tr>
              `;
          })
          .join("")}

      </tbody>

    </table>
  `;
}

// ==========================================
// CONTAS FIXAS
// ==========================================

function pegarContasFixas() {
  try {
    const contas = JSON.parse(localStorage.getItem("fixedAccounts") || "[]");

    return Array.isArray(contas) ? contas : [];
  } catch (erro) {
    console.error("Erro ao carregar contas fixas:", erro);

    return [];
  }
}

function salvarContasFixas(contas) {
  localStorage.setItem("fixedAccounts", JSON.stringify(contas));
}

function obterMesAtual() {
  const agora = new Date();

  return (
    agora.getFullYear() + "-" + String(agora.getMonth() + 1).padStart(2, "0")
  );
}

function contaFoiPaga(conta) {
  const mesAtual = obterMesAtual();

  return Array.isArray(conta.pagamentos) && conta.pagamentos.includes(mesAtual);
}

// ==========================================
// MARCAR / DESMARCAR CONTA COMO PAGA
// ==========================================

function marcarContaComoPaga(id) {
  const contas = pegarContasFixas();

  const conta = contas.find((item) => String(item.id) === String(id));

  if (!conta) {
    return;
  }

  if (!Array.isArray(conta.pagamentos)) {
    conta.pagamentos = [];
  }

  const mesAtual = obterMesAtual();

  const indice = conta.pagamentos.indexOf(mesAtual);

  if (indice >= 0) {
    conta.pagamentos.splice(indice, 1);
  } else {
    conta.pagamentos.push(mesAtual);
  }

  salvarContasFixas(contas);

  mostrarContasFixas();
}

// ==========================================
// MÊS SELECIONADO NAS CONTAS FIXAS
// ==========================================

let mesContasFixas = new Date(
  new Date().getFullYear(),
  new Date().getMonth(),
  1,
);

// ==========================================
// FORMATAR MÊS
// ==========================================

function formatarMesContasFixas(data) {
  return data.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

// ==========================================
// ATUALIZAR TÍTULO DO MÊS
// ==========================================

function atualizarMesContasFixas() {
  const titulo = document.querySelector("#fixedMonthTitle");

  const subtitulo = document.querySelector("#fixedMonthSubtitle");

  if (titulo) {
    const texto = formatarMesContasFixas(mesContasFixas);

    titulo.textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  if (subtitulo) {
    subtitulo.textContent = "Contas e parcelas deste mês";
  }
}

// ==========================================
// MÊS ANTERIOR
// ==========================================

function mesContasFixasAnterior() {
  mesContasFixas = new Date(
    mesContasFixas.getFullYear(),
    mesContasFixas.getMonth() - 1,
    1,
  );

  atualizarMesContasFixas();

  mostrarContasFixas();
}

// ==========================================
// PRÓXIMO MÊS
// ==========================================

function mesContasFixasProximo() {
  mesContasFixas = new Date(
    mesContasFixas.getFullYear(),
    mesContasFixas.getMonth() + 1,
    1,
  );

  atualizarMesContasFixas();

  mostrarContasFixas();
}

// ==========================================
// CONFIGURAR BOTÕES DOS MESES
// ==========================================

function configurarNavegacaoContasFixas() {
  const anterior = document.querySelector("#fixedPreviousMonth");

  const proximo = document.querySelector("#fixedNextMonth");

  if (anterior) {
    anterior.addEventListener("click", mesContasFixasAnterior);
  }

  if (proximo) {
    proximo.addEventListener("click", mesContasFixasProximo);
  }

  atualizarMesContasFixas();
}

// ==========================================
// MOSTRAR CONTAS FIXAS
// ==========================================

function mostrarContasFixas() {
  const contas = pegarContasFixas();

  // ==========================================
  // MÊS SELECIONADO
  // ==========================================

  const anoSelecionado = mesContasFixas.getFullYear();

  const mesSelecionado = mesContasFixas.getMonth();

  // ==========================================
  // CALCULAR INFORMAÇÕES DE CADA CONTA
  // ==========================================

  const contasDoMes = contas.filter((conta) => {
    // --------------------------------------
    // CONTAS FIXAS MENSAIS
    // --------------------------------------

    const ehParcelada =
      conta.tipo === "parcelada" || Number(conta.totalParcelas || 0) > 0;

    if (!ehParcelada) {
      return true;
    }

    // --------------------------------------
    // PARCELADAS
    // --------------------------------------

    if (conta.finalizada === true) {
      return false;
    }

    return true;
  });

  // ==========================================
  // TOTAL DO MÊS
  // ==========================================

  let total = 0;

  let totalPago = 0;

  let quantidade = 0;

  contasDoMes.forEach((conta) => {
    const ehParcelada =
      conta.tipo === "parcelada" || Number(conta.totalParcelas || 0) > 0;

    let deveAparecer = true;

    let parcelaDoMes = null;

    // ----------------------------------------
    // PARCELADA
    // ----------------------------------------

    if (ehParcelada) {
      const totalParcelas = Number(conta.totalParcelas || 0);

      const parcelaInicial = Number(conta.parcelaAtual || 1);

      const anoInicial = Number(conta.anoInicioParcela || anoSelecionado);

      const mesInicial = Number(conta.mesInicioParcela ?? mesSelecionado);

      const diferencaMeses =
        (anoSelecionado - anoInicial) * 12 + (mesSelecionado - mesInicial);

      parcelaDoMes = parcelaInicial + diferencaMeses;

      if (parcelaDoMes < parcelaInicial || parcelaDoMes > totalParcelas) {
        deveAparecer = false;
      }
    }

    if (!deveAparecer) {
      return;
    }

    const valor = Number(conta.amount || 0);

    total += valor;

    quantidade += 1;

    // ----------------------------------------
    // VERIFICAR PAGAMENTO DO MÊS
    // ----------------------------------------

    const chaveMes = `${anoSelecionado}-${String(mesSelecionado + 1).padStart(
      2,
      "0",
    )}`;

    const paga =
      Array.isArray(conta.pagamentos) && conta.pagamentos.includes(chaveMes);

    if (paga) {
      totalPago += valor;
    }
  });

  const totalPendente = total - totalPago;

  // ==========================================
  // ATUALIZAR RESUMO
  // ==========================================

  const elementoTotal = document.querySelector("#fixedTotal");

  const elementoQuantidade = document.querySelector("#fixedCount");

  const elementoPago = document.querySelector("#fixedPaid");

  const elementoPendente = document.querySelector("#fixedPending");

  if (elementoTotal) {
    elementoTotal.textContent = dinheiro(total);
  }

  if (elementoQuantidade) {
    elementoQuantidade.textContent = `${quantidade} cadastrada${
      quantidade === 1 ? "" : "s"
    }`;
  }

  if (elementoPago) {
    elementoPago.textContent = dinheiro(totalPago);
  }

  if (elementoPendente) {
    elementoPendente.textContent = dinheiro(totalPendente);
  }

  // ==========================================
  // LISTA
  // ==========================================

  const lista = document.querySelector("#fixedList");

  if (!lista) {
    return;
  }

  if (
    contasDoMes.filter((conta) => {
      const ehParcelada =
        conta.tipo === "parcelada" || Number(conta.totalParcelas || 0) > 0;

      if (ehParcelada && conta.finalizada === true) {
        return false;
      }

      if (!ehParcelada) {
        return true;
      }

      const totalParcelas = Number(conta.totalParcelas || 0);

      const parcelaInicial = Number(conta.parcelaAtual || 1);

      const anoInicial = Number(conta.anoInicioParcela || anoSelecionado);

      const mesInicial = Number(conta.mesInicioParcela ?? mesSelecionado);

      const diferencaMeses =
        (anoSelecionado - anoInicial) * 12 + (mesSelecionado - mesInicial);

      const parcelaDoMes = parcelaInicial + diferencaMeses;

      return parcelaDoMes >= parcelaInicial && parcelaDoMes <= totalParcelas;
    }).length === 0
  ) {
    lista.innerHTML = `
      <div class="empty">
        Nenhuma conta para este mês.
      </div>
    `;

    return;
  }

  // ==========================================
  // MONTAR LISTA
  // ==========================================

  lista.innerHTML = contasDoMes
    .map((conta) => {
      const ehParcelada =
        conta.tipo === "parcelada" || Number(conta.totalParcelas || 0) > 0;

      let parcelaDoMes = null;

      if (ehParcelada) {
        const totalParcelas = Number(conta.totalParcelas || 0);

        const parcelaInicial = Number(conta.parcelaAtual || 1);

        const anoInicial = Number(conta.anoInicioParcela || anoSelecionado);

        const mesInicial = Number(conta.mesInicioParcela ?? mesSelecionado);

        const diferencaMeses =
          (anoSelecionado - anoInicial) * 12 + (mesSelecionado - mesInicial);

        parcelaDoMes = parcelaInicial + diferencaMeses;

        if (parcelaDoMes < parcelaInicial || parcelaDoMes > totalParcelas) {
          return "";
        }
      }

      const chaveMes = `${anoSelecionado}-${String(mesSelecionado + 1).padStart(
        2,
        "0",
      )}`;

      const paga =
        Array.isArray(conta.pagamentos) && conta.pagamentos.includes(chaveMes);

      let textoParcela = "Conta mensal";

      if (ehParcelada) {
        textoParcela = `Parcela ${parcelaDoMes}/${conta.totalParcelas}`;
      }

      return `
            <div class="fixed-item">

              <div>

                <strong>
                  ${escapar(conta.name)}
                </strong>

                <small>
                  Dia ${conta.day}
                  ·
                  ${escapar(conta.category)}
                </small>

                <small>
                  ${textoParcela}
                </small>

                <small>
                  ${paga ? "🟢 Paga" : "🔴 Pendente"}
                </small>

              </div>

              <div>

                <strong>
                  ${dinheiro(conta.amount)}
                </strong>

                <button
                  type="button"
                  class="primary"
                  data-pagar-fixa="${conta.id}"
                >
                  ${paga ? "↩ Desmarcar paga" : "✓ Marcar como paga"}
                </button>

                <button
                  type="button"
                  class="delete-btn"
                  data-delete-fixed="${conta.id}"
                >
                  Excluir
                </button>

              </div>

            </div>
          `;
    })
    .filter((html) => html)
    .join("");

  // ==========================================
  // BOTÃO PAGAR
  // ==========================================

  lista.querySelectorAll("[data-pagar-fixa]").forEach((botao) => {
    botao.addEventListener("click", () => {
      marcarContaComoPaga(botao.dataset.pagarFixa);
    });
  });

  // ==========================================
  // BOTÃO EXCLUIR
  // ==========================================

  lista.querySelectorAll("[data-delete-fixed]").forEach((botao) => {
    botao.addEventListener("click", () => {
      const id = botao.dataset.deleteFixed;

      const confirmou = confirm("Deseja realmente excluir esta conta fixa?");

      if (!confirmou) {
        return;
      }

      const novasContas = pegarContasFixas().filter(
        (conta) => String(conta.id) !== String(id),
      );

      salvarContasFixas(novasContas);

      mostrarContasFixas();
    });
  });
}

// ==========================================
// CAIXINHAS
// ==========================================

async function carregarCaixinhas() {
  try {
    const dados = await buscarDados("/api/caixinhas");

    state.caixinhas = dados.caixinhas || [];

    mostrarCaixinhas();
  } catch (erro) {
    console.error("Erro ao carregar caixinhas:", erro);
  }
}

// ==========================================
// MOSTRAR CAIXINHAS
// ==========================================

function mostrarCaixinhas() {
  const lista = document.querySelector("#caixinhasList");

  if (!lista) {
    return;
  }

  if (!state.caixinhas.length) {
    lista.innerHTML = `
      <div class="empty">
        Nenhuma caixinha cadastrada.
      </div>
    `;

    return;
  }

  lista.innerHTML = state.caixinhas
    .map((caixinha) => {
      const meta = Number(caixinha.meta || 0);
      const saldo = Number(caixinha.saldo || 0);

      const progresso =
        meta > 0 ? Math.min((saldo / meta) * 100, 100) : 0;

      return `
        <div class="fixed-item">

          <div>
            <strong>
              ${escapar(caixinha.nome)}
            </strong>

            <small>
              ${escapar(caixinha.descricao || "")}
            </small>
          </div>

          <div>
            <strong>
              ${dinheiro(saldo)}
            </strong>

            <small>
              Meta:
              ${dinheiro(meta)}
            </small>
          </div>

        </div>

        <div
          style="
            margin-bottom:16px;
          "
        >

          <div class="bar-track">

            <div
              class="bar"
              style="
                width:${progresso}%
              "
            ></div>

          </div>

          <small>
            ${progresso.toFixed(1)}%
            da meta
          </small>

        </div>

        <div
          style="
            display:flex;
            gap:8px;
            margin-bottom:20px;
            flex-wrap:wrap;
          "
        >

          <button
            type="button"
            class="primary"
            data-adicionar-caixinha="${caixinha.id}"
          >
            ➕ Adicionar
          </button>

          <button
            type="button"
            class="primary"
            data-retirar-caixinha="${caixinha.id}"
          >
            ➖ Retirar
          </button>

          <button
            type="button"
            class="primary"
            data-rendimento-caixinha="${caixinha.id}"
          >
            📈 Rendimento
          </button>

          <button
            type="button"
            class="primary"
            data-editar-caixinha="${caixinha.id}"
          >
            ✏️ Editar
          </button>

          <button
            type="button"
            class="delete-btn"
            data-excluir-caixinha="${caixinha.id}"
          >
            🗑️ Excluir
          </button>

        </div>
      `;
    })
    .join("");

  // ------------------------------------------
  // BOTÃO ADICIONAR
  // ------------------------------------------

  lista
    .querySelectorAll("[data-adicionar-caixinha]")
    .forEach((botao) => {
      botao.addEventListener("click", () => {
        adicionarDinheiroCaixinha(
          botao.dataset.adicionarCaixinha,
        );
      });
    });

  // ------------------------------------------
  // BOTÃO RETIRAR
  // ------------------------------------------

  lista
    .querySelectorAll("[data-retirar-caixinha]")
    .forEach((botao) => {
      botao.addEventListener("click", () => {
        retirarDinheiroCaixinha(
          botao.dataset.retirarCaixinha,
        );
      });
    });

  // ------------------------------------------
  // BOTÃO RENDIMENTO
  // ------------------------------------------

  lista
    .querySelectorAll("[data-rendimento-caixinha]")
    .forEach((botao) => {
      botao.addEventListener("click", () => {
        adicionarRendimento(
          botao.dataset.rendimentoCaixinha,
        );
      });
    });

  // ------------------------------------------
  // BOTÃO EDITAR
  // ------------------------------------------

  lista
    .querySelectorAll("[data-editar-caixinha]")
    .forEach((botao) => {
      botao.addEventListener("click", () => {
        editarCaixinha(
          botao.dataset.editarCaixinha,
        );
      });
    });

  // ------------------------------------------
  // BOTÃO EXCLUIR
  // ------------------------------------------

  lista
    .querySelectorAll("[data-excluir-caixinha]")
    .forEach((botao) => {
      botao.addEventListener("click", () => {
        excluirCaixinha(
          botao.dataset.excluirCaixinha,
        );
      });
    });
}

// ==========================================
// ADICIONAR DINHEIRO NA CAIXINHA
// ==========================================

async function adicionarDinheiroCaixinha(id) {
  const caixinha = state.caixinhas.find(
    (item) => String(item.id) === String(id),
  );

  if (!caixinha) {
    alert("Caixinha não encontrada.");

    return;
  }

  const valorInformado = prompt(
    `Adicionar dinheiro em "${caixinha.nome}"\n\n` +
      `Saldo atual: ${dinheiro(caixinha.saldo)}\n\n` +
      "Digite o valor:",
  );

  if (valorInformado === null) {
    return;
  }

  const valor = Number(
    String(valorInformado).replace(",", "."),
  );

  if (!Number.isFinite(valor) || valor <= 0) {
    alert("Digite um valor válido maior que zero.");

    return;
  }

  const descricaoInformada = prompt(
    "Descrição da entrada:",
    "Adição manual",
  );

  if (descricaoInformada === null) {
    return;
  }

  try {
    const dados = await buscarDados(
      `/api/caixinhas/${id}/movimentacoes`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          tipo: "ENTRADA",
          valor,
          descricao:
            descricaoInformada.trim() || "Adição manual",
        }),
      },
    );

    alert(
      `Dinheiro adicionado com sucesso!\n\n` +
        `Novo saldo: ${dinheiro(dados.caixinha.saldo)}`,
    );

    await carregarCaixinhas();
  } catch (erro) {
    console.error(
      "Erro ao adicionar dinheiro:",
      erro,
    );

    alert(
      "Erro ao adicionar dinheiro: " +
        erro.message,
    );
  }
}

// ==========================================
// RETIRAR DINHEIRO DA CAIXINHA
// ==========================================

async function retirarDinheiroCaixinha(id) {
  const caixinha = state.caixinhas.find(
    (item) => String(item.id) === String(id),
  );

  if (!caixinha) {
    alert("Caixinha não encontrada.");

    return;
  }

  const saldoAtual = Number(caixinha.saldo || 0);

  const valorInformado = prompt(
    `Retirar dinheiro de "${caixinha.nome}"\n\n` +
      `Saldo atual: ${dinheiro(saldoAtual)}\n\n` +
      "Digite o valor:",
  );

  if (valorInformado === null) {
    return;
  }

  const valor = Number(
    String(valorInformado).replace(",", "."),
  );

  if (!Number.isFinite(valor) || valor <= 0) {
    alert("Digite um valor válido maior que zero.");

    return;
  }

  if (valor > saldoAtual) {
    alert(
      "Não é possível retirar um valor maior que o saldo da caixinha.",
    );

    return;
  }

  const descricaoInformada = prompt(
    "Descrição da retirada:",
    "Retirada manual",
  );

  if (descricaoInformada === null) {
    return;
  }

  try {
    const dados = await buscarDados(
      `/api/caixinhas/${id}/movimentacoes`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          tipo: "SAIDA",
          valor,
          descricao:
            descricaoInformada.trim() || "Retirada manual",
        }),
      },
    );

    alert(
      `Retirada realizada com sucesso!\n\n` +
        `Novo saldo: ${dinheiro(dados.caixinha.saldo)}`,
    );

    await carregarCaixinhas();
  } catch (erro) {
    console.error(
      "Erro ao retirar dinheiro:",
      erro,
    );

    alert(
      "Erro ao retirar dinheiro: " +
        erro.message,
    );
  }
}

// ==========================================
// CARTÕES E FATURAS
// ==========================================

function mostrarCartoesEFaturas() {
  const container = document.querySelector("#creditCards");

  if (!container) {
    return;
  }

  if (!state.cartoes.length) {
    container.innerHTML = `
      <div class="empty">
        Nenhum cartão encontrado.
      </div>
    `;

    return;
  }

  container.innerHTML = state.cartoes
    .map((cartao) => {
      const faturas = state.faturas
        .filter((fatura) => String(fatura.accountId) === String(cartao.id))
        .sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));

      const faturaAtual = faturas[0];

      let valorFatura = Number(
        faturaAtual?.totalAmount || faturaAtual?.valor || 0,
      );

      // Se a fatura atual ainda não possui
      // totalAmount, calcular pelas compras
      if (faturaAtual && valorFatura === 0) {
        const fechamento = new Date(faturaAtual.billClosingDate);

        const dataAnterior = new Date(fechamento);

        dataAnterior.setMonth(dataAnterior.getMonth() - 1);

        const comprasFaturaAtual = state.transacoes.filter((transacao) => {
          if (transacao.conta !== cartao.banco) {
            return false;
          }

          if (transacao.tipoConta !== "CREDIT") {
            return false;
          }

          if (transacao.tipo !== "DEBIT") {
            return false;
          }

          const data = new Date(transacao.data);

          return data > dataAnterior && data <= fechamento;
        });

        valorFatura = comprasFaturaAtual.reduce(
          (total, transacao) => total + Math.abs(Number(transacao.valor)),
          0,
        );
      }

      return `
            <article
              class="card credit-card-item"
              data-card-id="${cartao.id}"
              style="cursor: pointer;"
            >

              <div class="card-header">

                <div>

                  <strong>
                    💳 ${escapar(cartao.nome)}
                  </strong>

                  <div class="meta">
                    ${escapar(cartao.banco)}
                  </div>

                </div>

              </div>

              <div class="credit-card-value">
                ${dinheiro(valorFatura)}
              </div>

              <div class="meta">
                Fatura atual
              </div>

              <div class="meta">
                Limite:
                ${dinheiro(cartao.limite)}
              </div>

              <div class="meta">
                Disponível:
                ${dinheiro(cartao.limiteDisponivel)}
              </div>

              <div class="credit-card-footer">
                <span>
                  ${faturas.length}
                  fatura(s)
                </span>

                <strong>
                  Ver detalhes →
                </strong>
              </div>

            </article>
          `;
    })
    .join("");

  container.querySelectorAll("[data-card-id]").forEach((cartaoElemento) => {
    cartaoElemento.addEventListener("click", () => {
      mostrarDetalhesCartao(cartaoElemento.dataset.cardId);
    });
  });
}

function mostrarDetalhesCartao(cartaoId) {
  const cartao = state.cartoes.find(
    (item) => String(item.id) === String(cartaoId),
  );

  if (!cartao) {
    return;
  }

  const faturas = state.faturas
    .filter((fatura) => String(fatura.accountId) === String(cartao.id))
    .sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));

  const cards = document.querySelector("#creditCards");

  const detalhes = document.querySelector("#creditCardDetails");

  if (!cards || !detalhes) {
    return;
  }

  cards.style.display = "none";

  detalhes.style.display = "block";

  detalhes.innerHTML = `

    <div class="section-title">

      <div>

        <button
          class="link-btn"
          id="voltarCartoes"
        >
          ← Voltar
        </button>

        <p class="eyebrow">
          CARTÃO
        </p>

        <h2>
          💳 ${escapar(cartao.nome)}
        </h2>

        <p>
          ${escapar(cartao.banco)}
        </p>

      </div>

    </div>


    <div class="panel">

      <div class="panel-head">

        <div>

          <h2>
            Fatura
          </h2>

          <p>
            Selecione o mês que deseja consultar.
          </p>

        </div>

        <select
          id="faturaSelecionada"
        >

          ${faturas
            .map((fatura, index) => {
              const data = new Date(fatura.dueDate);

              const texto = data.toLocaleDateString("pt-BR", {
                month: "long",
                year: "numeric",
              });

              return `
                  <option
                    value="${fatura.id}"
                    ${index === 0 ? "selected" : ""}
                  >
                    ${texto}
                  </option>
                `;
            })
            .join("")}

        </select>

      </div>


      <div
        id="faturaDetalhes"
      ></div>

    </div>

  `;

  document.querySelector("#voltarCartoes").addEventListener("click", () => {
    detalhes.style.display = "none";

    cards.style.display = "";
  });

  const select = document.querySelector("#faturaSelecionada");

  function renderizarFatura() {
    const fatura = faturas.find(
      (item) => String(item.id) === String(select.value),
    );

    if (!fatura) {
      return;
    }

    const fechamento = new Date(fatura.billClosingDate);

    const dataAnterior = new Date(fechamento);

    dataAnterior.setMonth(dataAnterior.getMonth() - 1);

    const transacoes = state.transacoes.filter((transacao) => {
      if (transacao.conta !== cartao.banco) {
        return false;
      }

      if (transacao.tipoConta !== "CREDIT") {
        return false;
      }

      const data = new Date(transacao.data);

      return (
        data > dataAnterior && data <= fechamento && transacao.tipo === "DEBIT"
      );
    });

    const totalCompras = transacoes.reduce(
      (total, transacao) => total + Math.abs(Number(transacao.valor)),
      0,
    );

    const totalDaFatura = fatura.virtual
      ? totalCompras
      : Number(fatura.totalAmount || fatura.valor || 0);

    const detalhes = document.querySelector("#faturaDetalhes");

    detalhes.innerHTML = `

      <div class="cards">

        <article class="card highlight">

          <span>
            Total da fatura
          </span>

     <strong>
  ${dinheiro(totalDaFatura)}
</strong>

        </article>


        <article class="card">

          <span>
            Vencimento
          </span>

          <strong>
            ${dataBR(fatura.dueDate)}
          </strong>

        </article>


        <article class="card">

          <span>
            Compras encontradas
          </span>

          <strong>
            ${transacoes.length}
          </strong>

        </article>

      </div>


      <div class="panel">

        <div class="panel-head">

          <div>

            <h2>
              Compras da fatura
            </h2>

            <p>
              Total identificado:
              ${dinheiro(totalCompras)}
            </p>

          </div>

        </div>


        <div class="transactions">

          ${
            transacoes.length
              ? transacoes
                  .sort((a, b) => new Date(b.data) - new Date(a.data))
                  .map(
                    (transacao) => `

                      <div
                        class="transaction"
                      >

                        <div>

                          <div
                            class="desc"
                          >
                            ${escapar(transacao.descricao)}
                          </div>

                          <div
                            class="meta"
                          >
                            ${dataBR(transacao.data)}
                            ·
                            ${escapar(transacao.categoria)}
                          </div>

                        </div>

                        <div
                          class="amount expense"
                        >
                          - ${dinheiro(Math.abs(Number(transacao.valor)))}
                        </div>

                      </div>

                    `,
                  )
                  .join("")
              : `
                <div class="empty">
                  Nenhuma compra encontrada
                  para esta fatura.
                </div>
              `
          }

        </div>

      </div>

    `;
  }

  select.addEventListener("change", renderizarFatura);

  renderizarFatura();
}

// ==========================================
// CRIAR CAIXINHA
// ==========================================

function configurarFormularioCaixinha() {
  const formularioCaixinha = document.querySelector("#caixinhaForm");

  if (!formularioCaixinha) {
    return;
  }

  formularioCaixinha.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const nome = document.querySelector("#caixinhaNome").value.trim();

    const meta = Number(document.querySelector("#caixinhaMeta").value);

    const descricao = document.querySelector("#caixinhaDescricao").value.trim();

    if (!nome) {
      alert("Digite o nome da caixinha.");

      return;
    }

    if (!Number.isFinite(meta) || meta <= 0) {
      alert("Digite uma meta válida.");

      return;
    }

    try {
      await buscarDados("/api/caixinhas", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          nome,

          meta,

          saldo: 0,

          descricao,
        }),
      });

      alert("Caixinha criada com sucesso!");

      formularioCaixinha.reset();

      await carregarCaixinhas();
    } catch (erro) {
      console.error("Erro ao criar caixinha:", erro);

      alert("Erro ao criar caixinha: " + erro.message);
    }
  });
}

// ==========================================
// CARREGAR DADOS
// ==========================================

async function carregarDados() {
  try {
    const connectionText = document.querySelector("#connectionText");

    if (connectionText) {
      connectionText.textContent = "Sincronizando...";
    }

    const inicio = document.querySelector("#startDate")?.value;

    const fim = document.querySelector("#endDate")?.value;

    const parametros = new URLSearchParams();

    if (inicio) {
      parametros.set("startDate", inicio);
    }

    if (fim) {
  const fimBusca = new Date(`${fim}T00:00:00`);

  fimBusca.setDate(
    fimBusca.getDate() + 1
  );

  parametros.set(
    "endDate",
    fimBusca.toISOString().slice(0, 10)
  );
}

    const hoje = new Date();

const inicioParcelamentos = new Date(hoje);

inicioParcelamentos.setFullYear(
  inicioParcelamentos.getFullYear() - 5
);

const fimParcelamentos = new Date(hoje);

fimParcelamentos.setMonth(
  fimParcelamentos.getMonth() + 24
);

const formatarData = (data) =>
  data.toISOString().slice(0, 10);

const parametrosParcelamentos =
  new URLSearchParams();

parametrosParcelamentos.set(
  "startDate",
  formatarData(inicioParcelamentos)
);

parametrosParcelamentos.set(
  "endDate",
  formatarData(fimParcelamentos)
);

const [
  dadosContas,
  dadosTransacoes,
  dadosParcelamentos,
  dadosFaturas,
] = await Promise.all([
  buscarDados("/api/accounts"),

  buscarDados(
    `/api/transactions?${parametros.toString()}`
  ),

  buscarDados(
    `/api/installments?${parametrosParcelamentos.toString()}`
  ),

  buscarDados("/api/bills"),
]);

    state.contas = dadosContas.contas || [];

    state.cartoes = dadosContas.cartoes || [];

    console.log("CARTÕES DO PIERRE:", state.cartoes);

    state.investimentos = dadosContas.investimentos || [];

   state.transacoes = dadosTransacoes.transacoes || [];

state.parcelamentos =
  dadosParcelamentos.compras || [];
  
  state.faturas =
  dadosFaturas.faturas || [];

    state.resumos = dadosFaturas.resumos || [];

    mostrarContas();

    mostrarCartoesEFaturas();

    atualizarDashboard();

    mostrarTabela();

    mostrarContasFixas();

    mostrarParcelas();

    await carregarCaixinhas();

    if (connectionText) {
      connectionText.textContent =
        `${state.contas.length} contas · ` + `${state.cartoes.length} cartões`;
    }
  } catch (erro) {
    console.error("Erro ao carregar dados:", erro);

    const connectionText = document.querySelector("#connectionText");

    if (connectionText) {
      connectionText.textContent = "Erro na conexão";
    }

    if (erro.message !== "Sua sessão expirou. Faça login novamente.") {
      alert("Erro ao carregar os dados: " + erro.message);
    }
  }
}

// ==========================================
// NAVEGAÇÃO
// ==========================================

function navegar(secao) {
  document.querySelectorAll(".section").forEach((elemento) => {
    elemento.classList.toggle("active", elemento.id === secao);
  });

  document.querySelectorAll(".nav-item").forEach((botao) => {
    botao.classList.toggle("active", botao.dataset.section === secao);
  });

  const titulos = {
    dashboard: "Dashboard",

    contas: "Contas",

    cartoes: "Cartões e faturas",

    transacoes: "Transações",

    parcelas: "Parcelamentos",

    fixas: "Contas fixas",

    caixinhas: "Caixinhas",
  };

  const titulo = document.querySelector("#pageTitle");

  if (titulo) {
    titulo.textContent = titulos[secao] || "Dashboard";
  }
}

// ==========================================
// EVENTOS DO MENU
// ==========================================

function configurarNavegacao() {
  document.querySelectorAll(".nav-item").forEach((botao) => {
    botao.addEventListener("click", () => {
      navegar(botao.dataset.section);
    });
  });

  document.querySelectorAll("[data-go]").forEach((botao) => {
    botao.addEventListener("click", () => {
      navegar(botao.dataset.go);
    });
  });
}

// ==========================================
// SINCRONIZAR CAIXINHAS COM O PIERRE
// ==========================================

async function sincronizarCaixinhas() {
  try {
    return await buscarDados("/api/caixinhas/sincronizar", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (erro) {
    console.error("Erro ao sincronizar caixinhas:", erro);

    throw erro;
  }
}

// ==========================================
// BOTÃO ATUALIZAR
// ==========================================

function configurarBotaoAtualizar() {
  const botaoAtualizar = document.querySelector("#refreshBtn");

  if (!botaoAtualizar) {
    return;
  }

  botaoAtualizar.addEventListener("click", async () => {
    try {
      botaoAtualizar.disabled = true;

      botaoAtualizar.textContent = "↻ Sincronizando...";

      const resultado = await sincronizarCaixinhas();

      await carregarDados();

      const quantidade = resultado?.sincronizadas?.length || 0;

      if (quantidade > 0) {
        alert(
          `Sincronização concluída!\n\n` +
            `${quantidade} nova${quantidade === 1 ? "" : "s"} movimentação${
              quantidade === 1 ? "" : "ões"
            } sincronizada${quantidade === 1 ? "" : "s"}.`,
        );
      } else {
        alert(
          "Sincronização concluída!\n\n" +
            "Nenhuma nova movimentação encontrada.",
        );
      }
    } catch (erro) {
      console.error("Erro ao atualizar:", erro);

      if (erro.message !== "Sua sessão expirou. Faça login novamente.") {
        alert("Erro ao sincronizar:\n\n" + erro.message);
      }
    } finally {
      botaoAtualizar.disabled = false;

      botaoAtualizar.textContent = "↻ Atualizar";
    }
  });
}

// ==========================================
// FILTRO DE TRANSAÇÕES
// ==========================================

function configurarFiltro() {
  const botaoFiltro = document.querySelector("#filterBtn");

  if (!botaoFiltro) {
    return;
  }

  botaoFiltro.addEventListener("click", () => {
    carregarDados();
  });
}

// ==========================================
// CONTAS FIXAS
// ==========================================

// ==========================================
// CONTAS FIXAS
// ==========================================

function configurarFormularioContaFixa() {
  const formulario = document.querySelector("#fixedForm");

  if (!formulario) {
    return;
  }

  const tipoConta = document.querySelector("#fixedType");

  const camposParcelas = document.querySelector("#installmentFields");

  const totalParcelas = document.querySelector("#fixedTotalInstallments");

  const parcelaAtual = document.querySelector("#fixedCurrentInstallment");

  // ==========================================
  // MOSTRAR / ESCONDER CAMPOS DE PARCELAS
  // ==========================================

  function atualizarCamposParcelas() {
    if (!tipoConta) {
      return;
    }

    const ehParcelada = tipoConta.value === "parcelada";

    if (camposParcelas) {
      camposParcelas.style.display = ehParcelada ? "block" : "none";
    }

    if (totalParcelas) {
      totalParcelas.required = ehParcelada;
    }

    if (parcelaAtual) {
      parcelaAtual.required = ehParcelada;
    }
  }

  if (tipoConta) {
    tipoConta.addEventListener("change", atualizarCamposParcelas);

    atualizarCamposParcelas();
  }

  // ==========================================
  // CADASTRAR CONTA
  // ==========================================

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();

    const nome = document.querySelector("#fixedName").value.trim();

    const valor = Number(document.querySelector("#fixedAmount").value);

    const dia = Number(document.querySelector("#fixedDay").value);

    const categoria = document.querySelector("#fixedCategory").value;

    const tipo = tipoConta ? tipoConta.value : "fixa";

    const quantidadeParcelas = Number(totalParcelas ? totalParcelas.value : 0);

    const numeroParcelaAtual = Number(parcelaAtual ? parcelaAtual.value : 1);

    // ==========================================
    // VALIDAÇÕES
    // ==========================================

    if (!nome) {
      alert("Digite o nome da conta.");

      return;
    }

    if (!Number.isFinite(valor) || valor <= 0) {
      alert("Digite um valor válido.");

      return;
    }

    if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
      alert("Digite um dia de vencimento entre 1 e 31.");

      return;
    }

    if (tipo === "parcelada") {
      if (!Number.isInteger(quantidadeParcelas) || quantidadeParcelas < 1) {
        alert("Informe o total de parcelas.");

        return;
      }

      if (
        !Number.isInteger(numeroParcelaAtual) ||
        numeroParcelaAtual < 1 ||
        numeroParcelaAtual > quantidadeParcelas
      ) {
        alert("A parcela atual deve estar entre 1 e o total de parcelas.");

        return;
      }
    }

    // ==========================================
    // DEFINIR MÊS DE INÍCIO DA PARCELA
    // ==========================================

    const dataInicioParcela = new Date();

    const anoInicioParcela = dataInicioParcela.getFullYear();

    const mesInicioParcela = dataInicioParcela.getMonth();

    // ==========================================
    // CRIAR CONTA
    // ==========================================

    const conta = {
      id: crypto.randomUUID(),

      name: nome,

      amount: valor,

      day: dia,

      category: categoria,

      tipo: tipo,

      totalParcelas: tipo === "parcelada" ? quantidadeParcelas : null,

      parcelaAtual: tipo === "parcelada" ? numeroParcelaAtual : null,

      // ========================================
      // INÍCIO DA PARCELA
      // ========================================

      anoInicioParcela: tipo === "parcelada" ? anoInicioParcela : null,

      mesInicioParcela: tipo === "parcelada" ? mesInicioParcela : null,

      pagamentos: [],

      finalizada: false,
    };

    // ==========================================
    // SALVAR
    // ==========================================

    const contas = pegarContasFixas();

    contas.push(conta);

    salvarContasFixas(contas);

    // ==========================================
    // LIMPAR FORMULÁRIO
    // ==========================================

    formulario.reset();

    if (tipoConta) {
      tipoConta.value = "fixa";
    }

    if (camposParcelas) {
      camposParcelas.style.display = "none";
    }

    if (totalParcelas) {
      totalParcelas.required = false;

      totalParcelas.value = "";
    }

    if (parcelaAtual) {
      parcelaAtual.required = false;

      parcelaAtual.value = "1";
    }

    // ==========================================
    // ATUALIZAR LISTA
    // ==========================================

    mostrarContasFixas();

    alert(
      tipo === "parcelada"
        ? "Conta parcelada adicionada com sucesso!"
        : "Conta fixa adicionada com sucesso!",
    );
  });
}

// ==========================================
// DATAS PADRÃO
// ==========================================

function configurarDatas() {
  const fim = new Date();

  const inicio = new Date(fim);

  inicio.setMonth(inicio.getMonth() - 3);

  const formatar = (data) => data.toISOString().slice(0, 10);

  const campoInicio = document.querySelector("#startDate");

  const campoFim = document.querySelector("#endDate");

  if (campoInicio) {
    campoInicio.value = formatar(inicio);
  }

  if (campoFim) {
    campoFim.value = formatar(fim);
  }
}

// ==========================================
// INICIAR APLICAÇÃO
// ==========================================

async function iniciarAplicacao() {
  configurarDatas();

  mostrarContasFixas();

  configurarNavegacao();

  configurarBotaoAtualizar();

  configurarFiltro();

  configurarFormularioContaFixa();
  configurarNavegacaoContasFixas();

  configurarFormularioCaixinha();

  await carregarDados();
}

// ==========================================
// INICIALIZAÇÃO PRINCIPAL
// ==========================================

async function iniciarSistema() {
  // Primeiro escondemos o sistema.
  mostrarLogin();

  // Recupera o token salvo.
  carregarTokenSalvo();

  // Verifica se existe uma sessão válida.
  const autenticado = await verificarSessao();

  if (!autenticado) {
    mostrarLogin();

    const email = document.querySelector("#loginEmail");

    if (email) {
      email.focus();
    }

    return;
  }

  // Sessão válida.
  mostrarAplicacao();

  await iniciarAplicacao();
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {
  configurarLogin();

  configurarLogout();

  await iniciarSistema();
});

// ==========================================
// COMPRAS PARCELADAS
// ==========================================

function mostrarParcelas() {
  const lista = document.querySelector("#parcelasLista");
  const filtroConta = document.querySelector("#parcelasFiltroConta");
  const filtroMes = document.querySelector("#parcelasFiltroMes");

  const elementoAndamento = document.querySelector(
    "#parcelasEmAndamento",
  );

  const elementoValorTotal = document.querySelector(
    "#parcelasValorTotal",
  );

  const elementoJaPago = document.querySelector(
    "#parcelasJaPago",
  );

  const elementoRestante = document.querySelector(
    "#parcelasRestante",
  );

  const elementoProgresso = document.querySelector(
    "#parcelasProgresso",
  );

  const elementoProgressoTexto = document.querySelector(
    "#parcelasProgressoTexto",
  );

  const elementoUltimaData = document.querySelector(
    "#parcelasUltimaData",
  );

  if (!lista) {
    return;
  }

  // ==========================================
  // DADOS REAIS DO PIERRE
  // ==========================================

  const compras = Array.isArray(state.parcelamentos)
    ? state.parcelamentos
    : [];

  const cartoes = Array.isArray(state.cartoes)
    ? state.cartoes
    : [];

  // ==========================================
  // NORMALIZAR COMPRA
  // ==========================================

  const comprasNormalizadas = compras.map((compra, index) => {
    const parcelas = Array.isArray(compra.parcelas)
      ? [...compra.parcelas]
      : [];

    parcelas.sort(
      (a, b) =>
        Number(a.parcelaAtual || 0) -
        Number(b.parcelaAtual || 0),
    );

    const totalParcelas = Math.max(
      Number(compra.totalParcelas || 0),
      ...parcelas.map((parcela) =>
        Number(
          parcela.totalParcelas ||
            parcela.totalInstallments ||
            0,
        ),
      ),
    );

    const valorTotalInformado = Number(
      compra.valorTotal || 0,
    );

    const valorTotalParcelas = parcelas.reduce(
      (total, parcela) =>
        total + Math.abs(Number(parcela.valor || 0)),
      0,
    );

    const valorTotal =
      valorTotalInformado > 0
        ? valorTotalInformado
        : valorTotalParcelas;

    const valorJaPago = parcelas
      .filter((parcela) => {
        const status = String(
          parcela.status || "",
        ).toUpperCase();

        return status === "POSTED";
      })
      .reduce(
        (total, parcela) =>
          total + Math.abs(Number(parcela.valor || 0)),
        0,
      );

    const valorRestante = Math.max(
      valorTotal - valorJaPago,
      0,
    );

    const ultimaParcela =
      parcelas.length > 0
        ? Math.max(
            ...parcelas.map((parcela) =>
              Number(parcela.parcelaAtual || 0),
            ),
          )
        : 0;

    const finalizada =
      totalParcelas > 0 &&
      parcelas.length > 0 &&
      parcelas.every((parcela) => {
        const status = String(
          parcela.status || "",
        ).toUpperCase();

        return (
          status === "POSTED" &&
          Number(parcela.parcelaAtual || 0) >=
            totalParcelas
        );
      });

    return {
      ...compra,

      _id: compra.id || `${index}`,

      nome:
        compra.nome ||
        compra.descricao ||
        "Compra parcelada",

      cartaoId: compra.cartaoId || "",

      cartaoNome:
        compra.cartaoNome ||
        compra.cartao ||
        "Cartão",

      banco: compra.banco || "",

      parcelas,

      totalParcelas,

      valorTotal,

      valorJaPago,

      valorRestante,

      ultimaParcela,

      finalizada,
    };
  });

  // ==========================================
  // FILTRO DE CARTÕES
  // ==========================================

  if (filtroConta) {
    const valorAtual =
      filtroConta.value || "TODAS";

    filtroConta.innerHTML = `
      <option value="TODAS">
        Todos os cartões
      </option>

      ${cartoes
        .map(
          (cartao) => `
            <option value="${escapar(cartao.id)}">
              ${escapar(
                cartao.nome ||
                  cartao.banco ||
                  "Cartão",
              )}
            </option>
          `,
        )
        .join("")}
    `;

    if (
      [...filtroConta.options].some(
        (option) =>
          option.value === valorAtual,
      )
    ) {
      filtroConta.value = valorAtual;
    }
  }

  // ==========================================
  // FILTRO DE MESES
  // ==========================================

  if (filtroMes) {
    const valorAtual =
      filtroMes.value || "";

    const meses = new Set();

    comprasNormalizadas.forEach((compra) => {
      compra.parcelas.forEach((parcela) => {
        const vencimento =
          parcela.vencimento ||
          parcela.dueDate;

        if (vencimento) {
          const mes = String(vencimento).substring(
            0,
            7,
          );

          if (/^\d{4}-\d{2}$/.test(mes)) {
            meses.add(mes);
          }
        }
      });
    });

    // Sempre incluir alguns meses ao redor do atual.
    const hoje = new Date();

    const inicio = new Date(
      hoje.getFullYear(),
      hoje.getMonth() - 12,
      1,
    );

    for (let i = 0; i < 37; i++) {
      const ano = inicio.getFullYear();

      const mes = String(
        inicio.getMonth() + 1,
      ).padStart(2, "0");

      meses.add(`${ano}-${mes}`);

      inicio.setMonth(
        inicio.getMonth() + 1,
      );
    }

    const mesesOrdenados = [...meses].sort();

    filtroMes.innerHTML = `
      <option value="TODOS">
        Todos os meses
      </option>

      ${mesesOrdenados
        .map((mes) => {
          const [ano, numeroMes] =
            mes.split("-");

          const nomeMes = new Date(
            Number(ano),
            Number(numeroMes) - 1,
            1,
          ).toLocaleDateString(
            "pt-BR",
            {
              month: "long",
              year: "numeric",
            },
          );

          return `
            <option value="${mes}">
              ${
                nomeMes.charAt(0).toUpperCase() +
                nomeMes.slice(1)
              }
            </option>
          `;
        })
        .join("")}
    `;

    if (
      valorAtual &&
      [...filtroMes.options].some(
        (option) =>
          option.value === valorAtual,
      )
    ) {
      filtroMes.value = valorAtual;
    } else {
      const mesAtual =
        `${hoje.getFullYear()}-${String(
          hoje.getMonth() + 1,
        ).padStart(2, "0")}`;

      if (
        [...filtroMes.options].some(
          (option) =>
            option.value === mesAtual,
        )
      ) {
        filtroMes.value = mesAtual;
      } else {
        filtroMes.value = "TODOS";
      }
    }
  }

  // ==========================================
  // FILTROS SELECIONADOS
  // ==========================================

  const contaSelecionada =
    filtroConta?.value || "TODAS";

  const mesSelecionado =
    filtroMes?.value || "TODOS";

  let comprasFiltradas =
    comprasNormalizadas.filter(
      (compra) => {
        // --------------------------------------
        // CARTÃO
        // --------------------------------------

        if (
          contaSelecionada !== "TODAS" &&
          String(compra.cartaoId) !==
            String(contaSelecionada)
        ) {
          return false;
        }

        // --------------------------------------
        // MÊS DA PARCELA
        // --------------------------------------

        if (mesSelecionado !== "TODOS") {
          const possuiParcelaNoMes =
            compra.parcelas.some(
              (parcela) => {
                const vencimento =
                  parcela.vencimento ||
                  parcela.dueDate;

                return (
                  vencimento &&
                  String(vencimento).substring(
                    0,
                    7,
                  ) === mesSelecionado
                );
              },
            );

          if (!possuiParcelaNoMes) {
            return false;
          }
        }

        return true;
      },
    );

  // ==========================================
  // STATUS
  // ==========================================

  const status =
    window.parcelasStatus ||
    "ANDAMENTO";

  if (status === "FINALIZADAS") {
    comprasFiltradas =
      comprasFiltradas.filter(
        (compra) =>
          compra.finalizada,
      );
  } else {
    comprasFiltradas =
      comprasFiltradas.filter(
        (compra) =>
          !compra.finalizada,
      );
  }

  // ==========================================
  // RESUMO
  // ==========================================

  const quantidade =
    comprasFiltradas.length;

  const valorTotal =
    comprasFiltradas.reduce(
      (total, compra) =>
        total + compra.valorTotal,
      0,
    );

  const valorPago =
    comprasFiltradas.reduce(
      (total, compra) =>
        total + compra.valorJaPago,
      0,
    );

  const valorRestante =
    comprasFiltradas.reduce(
      (total, compra) =>
        total + compra.valorRestante,
      0,
    );

  const percentual =
    valorTotal > 0
      ? Math.min(
          (valorPago / valorTotal) * 100,
          100,
        )
      : 0;

  if (elementoAndamento) {
    elementoAndamento.textContent =
      quantidade;
  }

  if (elementoValorTotal) {
    elementoValorTotal.textContent =
      dinheiro(valorTotal);
  }

  if (elementoJaPago) {
    elementoJaPago.textContent =
      dinheiro(valorPago);
  }

  if (elementoRestante) {
    elementoRestante.textContent =
      dinheiro(valorRestante);
  }

  if (elementoProgresso) {
    elementoProgresso.style.width =
      `${percentual}%`;
  }

  if (elementoProgressoTexto) {
    elementoProgressoTexto.textContent =
      `${Math.round(percentual)}% pago`;
  }

  // ==========================================
  // ÚLTIMA DATA
  // ==========================================

  const datas = comprasFiltradas
    .flatMap((compra) =>
      compra.parcelas.map(
        (parcela) =>
          parcela.vencimento ||
          parcela.dueDate,
      ),
    )
    .filter(Boolean)
    .sort(
      (a, b) =>
        new Date(b) - new Date(a),
    );

  if (elementoUltimaData) {
    elementoUltimaData.textContent =
      datas.length
        ? dataBR(datas[0])
        : "—";
  }

  // ==========================================
  // LISTA
  // ==========================================

  if (!comprasFiltradas.length) {
    lista.innerHTML = `
      <div class="empty">
        Nenhuma compra parcelada encontrada
        para os filtros selecionados.
      </div>
    `;

    return;
  }

  lista.innerHTML =
    comprasFiltradas
      .map((compra) => {
        // --------------------------------------
        // PARCELA DO MÊS SELECIONADO
        // --------------------------------------

        let parcelaExibida = null;

        if (mesSelecionado !== "TODOS") {
          parcelaExibida =
            compra.parcelas.find(
              (parcela) => {
                const vencimento =
                  parcela.vencimento ||
                  parcela.dueDate;

                return (
                  vencimento &&
                  String(vencimento).substring(
                    0,
                    7,
                  ) === mesSelecionado
                );
              },
            );
        }

        // Se "todos", mostra a próxima pendente.
        if (!parcelaExibida) {
          parcelaExibida =
            compra.parcelas.find(
              (parcela) =>
                String(
                  parcela.status || "",
                ).toUpperCase() !==
                "POSTED",
            );
        }

        // Se não encontrou pendente,
        // mostra a última parcela.
        if (!parcelaExibida) {
          parcelaExibida =
            compra.parcelas[
              compra.parcelas.length - 1
            ];
        }

        const numeroParcela = Number(
          parcelaExibida?.parcelaAtual || 0,
        );

        const totalParcelas =
          Number(
            parcelaExibida?.totalParcelas ||
              compra.totalParcelas ||
              0,
          );

        const valorParcela = Number(
          parcelaExibida?.valor || 0,
        );

        const vencimento =
          parcelaExibida?.vencimento ||
          parcelaExibida?.dueDate;

        const progresso =
          compra.valorTotal > 0
            ? Math.min(
                (compra.valorJaPago /
                  compra.valorTotal) *
                  100,
                100,
              )
            : 0;

        const statusParcela =
          String(
            parcelaExibida?.status || "",
          ).toUpperCase();

        const textoStatus =
          statusParcela === "POSTED"
            ? "🟢 Lançada"
            : "🟡 Pendente";

        return `
          <div class="transaction">

            <div style="flex:1;">

              <div class="desc">
                ${escapar(compra.nome)}
              </div>

              <div class="meta">
                💳
                ${escapar(
                  compra.cartaoNome,
                )}
              </div>

              <div class="meta">
                Parcela
                ${numeroParcela}/${totalParcelas}
                ·
                ${textoStatus}
              </div>

              <div class="meta">
                Valor desta parcela:
                ${dinheiro(valorParcela)}
              </div>

              <div class="meta">
                Vencimento:
                ${dataBR(vencimento)}
              </div>

              <div class="meta">
                Total da compra:
                ${dinheiro(
                  compra.valorTotal,
                )}
              </div>

              <div class="meta">
                Já pago:
                ${dinheiro(
                  compra.valorJaPago,
                )}
              </div>

              <div class="meta">
                Restante:
                ${dinheiro(
                  compra.valorRestante,
                )}
              </div>

              <div
                style="
                  margin-top:10px;
                  width:100%;
                  height:7px;
                  background:#e5e7eb;
                  border-radius:999px;
                  overflow:hidden;
                "
              >
                <div
                  style="
                    width:${progresso}%;
                    height:100%;
                    background:#16a34a;
                    border-radius:999px;
                  "
                ></div>
              </div>

              <div
                class="meta"
                style="margin-top:5px;"
              >
                ${Math.round(progresso)}% pago
              </div>

            </div>

            <div
              class="amount ${
                compra.finalizada
                  ? "income"
                  : "expense"
              }"
            >
              ${
                compra.finalizada
                  ? "✓ Finalizada"
                  : dinheiro(
                      valorParcela,
                    )
              }
            </div>

          </div>
        `;
      })
      .join("");
}

// ==========================================
// FILTROS DE PARCELAS
// ==========================================

document.addEventListener(
  "change",
  (evento) => {
    if (
      evento.target?.id ===
        "parcelasFiltroConta" ||
      evento.target?.id ===
        "parcelasFiltroMes"
    ) {
      mostrarParcelas();
    }
  },
);

// ==========================================
// ABAS DE PARCELAMENTOS
// ==========================================

document.addEventListener(
  "click",
  (evento) => {
    if (
      evento.target?.id ===
      "parcelasTabAndamento"
    ) {
      window.parcelasStatus =
        "ANDAMENTO";

      mostrarParcelas();
    }

    if (
      evento.target?.id ===
      "parcelasTabFinalizadas"
    ) {
      window.parcelasStatus =
        "FINALIZADAS";

      mostrarParcelas();
    }
  },
);