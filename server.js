require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY
);

const app = express();
const PORT = process.env.PORT || 3000;

const PIERRE_API_URL =
  "https://www.pierre.finance/tools/api";

app.use(express.json());

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

// ==========================================
// AUTENTICAÇÃO
// ==========================================

const sessoes = new Map();

const TEMPO_SESSAO =
  1000 * 60 * 60 * 24 * 7;

function gerarTokenSessao() {
  return crypto.randomBytes(32).toString("hex");
}

function obterTokenDaRequisicao(req) {
  const autorizacao =
    req.headers.authorization || "";

  if (
    autorizacao.startsWith("Bearer ")
  ) {
    return autorizacao
      .slice(7)
      .trim();
  }

  return null;
}

// ==========================================
// VERIFICAR USUÁRIO ADMIN
// ==========================================

async function verificarUsuarioAdmin(token) {
  if (!token) {
    return {
      autorizado: false,
      erro:
        "Usuário não autenticado.",
    };
  }

  const sessao =
    sessoes.get(token);

  if (!sessao) {
    return {
      autorizado: false,
      erro:
        "Sessão inválida ou expirada.",
    };
  }

  if (
    Date.now() >
    sessao.expiraEm
  ) {
    sessoes.delete(token);

    return {
      autorizado: false,
      erro:
        "Sessão expirada.",
    };
  }

  try {
    const {
      data: {
        user,
      },
      error:
        erroUsuario,
    } =
      await supabase.auth.getUser(
        sessao.accessToken
      );

    if (
      erroUsuario ||
      !user
    ) {
      sessoes.delete(token);

      return {
        autorizado: false,
        erro:
          "Usuário não autenticado.",
      };
    }

    const {
      data: perfil,
      error:
        erroPerfil,
    } =
      await supabase
        .from("perfis")
        .select(
          "id, nome, tipo, ativo"
        )
        .eq(
          "id",
          user.id
        )
        .maybeSingle();

    if (
      erroPerfil
    ) {
      console.error(
        "Erro ao consultar perfil:",
        erroPerfil.message
      );

      return {
        autorizado: false,
        erro:
          "Não foi possível verificar o perfil.",
      };
    }

    if (!perfil) {
      return {
        autorizado: false,
        erro:
          "Usuário sem perfil autorizado.",
      };
    }

    if (
      perfil.ativo !== true
    ) {
      return {
        autorizado: false,
        erro:
          "Este usuário está inativo.",
      };
    }

    const tipoPerfil =
      String(
        perfil.tipo || ""
      )
        .trim()
        .toUpperCase();

    if (
      tipoPerfil !== "ADMIN" &&
      tipoPerfil !==
        "ADMINISTRADOR"
    ) {
      return {
        autorizado: false,
        erro:
          "Acesso permitido somente para administradores.",
      };
    }

    return {
      autorizado: true,
      user,
      perfil,
    };

  } catch (erro) {
    console.error(
      "Erro ao verificar usuário:",
      erro.message
    );

    return {
      autorizado: false,
      erro:
        "Erro ao validar autenticação.",
    };
  }
}

// ==========================================
// MIDDLEWARE
// ==========================================

async function exigirAdmin(
  req,
  res,
  next
) {
  const token =
    obterTokenDaRequisicao(req);

  const resultado =
    await verificarUsuarioAdmin(
      token
    );

  if (
    !resultado.autorizado
  ) {
    return res
      .status(401)
      .json({
        sucesso: false,
        erro:
          resultado.erro ||
          "Não autorizado.",
      });
  }

  req.usuario =
    resultado.user;

  req.perfil =
    resultado.perfil;

  req.tokenSessao =
    token;

  next();
}

// ==========================================
// LOGIN
// ==========================================

app.post(
  "/api/auth/login",
  async (req, res) => {
    try {
      const {
        email,
        senha,
      } = req.body;

      if (
        !email ||
        !senha
      ) {
        return res
          .status(400)
          .json({
            sucesso: false,
            erro:
              "E-mail e senha são obrigatórios.",
          });
      }

      const emailNormalizado =
        String(email)
          .trim()
          .toLowerCase();

      const {
        data,
        error,
      } =
        await supabase.auth
          .signInWithPassword({
            email:
              emailNormalizado,

            password:
              senha,
          });

      if (
        error ||
        !data?.user ||
        !data?.session
      ) {
        console.error(
          "ERRO REAL DO SUPABASE:",
          error?.message ||
            "Sem detalhes"
        );

        console.error(
          "CÓDIGO DO SUPABASE:",
          error?.code ||
            "Sem código"
        );

        return res
          .status(401)
          .json({
            sucesso: false,
            erro:
              "E-mail ou senha inválidos.",
          });
      }

      const {
        data: perfil,
        error:
          erroPerfil,
      } =
        await supabase
          .from("perfis")
          .select(
            "id, nome, tipo, ativo"
          )
          .eq(
            "id",
            data.user.id
          )
          .maybeSingle();

      if (
        erroPerfil
      ) {
        console.error(
          "Erro ao consultar perfil:",
          erroPerfil.message
        );

        await supabase.auth.signOut();

        return res
          .status(500)
          .json({
            sucesso: false,
            erro:
              "Erro ao verificar o perfil do usuário.",
          });
      }

      if (!perfil) {
        await supabase.auth.signOut();

        return res
          .status(403)
          .json({
            sucesso: false,
            erro:
              "Usuário autenticado, mas sem perfil autorizado.",
          });
      }

      if (
        perfil.ativo !== true
      ) {
        await supabase.auth.signOut();

        return res
          .status(403)
          .json({
            sucesso: false,
            erro:
              "Este usuário está inativo.",
          });
      }

      const tipoPerfil =
        String(
          perfil.tipo || ""
        )
          .trim()
          .toUpperCase();

      if (
        tipoPerfil !== "ADMIN" &&
        tipoPerfil !==
          "ADMINISTRADOR"
      ) {
        await supabase.auth.signOut();

        return res
          .status(403)
          .json({
            sucesso: false,
            erro:
              "Acesso permitido somente para administradores.",
          });
      }

      const tokenSessao =
        gerarTokenSessao();

      sessoes.set(
        tokenSessao,
        {
          accessToken:
            data.session
              .access_token,

          userId:
            data.user.id,

          expiraEm:
            Date.now() +
            TEMPO_SESSAO,
        }
      );

      res.json({
        sucesso: true,

        mensagem:
          "Login realizado com sucesso.",

        token:
          tokenSessao,

        usuario: {
          id:
            data.user.id,

          email:
            data.user.email,

          nome:
            perfil.nome ||
            data.user.email,

          role:
            perfil.tipo,

          ativo:
            perfil.ativo,
        },
      });

    } catch (erro) {
      console.error(
        "Erro no login:",
        erro.message
      );

      res
        .status(500)
        .json({
          sucesso: false,
          erro:
            "Erro interno ao realizar login.",
        });
    }
  }
);

// ==========================================
// VERIFICAR LOGIN
// ==========================================

app.get(
  "/api/auth/me",
  exigirAdmin,
  async (req, res) => {
    res.json({
      sucesso: true,

      autenticado: true,

      usuario: {
        id:
          req.usuario.id,

        email:
          req.usuario.email,

        nome:
          req.perfil.nome ||
          req.usuario.email,

        role:
          req.perfil.tipo,

        ativo:
          req.perfil.ativo,
      },
    });
  }
);

// ==========================================
// LOGOUT
// ==========================================

app.post(
  "/api/auth/logout",
  async (req, res) => {
    try {
      const token =
        obterTokenDaRequisicao(req);

      const sessao =
        token
          ? sessoes.get(token)
          : null;

      if (sessao) {
        sessoes.delete(token);

        try {
          await supabase.auth.signOut({
            scope: "local",
          });
        } catch (erro) {
          console.warn(
            "Aviso ao encerrar sessão do Supabase:",
            erro.message
          );
        }
      }

      res.json({
        sucesso: true,

        mensagem:
          "Sessão encerrada.",
      });

    } catch (erro) {
      console.error(
        "Erro ao fazer logout:",
        erro.message
      );

      res
        .status(500)
        .json({
          sucesso: false,
          erro:
            "Erro ao encerrar sessão.",
        });
    }
  }
);

// ==========================================
// CONEXÃO COM PIERRE
// ==========================================

async function pierreRequest(
  endpoint,
  params = {}
) {
  if (
    !process.env.PIERRE_API_KEY
  ) {
    throw new Error(
      "PIERRE_API_KEY não encontrada no arquivo .env"
    );
  }

  const url =
    new URL(
      `${PIERRE_API_URL}/${endpoint}`
    );

  Object.entries(params)
    .forEach(
      ([chave, valor]) => {
        if (
          valor !==
            undefined &&
          valor !== null &&
          valor !== ""
        ) {
          url.searchParams.set(
            chave,
            valor
          );
        }
      }
    );

  const resposta =
    await fetch(
      url,
      {
        method: "GET",

        headers: {
          Authorization:
            `Bearer ${process.env.PIERRE_API_KEY}`,
        },
      }
    );

  const dados =
    await resposta.json();

  if (!resposta.ok) {
    throw new Error(
      dados?.message ||
        dados?.error ||
        `Erro ${resposta.status} na API do Pierre`
    );
  }

  return dados;
}

// ==========================================
// NORMALIZAR TEXTO
// ==========================================

function normalizarTexto(
  texto
) {
  return String(
    texto || ""
  )
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .trim();
}

// ==========================================
// CONTAS
// ==========================================

app.get(
  "/api/accounts",
  exigirAdmin,
  async (req, res) => {
    try {
      const dados =
        await pierreRequest(
          "get-accounts"
        );

        console.log(
  "CARTAO BRUTO DO PIERRE:",
  dados.data?.find(
    (item) =>
      item.type === "CREDIT"
  )
);

      const registros =
        Array.isArray(
          dados.data
        )
          ? dados.data
          : [];

      const contasBancarias =
        registros.filter(
          (conta) =>
            conta.type ===
              "BANK" &&
            conta.itemIsActive !==
              false
        );

      const cartoes =
        registros.filter(
          (conta) =>
            conta.type ===
              "CREDIT" &&
            conta.itemIsActive !==
              false
        );

      const investimentos =
        registros.filter(
          (conta) =>
            conta.type ===
              "INVESTMENT" &&
            conta.itemIsActive !==
              false
        );

      const contas =
        contasBancarias.map(
          (conta) => ({
            id:
              conta.id,

            nome:
              conta.customName ||
              conta.name ||
              "Conta bancária",

            banco:
              conta.connectorName ||
              conta.marketingName ||
              "Banco não informado",

            tipo:
              conta.type,

            subtipo:
              conta.subtype ||
              "Não informado",

            saldo:
              Number(
                conta.balance || 0
              ),

            moeda:
              conta.currencyCode ||
              "BRL",

            ativa:
              conta.itemIsActive !==
              false,
          })
        );

      const cartoesFormatados =
        cartoes.map(
          (cartao) => {
            const credito =
              cartao.creditData ||
              {};

            return {
              id:
                cartao.id,

              nome:
                cartao.customName ||
                cartao.name ||
                "Cartão",

              banco:
                cartao.connectorName ||
                cartao.marketingName ||
                "Banco não informado",

              tipo:
                cartao.type,

              subtipo:
                cartao.subtype ||
                "CREDIT_CARD",

              saldo:
                Number(
                  cartao.balance || 0
                ),

              moeda:
                cartao.currencyCode ||
                "BRL",

              limite:
                Number(
                  credito.creditLimit ||
                    credito.limit ||
                    0
                ),

              limiteDisponivel:
                Number(
                  credito.availableCreditLimit ||
                    credito.availableLimit ||
                    0
                ),

              vencimento:
                credito.balanceDueDate ||
                null,

              fechamento:
                credito.balanceCloseDate ||
                null,

              ativa:
                cartao.itemIsActive !==
                false,
            };
          }
        );

      const investimentosFormatados =
        investimentos.map(
          (investimento) => ({
            id:
              investimento.id,

            nome:
              investimento.customName ||
              investimento.name ||
              "Investimento",

            banco:
              investimento.connectorName ||
              investimento.marketingName ||
              "Instituição não informada",

            tipo:
              investimento.type,

            subtipo:
              investimento.subtype ||
              "Não informado",

            saldo:
              Number(
                investimento.balance ||
                  0
              ),

            moeda:
              investimento.currencyCode ||
              "BRL",
          })
        );

      const saldoTotalContas =
        contas.reduce(
          (total, conta) =>
            total +
            conta.saldo,
          0
        );

      const limiteTotal =
        cartoesFormatados.reduce(
          (total, cartao) =>
            total +
            cartao.limite,
          0
        );

      const limiteDisponivelTotal =
        cartoesFormatados.reduce(
          (total, cartao) =>
            total +
            cartao.limiteDisponivel,
          0
        );

      const saldoCartoes =
        cartoesFormatados.reduce(
          (total, cartao) =>
            total +
            cartao.saldo,
          0
        );

      const saldoInvestimentos =
        investimentosFormatados.reduce(
          (total, investimento) =>
            total +
            investimento.saldo,
          0
        );

      res.json({
        sucesso: true,

        quantidadeTotal:
          registros.length,

        contas,

        cartoes:
          cartoesFormatados,

        investimentos:
          investimentosFormatados,

        totais: {
          saldoContas:
            saldoTotalContas,

          saldoCartoes:
            saldoCartoes,

          limiteCartoes:
            limiteTotal,

          limiteDisponivel:
            limiteDisponivelTotal,

          investimentos:
            saldoInvestimentos,
        },
      });

    } catch (erro) {
      console.error(
        "Erro ao buscar contas:",
        erro.message
      );

      res
        .status(500)
        .json({
          sucesso: false,
          erro:
            erro.message,
        });
    }
  }
);

// ==========================================
// FATURAS DOS CARTÕES
// ==========================================

app.get(
  "/api/bills",
  exigirAdmin,
  async (req, res) => {
    try {
      const accountId =
        req.query.accountId || null;

      // ==========================================
      // BUSCAR FATURAS DO PIERRE
      // ==========================================

      const dadosFaturas =
        await pierreRequest(
          "get-bills",
          accountId
            ? { accountId }
            : {}
        );

      let faturas =
        Array.isArray(
          dadosFaturas.data
        )
          ? dadosFaturas.data
          : [];

      // ==========================================
      // CRIAR PRÓXIMA FATURA QUANDO NECESSÁRIO
      // ==========================================

      /*
       * O Pierre está retornando as faturas fechadas.
       * No caso do cartão Gold/Nubank, a última fatura
       * retornada é:
       *
       * Fechamento: 05/08/2026
       * Vencimento: 12/08/2026
       *
       * Portanto, a próxima fatura será:
       *
       * Fechamento: 05/09/2026
       * Vencimento: 12/09/2026
       *
       * Criamos essa próxima fatura apenas como uma
       * fatura virtual. Ela não é enviada para o Pierre
       * nem gravada no banco.
       */

      function adicionarUmMes(
        dataOriginal
      ) {
        const data =
          new Date(
            dataOriginal
          );

        data.setMonth(
          data.getMonth() + 1
        );

        return data;
      }

      // ==========================================
      // SE FOI INFORMADO UM CARTÃO ESPECÍFICO
      // ==========================================

      if (accountId) {

        const faturasDoCartao =
          faturas
            .filter(
              (fatura) =>
                String(
                  fatura.accountId
                ) ===
                String(
                  accountId
                )
            )
            .sort(
              (a, b) =>
                new Date(
                  b.dueDate
                ) -
                new Date(
                  a.dueDate
                )
            );

        if (
          faturasDoCartao.length > 0
        ) {

          const ultimaFatura =
            faturasDoCartao[0];

          const fechamentoUltima =
            new Date(
              ultimaFatura.billClosingDate
            );

          const vencimentoUltima =
            new Date(
              ultimaFatura.dueDate
            );

          const proximoFechamento =
            adicionarUmMes(
              fechamentoUltima
            );

          const proximoVencimento =
            adicionarUmMes(
              vencimentoUltima
            );

          const existeProxima =
            faturas.some(
              (fatura) => {

                const fechamento =
                  new Date(
                    fatura.billClosingDate
                  );

                return (
                  String(
                    fatura.accountId
                  ) ===
                    String(
                      accountId
                    ) &&
                  fechamento.getFullYear() ===
                    proximoFechamento.getFullYear() &&
                  fechamento.getMonth() ===
                    proximoFechamento.getMonth()
                );
              }
            );

          if (
            !existeProxima
          ) {

            const faturaVirtual = {
              id:
                `virtual-${accountId}-${proximoVencimento
                  .toISOString()
                  .slice(0, 10)}`,

              userId:
                ultimaFatura.userId,

              itemId:
                ultimaFatura.itemId,

              accountId:
                accountId,

              billClosingDate:
                proximoFechamento.toISOString(),

              dueDate:
                proximoVencimento.toISOString(),

              totalAmount:
                "0",

              totalAmountCurrencyCode:
                ultimaFatura.totalAmountCurrencyCode ||
                "BRL",

              minimumPaymentAmount:
                "0",

              status:
                "OPEN",

              virtual:
                true,
            };

            faturas.push(
              faturaVirtual
            );

            console.log(
              "📅 Fatura virtual criada:",
              {
                accountId,
                fechamento:
                  proximoFechamento.toISOString(),
                vencimento:
                  proximoVencimento.toISOString(),
              }
            );
          }
        }

      } else {

        // ==========================================
        // SEM ACCOUNT ID:
        // CRIAR PRÓXIMA FATURA PARA CADA CARTÃO
        // ==========================================

        const contasDeCartao =
          [
            ...new Set(
              faturas
                .map(
                  (fatura) =>
                    fatura.accountId
                )
                .filter(Boolean)
            ),
          ];

        for (
          const idCartao of
            contasDeCartao
        ) {

          const faturasDoCartao =
            faturas
              .filter(
                (fatura) =>
                  String(
                    fatura.accountId
                  ) ===
                  String(
                    idCartao
                  )
              )
              .sort(
                (a, b) =>
                  new Date(
                    b.dueDate
                  ) -
                  new Date(
                    a.dueDate
                  )
              );

          if (
            faturasDoCartao.length ===
            0
          ) {
            continue;
          }

          const ultimaFatura =
            faturasDoCartao[0];

          if (
            !ultimaFatura.billClosingDate ||
            !ultimaFatura.dueDate
          ) {
            continue;
          }

          const fechamentoUltima =
            new Date(
              ultimaFatura.billClosingDate
            );

          const vencimentoUltima =
            new Date(
              ultimaFatura.dueDate
            );

          if (
            Number.isNaN(
              fechamentoUltima.getTime()
            ) ||
            Number.isNaN(
              vencimentoUltima.getTime()
            )
          ) {
            continue;
          }

          const proximoFechamento =
            adicionarUmMes(
              fechamentoUltima
            );

          const proximoVencimento =
            adicionarUmMes(
              vencimentoUltima
            );

          const existeProxima =
            faturas.some(
              (fatura) => {

                const fechamento =
                  new Date(
                    fatura.billClosingDate
                  );

                return (
                  String(
                    fatura.accountId
                  ) ===
                    String(
                      idCartao
                    ) &&
                  fechamento.getFullYear() ===
                    proximoFechamento.getFullYear() &&
                  fechamento.getMonth() ===
                    proximoFechamento.getMonth()
                );
              }
            );

          if (
            existeProxima
          ) {
            continue;
          }

          const faturaVirtual = {
            id:
              `virtual-${idCartao}-${proximoVencimento
                .toISOString()
                .slice(0, 10)}`,

            userId:
              ultimaFatura.userId,

            itemId:
              ultimaFatura.itemId,

            accountId:
              idCartao,

            billClosingDate:
              proximoFechamento.toISOString(),

            dueDate:
              proximoVencimento.toISOString(),

            totalAmount:
              "0",

            totalAmountCurrencyCode:
              ultimaFatura.totalAmountCurrencyCode ||
              "BRL",

            minimumPaymentAmount:
              "0",

            status:
              "OPEN",

            virtual:
              true,
          };

          faturas.push(
            faturaVirtual
          );

          console.log(
            "📅 Fatura virtual criada:",
            {
              accountId:
                idCartao,

              fechamento:
                proximoFechamento.toISOString(),

              vencimento:
                proximoVencimento.toISOString(),
            }
          );
        }
      }

      // ==========================================
      // RESUMO DA FATURA ATUAL
      // ==========================================

      const dadosResumo =
        await pierreRequest(
          "get-bill-summary",
          accountId
            ? { accountId }
            : {}
        );

      const resumos =
        Array.isArray(
          dadosResumo.data
        )
          ? dadosResumo.data
          : [];

      // ==========================================
      // ORDENAR FATURAS
      // ==========================================

      faturas.sort(
        (a, b) =>
          new Date(
            b.dueDate
          ) -
          new Date(
            a.dueDate
          )
      );

      // ==========================================
      // RETORNAR
      // ==========================================

      res.json({
        sucesso: true,

        faturas,

        resumos,

        quantidade:
          faturas.length,

        quantidadeResumos:
          resumos.length,
      });

    } catch (erro) {

      console.error(
        "Erro ao buscar faturas:",
        erro.message
      );

      res
        .status(500)
        .json({
          sucesso: false,

          erro:
            erro.message,
        });
    }
  }
);

// ==========================================
// TRANSAÇÕES
// ==========================================

app.get(
  "/api/transactions",
  exigirAdmin,
  async (req, res) => {
    try {
      const hoje =
        new Date();

      const tresMesesAtras =
        new Date(hoje);

      tresMesesAtras.setMonth(
        tresMesesAtras.getMonth() -
          3
      );

      const dataInicio =
        req.query.startDate ||
        tresMesesAtras
          .toISOString()
          .slice(0, 10);

      const dataFim =
        req.query.endDate ||
        hoje
          .toISOString()
          .slice(0, 10);

      const dados =
        await pierreRequest(
          "get-transactions",
          {
            startDate:
              dataInicio,

            endDate:
              dataFim,

            format:
              "raw",
          }
        );

      const transacoes =
        Array.isArray(
          dados.data
        )
          ? dados.data
          : [];

      // ==========================================
      // TRANSAÇÃO DE CARTÃO - DEBUG
      // ==========================================

      const transacaoCartao =
        transacoes.find(
          (transacao) =>
            transacao.credit_card_data !==
            null
        );

      console.log(
        "TRANSAÇÃO DE CARTÃO DO PIERRE:",
        JSON.stringify(
          transacaoCartao,
          null,
          2
        )
      );

      // ==========================================
      // FORMATAR TRANSAÇÕES
      // ==========================================

      const transacoesFormatadas =
        transacoes.map(
          (transacao) => ({

            id:
              transacao.id,

            descricao:
              transacao.description ||
              "Transação",

            categoria:
              transacao.category ||
              "Sem categoria",

            valor:
              Number(
                transacao.amount ||
                  0
              ),

            data:
              transacao.date ||
              "",

            tipo:
              transacao.type ||
              (
                Number(
                  transacao.amount ||
                    0
                ) >= 0
                  ? "CREDITO"
                  : "DEBITO"
              ),

            status:
              transacao.status ||
              "",

            conta:
              transacao.account_name ||
              transacao.accountName ||
              "Conta",

            tipoConta:
              transacao.account_type ||
              transacao.accountType ||
              "",

            // ==========================================
            // DADOS ORIGINAIS DO CARTÃO
            // ==========================================

            creditCardData:
              transacao.credit_card_data ||
              null,

            installmentDueDate:
              transacao.installment_due_date ||
              null,

            originalDescription:
              transacao.original_description ||
              "",

            merchant:
              transacao.merchant ||
              null,

            accountId:
              transacao.account_id ||
              null,

            accountSubtype:
              transacao.account_subtype ||
              "",

          })
        );

      res.json({
        sucesso: true,

        quantidade:
          transacoesFormatadas.length,

        dataInicio,

        dataFim,

        transacoes:
          transacoesFormatadas,
      });

    } catch (erro) {

      console.error(
        "Erro ao buscar transações:",
        erro.message
      );

      res
        .status(500)
        .json({
          sucesso: false,

          erro:
            erro.message,
        });
    }
  }
);

app.get(
  "/api/debug/transacoes",
  exigirAdmin,
  async (req, res) => {
    try {
      const hoje =
        new Date();

      const tresMesesAtras =
        new Date(hoje);

      tresMesesAtras.setMonth(
        tresMesesAtras.getMonth() -
          3
      );

      const dados =
        await pierreRequest(
          "get-transactions",
          {
            startDate:
              tresMesesAtras
                .toISOString()
                .slice(0, 10),

            endDate:
              hoje
                .toISOString()
                .slice(0, 10),

            format:
              "raw",
          }
        );

      res.json({
        sucesso: true,

        quantidade:
          Array.isArray(
            dados.data
          )
            ? dados.data.length
            : 0,

        transacoes:
          Array.isArray(
            dados.data
          )
            ? dados.data
            : [],
      });

    } catch (erro) {
      console.error(
        "Erro ao buscar transações brutas:",
        erro.message
      );

      res
        .status(500)
        .json({
          sucesso: false,
          erro:
            erro.message,
        });
    }
  }
);

// ==========================================
// HEALTH
// ==========================================

app.get(
  "/api/health",
  async (req, res) => {
    try {
      const dados =
        await pierreRequest(
          "get-accounts"
        );

      res.json({
        conectado: true,

        registros:
          Array.isArray(
            dados.data
          )
            ? dados.data.length
            : 0,
      });

    } catch (erro) {
      res
        .status(500)
        .json({
          conectado: false,
          erro:
            erro.message,
        });
    }
  }
);

// ==========================================
// CAIXINHAS - BUSCAR
// ==========================================

app.get(
  "/api/caixinhas",
  exigirAdmin,
  async (req, res) => {
    try {
      const {
        data,
        error,
      } =
        await supabase
          .from("caixinhas")
          .select("*")
          .order(
            "created_at",
            {
              ascending:
                false,
            }
          );

      if (error) {
        throw error;
      }

      res.json({
        sucesso: true,
        caixinhas:
          data,
      });

    } catch (erro) {
      console.error(
        "Erro ao buscar caixinhas:",
        erro.message
      );

      res
        .status(500)
        .json({
          sucesso: false,
          erro:
            erro.message,
        });
    }
  }
);

// ==========================================
// CAIXINHAS - CRIAR
// ==========================================

app.post(
  "/api/caixinhas",
  exigirAdmin,
  async (req, res) => {
    try {
      const {
        nome,
        meta,
        saldo,
        descricao,
      } = req.body;

      if (
        !nome ||
        nome.trim() === ""
      ) {
        return res
          .status(400)
          .json({
            sucesso: false,
            erro:
              "O nome da caixinha é obrigatório.",
          });
      }

      const metaNumerica =
        Number(meta);

      const saldoNumerico =
        Number(saldo) || 0;

      if (
        !Number.isFinite(
          metaNumerica
        ) ||
        metaNumerica <= 0
      ) {
        return res
          .status(400)
          .json({
            sucesso: false,
            erro:
              "A meta deve ser maior que zero.",
          });
      }

      if (
        !Number.isFinite(
          saldoNumerico
        ) ||
        saldoNumerico < 0
      ) {
        return res
          .status(400)
          .json({
            sucesso: false,
            erro:
              "O saldo inicial não pode ser negativo.",
          });
      }

      const {
        data,
        error,
      } =
        await supabase
          .from("caixinhas")
          .insert([
            {
              nome:
                nome.trim(),

              meta:
                metaNumerica,

              saldo:
                saldoNumerico,

              descricao:
                descricao?.trim() ||
                null,
            },
          ])
          .select()
          .single();

      if (error) {
        throw error;
      }

      res
        .status(201)
        .json({
          sucesso: true,

          mensagem:
            "Caixinha criada com sucesso.",

          caixinha:
            data,
        });

    } catch (erro) {
      console.error(
        "Erro ao criar caixinha:",
        erro.message
      );

      res
        .status(500)
        .json({
          sucesso: false,
          erro:
            erro.message,
        });
    }
  }
);

// ==========================================
// MOVIMENTAÇÕES DAS CAIXINHAS
// ==========================================

app.post(
  "/api/caixinhas/:id/movimentacoes",
  exigirAdmin,
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const {
        tipo,
        valor,
        descricao,
      } = req.body;

      if (
        !tipo ||
        !valor
      ) {
        return res
          .status(400)
          .json({
            sucesso: false,
            erro:
              "Tipo e valor são obrigatórios.",
          });
      }

      const tiposPermitidos = [
        "ENTRADA",
        "SAIDA",
      ];

      if (
        !tiposPermitidos.includes(
          tipo
        )
      ) {
        return res
          .status(400)
          .json({
            sucesso: false,
            erro:
              "Tipo de movimentação inválido. Use ENTRADA ou SAIDA.",
          });
      }

      const valorNumerico =
        Number(valor);

      if (
        !Number.isFinite(
          valorNumerico
        ) ||
        valorNumerico <= 0
      ) {
        return res
          .status(400)
          .json({
            sucesso: false,
            erro:
              "O valor deve ser maior que zero.",
          });
      }

      const {
        data: caixinha,
        error:
          erroCaixinha,
      } =
        await supabase
          .from("caixinhas")
          .select(
            "id, saldo"
          )
          .eq(
            "id",
            id
          )
          .single();

      if (
        erroCaixinha
      ) {
        return res
          .status(404)
          .json({
            sucesso: false,
            erro:
              "Caixinha não encontrada.",
          });
      }

      const saldoAtual =
        Number(
          caixinha.saldo || 0
        );

      let novoSaldo;

      if (
        tipo === "ENTRADA"
      ) {
        novoSaldo =
          saldoAtual +
          valorNumerico;
      } else {
        novoSaldo =
          saldoAtual -
          valorNumerico;
      }

      if (
        novoSaldo < 0
      ) {
        return res
          .status(400)
          .json({
            sucesso: false,
            erro:
              "A caixinha não possui saldo suficiente para essa saída.",
          });
      }

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "movimentacoes_caixinhas"
          )
          .insert([
            {
              caixinha_id:
                caixinha.id,

              tipo,

              valor:
                valorNumerico,

              descricao:
                descricao?.trim() ||
                null,
            },
          ])
          .select()
          .single();

      if (error) {
        throw error;
      }

      const {
        data:
          caixinhaAtualizada,
        error:
          erroAtualizacao,
      } =
        await supabase
          .from("caixinhas")
          .update({
            saldo:
              novoSaldo,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            id
          )
          .select()
          .single();

      if (
        erroAtualizacao
      ) {
        throw erroAtualizacao;
      }

      res
        .status(201)
        .json({
          sucesso: true,

          mensagem:
            "Movimentação registrada com sucesso.",

          movimentacao:
            data,

          caixinha:
            caixinhaAtualizada,
        });

    } catch (erro) {
      console.error(
        "Erro ao movimentar caixinha:",
        erro.message
      );

      res
        .status(500)
        .json({
          sucesso: false,
          erro:
            erro.message,
        });
    }
  }
);

// ==========================================
// SINCRONIZAR CAIXINHAS COM O PIERRE
// ==========================================

app.post(
  "/api/caixinhas/sincronizar",
  exigirAdmin,
  async (req, res) => {
    try {
      console.log(
        "🔄 Iniciando sincronização das caixinhas..."
      );

      const {
        data: caixinhas,
        error:
          erroCaixinhas,
      } =
        await supabase
          .from("caixinhas")
          .select(
            "id, nome, saldo"
          );

      if (
        erroCaixinhas
      ) {
        throw erroCaixinhas;
      }

      if (
        !caixinhas ||
        caixinhas.length === 0
      ) {
        return res.json({
          sucesso: true,

          mensagem:
            "Nenhuma caixinha cadastrada para sincronizar.",

          sincronizadas: [],

          ignoradas: [],
        });
      }

      console.log(
        `📦 ${caixinhas.length} caixinhas encontradas.`
      );

      let {
        data:
          controleSincronizacao,
        error:
          erroControle,
      } =
        await supabase
          .from(
            "sincronizacoes"
          )
          .select(
            "id, ultima_sincronizacao"
          )
          .eq(
            "id",
            1
          )
          .maybeSingle();

      if (
        erroControle
      ) {
        throw erroControle;
      }

      if (
        !controleSincronizacao
      ) {
        const {
          data:
            novoControle,
          error:
            erroCriarControle,
        } =
          await supabase
            .from(
              "sincronizacoes"
            )
            .insert([
              {
                id: 1,

                ultima_sincronizacao:
                  null,
              },
            ])
            .select()
            .single();

        if (
          erroCriarControle
        ) {
          throw erroCriarControle;
        }

        controleSincronizacao =
          novoControle;
      }

      const agora =
  new Date();

const dataInicio =
  new Date(agora);

dataInicio.setDate(
  dataInicio.getDate() -
    3
);

console.log(
  "🔄 Buscando movimentações dos últimos 3 dias para identificar novidades."
);

      const dataInicioFormatada =
        dataInicio
          .toISOString()
          .slice(0, 10);

      const dataFimFormatada =
        agora
          .toISOString()
          .slice(0, 10);

      console.log(
        "📅 Período:",
        dataInicioFormatada,
        "até",
        dataFimFormatada
      );

      const respostaPierre =
        await pierreRequest(
          "get-transactions",
          {
            startDate:
              dataInicioFormatada,

            endDate:
              dataFimFormatada,

            format:
              "raw",
          }
        );

      const transacoes =
        Array.isArray(
          respostaPierre?.data
        )
          ? respostaPierre.data
          : [];

      console.log(
        `📊 ${transacoes.length} transações encontradas.`
      );

      const sincronizadas =
        [];

      const ignoradas =
        [];

      for (
        const transacao of
          transacoes
      ) {
          

        const transacaoId =
          transacao.id ||
          transacao.transaction_id ||
          transacao.transactionId;

        const descricao =
          String(
            transacao.description ||
            transacao.descricao ||
            ""
          ).trim();

        const tipoPierre =
          String(
            transacao.type ||
            ""
          )
            .trim()
            .toUpperCase();

        const valorOriginal =
          Number(
            transacao.amount
          );

        if (
          !transacaoId
        ) {
          ignoradas.push({
            motivo:
              "Transação sem ID.",

            descricao,
          });

          continue;
        }

        if (
          !descricao
        ) {
          ignoradas.push({
            transacao_id:
              transacaoId,

            motivo:
              "Transação sem descrição.",
          });

          continue;
        }

        if (
          !Number.isFinite(
            valorOriginal
          ) ||
          valorOriginal === 0
        ) {
          ignoradas.push({
            transacao_id:
              transacaoId,

            descricao,

            motivo:
              "Valor inválido ou igual a zero.",
          });

          continue;
        }

        const descricaoNormalizada =
          normalizarTexto(
            descricao
          );

        // ==========================================
        // RENDIMENTOS SÃO MANUAIS
        // ==========================================

        if (
          descricaoNormalizada.includes(
            "rendimento"
          )
        ) {
          ignoradas.push({
            transacao_id:
              transacaoId,

            descricao,

            valor:
              valorOriginal,

            tipoPierre,

            motivo:
              "Rendimento ignorado: os rendimentos são adicionados manualmente no app.",
          });

          console.log(
            "📈 Rendimento ignorado:",
            descricao,
            valorOriginal
          );

          continue;
        }

        // ==========================================
        // IDENTIFICAR MOVIMENTAÇÃO AUTOMÁTICA
        // ==========================================

        const ehReserva =
          descricaoNormalizada.includes(
            "reserva por gastos"
          );

        const ehRetirada =
          descricaoNormalizada.includes(
            "dinheiro retirado"
          );

        if (
          !ehReserva &&
          !ehRetirada
        ) {
          ignoradas.push({
            transacao_id:
              transacaoId,

            descricao,

            valor:
              valorOriginal,

            tipoPierre,

            motivo:
              "Transação não identificada como reserva ou retirada de caixinha.",
          });

          continue;
        }

        // ==========================================
        // EVITAR DUPLICAÇÃO
        // ==========================================

        const {
          data:
            movimentacaoExistente,
          error:
            erroMovimentacaoExistente,
        } =
          await supabase
            .from(
              "movimentacoes_caixinhas"
            )
            .select(
              "id"
            )
            .eq(
              "transacao_pierre_id",
              String(
                transacaoId
              )
            )
            .maybeSingle();

        if (
          erroMovimentacaoExistente
        ) {
          throw erroMovimentacaoExistente;
        }

        if (
          movimentacaoExistente
        ) {
          ignoradas.push({
            transacao_id:
              transacaoId,

            descricao,

            motivo:
              "Transação já sincronizada anteriormente.",
          });

          continue;
        }

        // ==========================================
        // ENCONTRAR CAIXINHA
        // ==========================================

        const caixinhaEncontrada =
          caixinhas.find(
            (caixinha) => {
              const nomeCaixinha =
                normalizarTexto(
                  caixinha.nome
                );

              if (
                !nomeCaixinha
              ) {
                return false;
              }

              return (
                descricaoNormalizada.includes(
                  nomeCaixinha
                ) ||
                nomeCaixinha.includes(
                  descricaoNormalizada
                )
              );
            }
          );

        if (
          !caixinhaEncontrada
        ) {
          ignoradas.push({
            transacao_id:
              transacaoId,

            descricao,

            valor:
              valorOriginal,

            tipoPierre,

            motivo:
              "Movimentação de caixinha encontrada, mas nenhuma caixinha compatível foi localizada na descrição.",
          });

          console.log(
            "⚠️ Caixinha não encontrada:",
            descricao
          );

          continue;
        }

        console.log(
          "📦 Caixinha encontrada:",
          caixinhaEncontrada.nome,
          "<-",
          descricao
        );

        // ==========================================
        // TIPO DA MOVIMENTAÇÃO
        // ==========================================

        let tipoMovimentacao;

        if (
          tipoPierre ===
          "DEBIT"
        ) {
          tipoMovimentacao =
            "ENTRADA";

        } else if (
          tipoPierre ===
          "CREDIT"
        ) {
          tipoMovimentacao =
            "SAIDA";

        } else {
          ignoradas.push({
            transacao_id:
              transacaoId,

            descricao,

            tipoPierre,

            motivo:
              `Tipo do Pierre não reconhecido: ${tipoPierre}`,
          });

          continue;
        }

        const valor =
          Math.abs(
            valorOriginal
          );

        const saldoAtual =
          Number(
            caixinhaEncontrada.saldo ||
              0
          );

        let novoSaldo;

        if (
          tipoMovimentacao ===
          "ENTRADA"
        ) {
          novoSaldo =
            saldoAtual +
            valor;

        } else {
          novoSaldo =
            saldoAtual -
            valor;
        }

        if (
          novoSaldo < 0
        ) {
          ignoradas.push({
            transacao_id:
              transacaoId,

            caixinha:
              caixinhaEncontrada.nome,

            descricao,

            valor,

            motivo:
              "A saída deixaria o saldo da caixinha negativo.",
          });

          continue;
        }

        console.log(
          "➡️ TENTANDO SINCRONIZAR:",
          {
            caixinha:
              caixinhaEncontrada.nome,

            tipo:
              tipoMovimentacao,

            valor,

            transacaoId,

            descricao,
          }
        );

        const {
          data:
            movimentacao,
          error:
            erroInsercao,
        } =
          await supabase
            .from(
              "movimentacoes_caixinhas"
            )
            .insert([
              {
                caixinha_id:
                  caixinhaEncontrada.id,

                tipo:
                  tipoMovimentacao,

                valor,

                descricao:
                  `Pierre: ${descricao}`,

                transacao_pierre_id:
                  String(
                    transacaoId
                  ),
              },
            ])
            .select()
            .single();

        if (
          erroInsercao
        ) {
          if (
            erroInsercao.code ===
            "23505"
          ) {
            ignoradas.push({
              transacao_id:
                transacaoId,

              descricao,

              motivo:
                "Transação já existente no banco.",
            });

            continue;
          }

          throw erroInsercao;
        }

        const {
          data:
            caixinhaAtualizada,
          error:
            erroAtualizacao,
        } =
          await supabase
            .from(
              "caixinhas"
            )
            .update({
              saldo:
                novoSaldo,

              updated_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              caixinhaEncontrada.id
            )
            .select()
            .single();

        if (
          erroAtualizacao
        ) {
          throw erroAtualizacao;
        }

        caixinhaEncontrada.saldo =
          Number(
            caixinhaAtualizada.saldo ||
              0
          );

        sincronizadas.push({
          transacao_id:
            transacaoId,

          caixinha:
            caixinhaEncontrada.nome,

          tipo:
            tipoMovimentacao,

          valor,

          saldoAnterior:
            saldoAtual,

          saldoAtual:
            caixinhaEncontrada.saldo,

          descricao,
        });
      }

      // ==========================================
      // SALVAR ÚLTIMA SINCRONIZAÇÃO
      // ==========================================

      const {
        error:
          erroSalvarSincronizacao,
      } =
        await supabase
          .from(
            "sincronizacoes"
          )
          .update({
            ultima_sincronizacao:
              agora.toISOString(),
          })
          .eq(
            "id",
            1
          );

      if (
        erroSalvarSincronizacao
      ) {
        throw erroSalvarSincronizacao;
      }

      console.log(
        `✅ ${sincronizadas.length} movimentações sincronizadas.`
      );

      console.log(
        `⚠️ ${ignoradas.length} movimentações ignoradas.`
      );

      res.json({
        sucesso:
          true,

        mensagem:
          "Sincronização concluída.",

        periodoBusca: {
          inicio:
            dataInicioFormatada,

          fim:
            dataFimFormatada,
        },

        totalEncontradas:
          transacoes.length,

        totalSincronizadas:
          sincronizadas.length,

        totalIgnoradas:
          ignoradas.length,

        sincronizadas,

        ignoradas,

        ultima_sincronizacao:
          agora.toISOString(),
      });

    } catch (erro) {
      console.error(
        "❌ Erro ao sincronizar caixinhas:",
        erro.message
      );

      res
        .status(500)
        .json({
          sucesso: false,
          erro:
            erro.message,
        });
    }
  }
);

// ==========================================
// ADICIONAR RENDIMENTO À CAIXINHA
// ==========================================

app.post(
  "/api/caixinhas/:id/rendimento",
  exigirAdmin,
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const {
        valor,
        descricao,
      } = req.body;

      const valorNumerico =
        Number(valor);

      if (
        !Number.isFinite(
          valorNumerico
        ) ||
        valorNumerico <= 0
      ) {
        return res
          .status(400)
          .json({
            sucesso: false,

            erro:
              "O valor do rendimento deve ser maior que zero.",
          });
      }

      const {
        data: caixinha,
        error:
          erroCaixinha,
      } =
        await supabase
          .from(
            "caixinhas"
          )
          .select(
            "id, nome, saldo"
          )
          .eq(
            "id",
            id
          )
          .single();

      if (
        erroCaixinha ||
        !caixinha
      ) {
        return res
          .status(404)
          .json({
            sucesso: false,

            erro:
              "Caixinha não encontrada.",
          });
      }

      const {
        data:
          rendimento,
        error:
          erroRendimento,
      } =
        await supabase
          .from(
            "rendimentos_caixinhas"
          )
          .insert([
            {
              caixinha_id:
                id,

              valor:
                valorNumerico,

              descricao:
                descricao?.trim() ||
                "Rendimento",
            },
          ])
          .select()
          .single();

      if (
        erroRendimento
      ) {
        throw erroRendimento;
      }

      const saldoAtual =
        Number(
          caixinha.saldo
        ) || 0;

      const novoSaldo =
        saldoAtual +
        valorNumerico;

      const {
        data:
          caixinhaAtualizada,
        error:
          erroAtualizacao,
      } =
        await supabase
          .from(
            "caixinhas"
          )
          .update({
            saldo:
              novoSaldo,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            id
          )
          .select()
          .single();

      if (
        erroAtualizacao
      ) {
        throw erroAtualizacao;
      }

      res.json({
        sucesso: true,

        mensagem:
          "Rendimento adicionado com sucesso.",

        rendimento,

        caixinha:
          caixinhaAtualizada,
      });

    } catch (erro) {
      console.error(
        "Erro ao adicionar rendimento:",
        erro.message
      );

      res
        .status(500)
        .json({
          sucesso: false,
          erro:
            erro.message,
        });
    }
  }
);

// ==========================================
// EDITAR CAIXINHA
// ==========================================

app.put(
  "/api/caixinhas/:id",
  exigirAdmin,
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const {
        nome,
        meta,
        descricao,
      } = req.body;

      if (
        !nome ||
        meta === undefined
      ) {
        return res
          .status(400)
          .json({
            sucesso: false,

            erro:
              "Nome e meta são obrigatórios.",
          });
      }

      const metaNumerica =
        Number(meta);

      if (
        !Number.isFinite(
          metaNumerica
        ) ||
        metaNumerica <= 0
      ) {
        return res
          .status(400)
          .json({
            sucesso: false,

            erro:
              "A meta deve ser maior que zero.",
          });
      }

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "caixinhas"
          )
          .update({
            nome:
              nome.trim(),

            meta:
              metaNumerica,

            descricao:
              descricao?.trim() ||
              null,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            id
          )
          .select()
          .single();

      if (error) {
        throw error;
      }

      res.json({
        sucesso: true,

        mensagem:
          "Caixinha atualizada com sucesso.",

        caixinha:
          data,
      });

    } catch (erro) {
      console.error(
        "Erro ao editar caixinha:",
        erro.message
      );

      res
        .status(500)
        .json({
          sucesso: false,
          erro:
            erro.message,
        });
    }
  }
);

// ==========================================
// EXCLUIR CAIXINHA
// ==========================================

app.delete(
  "/api/caixinhas/:id",
  exigirAdmin,
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const {
        error:
          erroMovimentacoes,
      } =
        await supabase
          .from(
            "movimentacoes_caixinhas"
          )
          .delete()
          .eq(
            "caixinha_id",
            id
          );

      if (
        erroMovimentacoes
      ) {
        throw erroMovimentacoes;
      }

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "caixinhas"
          )
          .delete()
          .eq(
            "id",
            id
          )
          .select()
          .single();

      if (error) {
        throw error;
      }

      res.json({
        sucesso: true,

        mensagem:
          "Caixinha excluída com sucesso.",

        caixinha:
          data,
      });

    } catch (erro) {
      console.error(
        "Erro ao excluir caixinha:",
        erro.message
      );

      res
        .status(500)
        .json({
          sucesso: false,
          erro:
            erro.message,
        });
    }
  }
);

// ==========================================
// ABRIR O SITE
// ==========================================

app.use(
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);

// ==========================================
// INICIAR SERVIDOR
// ==========================================

app.listen(
  PORT,
  () => {
    console.log("");

    console.log(
      "================================="
    );

    console.log(
      "      MEU APP FINANCEIRO"
    );

    console.log(
      "================================="
    );

    console.log("");

    console.log(
      `Servidor: http://localhost:${PORT}`
    );

    console.log("");

    console.log(
      "Conexão com o Pierre preparada."
    );

    console.log("");
  }
);