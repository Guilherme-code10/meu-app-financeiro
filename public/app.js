const state = {
  contas: [],
  contasFixas: [],
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
  const botaoMenu = document.querySelector("#mobileMenuButton");

  if (botaoMenu) {
    botaoMenu.style.display = "none";
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

  // Mostrar novamente o botão do menu
  // depois que o usuário fizer login
  const botaoMenu = document.querySelector("#mobileMenuButton");

  if (botaoMenu) {
    botaoMenu.style.display = "";
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
// TOTAL DAS CAIXINHAS NO DASHBOARD
// ==========================================

function atualizarTotalCaixinhas() {
  const elemento = document.querySelector("#totalCaixinhas");

  if (!elemento) {
    return;
  }

  const total = state.caixinhas.reduce(
    (soma, caixinha) => soma + Number(caixinha.saldo || 0),
    0,
  );

  elemento.textContent = dinheiro(total);
}

// ==========================================
// CLIQUE NO TOTAL DAS CAIXINHAS
// ==========================================

function configurarCardTotalCaixinhas() {
  const card = document.querySelector("#totalCaixinhasCard");

  if (!card) {
    return;
  }

  card.addEventListener("click", () => {
    navegar("caixinhas");
  });
}

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
    .map(([categoria, valor], indice) => {
      const porcentagem = Math.max(5, (valor / maior) * 100);

      const classeCor = `grafico-cor-${(indice % 7) + 1}`;

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
              class="bar ${classeCor}"
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

async function marcarContaComoPaga(id) {
  try {
    const contas = pegarContasFixas();

    const conta = contas.find((item) => String(item.id) === String(id));

    if (!conta) {
      return;
    }

    const pagamentosAtuais = Array.isArray(conta.pagamentos)
      ? [...conta.pagamentos]
      : [];

    const mesAtual = obterMesAtual();

    const indice = pagamentosAtuais.indexOf(mesAtual);

    if (indice >= 0) {
      // Desmarcar como paga
      pagamentosAtuais.splice(indice, 1);
    } else {
      // Marcar como paga
      pagamentosAtuais.push(mesAtual);
    }

    await buscarDados(`/api/contas-fixas/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: conta.name,
        amount: conta.amount,
        day: conta.day,
        category: conta.category,
        tipo: conta.tipo,
        totalParcelas: conta.totalParcelas,
        parcelaAtual: conta.parcelaAtual,
        anoInicioParcela: conta.anoInicioParcela,
        mesInicioParcela: conta.mesInicioParcela,
        pagamentos: pagamentosAtuais,
        finalizada: conta.finalizada,
      }),
    });

    await carregarContasFixas();
  } catch (erro) {
    console.error("Erro ao atualizar pagamento da conta fixa:", erro);

    alert(
      "Não foi possível atualizar o pagamento da conta fixa:\n\n" +
        erro.message,
    );
  }
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
    botao.addEventListener("click", async () => {
      const id = botao.dataset.deleteFixed;

      const confirmou = confirm("Deseja realmente excluir esta conta fixa?");

      if (!confirmou) {
        return;
      }

      try {
        botao.disabled = true;
        botao.textContent = "Excluindo...";

        await buscarDados(`/api/contas-fixas/${id}`, {
          method: "DELETE",
        });

        await carregarContasFixas();

        alert("Conta fixa excluída com sucesso!");
      } catch (erro) {
        console.error("Erro ao excluir conta fixa:", erro);

        alert("Não foi possível excluir a conta fixa:\n\n" + erro.message);

        botao.disabled = false;
        botao.textContent = "Excluir";
      }
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

    atualizarTotalCaixinhas();
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

      const progresso = meta > 0 ? Math.min((saldo / meta) * 100, 100) : 0;

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

        <div class="caixinha-acoes">
        
        <button
  type="button"
  class="primary"
  data-dashboard-caixinha="${caixinha.id}"
>
  📊 Dashboard
</button>

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
  class="caixinha-btn caixinha-btn-rendimento"
  data-rendimento-caixinha="${caixinha.id}"
>
  Rendimento
</button>

<button
  type="button"
  class="caixinha-btn caixinha-btn-editar"
  data-editar-caixinha="${caixinha.id}"
>
  Editar
</button>

<button
  type="button"
  class="caixinha-btn caixinha-btn-excluir"
  data-excluir-caixinha="${caixinha.id}"
>
  Excluir
</button>

        </div>
      `;
    })
    .join("");

  // ------------------------------------------
  // BOTÃO DASHBOARD
  // ------------------------------------------

  lista.querySelectorAll("[data-dashboard-caixinha]").forEach((botao) => {
    botao.addEventListener("click", () => {
      abrirDashboardCaixinha(botao.dataset.dashboardCaixinha);
    });
  });

  // ------------------------------------------
  // BOTÃO ADICIONAR
  // ------------------------------------------

  lista.querySelectorAll("[data-adicionar-caixinha]").forEach((botao) => {
    botao.addEventListener("click", () => {
      adicionarDinheiroCaixinha(botao.dataset.adicionarCaixinha);
    });
  });

  // ------------------------------------------
  // BOTÃO RETIRAR
  // ------------------------------------------

  lista.querySelectorAll("[data-retirar-caixinha]").forEach((botao) => {
    botao.addEventListener("click", () => {
      retirarDinheiroCaixinha(botao.dataset.retirarCaixinha);
    });
  });

  // ------------------------------------------
  // BOTÃO RENDIMENTO
  // ------------------------------------------

  lista.querySelectorAll("[data-rendimento-caixinha]").forEach((botao) => {
    botao.addEventListener("click", () => {
      adicionarRendimento(botao.dataset.rendimentoCaixinha);
    });
  });

  // ------------------------------------------
  // BOTÃO EDITAR
  // ------------------------------------------

  lista.querySelectorAll("[data-editar-caixinha]").forEach((botao) => {
    botao.addEventListener("click", () => {
      editarCaixinha(botao.dataset.editarCaixinha);
    });
  });

  // ------------------------------------------
  // BOTÃO EXCLUIR
  // ------------------------------------------

  lista.querySelectorAll("[data-excluir-caixinha]").forEach((botao) => {
    botao.addEventListener("click", () => {
      excluirCaixinha(botao.dataset.excluirCaixinha);
    });
  });
}
// ==========================================
// DASHBOARD DA CAIXINHA
// ==========================================

async function abrirDashboardCaixinha(id) {
  try {
    const dados = await buscarDados(`/api/caixinhas/${id}/dashboard`);

    if (!dados || !dados.sucesso) {
      throw new Error(dados?.erro || "Não foi possível carregar o dashboard.");
    }

    const caixinha = dados.caixinha;
    const resumo = dados.resumo;
    const historico = dados.historico || [];

    // ------------------------------------------
    // REMOVER DASHBOARD ANTERIOR
    // ------------------------------------------

    const dashboardAnterior = document.querySelector("#modalDashboardCaixinha");

    if (dashboardAnterior) {
      dashboardAnterior.remove();
    }

    // ------------------------------------------
    // FORMATAR HISTÓRICO
    // ------------------------------------------

    const historicoOrdenado = [...historico].sort(
      (a, b) => new Date(a.data) - new Date(b.data),
    );

    // ------------------------------------------
    // CALCULAR EVOLUÇÃO DO SALDO
    // ------------------------------------------

    let saldoGrafico = 0;

    const pontosGrafico = historicoOrdenado.map((item) => {
      const valor = Number(item.valor || 0);

      if (item.tipo === "ENTRADA" || item.tipo === "RENDIMENTO") {
        saldoGrafico += valor;
      }

      if (item.tipo === "SAIDA") {
        saldoGrafico -= valor;
      }

      return {
        data: item.data,
        saldo: saldoGrafico,
      };
    });

    // ------------------------------------------
    // GERAR GRÁFICO
    // ------------------------------------------

    let graficoHTML = `
      <div
        style="
          height:240px;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#64748b;
          background:#f8fafc;
          border-radius:16px;
        "
      >
        Ainda não existem movimentações
        suficientes para mostrar o gráfico.
      </div>
    `;

    if (pontosGrafico.length > 0) {
      const largura = 700;
      const altura = 220;
      const margem = 35;

      const valores = pontosGrafico.map((ponto) => ponto.saldo);

      const maiorValor = Math.max(...valores, 1);

      const menorValor = Math.min(...valores, 0);

      const diferenca = maiorValor - menorValor || 1;

      const pontos = pontosGrafico
        .map((ponto, indice) => {
          const x =
            margem +
            (indice / Math.max(pontosGrafico.length - 1, 1)) *
              (largura - margem * 2);

          const y =
            altura -
            margem -
            ((ponto.saldo - menorValor) / diferenca) * (altura - margem * 2);

          return `${x},${y}`;
        })
        .join(" ");

      graficoHTML = `
        <div
          style="
            width:100%;
            overflow:hidden;
            background:#f8fafc;
            border-radius:16px;
            padding:10px;
          "
        >
          <svg
            viewBox="0 0 ${largura} ${altura}"
            width="100%"
            height="220"
            preserveAspectRatio="none"
          >

            <line
              x1="${margem}"
              y1="${altura - margem}"
              x2="${largura - margem}"
              y2="${altura - margem}"
              stroke="#cbd5e1"
              stroke-width="1"
            />

            <polyline
              points="${pontos}"
              fill="none"
              stroke="#4054c6"
              stroke-width="4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />

            ${pontosGrafico
              .map((ponto, indice) => {
                const x =
                  margem +
                  (indice / Math.max(pontosGrafico.length - 1, 1)) *
                    (largura - margem * 2);

                const y =
                  altura -
                  margem -
                  ((ponto.saldo - menorValor) / diferenca) *
                    (altura - margem * 2);

                return `
                    <circle
                      cx="${x}"
                      cy="${y}"
                      r="4"
                      fill="#4054c6"
                    />
                  `;
              })
              .join("")}

          </svg>
        </div>
      `;
    }

    // ------------------------------------------
    // HISTÓRICO
    // ------------------------------------------

    const historicoHTML = historico.length
      ? historico
          .map((item) => {
            const tipo = item.tipo || "";

            let icone = "↔️";
            let classe = "#64748b";
            let sinal = "";

            if (tipo === "ENTRADA") {
              icone = "🟢";
              classe = "#16a34a";
              sinal = "+";
            }

            if (tipo === "SAIDA") {
              icone = "🔴";
              classe = "#dc2626";
              sinal = "-";
            }

            if (tipo === "RENDIMENTO") {
              icone = "📈";
              classe = "#2563eb";
              sinal = "+";
            }

            const origem =
              item.tipo === "RENDIMENTO"
                ? "Rendimento manual"
                : item.origem === "AUTOMATICO"
                  ? "Automático • Pierre"
                  : "Movimentação manual";

            return `
                <div
                  style="
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:16px;
                    padding:14px 0;
                    border-bottom:1px solid #e2e8f0;
                  "
                >

                  <div
                    style="
                      display:flex;
                      align-items:center;
                      gap:12px;
                      min-width:0;
                    "
                  >

                    <span
                      style="
                        font-size:20px;
                      "
                    >
                      ${icone}
                    </span>

                    <div
                      style="
                        min-width:0;
                      "
                    >

                      <strong>
                        ${escapar(item.descricao || "Movimentação")}
                      </strong>

                      <small
                        style="
                          display:block;
                          color:#64748b;
                          margin-top:3px;
                        "
                      >
                        ${origem}
                        ·
                        ${dataBR(item.data)}
                      </small>

                    </div>

                  </div>

                  <strong
                    style="
                      color:${classe};
                      white-space:nowrap;
                    "
                  >
                    ${sinal}
                    ${dinheiro(Math.abs(Number(item.valor || 0)))}
                  </strong>

                </div>
              `;
          })
          .join("")
      : `
          <div class="empty">
            Nenhuma movimentação encontrada.
          </div>
        `;

    // ------------------------------------------
    // CRIAR MODAL
    // ------------------------------------------

    const modal = document.createElement("div");

    modal.id = "modalDashboardCaixinha";

    modal.style.cssText = `
      position:fixed;
      inset:0;
      background:rgba(15,23,42,.65);
      z-index:9999;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
      overflow:auto;
    `;

    modal.innerHTML = `
      <div
        style="
          width:100%;
          max-width:1000px;
          max-height:92vh;
          overflow:auto;
          background:white;
          border-radius:24px;
          padding:28px;
          box-shadow:0 25px 60px rgba(0,0,0,.25);
        "
      >

        <!-- CABEÇALHO -->

        <div
          style="
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:20px;
            margin-bottom:25px;
          "
        >

          <div>

            <small
              style="
                color:#4054c6;
                font-weight:700;
                text-transform:uppercase;
              "
            >
              Dashboard da caixinha
            </small>

            <h2
              style="
                margin:5px 0;
                font-size:28px;
              "
            >
              ${escapar(caixinha.nome)}
            </h2>

            <p
              style="
                margin:0;
                color:#64748b;
              "
            >
              ${escapar(caixinha.descricao || "")}
            </p>

          </div>

          <button
            type="button"
            id="fecharDashboardCaixinha"
            style="
              border:0;
              background:#f1f5f9;
              width:42px;
              height:42px;
              border-radius:50%;
              cursor:pointer;
              font-size:20px;
            "
          >
            ×
          </button>

        </div>

        <!-- CARDS -->

        <div
          style="
            display:grid;
            grid-template-columns:
              repeat(
                auto-fit,
                minmax(180px,1fr)
              );
            gap:16px;
            margin-bottom:22px;
          "
        >

          <div
            style="
              background:#f8fafc;
              border-radius:18px;
              padding:20px;
            "
          >
            <small>Saldo atual</small>

            <strong
              style="
                display:block;
                font-size:26px;
                margin-top:8px;
              "
            >
              ${dinheiro(caixinha.saldo)}
            </strong>
          </div>

          <div
            style="
              background:#f8fafc;
              border-radius:18px;
              padding:20px;
            "
          >
            <small>Meta</small>

            <strong
              style="
                display:block;
                font-size:26px;
                margin-top:8px;
              "
            >
              ${dinheiro(caixinha.meta)}
            </strong>
          </div>

          <div
            style="
              background:#f8fafc;
              border-radius:18px;
              padding:20px;
            "
          >
            <small>Total adicionado</small>

            <strong
              style="
                display:block;
                font-size:26px;
                margin-top:8px;
                color:#16a34a;
              "
            >
              ${dinheiro(resumo.totalEntradas)}
            </strong>
          </div>

          <div
            style="
              background:#f8fafc;
              border-radius:18px;
              padding:20px;
            "
          >
            <small>Total retirado</small>

            <strong
              style="
                display:block;
                font-size:26px;
                margin-top:8px;
                color:#dc2626;
              "
            >
              ${dinheiro(resumo.totalSaidas)}
            </strong>
          </div>

          <div
            style="
              background:#f8fafc;
              border-radius:18px;
              padding:20px;
            "
          >
            <small>Rendimentos</small>

            <strong
              style="
                display:block;
                font-size:26px;
                margin-top:8px;
                color:#2563eb;
              "
            >
              ${dinheiro(resumo.totalRendimentos)}
            </strong>
          </div>

        </div>

        <!-- PROGRESSO -->

        <div
          style="
            background:#f8fafc;
            padding:20px;
            border-radius:18px;
            margin-bottom:22px;
          "
        >

          <div
            style="
              display:flex;
              justify-content:space-between;
              margin-bottom:10px;
            "
          >

            <strong>
              Progresso da meta
            </strong>

            <strong>
              ${Number(caixinha.progresso || 0).toFixed(1)}%
            </strong>

          </div>

          <div
            style="
              height:12px;
              background:#e2e8f0;
              border-radius:20px;
              overflow:hidden;
            "
          >

            <div
              style="
                width:${Math.min(Number(caixinha.progresso || 0), 100)}%;
                height:100%;
                background:#4054c6;
                border-radius:20px;
              "
            ></div>

          </div>

        </div>

        <!-- GRÁFICO -->

        <div
          style="
            margin-bottom:22px;
          "
        >

          <h3>
            📈 Evolução do saldo
          </h3>

          ${graficoHTML}

        </div>

        <!-- HISTÓRICO -->

        <div>

          <h3>
            📋 Histórico completo
          </h3>

          <div>
            ${historicoHTML}
          </div>

        </div>

      </div>
    `;

    document.body.appendChild(modal);

    // ------------------------------------------
    // FECHAR
    // ------------------------------------------

    const botaoFechar = document.querySelector("#fecharDashboardCaixinha");

    if (botaoFechar) {
      botaoFechar.addEventListener("click", () => {
        modal.remove();
      });
    }

    // ------------------------------------------
    // FECHAR CLICANDO FORA
    // ------------------------------------------

    modal.addEventListener("click", (evento) => {
      if (evento.target === modal) {
        modal.remove();
      }
    });
  } catch (erro) {
    console.error("Erro ao abrir dashboard da caixinha:", erro);

    alert("Erro ao carregar dashboard: " + erro.message);
  }
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

  const valor = Number(String(valorInformado).replace(",", "."));

  if (!Number.isFinite(valor) || valor <= 0) {
    alert("Digite um valor válido maior que zero.");

    return;
  }

  const descricaoInformada = prompt("Descrição da entrada:", "Adição manual");

  if (descricaoInformada === null) {
    return;
  }

  try {
    const dados = await buscarDados(`/api/caixinhas/${id}/movimentacoes`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        tipo: "ENTRADA",
        valor,
        descricao: descricaoInformada.trim() || "Adição manual",
      }),
    });

    alert(
      `Dinheiro adicionado com sucesso!\n\n` +
        `Novo saldo: ${dinheiro(dados.caixinha.saldo)}`,
    );

    await carregarCaixinhas();
  } catch (erro) {
    console.error("Erro ao adicionar dinheiro:", erro);

    alert("Erro ao adicionar dinheiro: " + erro.message);
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

  const valor = Number(String(valorInformado).replace(",", "."));

  if (!Number.isFinite(valor) || valor <= 0) {
    alert("Digite um valor válido maior que zero.");

    return;
  }

  if (valor > saldoAtual) {
    alert("Não é possível retirar um valor maior que o saldo da caixinha.");

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
    const dados = await buscarDados(`/api/caixinhas/${id}/movimentacoes`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        tipo: "SAIDA",
        valor,
        descricao: descricaoInformada.trim() || "Retirada manual",
      }),
    });

    alert(
      `Retirada realizada com sucesso!\n\n` +
        `Novo saldo: ${dinheiro(dados.caixinha.saldo)}`,
    );

    await carregarCaixinhas();
  } catch (erro) {
    console.error("Erro ao retirar dinheiro:", erro);

    alert("Erro ao retirar dinheiro: " + erro.message);
  }
}

// ==========================================
// CONVERTER VALOR DIGITADO EM PT-BR
// ==========================================

function converterNumeroBR(valor) {
  const texto = String(valor ?? "").trim();

  if (!texto) {
    return NaN;
  }

  if (texto.includes(",")) {
    return Number(texto.replace(/\./g, "").replace(",", "."));
  }

  return Number(texto);
}

// ==========================================
// ADICIONAR RENDIMENTO
// ==========================================

async function adicionarRendimento(id) {
  const caixinha = state.caixinhas.find(
    (item) => String(item.id) === String(id),
  );

  if (!caixinha) {
    alert("Caixinha não encontrada.");
    return;
  }

  const valorInformado = prompt(
    `Adicionar rendimento para "${caixinha.nome}"\n\n` +
      `Saldo atual: ${dinheiro(caixinha.saldo)}\n\n` +
      "Digite o valor do rendimento:",
  );

  if (valorInformado === null) {
    return;
  }

  const valor = converterNumeroBR(valorInformado);

  if (!Number.isFinite(valor) || valor <= 0) {
    alert("Digite um valor de rendimento válido.");
    return;
  }

  const descricaoInformada = prompt("Descrição do rendimento:", "Rendimento");

  if (descricaoInformada === null) {
    return;
  }

  try {
    const dados = await buscarDados(`/api/caixinhas/${id}/rendimento`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        valor,
        descricao: descricaoInformada.trim() || "Rendimento",
      }),
    });

    await carregarCaixinhas();

    alert(
      `Rendimento adicionado com sucesso!\n\n` +
        `Novo saldo: ${dinheiro(dados.caixinha.saldo)}`,
    );
  } catch (erro) {
    console.error("Erro ao adicionar rendimento:", erro);

    alert("Erro ao adicionar rendimento: " + erro.message);
  }
}

// ==========================================
// EDITAR CAIXINHA
// ==========================================

async function editarCaixinha(id) {
  const caixinha = state.caixinhas.find(
    (item) => String(item.id) === String(id),
  );

  if (!caixinha) {
    alert("Caixinha não encontrada.");
    return;
  }

  const novoNome = prompt("Nome da caixinha:", caixinha.nome || "");

  if (novoNome === null) {
    return;
  }

  const nome = novoNome.trim();

  if (!nome) {
    alert("O nome da caixinha não pode ficar vazio.");
    return;
  }

  const novaMeta = prompt(
    "Meta da caixinha:",
    Number(caixinha.meta || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  );

  if (novaMeta === null) {
    return;
  }

  const meta = converterNumeroBR(novaMeta);

  if (!Number.isFinite(meta) || meta <= 0) {
    alert("Digite uma meta válida maior que zero.");
    return;
  }

  const novaDescricao = prompt(
    "Descrição da caixinha:",
    caixinha.descricao || "",
  );

  if (novaDescricao === null) {
    return;
  }

  try {
    await buscarDados(`/api/caixinhas/${id}`, {
      method: "PUT",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        nome,
        meta,
        descricao: novaDescricao.trim(),
      }),
    });

    await carregarCaixinhas();

    alert("Caixinha atualizada com sucesso!");
  } catch (erro) {
    console.error("Erro ao editar caixinha:", erro);

    alert("Erro ao editar caixinha: " + erro.message);
  }
}

// ==========================================
// EXCLUIR CAIXINHA
// ==========================================

async function excluirCaixinha(id) {
  const caixinha = state.caixinhas.find(
    (item) => String(item.id) === String(id),
  );

  if (!caixinha) {
    alert("Caixinha não encontrada.");
    return;
  }

  const confirmou = confirm(
    `Tem certeza que deseja excluir a caixinha "${caixinha.nome}"?\n\n` +
      "As movimentações relacionadas a ela também serão excluídas.",
  );

  if (!confirmou) {
    return;
  }

  try {
    await buscarDados(`/api/caixinhas/${id}`, {
      method: "DELETE",
    });

    await carregarCaixinhas();

    alert("Caixinha excluída com sucesso!");
  } catch (erro) {
    console.error("Erro ao excluir caixinha:", erro);

    alert("Erro ao excluir caixinha: " + erro.message);
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

      fimBusca.setDate(fimBusca.getDate() + 1);

      parametros.set("endDate", fimBusca.toISOString().slice(0, 10));
    }

    const hoje = new Date();

    const inicioParcelamentos = new Date(hoje);

    inicioParcelamentos.setFullYear(inicioParcelamentos.getFullYear() - 5);

    const fimParcelamentos = new Date(hoje);

    fimParcelamentos.setMonth(fimParcelamentos.getMonth() + 24);

    const formatarData = (data) => data.toISOString().slice(0, 10);

    const parametrosParcelamentos = new URLSearchParams();

    parametrosParcelamentos.set("startDate", formatarData(inicioParcelamentos));

    parametrosParcelamentos.set("endDate", formatarData(fimParcelamentos));

    const [dadosContas, dadosTransacoes, dadosParcelamentos, dadosFaturas] =
      await Promise.all([
        buscarDados("/api/accounts"),

        buscarDados(`/api/transactions?${parametros.toString()}`),

        buscarDados(`/api/installments?${parametrosParcelamentos.toString()}`),

        buscarDados("/api/bills"),
      ]);

    state.contas = dadosContas.contas || [];

    state.cartoes = dadosContas.cartoes || [];

    console.log("CARTÕES DO PIERRE:", state.cartoes);

    state.investimentos = dadosContas.investimentos || [];

    state.transacoes = dadosTransacoes.transacoes || [];

    state.parcelamentos = dadosParcelamentos.compras || [];

    state.faturas = dadosFaturas.faturas || [];

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
// CONTAS FIXAS - CARREGAR DO BANCO
// ==========================================

async function carregarContasFixas() {
  try {
    const dados = await buscarDados("/api/contas-fixas");

    state.contasFixas = dados.contas || [];

    mostrarContasFixas();

    atualizarDashboard();
  } catch (erro) {
    console.error("Erro ao carregar contas fixas:", erro);
  }
}

// ==========================================
// MIGRAR CONTAS FIXAS DO LOCALSTORAGE
// ==========================================

async function migrarContasFixas() {
  const contasLocais = JSON.parse(
    localStorage.getItem("fixedAccounts") || "[]",
  );

  if (!contasLocais.length) {
    return;
  }

  try {
    const dadosBanco = await buscarDados("/api/contas-fixas");

    const contasBanco = dadosBanco.contas || [];

    const idsBanco = new Set(contasBanco.map((conta) => String(conta.id)));

    const contasParaMigrar = contasLocais.filter(
      (conta) => !idsBanco.has(String(conta.id)),
    );

    if (!contasParaMigrar.length) {
      return;
    }

    console.log(`Migrando ${contasParaMigrar.length} conta(s) fixa(s)...`);

    for (const conta of contasParaMigrar) {
      await buscarDados("/api/contas-fixas", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          id: conta.id,

          name: conta.name,

          amount: Number(conta.amount || 0),

          day: Number(conta.day || 1),

          category: conta.category || "Outros",

          tipo: conta.tipo || "fixa",

          totalParcelas: conta.totalParcelas ?? null,

          parcelaAtual: conta.parcelaAtual ?? null,

          anoInicioParcela: conta.anoInicioParcela ?? null,

          mesInicioParcela: conta.mesInicioParcela ?? null,

          pagamentos: Array.isArray(conta.pagamentos) ? conta.pagamentos : [],

          finalizada: conta.finalizada === true,
        }),
      });
    }

    console.log("Migração das contas fixas concluída.");

    await carregarContasFixas();
  } catch (erro) {
    console.error("Erro ao migrar contas fixas:", erro);

    alert("Não foi possível migrar as contas fixas: " + erro.message);
  }
}

function pegarContasFixas() {
  return Array.isArray(state.contasFixas) ? state.contasFixas : [];
}

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

  formulario.addEventListener("submit", async (evento) => {
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
    // SALVAR NO BANCO
    // ==========================================

    try {
      const resposta = await buscarDados("/api/contas-fixas", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify(conta),
      });

      // Recarregar as contas do banco
      // para receber os dados já normalizados
      await carregarContasFixas();
    } catch (erro) {
      console.error("Erro ao salvar conta fixa:", erro);

      alert("Não foi possível adicionar a conta:\n\n" + erro.message);

      return;
    }

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

  configurarCardTotalCaixinhas();

  await carregarDados();

  //await migrarContasFixas();

  await carregarContasFixas();
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

  const elementoAndamento = document.querySelector("#parcelasEmAndamento");
  const elementoValorTotal = document.querySelector("#parcelasValorTotal");
  const elementoJaPago = document.querySelector("#parcelasJaPago");
  const elementoRestante = document.querySelector("#parcelasRestante");
  const elementoProgresso = document.querySelector("#parcelasProgresso");
  const elementoProgressoTexto = document.querySelector(
    "#parcelasProgressoTexto",
  );
  const elementoUltimaData = document.querySelector("#parcelasUltimaData");

  if (!lista) {
    return;
  }

  const compras = Array.isArray(state.parcelamentos) ? state.parcelamentos : [];

  const cartoes = Array.isArray(state.cartoes) ? state.cartoes : [];

  const transacoes = Array.isArray(state.transacoes) ? state.transacoes : [];

  // ==========================================
  // NORMALIZAR TEXTO
  // ==========================================

  function normalizarTexto(valor) {
    return String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\d+\s*\/\s*\d+/g, "")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .toLowerCase()
      .trim();
  }

  // ==========================================
  // ENCONTRAR TRANSAÇÃO REAL
  // PARA PARCELAMENTOS MAL FORMADOS
  // ==========================================

  function encontrarTransacaoParcelada(compra, parcela) {
    const nome = normalizarTexto(
      compra.nome || compra.descricao || parcela?.descricao || "",
    );

    if (!nome) {
      return null;
    }

    const candidatos = transacoes
      .filter((transacao) => {
        const descricao = normalizarTexto(transacao.descricao);

        if (!descricao) {
          return false;
        }

        const corresponde =
          descricao.includes(nome) || nome.includes(descricao);

        if (!corresponde) {
          return false;
        }

        if (compra.dataCompra && transacao.data) {
          const dataCompra = new Date(compra.dataCompra);

          const dataTransacao = new Date(transacao.data);

          const diferenca =
            Math.abs(dataCompra - dataTransacao) / (1000 * 60 * 60 * 24);

          if (diferenca > 10) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const aDescricao = String(a.descricao || "");

        const bDescricao = String(b.descricao || "");

        const aTemParcela = /\b\d+\s*\/\s*\d+\b/.test(aDescricao);

        const bTemParcela = /\b\d+\s*\/\s*\d+\b/.test(bDescricao);

        if (aTemParcela !== bTemParcela) {
          return aTemParcela ? -1 : 1;
        }

        if (compra.dataCompra && a.data && b.data) {
          const dataCompra = new Date(compra.dataCompra);

          const distanciaA = Math.abs(dataCompra - new Date(a.data));

          const distanciaB = Math.abs(dataCompra - new Date(b.data));

          return distanciaA - distanciaB;
        }

        return 0;
      });

    return candidatos[0] || null;
  }

  // ==========================================
  // NORMALIZAR COMPRAS
  // ==========================================

  const comprasNormalizadas = compras.map((compra, index) => {
    let parcelas = Array.isArray(compra.parcelas) ? [...compra.parcelas] : [];

    parcelas = parcelas
      .map((parcela) => ({
        ...parcela,

        valor: Number(parcela.valor || 0),

        parcelaAtual: Number(
          parcela.parcelaAtual || parcela.installmentNumber || 0,
        ),

        totalParcelas: Number(
          parcela.totalParcelas || parcela.totalInstallments || 0,
        ),

        status: String(parcela.status || "PENDING").toUpperCase(),

        vencimento: parcela.vencimento || parcela.dueDate || null,
      }))
      .sort((a, b) => a.parcelaAtual - b.parcelaAtual);

    // ========================================
    // CORREÇÃO DE PARCELAMENTO MAL FORMADO
    // ========================================

    const primeiraParcela = parcelas[0];

    const parcelamentoInvalido =
      parcelas.length === 0 ||
      (parcelas.length === 1 &&
        (primeiraParcela?.totalParcelas <= 1 ||
          primeiraParcela?.parcelaAtual <= 0 ||
          primeiraParcela?.valor === 0));

    if (parcelamentoInvalido) {
      const transacao = encontrarTransacaoParcelada(compra, primeiraParcela);

      if (transacao) {
        const descricao = String(transacao.descricao || "");

        const match = descricao.match(/(\d+)\s*\/\s*(\d+)/);

        if (match) {
          const numeroAtual = Number(match[1]);

          const total = Number(match[2]);

          parcelas = [
            {
              descricao,

              valor: Math.abs(Number(transacao.valor || 0)),

              parcelaAtual: numeroAtual,

              totalParcelas: total,

              vencimento: transacao.data || null,

              status: String(transacao.status || "PENDING").toUpperCase(),

              categoria: transacao.categoria || null,
            },
          ];
        }
      }
    }

    // ========================================
    // TOTAL DE PARCELAS
    // ========================================

    const totalParcelas = Math.max(
      Number(compra.totalParcelas || 0),

      ...parcelas.map((parcela) => Number(parcela.totalParcelas || 0)),
    );

    // ========================================
    // VALOR TOTAL
    // ========================================

    const somaParcelas = parcelas.reduce(
      (total, parcela) => total + Math.abs(Number(parcela.valor || 0)),
      0,
    );

    const valorInformado = Number(compra.valorTotal || 0);

    /*
     * Se temos valores reais das parcelas,
     * damos prioridade a eles.
     *
     * Isso preserva:
     * 1ª parcela = R$ 803,03
     * próximas = R$ 300 e pouco
     */
    const valorTotal = somaParcelas > 0 ? somaParcelas : valorInformado;

    // ========================================
    // PARCELAS PAGAS
    // ========================================

    const valorJaPago = parcelas.reduce((total, parcela) => {
      const status = String(parcela.status || "").toUpperCase();

      if (status === "POSTED" || status === "PAID" || status === "SETTLED") {
        return total + Math.abs(Number(parcela.valor || 0));
      }

      return total;
    }, 0);

    // ========================================
    // PARCELA ATUAL
    // ========================================

    const parcelaAtual = parcelas.length
      ? Math.max(
          ...parcelas.map((parcela) => Number(parcela.parcelaAtual || 0)),
        )
      : 0;

    // ========================================
    // FINALIZADA
    // ========================================

    const ultimaParcela = parcelas.length
      ? parcelas[parcelas.length - 1]
      : null;

    const finalizada =
      totalParcelas > 0 &&
      parcelaAtual >= totalParcelas &&
      !!ultimaParcela &&
      ["POSTED", "PAID", "SETTLED"].includes(
        String(ultimaParcela.status || "").toUpperCase(),
      );

    // ========================================
    // CARTÃO
    // ========================================

    let cartaoId =
      compra.cartaoId || compra.accountId || compra.account_id || "";

    let cartaoNome = compra.cartaoNome || compra.cartao || "";

    let banco = compra.banco || "";

    // Se o backend encontrou o cartão,
    // usamos ele.
    const cartaoEncontrado = cartoes.find(
      (cartao) => String(cartao.id) === String(cartaoId),
    );

    if (cartaoEncontrado) {
      cartaoNome =
        cartaoEncontrado.nome || cartaoEncontrado.banco || cartaoNome;

      banco = cartaoEncontrado.banco || banco;
    }

    // ========================================
    // TENTAR DESCOBRIR CARTÃO PELA TRANSAÇÃO
    // ========================================

    if (!cartaoId || !cartaoNome) {
      const transacao = encontrarTransacaoParcelada(compra, parcelas[0]);

      if (transacao) {
        const nomeConta = normalizarTexto(transacao.conta);

        const cartaoDaTransacao = cartoes.find((cartao) => {
          const nomeCartao = normalizarTexto(cartao.nome);

          const bancoCartao = normalizarTexto(cartao.banco);

          return nomeConta === nomeCartao || nomeConta === bancoCartao;
        });

        if (cartaoDaTransacao) {
          cartaoId = cartaoDaTransacao.id;

          cartaoNome = cartaoDaTransacao.nome || cartaoDaTransacao.banco;

          banco = cartaoDaTransacao.banco;
        }
      }
    }

    const valorRestante = Math.max(valorTotal - valorJaPago, 0);

    return {
      ...compra,

      _id: compra.id || `${index}`,

      nome: compra.nome || compra.descricao || "Compra parcelada",

      cartaoId,

      cartaoNome: cartaoNome || "Cartão",

      banco,

      parcelas,

      totalParcelas,

      valorTotal,

      valorJaPago,

      valorRestante,

      parcelaAtual,

      finalizada,
    };
  });

  // ==========================================
  // FILTRO DE CARTÕES
  // ==========================================

  if (filtroConta) {
    const valorAtual = filtroConta.value || "TODAS";

    filtroConta.innerHTML = `
      <option value="TODAS">
        Todos os cartões
      </option>

      ${cartoes
        .map(
          (cartao) => `
            <option value="${escapar(cartao.id)}">
              ${escapar(cartao.nome || cartao.banco || "Cartão")}
            </option>
          `,
        )
        .join("")}
    `;

    if (
      [...filtroConta.options].some((option) => option.value === valorAtual)
    ) {
      filtroConta.value = valorAtual;
    }
  }

  // ==========================================
  // FILTRO DE MESES
  // ==========================================

  if (filtroMes) {
    const valorAtual = filtroMes.value || "TODOS";

    const meses = new Set();

    comprasNormalizadas.forEach((compra) => {
      compra.parcelas.forEach((parcela) => {
        const vencimento = parcela.vencimento || parcela.dueDate;

        if (vencimento) {
          const mes = String(vencimento).substring(0, 7);

          if (/^\d{4}-\d{2}$/.test(mes)) {
            meses.add(mes);
          }
        }
      });
    });

    const hoje = new Date();

    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1);

    for (let i = 0; i < 37; i++) {
      const ano = inicio.getFullYear();

      const mes = String(inicio.getMonth() + 1).padStart(2, "0");

      meses.add(`${ano}-${mes}`);

      inicio.setMonth(inicio.getMonth() + 1);
    }

    const mesesOrdenados = [...meses].sort();

    filtroMes.innerHTML = `
      <option value="TODOS">
        Todos os meses
      </option>

      ${mesesOrdenados
        .map((mes) => {
          const [ano, numeroMes] = mes.split("-");

          const nomeMes = new Date(
            Number(ano),
            Number(numeroMes) - 1,
            1,
          ).toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
          });

          return `
            <option value="${mes}">
              ${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}
            </option>
          `;
        })
        .join("")}
    `;

    if ([...filtroMes.options].some((option) => option.value === valorAtual)) {
      filtroMes.value = valorAtual;
    } else {
      filtroMes.value = "TODOS";
    }
  }

  // ==========================================
  // FILTROS SELECIONADOS
  // ==========================================

  const contaSelecionada = filtroConta?.value || "TODAS";

  const mesSelecionado = filtroMes?.value || "TODOS";

  // ==========================================
  // APLICAÇÃO DOS FILTROS
  // ==========================================

  let comprasFiltradas = comprasNormalizadas.filter((compra) => {
    // --------------------------------------
    // CARTÃO
    // --------------------------------------

    if (
      contaSelecionada !== "TODAS" &&
      String(compra.cartaoId) !== String(contaSelecionada)
    ) {
      return false;
    }

    // --------------------------------------
    // MÊS
    // --------------------------------------

    if (mesSelecionado !== "TODOS") {
      const possuiParcela = compra.parcelas.some((parcela) => {
        const vencimento = parcela.vencimento || parcela.dueDate;

        return (
          vencimento && String(vencimento).substring(0, 7) === mesSelecionado
        );
      });

      if (!possuiParcela) {
        return false;
      }
    }

    return true;
  });

  // ==========================================
  // STATUS
  // ==========================================

  const status = window.parcelasStatus || "ANDAMENTO";

  if (status === "FINALIZADAS") {
    comprasFiltradas = comprasFiltradas.filter(
      (compra) => compra.finalizada === true,
    );
  } else {
    comprasFiltradas = comprasFiltradas.filter(
      (compra) => compra.finalizada !== true,
    );
  }

  // ==========================================
  // RESUMO
  // ==========================================

  const quantidade = comprasFiltradas.length;

  const valorTotal = comprasFiltradas.reduce(
    (total, compra) => total + Number(compra.valorTotal || 0),
    0,
  );

  const valorPago = comprasFiltradas.reduce(
    (total, compra) => total + Number(compra.valorJaPago || 0),
    0,
  );

  const valorRestante = comprasFiltradas.reduce(
    (total, compra) => total + Number(compra.valorRestante || 0),
    0,
  );

  const percentual =
    valorTotal > 0 ? Math.min((valorPago / valorTotal) * 100, 100) : 0;

  if (elementoAndamento) {
    elementoAndamento.textContent = quantidade;
  }

  if (elementoValorTotal) {
    elementoValorTotal.textContent = dinheiro(valorTotal);
  }

  if (elementoJaPago) {
    elementoJaPago.textContent = dinheiro(valorPago);
  }

  if (elementoRestante) {
    elementoRestante.textContent = dinheiro(valorRestante);
  }

  if (elementoProgresso) {
    elementoProgresso.style.width = `${percentual}%`;
  }

  if (elementoProgressoTexto) {
    elementoProgressoTexto.textContent = `${Math.round(percentual)}% pago`;
  }

  // ==========================================
  // ÚLTIMA DATA
  // ==========================================

  const datas = comprasFiltradas
    .flatMap((compra) =>
      compra.parcelas.map((parcela) => parcela.vencimento || parcela.dueDate),
    )
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a));

  if (elementoUltimaData) {
    elementoUltimaData.textContent = datas.length ? dataBR(datas[0]) : "—";
  }

  // ==========================================
  // LISTA VAZIA
  // ==========================================

  if (!comprasFiltradas.length) {
    lista.innerHTML = `
      <div class="empty">
        ${
          status === "FINALIZADAS"
            ? "Nenhuma compra finalizada encontrada."
            : "Nenhuma compra em andamento encontrada."
        }
      </div>
    `;

    return;
  }

  // ==========================================
  // LISTA
  // ==========================================

  lista.innerHTML = comprasFiltradas
    .map((compra) => {
      let parcelaExibida = null;

      // ------------------------------------
      // MÊS ESPECÍFICO
      // ------------------------------------

      if (mesSelecionado !== "TODOS") {
        parcelaExibida = compra.parcelas.find((parcela) => {
          const vencimento = parcela.vencimento || parcela.dueDate;

          return (
            vencimento && String(vencimento).substring(0, 7) === mesSelecionado
          );
        });
      }

      // ------------------------------------
      // PRÓXIMA PARCELA
      // ------------------------------------

      if (!parcelaExibida) {
        parcelaExibida = compra.parcelas.find((parcela) => {
          const statusParcela = String(parcela.status || "").toUpperCase();

          return !["POSTED", "PAID", "SETTLED"].includes(statusParcela);
        });
      }

      // ------------------------------------
      // ÚLTIMA PARCELA
      // ------------------------------------

      if (!parcelaExibida) {
        parcelaExibida = compra.parcelas[compra.parcelas.length - 1];
      }

      const numeroParcela = Number(parcelaExibida?.parcelaAtual || 0);

      const totalParcelas = Number(
        parcelaExibida?.totalParcelas || compra.totalParcelas || 0,
      );

      const valorParcela = Math.abs(Number(parcelaExibida?.valor || 0));

      const vencimento = parcelaExibida?.vencimento || parcelaExibida?.dueDate;

      const progresso =
        compra.valorTotal > 0
          ? Math.min((compra.valorJaPago / compra.valorTotal) * 100, 100)
          : 0;

      const statusParcela = String(parcelaExibida?.status || "").toUpperCase();

      const textoStatus = ["POSTED", "PAID", "SETTLED"].includes(statusParcela)
        ? "🟢 Paga"
        : "🟡 Pendente";

      return `
            <div class="transaction">

              <div style="flex:1;">

                <div class="desc">
                  ${escapar(compra.nome)}
                </div>

                <div class="meta">
                  💳
                  ${escapar(compra.cartaoNome)}
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
                  ${dinheiro(compra.valorTotal)}
                </div>

                <div class="meta">
                  Já pago:
                  ${dinheiro(compra.valorJaPago)}
                </div>

                <div class="meta">
                  Restante:
                  ${dinheiro(compra.valorRestante)}
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
                class="amount ${compra.finalizada ? "income" : "expense"}"
              >
                ${compra.finalizada ? "✓ Finalizada" : dinheiro(valorParcela)}
              </div>

            </div>
          `;
    })
    .join("");
}

// ==========================================
// FILTROS DE PARCELAS
// ==========================================

document.addEventListener("change", (evento) => {
  if (
    evento.target?.id === "parcelasFiltroConta" ||
    evento.target?.id === "parcelasFiltroMes"
  ) {
    mostrarParcelas();
  }
});

// ==========================================
// ABAS DE PARCELAMENTOS
// ==========================================

document.addEventListener("click", (evento) => {
  if (evento.target?.id === "parcelasTabAndamento") {
    window.parcelasStatus = "ANDAMENTO";

    mostrarParcelas();
  }

  if (evento.target?.id === "parcelasTabFinalizadas") {
    window.parcelasStatus = "FINALIZADAS";

    mostrarParcelas();
  }
});

// ==========================================
// MENU RESPONSIVO PARA CELULAR
// ==========================================

function configurarMenuResponsivo() {
  const sidebar = document.querySelector(".sidebar");
  const main = document.querySelector(".main");

  if (!sidebar || !main) {
    return;
  }

  // Evita criar o menu duas vezes
  if (document.querySelector("#mobileMenuButton")) {
    return;
  }

  // ==========================================
  // CRIAR BOTÃO HAMBÚRGUER
  // ==========================================

  const botaoMenu = document.createElement("button");

  botaoMenu.id = "mobileMenuButton";
  botaoMenu.type = "button";
  botaoMenu.setAttribute("aria-label", "Abrir menu");
  botaoMenu.innerHTML = "☰";

  // ==========================================
  // CRIAR FUNDO ESCURO
  // ==========================================

  const overlay = document.createElement("div");

  overlay.id = "mobileMenuOverlay";

  // ==========================================
  // ADICIONAR NA PÁGINA
  // ==========================================

  document.body.appendChild(botaoMenu);
  document.body.appendChild(overlay);
  const loginVisivel =
  document.querySelector("#loginScreen")?.style.display !== "none";

if (loginVisivel) {
  botaoMenu.style.display = "none";
}

  // ==========================================
  // CSS DO MENU
  // ==========================================

  const estilo = document.createElement("style");

  estilo.id = "mobileMenuStyle";

  estilo.textContent = `
    
    /* ========================================
       BOTÃO HAMBÚRGUER
    ======================================== */

    #mobileMenuButton {
      display: none;
      position: fixed;
      top: 15px;
      right: 15px;
      left: auto;
      z-index: 10001;

      width: 48px;
      height: 48px;

      border: none;
      border-radius: 12px;

      background: #4054c6;
      color: white;

      font-size: 25px;
      line-height: 1;

      cursor: pointer;

      box-shadow: 0 8px 25px rgba(0,0,0,.20);
    }

    /* ========================================
       FUNDO ESCURO
    ======================================== */

    #mobileMenuOverlay {
      display: none;

      position: fixed;
      inset: 0;

      background: rgba(0, 0, 0, .55);

      z-index: 9998;
    }

    /* ========================================
       CELULAR
    ======================================== */

    @media (max-width: 768px) {

      #mobileMenuButton {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .sidebar {
        position: fixed !important;

        top: 0;
        left: 0;
        bottom: 0;

        width: 280px !important;
        max-width: 85vw;

        z-index: 10000;

        transform: translateX(-100%);

        transition: transform .3s ease;

        overflow-y: auto;

        box-shadow: 10px 0 30px rgba(0,0,0,.20);
      }

      .sidebar.mobile-open {
        transform: translateX(0);
      }

      #mobileMenuOverlay.mobile-open {
        display: block;
      }

      .main {
        width: 100% !important;
        min-width: 0 !important;

        margin-left: 0 !important;

        padding-top: 75px !important;
      }

      .topbar {
        padding-top: 10px;
      }

      /* ======================================
         AJUSTE DO CONTEÚDO
      ====================================== */

      .cards {
        grid-template-columns: 1fr !important;
      }

      .grid-2 {
        grid-template-columns: 1fr !important;
      }

      .fixed-layout {
        grid-template-columns: 1fr !important;
      }

      /* ======================================
         TABELAS
      ====================================== */

      .table-wrap {
        overflow-x: auto;
        width: 100%;
      }

      table {
        min-width: 700px;
      }

      /* ======================================
         FORMULÁRIOS
      ====================================== */

      input,
      select,
      textarea,
      button {
        max-width: 100%;
      }

      /* ======================================
         BOTÕES DAS CAIXINHAS
      ====================================== */

      .fixed-item {
        flex-direction: column;
        align-items: stretch !important;
      }

      .fixed-item > div:last-child {
        width: 100%;
      }

      .fixed-item button {
        width: 100%;
        margin-top: 6px;
      }

      /* ======================================
         TÍTULOS
      ====================================== */

      .section-title {
        flex-direction: column;
        align-items: stretch !important;
      }

      .filters {
        width: 100%;
        flex-direction: column;
      }

      .filters label,
      .filters input,
      .filters select,
      .filters button {
        width: 100%;
      }

      /* ======================================
         MODAIS
      ====================================== */

      #modalDashboardCaixinha {
        padding: 10px !important;
      }

      #modalDashboardCaixinha > div {
        padding: 18px !important;
        border-radius: 18px !important;
      }

    }

  `;

  document.head.appendChild(estilo);

  // ==========================================
  // ABRIR MENU
  // ==========================================

  function abrirMenu() {
    sidebar.classList.add("mobile-open");
    overlay.classList.add("mobile-open");

    botaoMenu.innerHTML = "✕";
    botaoMenu.setAttribute("aria-label", "Fechar menu");

    botaoMenu.classList.add("menu-aberto");

    document.body.style.overflow = "hidden";
  }

  // ==========================================
  // FECHAR MENU
  // ==========================================

  function fecharMenu() {
    sidebar.classList.remove("mobile-open");
    overlay.classList.remove("mobile-open");

    botaoMenu.innerHTML = "☰";
    botaoMenu.setAttribute("aria-label", "Abrir menu");

    botaoMenu.classList.remove("menu-aberto");

    document.body.style.overflow = "";
  }

  // ==========================================
  // ABRIR / FECHAR
  // ==========================================

  botaoMenu.addEventListener("click", () => {
    const aberto = sidebar.classList.contains("mobile-open");

    if (aberto) {
      fecharMenu();
    } else {
      abrirMenu();
    }
  });

  // ==========================================
  // CLICAR NO FUNDO
  // ==========================================

  overlay.addEventListener("click", () => {
    fecharMenu();
  });

  // ==========================================
  // CLICAR EM UMA OPÇÃO DO MENU
  // ==========================================

  sidebar.querySelectorAll(".nav-item").forEach((botao) => {
    botao.addEventListener("click", () => {
      fecharMenu();
    });
  });

  // ==========================================
  // ESC FECHA O MENU
  // ==========================================

  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") {
      fecharMenu();
    }
  });

  // ==========================================
  // SE VOLTAR PARA DESKTOP
  // ==========================================

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      fecharMenu();
    }
  });
}

// ==========================================
// INICIAR MENU RESPONSIVO
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  configurarMenuResponsivo();
});
