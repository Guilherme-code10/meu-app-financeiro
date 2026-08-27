const state = {
  contas: [],
  cartoes: [],
  investimentos: [],
  transacoes: [],
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
    localStorage.setItem(
      "meuFinanceiroToken",
      token
    );
  } else {
    localStorage.removeItem(
      "meuFinanceiroToken"
    );
  }
}

function carregarTokenSalvo() {
  tokenSessao =
    localStorage.getItem(
      "meuFinanceiroToken"
    );
}

function mostrarLogin() {
  const login =
    document.querySelector(
      "#loginScreen"
    );

  const app =
    document.querySelector(
      "#appShell"
    );

  if (login) {
    login.style.display = "flex";
  }

  if (app) {
    app.style.display = "none";
  }
}

function mostrarAplicacao() {
  const login =
    document.querySelector(
      "#loginScreen"
    );

  const app =
    document.querySelector(
      "#appShell"
    );

  if (login) {
    login.style.display = "none";
  }

  if (app) {
    app.style.display = "flex";
  }
}

function mostrarErroLogin(mensagem) {
  const elemento =
    document.querySelector(
      "#loginError"
    );

  if (!elemento) {
    return;
  }

  elemento.textContent =
    mensagem;

  elemento.style.display =
    "block";
}

function limparErroLogin() {
  const elemento =
    document.querySelector(
      "#loginError"
    );

  if (!elemento) {
    return;
  }

  elemento.textContent = "";

  elemento.style.display =
    "none";
}

function atualizarUsuarioLogado(usuario) {
  const nome =
    document.querySelector(
      "#loggedUserName"
    );

  const email =
    document.querySelector(
      "#loggedUserEmail"
    );

  if (nome) {
    nome.textContent =
      usuario?.nome ||
      usuario?.email ||
      "Usuário";
  }

  if (email) {
    email.textContent =
      usuario?.email ||
      "";
  }
}

// ==========================================
// LOGIN
// ==========================================

async function realizarLogin(
  email,
  senha
) {
  const resposta =
    await fetch(
      "/api/auth/login",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          email,
          senha,
        }),
      }
    );

  let dados;

  try {
    dados =
      await resposta.json();
  } catch {
    throw new Error(
      "O servidor retornou uma resposta inválida."
    );
  }

  if (
    !resposta.ok ||
    dados.sucesso === false
  ) {
    throw new Error(
      dados.erro ||
        "E-mail ou senha inválidos."
    );
  }

  if (!dados.token) {
    throw new Error(
      "O servidor não retornou o token da sessão."
    );
  }

  salvarToken(
    dados.token
  );

  atualizarUsuarioLogado(
    dados.usuario
  );

  return dados;
}

// ==========================================
// VERIFICAR SESSÃO
// ==========================================

async function verificarSessao() {
  const token =
    obterToken();

  if (!token) {
    return false;
  }

  try {
    const resposta =
      await fetch(
        "/api/auth/me",
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

    if (!resposta.ok) {
      salvarToken(null);

      return false;
    }

    const dados =
      await resposta.json();

    if (
      !dados.sucesso ||
      !dados.autenticado ||
      !dados.usuario
    ) {
      salvarToken(null);

      return false;
    }

    atualizarUsuarioLogado(
      dados.usuario
    );

    return true;

  } catch (erro) {
    console.error(
      "Erro ao verificar sessão:",
      erro
    );

    return false;
  }
}

// ==========================================
// LOGOUT
// ==========================================

async function realizarLogout() {
  try {
    const token =
      obterToken();

    if (token) {
      await fetch(
        "/api/auth/logout",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );
    }

  } catch (erro) {
    console.error(
      "Erro ao fazer logout:",
      erro
    );

  } finally {
    salvarToken(null);

    mostrarLogin();

    const email =
      document.querySelector(
        "#loginEmail"
      );

    const senha =
      document.querySelector(
        "#loginSenha"
      );

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
  const formulario =
    document.querySelector(
      "#loginForm"
    );

  const botao =
    document.querySelector(
      "#loginButton"
    );

  if (!formulario) {
    return;
  }

  formulario.addEventListener(
    "submit",
    async (evento) => {
      evento.preventDefault();

      limparErroLogin();

      const email =
        document.querySelector(
          "#loginEmail"
        )?.value
          .trim()
          .toLowerCase();

      const senha =
        document.querySelector(
          "#loginSenha"
        )?.value;

      if (!email || !senha) {
        mostrarErroLogin(
          "E-mail e senha são obrigatórios."
        );

        return;
      }

      try {
        if (botao) {
          botao.disabled = true;

          botao.textContent =
            "Entrando...";
        }

        await realizarLogin(
          email,
          senha
        );

        mostrarAplicacao();

        await iniciarAplicacao();

      } catch (erro) {
        console.error(
          "Erro ao realizar login:",
          erro
        );

        mostrarErroLogin(
          erro.message ||
            "E-mail ou senha inválidos."
        );

      } finally {
        if (botao) {
          botao.disabled = false;

          botao.textContent =
            "Entrar";
        }
      }
    }
  );
}

// ==========================================
// BOTÃO SAIR
// ==========================================

function configurarLogout() {
  const botao =
    document.querySelector(
      "#logoutBtn"
    );

  if (!botao) {
    return;
  }

  botao.addEventListener(
    "click",
    async () => {
      const confirmou =
        confirm(
          "Deseja realmente sair do Meu Financeiro?"
        );

      if (!confirmou) {
        return;
      }

      botao.disabled = true;

      botao.textContent =
        "Saindo...";

      await realizarLogout();

      botao.disabled = false;

      botao.textContent =
        "Sair";
    }
  );
}

// ==========================================
// FORMATAÇÃO
// ==========================================

function dinheiro(valor) {
  return new Intl.NumberFormat(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    }
  ).format(
    Number(valor || 0)
  );
}

function escapar(valor) {
  return String(valor ?? "")
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

function dataBR(data) {
  if (!data) {
    return "—";
  }

  const parte =
    String(data).substring(
      0,
      10
    );

  const [
    ano,
    mes,
    dia,
  ] =
    parte.split("-");

  if (
    !ano ||
    !mes ||
    !dia
  ) {
    return data;
  }

  return `${dia}/${mes}/${ano}`;
}

// ==========================================
// CLASSIFICAÇÃO DAS TRANSAÇÕES
// ==========================================

function analisarTransacao(
  transacao
) {
  const valorOriginal =
    Number(
      transacao.valor || 0
    );

  const tipoConta =
    String(
      transacao.tipoConta ||
        ""
    ).toUpperCase();

  const tipo =
    String(
      transacao.tipo ||
        ""
    ).toUpperCase();

  const ehCartao =
    tipoConta === "CREDIT";

  const ehDebito =
    tipo === "DEBIT" ||
    tipo === "DÉBITO";

  const ehCredito =
    tipo === "CREDIT" ||
    tipo === "CRÉDITO";

  // ------------------------------------------
  // CARTÃO
  // ------------------------------------------

  if (ehCartao) {
    if (ehDebito) {
      return {
        tipoVisual:
          "COMPRA NO CARTÃO",

        classe:
          "expense",

        sinal:
          "-",

        valor:
          Math.abs(
            valorOriginal
          ),

        ehEntrada:
          false,

        ehSaida:
          true,

        ehCartao:
          true,
      };
    }

    if (ehCredito) {
      return {
        tipoVisual:
          "CRÉDITO NO CARTÃO",

        classe:
          "income",

        sinal:
          "+",

        valor:
          Math.abs(
            valorOriginal
          ),

        ehEntrada:
          false,

        ehSaida:
          false,

        ehCartao:
          true,
      };
    }
  }

  // ------------------------------------------
  // CONTA BANCÁRIA
  // ------------------------------------------

  if (ehDebito) {
    return {
      tipoVisual:
        "SAÍDA",

      classe:
        "expense",

      sinal:
        "-",

      valor:
        Math.abs(
          valorOriginal
        ),

      ehEntrada:
        false,

      ehSaida:
        true,

      ehCartao:
        false,
    };
  }

  if (ehCredito) {
    return {
      tipoVisual:
        "ENTRADA",

      classe:
        "income",

      sinal:
        "+",

      valor:
        Math.abs(
          valorOriginal
        ),

      ehEntrada:
        true,

      ehSaida:
        false,

      ehCartao:
        false,
    };
  }

  // ------------------------------------------
  // FALLBACK
  // ------------------------------------------

  if (
    valorOriginal < 0
  ) {
    return {
      tipoVisual:
        "SAÍDA",

      classe:
        "expense",

      sinal:
        "-",

      valor:
        Math.abs(
          valorOriginal
        ),

      ehEntrada:
        false,

      ehSaida:
        true,

      ehCartao:
        false,
    };
  }

  return {
    tipoVisual:
      "ENTRADA",

    classe:
      "income",

    sinal:
      "+",

    valor:
      Math.abs(
        valorOriginal
      ),

    ehEntrada:
      true,

    ehSaida:
      false,

    ehCartao:
      false,
  };
}

// ==========================================
// REQUISIÇÃO AO BACKEND
// ==========================================

async function buscarDados(
  url,
  opcoes = {}
) {
  const token =
    obterToken();

  const headers = {
    ...(opcoes.headers || {}),
  };

  if (token) {
    headers.Authorization =
      `Bearer ${token}`;
  }

  const resposta =
    await fetch(
      url,
      {
        ...opcoes,
        headers,
      }
    );

  let dados;

  try {
    dados =
      await resposta.json();
  } catch {
    throw new Error(
      "O servidor retornou uma resposta inválida."
    );
  }

  // ------------------------------------------
  // SESSÃO EXPIRADA
  // ------------------------------------------

  if (
    resposta.status === 401
  ) {
    salvarToken(null);

    mostrarLogin();

    throw new Error(
      "Sua sessão expirou. Faça login novamente."
    );
  }

  if (
    !resposta.ok ||
    dados.sucesso === false
  ) {
    throw new Error(
      dados.erro ||
        dados.message ||
        "Erro ao buscar dados."
    );
  }

  return dados;
}

// ==========================================
// CONTAS
// ==========================================

function mostrarContas() {
  const container =
    document.querySelector(
      "#accountsGrid"
    );

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

  container.innerHTML =
    state.contas
      .map(
        (conta) => `
          <article class="panel account-card">

            <div class="account-top">

              <div>

                <div class="account-name">
                  ${escapar(
                    conta.nome
                  )}
                </div>

                <div class="account-bank">
                  ${escapar(
                    conta.banco
                  )}
                </div>

              </div>

              <span class="badge">
                ${escapar(
                  conta.subtipo
                )}
              </span>

            </div>

            <div class="account-balance">
              ${dinheiro(
                conta.saldo
              )}
            </div>

            <div class="account-bank">
              ${escapar(
                conta.moeda
              )}
            </div>

          </article>
        `
      )
      .join("");
}

// ==========================================
// TRANSAÇÕES RECENTES
// ==========================================

function mostrarTransacao(
  transacao
) {
  const analise =
    analisarTransacao(
      transacao
    );

  const identificacaoCartao =
    analise.ehCartao
      ? "💳 Compra no cartão"
      : "🏦 Conta bancária";

  return `
    <div class="transaction">

      <div>

        <div class="desc">
          ${escapar(
            transacao.descricao
          )}
        </div>

        <div class="meta">
          ${dataBR(
            transacao.data
          )}
          ·
          ${escapar(
            transacao.categoria
          )}
          ·
          ${escapar(
            transacao.conta
          )}
        </div>

        <div class="meta">
          ${identificacaoCartao}
          ·
          ${analise.tipoVisual}
        </div>

      </div>

      <div class="amount ${analise.classe}">
        ${analise.sinal}
        ${dinheiro(
          analise.valor
        )}
      </div>

    </div>
  `;
}

function mostrarRecentes() {
  const container =
    document.querySelector(
      "#recentTransactions"
    );

  if (!container) {
    return;
  }

  const recentes =
    [...state.transacoes]
      .sort(
        (a, b) =>
          String(
            b.data
          ).localeCompare(
            String(a.data)
          )
      )
      .slice(0, 7);

  if (!recentes.length) {
    container.innerHTML = `
      <div class="empty">
        Nenhuma movimentação encontrada.
      </div>
    `;

    return;
  }

  container.innerHTML =
    recentes
      .map(
        mostrarTransacao
      )
      .join("");
}

// ==========================================
// DASHBOARD
// ==========================================

function atualizarDashboard() {
  const saldoContas =
    state.contas.reduce(
      (
        total,
        conta
      ) =>
        total +
        Number(
          conta.saldo || 0
        ),
      0
    );

  const entradas =
    state.transacoes
      .filter(
        (transacao) => {
          const analise =
            analisarTransacao(
              transacao
            );

          return analise.ehEntrada;
        }
      )
      .reduce(
        (
          total,
          transacao
        ) => {
          const analise =
            analisarTransacao(
              transacao
            );

          return (
            total +
            analise.valor
          );
        },
        0
      );

  const saidas =
    state.transacoes
      .filter(
        (transacao) => {
          const analise =
            analisarTransacao(
              transacao
            );

          return analise.ehSaida;
        }
      )
      .reduce(
        (
          total,
          transacao
        ) => {
          const analise =
            analisarTransacao(
              transacao
            );

          return (
            total +
            analise.valor
          );
        },
        0
      );

  const elementoSaldo =
    document.querySelector(
      "#totalBalance"
    );

  const elementoEntradas =
    document.querySelector(
      "#totalIncome"
    );

  const elementoSaidas =
    document.querySelector(
      "#totalExpense"
    );

  if (elementoSaldo) {
    elementoSaldo.textContent =
      dinheiro(
        saldoContas
      );
  }

  if (elementoEntradas) {
    elementoEntradas.textContent =
      dinheiro(
        entradas
      );
  }

  if (elementoSaidas) {
    elementoSaidas.textContent =
      dinheiro(
        saidas
      );
  }

  mostrarRecentes();

  mostrarCategorias();
}

// ==========================================
// CATEGORIAS
// ==========================================

function mostrarCategorias() {
  const container =
    document.querySelector(
      "#categoryChart"
    );

  if (!container) {
    return;
  }

  const categorias = {};

  state.transacoes.forEach(
    (transacao) => {
      const analise =
        analisarTransacao(
          transacao
        );

      if (!analise.ehSaida) {
        return;
      }

      const categoria =
        transacao.categoria ||
        "Sem categoria";

      categorias[
        categoria
      ] =
        (
          categorias[
            categoria
          ] || 0
        ) +
        analise.valor;
    }
  );

  const lista =
    Object.entries(
      categorias
    )
      .sort(
        (a, b) =>
          b[1] - a[1]
      )
      .slice(0, 7);

  if (!lista.length) {
    container.innerHTML = `
      <div class="empty">
        Nenhuma saída encontrada.
      </div>
    `;

    return;
  }

  const maior =
    lista[0][1] || 1;

  container.innerHTML =
    lista
      .map(
        (
          [
            categoria,
            valor,
          ]
        ) => {
          const porcentagem =
            Math.max(
              5,
              (valor /
                maior) *
                100
            );

          return `
            <div class="bar-row">

              <div class="bar-label">

                <span>
                  ${escapar(
                    categoria
                  )}
                </span>

                <strong>
                  ${dinheiro(
                    valor
                  )}
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
        }
      )
      .join("");
}

// ==========================================
// TABELA DE TRANSAÇÕES
// ==========================================

function mostrarTabela() {
  const container =
    document.querySelector(
      "#transactionTable"
    );

  if (!container) {
    return;
  }

  const transacoes =
    [...state.transacoes]
      .sort(
        (a, b) =>
          String(
            b.data
          ).localeCompare(
            String(a.data)
          )
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
          .map(
            (
              transacao
            ) => {
              const analise =
                analisarTransacao(
                  transacao
                );

              return `
                <tr>

                  <td>
                    ${dataBR(
                      transacao.data
                    )}
                  </td>

                  <td>
                    ${escapar(
                      transacao.descricao
                    )}
                  </td>

                  <td>
                    ${escapar(
                      transacao.categoria
                    )}
                  </td>

                  <td>
                    ${escapar(
                      transacao.conta
                    )}
                  </td>

                  <td>
                    ${
                      analise.ehCartao
                        ? "💳 "
                        : "🏦 "
                    }

                    ${
                      analise.tipoVisual
                    }
                  </td>

                  <td
                    class="${analise.classe}"
                  >
                    ${analise.sinal}
                    ${dinheiro(
                      analise.valor
                    )}
                  </td>

                </tr>
              `;
            }
          )
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
    return JSON.parse(
      localStorage.getItem(
        "fixedAccounts"
      ) || "[]"
    );

  } catch {
    return [];
  }
}

function salvarContasFixas(
  contas
) {
  localStorage.setItem(
    "fixedAccounts",
    JSON.stringify(
      contas
    )
  );
}

function mostrarContasFixas() {
  const contas =
    pegarContasFixas();

  const total =
    contas.reduce(
      (
        soma,
        conta
      ) =>
        soma +
        Number(
          conta.amount || 0
        ),
      0
    );

  const elementoTotal =
    document.querySelector(
      "#fixedTotal"
    );

  const elementoQuantidade =
    document.querySelector(
      "#fixedCount"
    );

  if (elementoTotal) {
    elementoTotal.textContent =
      dinheiro(
        total
      );
  }

  if (elementoQuantidade) {
    elementoQuantidade.textContent =
      `${contas.length} cadastrada${
        contas.length ===
        1
          ? ""
          : "s"
      }`;
  }

  const lista =
    document.querySelector(
      "#fixedList"
    );

  if (!lista) {
    return;
  }

  if (!contas.length) {
    lista.innerHTML = `
      <div class="empty">
        Nenhuma conta fixa cadastrada.
      </div>
    `;

    return;
  }

  lista.innerHTML =
    contas
      .map(
        (conta) => `
          <div class="fixed-item">

            <div>

              <strong>
                ${escapar(
                  conta.name
                )}
              </strong>

              <small>
                Dia ${conta.day}
                ·
                ${escapar(
                  conta.category
                )}
              </small>

            </div>

            <div>

              <strong>
                ${dinheiro(
                  conta.amount
                )}
              </strong>

              <button
                class="delete-btn"
                data-delete-fixed="${conta.id}"
              >
                Excluir
              </button>

            </div>

          </div>
        `
      )
      .join("");

  lista
    .querySelectorAll(
      "[data-delete-fixed]"
    )
    .forEach(
      (botao) => {
        botao.addEventListener(
          "click",
          () => {
            const id =
              botao.dataset
                .deleteFixed;

            const novasContas =
              pegarContasFixas()
                .filter(
                  (
                    conta
                  ) =>
                    conta.id !==
                    id
                );

            salvarContasFixas(
              novasContas
            );

            mostrarContasFixas();
          }
        );
      }
    );
}

// ==========================================
// CAIXINHAS
// ==========================================

async function carregarCaixinhas() {
  try {
    const dados =
      await buscarDados(
        "/api/caixinhas"
      );

    state.caixinhas =
      dados.caixinhas ||
      [];

    mostrarCaixinhas();

  } catch (erro) {
    console.error(
      "Erro ao carregar caixinhas:",
      erro
    );
  }
}

// ==========================================
// MOSTRAR CAIXINHAS
// ==========================================

function mostrarCaixinhas() {
  const lista =
    document.querySelector(
      "#caixinhasList"
    );

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

  lista.innerHTML =
    state.caixinhas
      .map(
        (caixinha) => {
          const meta =
            Number(
              caixinha.meta ||
                0
            );

          const saldo =
            Number(
              caixinha.saldo ||
                0
            );

          const progresso =
            meta > 0
              ? Math.min(
                  (saldo /
                    meta) *
                    100,
                  100
                )
              : 0;

          return `
            <div class="fixed-item">

              <div>

                <strong>
                  ${escapar(
                    caixinha.nome
                  )}
                </strong>

                <small>
                  ${escapar(
                    caixinha.descricao ||
                      ""
                  )}
                </small>

              </div>

              <div>

                <strong>
                  ${dinheiro(
                    saldo
                  )}
                </strong>

                <small>
                  Meta:
                  ${dinheiro(
                    meta
                  )}
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
                ${progresso.toFixed(
                  1
                )}%
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
        }
      )
      .join("");

  // ------------------------------------------
  // BOTÃO RENDIMENTO
  // ------------------------------------------

  lista
    .querySelectorAll(
      "[data-rendimento-caixinha]"
    )
    .forEach(
      (botao) => {
        botao.addEventListener(
          "click",
          () => {
            adicionarRendimento(
              botao.dataset
                .rendimentoCaixinha
            );
          }
        );
      }
    );

  // ------------------------------------------
  // BOTÃO EDITAR
  // ------------------------------------------

  lista
    .querySelectorAll(
      "[data-editar-caixinha]"
    )
    .forEach(
      (botao) => {
        botao.addEventListener(
          "click",
          () => {
            editarCaixinha(
              botao.dataset
                .editarCaixinha
            );
          }
        );
      }
    );

  // ------------------------------------------
  // BOTÃO EXCLUIR
  // ------------------------------------------

  lista
    .querySelectorAll(
      "[data-excluir-caixinha]"
    )
    .forEach(
      (botao) => {
        botao.addEventListener(
          "click",
          () => {
            excluirCaixinha(
              botao.dataset
                .excluirCaixinha
            );
          }
        );
      }
    );
}

// ==========================================
// ADICIONAR RENDIMENTO
// ==========================================

async function adicionarRendimento(
  id
) {
  const caixinha =
    state.caixinhas.find(
      (item) =>
        String(
          item.id
        ) ===
        String(id)
    );

  if (!caixinha) {
    alert(
      "Caixinha não encontrada."
    );

    return;
  }

  const valorInformado =
    prompt(
      `Adicionar rendimento para "${caixinha.nome}"\n\n` +
        `Saldo atual: ${dinheiro(
          caixinha.saldo
        )}\n\n` +
        "Digite o valor do rendimento:"
    );

  if (
    valorInformado ===
    null
  ) {
    return;
  }

  const valor =
    Number(
      String(
        valorInformado
      ).replace(
        ",",
        "."
      )
    );

  if (
    !Number.isFinite(
      valor
    ) ||
    valor <= 0
  ) {
    alert(
      "Digite um valor de rendimento válido."
    );

    return;
  }

  const descricaoInformada =
    prompt(
      "Descrição do rendimento:",
      "Rendimento"
    );

  if (
    descricaoInformada ===
    null
  ) {
    return;
  }

  try {
    const dados =
      await buscarDados(
        `/api/caixinhas/${id}/rendimento`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            valor,

            descricao:
              descricaoInformada.trim() ||
              "Rendimento",
          }),
        }
      );

    alert(
      `Rendimento adicionado com sucesso!\n\n` +
        `Novo saldo: ${dinheiro(
          dados.caixinha.saldo
        )}`
    );

    await carregarCaixinhas();

  } catch (erro) {
    console.error(
      "Erro ao adicionar rendimento:",
      erro
    );

    alert(
      "Erro ao adicionar rendimento: " +
        erro.message
    );
  }
}

// ==========================================
// EDITAR CAIXINHA
// ==========================================

async function editarCaixinha(
  id
) {
  const caixinha =
    state.caixinhas.find(
      (item) =>
        String(
          item.id
        ) ===
        String(id)
    );

  if (!caixinha) {
    alert(
      "Caixinha não encontrada."
    );

    return;
  }

  const novoNome =
    prompt(
      "Nome da caixinha:",
      caixinha.nome ||
        ""
    );

  if (
    novoNome ===
    null
  ) {
    return;
  }

  const nome =
    novoNome.trim();

  if (!nome) {
    alert(
      "O nome da caixinha não pode ficar vazio."
    );

    return;
  }

  const novaMeta =
    prompt(
      "Meta da caixinha:",
      Number(
        caixinha.meta ||
          0
      )
    );

  if (
    novaMeta ===
    null
  ) {
    return;
  }

  const meta =
    Number(
      novaMeta
    );

  if (
    !Number.isFinite(
      meta
    ) ||
    meta <= 0
  ) {
    alert(
      "Digite uma meta válida maior que zero."
    );

    return;
  }

  const novaDescricao =
    prompt(
      "Descrição da caixinha:",
      caixinha.descricao ||
        ""
    );

  if (
    novaDescricao ===
    null
  ) {
    return;
  }

  try {
    await buscarDados(
      `/api/caixinhas/${id}`,
      {
        method: "PUT",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          nome,

          meta,

          descricao:
            novaDescricao.trim(),
        }),
      }
    );

    alert(
      "Caixinha atualizada com sucesso!"
    );

    await carregarCaixinhas();

  } catch (erro) {
    console.error(
      "Erro ao editar caixinha:",
      erro
    );

    alert(
      "Erro ao editar caixinha: " +
        erro.message
    );
  }
}

// ==========================================
// EXCLUIR CAIXINHA
// ==========================================

async function excluirCaixinha(
  id
) {
  const caixinha =
    state.caixinhas.find(
      (item) =>
        String(
          item.id
        ) ===
        String(id)
    );

  if (!caixinha) {
    alert(
      "Caixinha não encontrada."
    );

    return;
  }

  const confirmou =
    confirm(
      `Tem certeza que deseja excluir a caixinha "${caixinha.nome}"?\n\n` +
        "As movimentações relacionadas a ela também serão excluídas."
    );

  if (!confirmou) {
    return;
  }

  try {
    await buscarDados(
      `/api/caixinhas/${id}`,
      {
        method: "DELETE",
      }
    );

    alert(
      "Caixinha excluída com sucesso!"
    );

    await carregarCaixinhas();

  } catch (erro) {
    console.error(
      "Erro ao excluir caixinha:",
      erro
    );

    alert(
      "Erro ao excluir caixinha: " +
        erro.message
    );
  }
}

// ==========================================
// CRIAR CAIXINHA
// ==========================================

function configurarFormularioCaixinha() {
  const formularioCaixinha =
    document.querySelector(
      "#caixinhaForm"
    );

  if (!formularioCaixinha) {
    return;
  }

  formularioCaixinha.addEventListener(
    "submit",
    async (evento) => {
      evento.preventDefault();

      const nome =
        document.querySelector(
          "#caixinhaNome"
        ).value.trim();

      const meta =
        Number(
          document.querySelector(
            "#caixinhaMeta"
          ).value
        );

      const descricao =
        document.querySelector(
          "#caixinhaDescricao"
        ).value.trim();

      if (!nome) {
        alert(
          "Digite o nome da caixinha."
        );

        return;
      }

      if (
        !Number.isFinite(
          meta
        ) ||
        meta <= 0
      ) {
        alert(
          "Digite uma meta válida."
        );

        return;
      }

      try {
        await buscarDados(
          "/api/caixinhas",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              nome,

              meta,

              saldo: 0,

              descricao,
            }),
          }
        );

        alert(
          "Caixinha criada com sucesso!"
        );

        formularioCaixinha.reset();

        await carregarCaixinhas();

      } catch (erro) {
        console.error(
          "Erro ao criar caixinha:",
          erro
        );

        alert(
          "Erro ao criar caixinha: " +
            erro.message
        );
      }
    }
  );
}

// ==========================================
// CARREGAR DADOS
// ==========================================

async function carregarDados() {
  try {
    const connectionText =
      document.querySelector(
        "#connectionText"
      );

    if (connectionText) {
      connectionText.textContent =
        "Sincronizando...";
    }

    const inicio =
      document.querySelector(
        "#startDate"
      )?.value;

    const fim =
      document.querySelector(
        "#endDate"
      )?.value;

    const parametros =
      new URLSearchParams();

    if (inicio) {
      parametros.set(
        "startDate",
        inicio
      );
    }

    if (fim) {
      parametros.set(
        "endDate",
        fim
      );
    }

    const [
      dadosContas,
      dadosTransacoes,
    ] =
      await Promise.all([
        buscarDados(
          "/api/accounts"
        ),

        buscarDados(
          `/api/transactions?${parametros.toString()}`
        ),
      ]);

    state.contas =
      dadosContas.contas ||
      [];

    state.cartoes =
      dadosContas.cartoes ||
      [];

    state.investimentos =
      dadosContas.investimentos ||
      [];

    state.transacoes =
      dadosTransacoes.transacoes ||
      [];

    mostrarContas();

    atualizarDashboard();

    mostrarTabela();

    mostrarContasFixas();

    await carregarCaixinhas();

    if (connectionText) {
      connectionText.textContent =
        `${state.contas.length} contas · ` +
        `${state.cartoes.length} cartões`;
    }

  } catch (erro) {
    console.error(
      "Erro ao carregar dados:",
      erro
    );

    const connectionText =
      document.querySelector(
        "#connectionText"
      );

    if (connectionText) {
      connectionText.textContent =
        "Erro na conexão";
    }

    if (
      erro.message !==
      "Sua sessão expirou. Faça login novamente."
    ) {
      alert(
        "Erro ao carregar os dados: " +
          erro.message
      );
    }
  }
}

// ==========================================
// NAVEGAÇÃO
// ==========================================

function navegar(
  secao
) {
  document
    .querySelectorAll(
      ".section"
    )
    .forEach(
      (elemento) => {
        elemento.classList.toggle(
          "active",
          elemento.id ===
            secao
        );
      }
    );

  document
    .querySelectorAll(
      ".nav-item"
    )
    .forEach(
      (botao) => {
        botao.classList.toggle(
          "active",
          botao.dataset
            .section ===
            secao
        );
      }
    );

  const titulos = {
    dashboard:
      "Dashboard",

    contas:
      "Contas",

    transacoes:
      "Transações",

    fixas:
      "Contas fixas",

    caixinhas:
      "Caixinhas",
  };

  const titulo =
    document.querySelector(
      "#pageTitle"
    );

  if (titulo) {
    titulo.textContent =
      titulos[secao] ||
      "Dashboard";
  }
}

// ==========================================
// EVENTOS DO MENU
// ==========================================

function configurarNavegacao() {
  document
    .querySelectorAll(
      ".nav-item"
    )
    .forEach(
      (botao) => {
        botao.addEventListener(
          "click",
          () => {
            navegar(
              botao.dataset
                .section
            );
          }
        );
      }
    );

  document
    .querySelectorAll(
      "[data-go]"
    )
    .forEach(
      (botao) => {
        botao.addEventListener(
          "click",
          () => {
            navegar(
              botao.dataset
                .go
            );
          }
        );
      }
    );
}

// ==========================================
// SINCRONIZAR CAIXINHAS COM O PIERRE
// ==========================================

async function sincronizarCaixinhas() {
  try {
    return await buscarDados(
      "/api/caixinhas/sincronizar",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );

  } catch (erro) {
    console.error(
      "Erro ao sincronizar caixinhas:",
      erro
    );

    throw erro;
  }
}

// ==========================================
// BOTÃO ATUALIZAR
// ==========================================

function configurarBotaoAtualizar() {
  const botaoAtualizar =
    document.querySelector(
      "#refreshBtn"
    );

  if (!botaoAtualizar) {
    return;
  }

  botaoAtualizar.addEventListener(
    "click",
    async () => {
      try {
        botaoAtualizar.disabled =
          true;

        botaoAtualizar.textContent =
          "↻ Sincronizando...";

        const resultado =
          await sincronizarCaixinhas();

        await carregarDados();

        const quantidade =
          resultado
            ?.sincronizadas
            ?.length ||
          0;

        if (
          quantidade > 0
        ) {
          alert(
            `Sincronização concluída!\n\n` +
              `${quantidade} nova${
                quantidade ===
                1
                  ? ""
                  : "s"
              } movimentação${
                quantidade ===
                1
                  ? ""
                  : "ões"
              } sincronizada${
                quantidade ===
                1
                  ? ""
                  : "s"
              }.`
          );

        } else {
          alert(
            "Sincronização concluída!\n\n" +
              "Nenhuma nova movimentação encontrada."
          );
        }

      } catch (erro) {
        console.error(
          "Erro ao atualizar:",
          erro
        );

        if (
          erro.message !==
          "Sua sessão expirou. Faça login novamente."
        ) {
          alert(
            "Erro ao sincronizar:\n\n" +
              erro.message
          );
        }

      } finally {
        botaoAtualizar.disabled =
          false;

        botaoAtualizar.textContent =
          "↻ Atualizar";
      }
    }
  );
}

// ==========================================
// FILTRO DE TRANSAÇÕES
// ==========================================

function configurarFiltro() {
  const botaoFiltro =
    document.querySelector(
      "#filterBtn"
    );

  if (!botaoFiltro) {
    return;
  }

  botaoFiltro.addEventListener(
    "click",
    () => {
      carregarDados();
    }
  );
}

// ==========================================
// CONTAS FIXAS
// ==========================================

function configurarFormularioContaFixa() {
  const formulario =
    document.querySelector(
      "#fixedForm"
    );

  if (!formulario) {
    return;
  }

  formulario.addEventListener(
    "submit",
    (evento) => {
      evento.preventDefault();

      const conta = {
        id:
          crypto.randomUUID(),

        name:
          document.querySelector(
            "#fixedName"
          ).value.trim(),

        amount:
          Number(
            document.querySelector(
              "#fixedAmount"
            ).value
          ),

        day:
          Number(
            document.querySelector(
              "#fixedDay"
            ).value
          ),

        category:
          document.querySelector(
            "#fixedCategory"
          ).value,
      };

      const contas =
        pegarContasFixas();

      contas.push(
        conta
      );

      salvarContasFixas(
        contas
      );

      formulario.reset();

      mostrarContasFixas();
    }
  );
}

// ==========================================
// DATAS PADRÃO
// ==========================================

function configurarDatas() {
  const fim =
    new Date();

  const inicio =
    new Date(fim);

  inicio.setMonth(
    inicio.getMonth() -
      3
  );

  const formatar =
    (data) =>
      data
        .toISOString()
        .slice(
          0,
          10
        );

  const campoInicio =
    document.querySelector(
      "#startDate"
    );

  const campoFim =
    document.querySelector(
      "#endDate"
    );

  if (campoInicio) {
    campoInicio.value =
      formatar(
        inicio
      );
  }

  if (campoFim) {
    campoFim.value =
      formatar(
        fim
      );
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
  const autenticado =
    await verificarSessao();

  if (!autenticado) {
    mostrarLogin();

    const email =
      document.querySelector(
        "#loginEmail"
      );

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

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    configurarLogin();

    configurarLogout();

    await iniciarSistema();
  }
);