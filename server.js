require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY,
);

const app = express();
const PORT = process.env.PORT || 3000;

const PIERRE_API_URL = "https://www.pierre.finance/tools/api";

app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// AUTENTICAÇÃO
// ==========================================

const sessoes = new Map();

const TEMPO_SESSAO = 1000 * 60 * 60 * 24 * 7;

function gerarTokenSessao() {
  return crypto.randomBytes(32).toString("hex");
}

function obterTokenDaRequisicao(req) {
  const autorizacao = req.headers.authorization || "";

  if (autorizacao.startsWith("Bearer ")) {
    return autorizacao.slice(7).trim();
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
      erro: "Usuário não autenticado.",
    };
  }

  const sessao = sessoes.get(token);

  if (!sessao) {
    return {
      autorizado: false,
      erro: "Sessão inválida ou expirada.",
    };
  }

  if (Date.now() > sessao.expiraEm) {
    sessoes.delete(token);

    return {
      autorizado: false,
      erro: "Sessão expirada.",
    };
  }

  try {
    const {
      data: { user },
      error: erroUsuario,
    } = await supabase.auth.getUser(sessao.accessToken);

    if (erroUsuario || !user) {
      sessoes.delete(token);

      return {
        autorizado: false,
        erro: "Usuário não autenticado.",
      };
    }

    const { data: perfil, error: erroPerfil } = await supabase
      .from("perfis")
      .select("id, nome, tipo, ativo")
      .eq("id", user.id)
      .maybeSingle();

    if (erroPerfil) {
      console.error("Erro ao consultar perfil:", erroPerfil.message);

      return {
        autorizado: false,
        erro: "Não foi possível verificar o perfil.",
      };
    }

    if (!perfil) {
      return {
        autorizado: false,
        erro: "Usuário sem perfil autorizado.",
      };
    }

    if (perfil.ativo !== true) {
      return {
        autorizado: false,
        erro: "Este usuário está inativo.",
      };
    }

    const tipoPerfil = String(perfil.tipo || "")
      .trim()
      .toUpperCase();

    if (tipoPerfil !== "ADMIN" && tipoPerfil !== "ADMINISTRADOR") {
      return {
        autorizado: false,
        erro: "Acesso permitido somente para administradores.",
      };
    }

    return {
      autorizado: true,
      user,
      perfil,
    };
  } catch (erro) {
    console.error("Erro ao verificar usuário:", erro.message);

    return {
      autorizado: false,
      erro: "Erro ao validar autenticação.",
    };
  }
}

// ==========================================
// MIDDLEWARE
// ==========================================

async function exigirAdmin(req, res, next) {
  const token = obterTokenDaRequisicao(req);

  const resultado = await verificarUsuarioAdmin(token);

  if (!resultado.autorizado) {
    return res.status(401).json({
      sucesso: false,
      erro: resultado.erro || "Não autorizado.",
    });
  }

  req.usuario = resultado.user;

  req.perfil = resultado.perfil;

  req.tokenSessao = token;

  next();
}

// ==========================================
// LOGIN
// ==========================================

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({
        sucesso: false,
        erro: "E-mail e senha são obrigatórios.",
      });
    }

    const emailNormalizado = String(email).trim().toLowerCase();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailNormalizado,

      password: senha,
    });

    if (error || !data?.user || !data?.session) {
      console.error("ERRO REAL DO SUPABASE:", error?.message || "Sem detalhes");

      console.error("CÓDIGO DO SUPABASE:", error?.code || "Sem código");

      return res.status(401).json({
        sucesso: false,
        erro: "E-mail ou senha inválidos.",
      });
    }

    const { data: perfil, error: erroPerfil } = await supabase
      .from("perfis")
      .select("id, nome, tipo, ativo")
      .eq("id", data.user.id)
      .maybeSingle();

    if (erroPerfil) {
      console.error("Erro ao consultar perfil:", erroPerfil.message);

      await supabase.auth.signOut();

      return res.status(500).json({
        sucesso: false,
        erro: "Erro ao verificar o perfil do usuário.",
      });
    }

    if (!perfil) {
      await supabase.auth.signOut();

      return res.status(403).json({
        sucesso: false,
        erro: "Usuário autenticado, mas sem perfil autorizado.",
      });
    }

    if (perfil.ativo !== true) {
      await supabase.auth.signOut();

      return res.status(403).json({
        sucesso: false,
        erro: "Este usuário está inativo.",
      });
    }

    const tipoPerfil = String(perfil.tipo || "")
      .trim()
      .toUpperCase();

    if (tipoPerfil !== "ADMIN" && tipoPerfil !== "ADMINISTRADOR") {
      await supabase.auth.signOut();

      return res.status(403).json({
        sucesso: false,
        erro: "Acesso permitido somente para administradores.",
      });
    }

    const tokenSessao = gerarTokenSessao();

    sessoes.set(tokenSessao, {
      accessToken: data.session.access_token,

      userId: data.user.id,

      expiraEm: Date.now() + TEMPO_SESSAO,
    });

    res.json({
      sucesso: true,

      mensagem: "Login realizado com sucesso.",

      token: tokenSessao,

      usuario: {
        id: data.user.id,

        email: data.user.email,

        nome: perfil.nome || data.user.email,

        role: perfil.tipo,

        ativo: perfil.ativo,
      },
    });
  } catch (erro) {
    console.error("Erro no login:", erro.message);

    res.status(500).json({
      sucesso: false,
      erro: "Erro interno ao realizar login.",
    });
  }
});

// ==========================================
// VERIFICAR LOGIN
// ==========================================

app.get("/api/auth/me", exigirAdmin, async (req, res) => {
  res.json({
    sucesso: true,

    autenticado: true,

    usuario: {
      id: req.usuario.id,

      email: req.usuario.email,

      nome: req.perfil.nome || req.usuario.email,

      role: req.perfil.tipo,

      ativo: req.perfil.ativo,
    },
  });
});

// ==========================================
// LOGOUT
// ==========================================

app.post("/api/auth/logout", async (req, res) => {
  try {
    const token = obterTokenDaRequisicao(req);

    const sessao = token ? sessoes.get(token) : null;

    if (sessao) {
      sessoes.delete(token);

      try {
        await supabase.auth.signOut({
          scope: "local",
        });
      } catch (erro) {
        console.warn("Aviso ao encerrar sessão do Supabase:", erro.message);
      }
    }

    res.json({
      sucesso: true,

      mensagem: "Sessão encerrada.",
    });
  } catch (erro) {
    console.error("Erro ao fazer logout:", erro.message);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao encerrar sessão.",
    });
  }
});

// ==========================================
// CONEXÃO COM PIERRE
// ==========================================

async function pierreRequest(endpoint, params = {}) {
  if (!process.env.PIERRE_API_KEY) {
    throw new Error("PIERRE_API_KEY não encontrada no arquivo .env");
  }

  const url = new URL(`${PIERRE_API_URL}/${endpoint}`);

  Object.entries(params).forEach(([chave, valor]) => {
    if (valor !== undefined && valor !== null && valor !== "") {
      url.searchParams.set(chave, valor);
    }
  });

  const resposta = await fetch(url, {
    method: "GET",

    headers: {
      Authorization: `Bearer ${process.env.PIERRE_API_KEY}`,
    },
  });

  const dados = await resposta.json();

  if (!resposta.ok) {
    throw new Error(
      dados?.message ||
        dados?.error ||
        `Erro ${resposta.status} na API do Pierre`,
    );
  }

  return dados;
}

// ==========================================
// NORMALIZAR TEXTO
// ==========================================

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// ==========================================
// CONTAS
// ==========================================

app.get("/api/accounts", exigirAdmin, async (req, res) => {
  try {
    const dados = await pierreRequest("get-accounts");

    console.log(
      "CARTAO BRUTO DO PIERRE:",
      dados.data?.find((item) => item.type === "CREDIT"),
    );

    const registros = Array.isArray(dados.data) ? dados.data : [];

    const contasBancarias = registros.filter(
      (conta) => conta.type === "BANK" && conta.itemIsActive !== false,
    );

    const cartoes = registros.filter(
      (conta) => conta.type === "CREDIT" && conta.itemIsActive !== false,
    );

    const investimentos = registros.filter(
      (conta) => conta.type === "INVESTMENT" && conta.itemIsActive !== false,
    );

    const contas = contasBancarias.map((conta) => ({
      id: conta.id,

      nome: conta.customName || conta.name || "Conta bancária",

      banco:
        conta.connectorName || conta.marketingName || "Banco não informado",

      tipo: conta.type,

      subtipo: conta.subtype || "Não informado",

      saldo: Number(conta.balance || 0),

      moeda: conta.currencyCode || "BRL",

      ativa: conta.itemIsActive !== false,
    }));

    const cartoesFormatados = cartoes.map((cartao) => {
      const credito = cartao.creditData || {};

      return {
        id: cartao.id,

        nome: cartao.customName || cartao.name || "Cartão",

        banco:
          cartao.connectorName || cartao.marketingName || "Banco não informado",

        tipo: cartao.type,

        subtipo: cartao.subtype || "CREDIT_CARD",

        saldo: Number(cartao.balance || 0),

        moeda: cartao.currencyCode || "BRL",

        limite: Number(credito.creditLimit || credito.limit || 0),

        limiteDisponivel: Number(
          credito.availableCreditLimit || credito.availableLimit || 0,
        ),

        vencimento: credito.balanceDueDate || null,

        fechamento: credito.balanceCloseDate || null,

        ativa: cartao.itemIsActive !== false,
      };
    });

    const investimentosFormatados = investimentos.map((investimento) => ({
      id: investimento.id,

      nome: investimento.customName || investimento.name || "Investimento",

      banco:
        investimento.connectorName ||
        investimento.marketingName ||
        "Instituição não informada",

      tipo: investimento.type,

      subtipo: investimento.subtype || "Não informado",

      saldo: Number(investimento.balance || 0),

      moeda: investimento.currencyCode || "BRL",
    }));

    const saldoTotalContas = contas.reduce(
      (total, conta) => total + conta.saldo,
      0,
    );

    const limiteTotal = cartoesFormatados.reduce(
      (total, cartao) => total + cartao.limite,
      0,
    );

    const limiteDisponivelTotal = cartoesFormatados.reduce(
      (total, cartao) => total + cartao.limiteDisponivel,
      0,
    );

    const saldoCartoes = cartoesFormatados.reduce(
      (total, cartao) => total + cartao.saldo,
      0,
    );

    const saldoInvestimentos = investimentosFormatados.reduce(
      (total, investimento) => total + investimento.saldo,
      0,
    );

    res.json({
      sucesso: true,

      quantidadeTotal: registros.length,

      contas,

      cartoes: cartoesFormatados,

      investimentos: investimentosFormatados,

      totais: {
        saldoContas: saldoTotalContas,

        saldoCartoes: saldoCartoes,

        limiteCartoes: limiteTotal,

        limiteDisponivel: limiteDisponivelTotal,

        investimentos: saldoInvestimentos,
      },
    });
  } catch (erro) {
    console.error("Erro ao buscar contas:", erro.message);

    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// ==========================================
// FATURAS DOS CARTÕES
// ==========================================

app.get("/api/bills", exigirAdmin, async (req, res) => {
  try {
    const accountId = req.query.accountId || null;

    // ==========================================
    // BUSCAR FATURAS DO PIERRE
    // ==========================================

    const dadosFaturas = await pierreRequest(
      "get-bills",
      accountId ? { accountId } : {},
    );

    let faturas = Array.isArray(dadosFaturas.data) ? dadosFaturas.data : [];

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

    function adicionarUmMes(dataOriginal) {
      const data = new Date(dataOriginal);

      data.setMonth(data.getMonth() + 1);

      return data;
    }

    // ==========================================
    // SE FOI INFORMADO UM CARTÃO ESPECÍFICO
    // ==========================================

    if (accountId) {
      const faturasDoCartao = faturas
        .filter((fatura) => String(fatura.accountId) === String(accountId))
        .sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));

      if (faturasDoCartao.length > 0) {
        const ultimaFatura = faturasDoCartao[0];

        const fechamentoUltima = new Date(ultimaFatura.billClosingDate);

        const vencimentoUltima = new Date(ultimaFatura.dueDate);

        const proximoFechamento = adicionarUmMes(fechamentoUltima);

        const proximoVencimento = adicionarUmMes(vencimentoUltima);

        const existeProxima = faturas.some((fatura) => {
          const fechamento = new Date(fatura.billClosingDate);

          return (
            String(fatura.accountId) === String(accountId) &&
            fechamento.getFullYear() === proximoFechamento.getFullYear() &&
            fechamento.getMonth() === proximoFechamento.getMonth()
          );
        });

        if (!existeProxima) {
          const faturaVirtual = {
            id: `virtual-${accountId}-${proximoVencimento
              .toISOString()
              .slice(0, 10)}`,

            userId: ultimaFatura.userId,

            itemId: ultimaFatura.itemId,

            accountId: accountId,

            billClosingDate: proximoFechamento.toISOString(),

            dueDate: proximoVencimento.toISOString(),

            totalAmount: "0",

            totalAmountCurrencyCode:
              ultimaFatura.totalAmountCurrencyCode || "BRL",

            minimumPaymentAmount: "0",

            status: "OPEN",

            virtual: true,
          };

          faturas.push(faturaVirtual);

          console.log("📅 Fatura virtual criada:", {
            accountId,
            fechamento: proximoFechamento.toISOString(),
            vencimento: proximoVencimento.toISOString(),
          });
        }
      }
    } else {
      // ==========================================
      // SEM ACCOUNT ID:
      // CRIAR PRÓXIMA FATURA PARA CADA CARTÃO
      // ==========================================

      const contasDeCartao = [
        ...new Set(faturas.map((fatura) => fatura.accountId).filter(Boolean)),
      ];

      for (const idCartao of contasDeCartao) {
        const faturasDoCartao = faturas
          .filter((fatura) => String(fatura.accountId) === String(idCartao))
          .sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));

        if (faturasDoCartao.length === 0) {
          continue;
        }

        const ultimaFatura = faturasDoCartao[0];

        if (!ultimaFatura.billClosingDate || !ultimaFatura.dueDate) {
          continue;
        }

        const fechamentoUltima = new Date(ultimaFatura.billClosingDate);

        const vencimentoUltima = new Date(ultimaFatura.dueDate);

        if (
          Number.isNaN(fechamentoUltima.getTime()) ||
          Number.isNaN(vencimentoUltima.getTime())
        ) {
          continue;
        }

        const proximoFechamento = adicionarUmMes(fechamentoUltima);

        const proximoVencimento = adicionarUmMes(vencimentoUltima);

        const existeProxima = faturas.some((fatura) => {
          const fechamento = new Date(fatura.billClosingDate);

          return (
            String(fatura.accountId) === String(idCartao) &&
            fechamento.getFullYear() === proximoFechamento.getFullYear() &&
            fechamento.getMonth() === proximoFechamento.getMonth()
          );
        });

        if (existeProxima) {
          continue;
        }

        const faturaVirtual = {
          id: `virtual-${idCartao}-${proximoVencimento
            .toISOString()
            .slice(0, 10)}`,

          userId: ultimaFatura.userId,

          itemId: ultimaFatura.itemId,

          accountId: idCartao,

          billClosingDate: proximoFechamento.toISOString(),

          dueDate: proximoVencimento.toISOString(),

          totalAmount: "0",

          totalAmountCurrencyCode:
            ultimaFatura.totalAmountCurrencyCode || "BRL",

          minimumPaymentAmount: "0",

          status: "OPEN",

          virtual: true,
        };

        faturas.push(faturaVirtual);

        console.log("📅 Fatura virtual criada:", {
          accountId: idCartao,

          fechamento: proximoFechamento.toISOString(),

          vencimento: proximoVencimento.toISOString(),
        });
      }
    }

    // ==========================================
    // RESUMO DA FATURA ATUAL
    // ==========================================

    const dadosResumo = await pierreRequest(
      "get-bill-summary",
      accountId ? { accountId } : {},
    );

    const resumos = Array.isArray(dadosResumo.data) ? dadosResumo.data : [];

    // ==========================================
    // ORDENAR FATURAS
    // ==========================================

    faturas.sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));

    // ==========================================
    // RETORNAR
    // ==========================================

    res.json({
      sucesso: true,

      faturas,

      resumos,

      quantidade: faturas.length,

      quantidadeResumos: resumos.length,
    });
  } catch (erro) {
    console.error("Erro ao buscar faturas:", erro.message);

    res.status(500).json({
      sucesso: false,

      erro: erro.message,
    });
  }
});

// ==========================================
// TRANSAÇÕES
// ==========================================

app.get("/api/transactions", exigirAdmin, async (req, res) => {
  try {
    const hoje = new Date();

    const tresMesesAtras = new Date(hoje);

    tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3);

    const dataInicio =
      req.query.startDate || tresMesesAtras.toISOString().slice(0, 10);

    const fimBusca =
  new Date(hoje);

fimBusca.setDate(
  fimBusca.getDate() + 1
);

const dataFim =
  req.query.endDate ||
  fimBusca
    .toISOString()
    .slice(0, 10);

    const dados = await pierreRequest("get-transactions", {
      startDate: dataInicio,

      endDate: dataFim,

      format: "raw",
    });

    const transacoes = Array.isArray(dados.data) ? dados.data : [];

    // ==========================================
    // TRANSAÇÃO DE CARTÃO - DEBUG
    // ==========================================

    const transacaoCartao = transacoes.find(
      (transacao) => transacao.credit_card_data !== null,
    );

    console.log(
      "TRANSAÇÃO DE CARTÃO DO PIERRE:",
      JSON.stringify(transacaoCartao, null, 2),
    );

    // ==========================================
    // FORMATAR TRANSAÇÕES
    // ==========================================

    const transacoesFormatadas = transacoes.map((transacao) => ({
      id: transacao.id,

      descricao: transacao.description || "Transação",

      categoria: transacao.category || "Sem categoria",

      valor: Number(transacao.amount || 0),

      data: transacao.date || "",

      tipo:
        transacao.type ||
        (Number(transacao.amount || 0) >= 0 ? "CREDITO" : "DEBITO"),

      status: transacao.status || "",

      conta: transacao.account_name || transacao.accountName || "Conta",

      tipoConta: transacao.account_type || transacao.accountType || "",

      // ==========================================
      // DADOS ORIGINAIS DO CARTÃO
      // ==========================================

      creditCardData: transacao.credit_card_data || null,

      installmentDueDate: transacao.installment_due_date || null,

      originalDescription: transacao.original_description || "",

      merchant: transacao.merchant || null,

      accountId: transacao.account_id || null,

      accountSubtype: transacao.account_subtype || "",
    }));

    res.json({
      sucesso: true,

      quantidade: transacoesFormatadas.length,

      dataInicio,

      dataFim,

      transacoes: transacoesFormatadas,
    });
  } catch (erro) {
    console.error("Erro ao buscar transações:", erro.message);

    res.status(500).json({
      sucesso: false,

      erro: erro.message,
    });
  }
});

// ==========================================
// COMPRAS PARCELADAS - PIERRE
// ==========================================

app.get("/api/installments", exigirAdmin, async (req, res) => {
  try {
    const hoje = new Date();

    const inicio = new Date(hoje);
    inicio.setFullYear(inicio.getFullYear() - 5);

    const fim = new Date(hoje);
    fim.setMonth(fim.getMonth() + 24);

    const dataInicio =
      req.query.startDate ||
      inicio.toISOString().slice(0, 10);

    const dataFim =
      req.query.endDate ||
      fim.toISOString().slice(0, 10);

    // ==========================================
    // BUSCAR PARCELAMENTOS
    // ==========================================

    const dadosPierre = await pierreRequest(
      "get-installments",
      {
        startDate: dataInicio,
        endDate: dataFim,
      },
    );

    const compras = Array.isArray(
      dadosPierre?.data?.purchases,
    )
      ? dadosPierre.data.purchases
      : [];

    // ==========================================
// MESCLAR COMPRAS DUPLICADAS DO PIERRE
// ==========================================

const comprasMescladas = [];

for (const compra of compras) {
  const nomeCompra = String(
    compra.description || "",
  )
    .replace(/\d+\s*\/\s*\d+/g, "")
    .trim()
    .toLowerCase();

  const existente = comprasMescladas.find(
    (item) => {
      const nomeExistente = String(
        item.description || "",
      )
        .replace(/\d+\s*\/\s*\d+/g, "")
        .trim()
        .toLowerCase();

      return (
        String(item.accountId || "") ===
          String(compra.accountId || "") &&
        String(item.purchaseDate || "") ===
          String(compra.purchaseDate || "") &&
        Number(item.totalInstallments || 0) ===
          Number(compra.totalInstallments || 0) &&
        nomeExistente === nomeCompra
      );
    },
  );

  if (!existente) {
    comprasMescladas.push({
      ...compra,
      installments: Array.isArray(
        compra.installments,
      )
        ? [...compra.installments]
        : [],
    });

    continue;
  }

  // ========================================
  // MESCLAR AS PARCELAS
  // ========================================

  const mapaParcelas = new Map();

  const adicionarParcelas = (
    origem,
  ) => {
    if (
      !Array.isArray(
        origem.installments,
      )
    ) {
      return;
    }

    for (const parcela of origem.installments) {
      const numero = Number(
        parcela.installmentNumber || 0,
      );

      if (!numero) {
        continue;
      }

      const atual =
        mapaParcelas.get(numero);

      if (!atual) {
        mapaParcelas.set(
          numero,
          { ...parcela },
        );

        continue;
      }

      // Prefere parcela REAL do banco
      // em vez de parcela projetada.

      const atualProjetada =
        atual.isProjected === true;

      const novaProjetada =
        parcela.isProjected === true;

      if (
        atualProjetada &&
        !novaProjetada
      ) {
        mapaParcelas.set(
          numero,
          { ...parcela },
        );
      }
    }
  };

  adicionarParcelas(existente);
  adicionarParcelas(compra);

  existente.installments =
    Array.from(
      mapaParcelas.values(),
    ).sort(
      (a, b) =>
        Number(
          a.installmentNumber || 0,
        ) -
        Number(
          b.installmentNumber || 0,
        ),
    );

  // Usa o maior total informado
  existente.totalInstallments =
    Math.max(
      Number(
        existente.totalInstallments || 0,
      ),
      Number(
        compra.totalInstallments || 0,
      ),
    );

  // Mantém o maior valor pago
  existente.amountPaid =
    Math.max(
      Number(
        existente.amountPaid || 0,
      ),
      Number(
        compra.amountPaid || 0,
      ),
    );

  existente.amountRemaining =
    existente.installments
      .filter(
        (parcela) =>
          !parcela.isPaid,
      )
      .reduce(
        (total, parcela) =>
          total +
          Number(
            parcela.amount || 0,
          ),
        0,
      );

  // Se existir uma parcela real com
  // valor diferente, usa o valor dela.
  const primeiraReal =
    existente.installments.find(
      (parcela) =>
        parcela.isProjected !== true,
    );

  if (primeiraReal) {
    existente.installmentValue =
      Number(
        primeiraReal.amount || 0,
      );
  }
}  

    // ==========================================
    // BUSCAR TRANSAÇÕES
    // ==========================================

    let transacoes = [];

    try {
      const dadosTransacoes =
        await pierreRequest(
          "get-transactions",
          {
            startDate: dataInicio,
            endDate: dataFim,
            format: "raw",
          },
        );

      transacoes = Array.isArray(
        dadosTransacoes?.data,
      )
        ? dadosTransacoes.data
        : [];
    } catch (erro) {
      console.warn(
        "Aviso ao buscar transações para parcelamentos:",
        erro.message,
      );
    }

    // ==========================================
    // BUSCAR CARTÕES
    // ==========================================

    const dadosContas =
      await pierreRequest("get-accounts");

    const registros = Array.isArray(
      dadosContas?.data,
    )
      ? dadosContas.data
      : [];

    const cartoes = registros.filter(
      (conta) =>
        conta.type === "CREDIT" &&
        conta.itemIsActive !== false,
    );

    const mapaCartoes = new Map();

    cartoes.forEach((cartao) => {
      mapaCartoes.set(
        String(cartao.id),
        {
          id: cartao.id,

          nome:
            cartao.customName ||
            cartao.name ||
            "Cartão",

          banco:
            cartao.connectorName ||
            cartao.marketingName ||
            "Banco não informado",
        },
      );
    });

    // ==========================================
    // NORMALIZAR DESCRIÇÃO
    // ==========================================

    function normalizarDescricao(valor) {
      return String(valor || "")
        .normalize("NFD")
        .replace(
          /[\u0300-\u036f]/g,
          "",
        )
        .replace(
          /\d+\s*\/\s*\d+/g,
          "",
        )
        .replace(
          /[^a-zA-Z0-9]+/g,
          " ",
        )
        .toLowerCase()
        .trim();
    }

    // ==========================================
    // ENCONTRAR TRANSAÇÕES DA COMPRA
    // ==========================================

   function encontrarTransacoes(compra, descricao) {
  const base =
    normalizarDescricao(descricao);

  if (!base) {
    return [];
  }

  const accountIdCompra =
    compra.accountId ||
    compra.account_id ||
    null;

  return transacoes
    .filter((transacao) => {
      const accountIdTransacao =
        transacao.account_id ||
        transacao.accountId ||
        null;

      // ==========================================
      // PRIMEIRO: MESMO CARTÃO/CONTA
      // ==========================================

      if (
        accountIdCompra &&
        accountIdTransacao &&
        String(accountIdCompra) !==
          String(accountIdTransacao)
      ) {
        return false;
      }

      // ==========================================
      // DEPOIS: DESCRIÇÃO
      // ==========================================

      const descricaoTransacao =
        normalizarDescricao(
          transacao.description,
        );

      if (!descricaoTransacao) {
        return false;
      }

      return (
        descricaoTransacao.includes(base) ||
        base.includes(descricaoTransacao)
      );
    })
    .sort((a, b) => {
      const aParcela =
        String(
          a.description || "",
        ).match(
          /(\d+)\s*\/\s*(\d+)/,
        );

      const bParcela =
        String(
          b.description || "",
        ).match(
          /(\d+)\s*\/\s*(\d+)/,
        );

      const numeroA = aParcela
        ? Number(aParcela[1])
        : 9999;

      const numeroB = bParcela
        ? Number(bParcela[1])
        : 9999;

      return numeroA - numeroB;
    });
}

    // ==========================================
    // ADICIONAR MESES
    // ==========================================

    function adicionarMeses(
      dataOriginal,
      quantidade,
    ) {
      if (!dataOriginal) {
        return null;
      }

      const data = new Date(
        dataOriginal,
      );

      data.setMonth(
        data.getMonth() +
          quantidade,
      );

      return data
        .toISOString()
        .slice(0, 10);
    }

    // ==========================================
    // FORMATAR COMPRAS
    // ==========================================

    const comprasFormatadas =
  comprasMescladas.map((compra) => {
        let parcelas =
          Array.isArray(
            compra.installments,
          )
            ? compra.installments
                .map((parcela) => ({
                  descricao:
                    parcela.description ||
                    "Parcela",

                  valor: Number(
                    parcela.amount ||
                      0,
                  ),

                  parcelaAtual:
                    Number(
                      parcela.installmentNumber ||
                        0,
                    ),

                  totalParcelas:
                    Number(
                      parcela.totalInstallments ||
                        0,
                    ),

                  vencimento:
                    parcela.dueDate ||
                    null,

                  status:
                    String(
                      parcela.status ||
                        "PENDING",
                    ).toUpperCase(),

                  categoria:
                    parcela.category ||
                    null,

                  accountId:
                    parcela.accountId ||
                    parcela.account_id ||
                    null,
                }))
                .filter(
                  (parcela) =>
                    parcela.parcelaAtual >
                      0 &&
                    parcela.totalParcelas >
                      0,
                )
            : [];

        parcelas.sort(
          (a, b) =>
            a.parcelaAtual -
            b.parcelaAtual,
        );

        // ======================================
        // NOME DA COMPRA
        // ======================================

        const nomeCompra =
          String(
            parcelas[0]?.descricao ||
              compra.description ||
              compra.name ||
              "Compra parcelada",
          )
            .replace(
              /\d+\s*\/\s*\d+/g,
              "",
            )
            .replace(
              /^[-–—:|]+/,
              "",
            )
            .trim();

        // ======================================
        // TRANSAÇÕES RELACIONADAS
        // ======================================

        const transacoesRelacionadas =
          encontrarTransacoes(
            compra,
            nomeCompra,
          );

        // ======================================
        // DESCOBRIR CARTÃO
        // ======================================

        let cartaoId =
          compra.accountId ||
          compra.account_id ||
          parcelas.find(
            (parcela) =>
              parcela.accountId,
          )?.accountId ||
          parcelas.find(
            (parcela) =>
              parcela.accountId,
          )?.account_id ||
          null;

        let transacaoParcela1 =
          transacoesRelacionadas.find(
            (transacao) =>
              /1\s*\/\s*\d+/.test(
                String(
                  transacao.description ||
                    "",
                ),
              ),
          );

        if (
          !transacaoParcela1 &&
          transacoesRelacionadas.length
        ) {
          transacaoParcela1 =
            transacoesRelacionadas[0];
        }

        if (
          !cartaoId &&
          transacaoParcela1
        ) {
          cartaoId =
            transacaoParcela1.account_id ||
            transacaoParcela1.accountId ||
            null;
        }

        const cartao =
          cartaoId
            ? mapaCartoes.get(
                String(cartaoId),
              )
            : null;

        // ======================================
        // CORRIGIR PARCELAMENTO INCOMPLETO
        // ======================================

        const primeiraTransacao =
          transacaoParcela1;

        const matchParcela =
          String(
            primeiraTransacao?.description ||
              "",
          ).match(
            /(\d+)\s*\/\s*(\d+)/,
          );

        const numeroPrimeiraParcela =
          matchParcela
            ? Number(
                matchParcela[1],
              )
            : null;

        const totalParcelasDaTransacao =
          matchParcela
            ? Number(
                matchParcela[2],
              )
            : 0;

        const valorPrimeiraTransacao =
          primeiraTransacao
            ? Math.abs(
                Number(
                  primeiraTransacao.amount ||
                    0,
                ),
              )
            : 0;

      

      // ==========================================
// CORRIGIR PARCELAMENTO INCOMPLETO
// ==========================================

const transacoesParceladas = transacoesRelacionadas
  .map((transacao) => {
    const match = String(
      transacao.description || "",
    ).match(/(\d+)\s*\/\s*(\d+)/);

    if (!match) {
      return null;
    }

    return {
      transacao,
      parcela: Number(match[1]),
      total: Number(match[2]),
      valor: Math.abs(
        Number(transacao.amount || 0),
      ),
    };
  })
  .filter(Boolean);

// ==========================================
// VALORES REAIS DAS TRANSAÇÕES
// ==========================================

const parcelasComValoresReais = [];

for (const parcela of parcelas) {
  const numeroParcela = Number(
    parcela.parcelaAtual || 0,
  );

  const transacaoCorrespondente =
    transacoesParceladas.find(
      (item) =>
        item.parcela === numeroParcela,
    );

  if (
    transacaoCorrespondente &&
    transacaoCorrespondente.valor > 0
  ) {
    parcelasComValoresReais.push({
      ...parcela,
      valor:
        transacaoCorrespondente.valor,
      vencimento:
        transacaoCorrespondente.transacao.date ||
        parcela.vencimento,
      status: String(
        transacaoCorrespondente.transacao.status ||
          parcela.status ||
          "PENDING",
      ).toUpperCase(),
    });
  } else {
    parcelasComValoresReais.push(parcela);
  }
}

// ==========================================
// ADICIONAR PARCELAS QUE O PIERRE NÃO ENVIOU
// ==========================================

if (
  totalParcelasDaTransacao > 0 &&
  parcelasComValoresReais.length <
    totalParcelasDaTransacao
) {
  const vencimentoInicial =
    parcelasComValoresReais[0]?.vencimento ||
    compra.purchaseDate ||
    hoje.toISOString().slice(0, 10);

  for (
    let i = 1;
    i <= totalParcelasDaTransacao;
    i++
  ) {
    const jaExiste =
      parcelasComValoresReais.some(
        (parcela) =>
          Number(parcela.parcelaAtual) === i,
      );

    if (jaExiste) {
      continue;
    }

    const transacaoDaParcela =
      transacoesParceladas.find(
        (item) => item.parcela === i,
      );

    // Só adiciona se existir uma transação REAL
    if (
      !transacaoDaParcela ||
      transacaoDaParcela.valor <= 0
    ) {
      continue;
    }

    parcelasComValoresReais.push({
      descricao: nomeCompra,

      valor:
        transacaoDaParcela.valor,

      parcelaAtual: i,

      totalParcelas:
        totalParcelasDaTransacao,

      vencimento:
        transacaoDaParcela.transacao.date ||
        adicionarMeses(
          vencimentoInicial,
          i - 1,
        ),

      status: String(
        transacaoDaParcela.transacao.status ||
          "PENDING",
      ).toUpperCase(),

      categoria:
        parcelas[0]?.categoria ||
        null,

      accountId:
        transacaoDaParcela.transacao.account_id ||
        transacaoDaParcela.transacao.accountId ||
        null,
    });
  }
}

// ==========================================
// ORDENAR PARCELAS
// ==========================================

parcelasComValoresReais.sort(
  (a, b) =>
    Number(a.parcelaAtual) -
    Number(b.parcelaAtual),
);

parcelas = parcelasComValoresReais;
         

        // ======================================
        // TOTAL DE PARCELAS
        // ======================================

        const totalParcelas =
          Math.max(
            Number(
              compra.totalParcelas ||
                0,
            ),
            ...parcelas.map(
              (parcela) =>
                Number(
                  parcela.totalParcelas ||
                    0,
                ),
            ),
            totalParcelasDaTransacao,
          );

        // ======================================
        // TOTAL DA COMPRA
        // ======================================

        const valorTotal =
          parcelas.reduce(
            (total, parcela) =>
              total +
              Math.abs(
                Number(
                  parcela.valor ||
                    0,
                ),
              ),
            0,
          ) ||
          Number(
            compra.totalAmount ||
              0,
          );

        // ======================================
        // DATA DA COMPRA
        // ======================================

        const dataCompra =
          compra.purchaseDate ||
          primeiraTransacao?.date ||
          null;

        return {
          id:
            compra.id ||
            `${normalizarDescricao(
              nomeCompra,
            )}-${dataCompra || ""}`,

          nome:
            nomeCompra,

          descricao:
            nomeCompra,

          dataCompra,

          valorTotal,

          cartaoId:
            cartao?.id ||
            cartaoId ||
            "",

          cartaoNome:
            cartao?.nome ||
            "Cartão",

          banco:
            cartao?.banco ||
            primeiraTransacao?.account_name ||
            "",

          parcelas,

          totalParcelas,

          categoria:
            parcelas[0]?.categoria ||
            null,
        };
      });

    // ==========================================
// REMOVER DUPLICAÇÕES DE COMPRAS
// ==========================================

function comprasSaoDuplicadas(compraA, compraB) {
  // Mesmo cartão
  if (
    String(compraA.cartaoId || "") !==
    String(compraB.cartaoId || "")
  ) {
    return false;
  }

  // Mesma quantidade de parcelas
  if (
    Number(compraA.totalParcelas || 0) !==
    Number(compraB.totalParcelas || 0)
  ) {
    return false;
  }

  // Nome normalizado
  const nomeA = normalizarDescricao(
    compraA.nome,
  );

  const nomeB = normalizarDescricao(
    compraB.nome,
  );

  const nomesParecidos =
    nomeA === nomeB ||
    nomeA.includes(nomeB) ||
    nomeB.includes(nomeA);

  if (!nomesParecidos) {
    return false;
  }

  // Primeiras parcelas
  const primeiraA =
    compraA.parcelas?.[0];

  const primeiraB =
    compraB.parcelas?.[0];

  if (!primeiraA || !primeiraB) {
    return false;
  }

  // Mesmo número da parcela inicial
  if (
    Number(primeiraA.parcelaAtual || 0) !==
    Number(primeiraB.parcelaAtual || 0)
  ) {
    return false;
  }

  // Mesmo vencimento da primeira parcela
  const vencimentoA =
    String(
      primeiraA.vencimento || "",
    ).slice(0, 10);

  const vencimentoB =
    String(
      primeiraB.vencimento || "",
    ).slice(0, 10);

  if (
    vencimentoA &&
    vencimentoB &&
    vencimentoA !== vencimentoB
  ) {
    return false;
  }

  // Diferença pequena de valor
  const valorA = Number(
    compraA.valorTotal || 0,
  );

  const valorB = Number(
    compraB.valorTotal || 0,
  );

  const diferenca = Math.abs(
    valorA - valorB,
  );

  // Diferença máxima de R$ 5,00
  if (diferenca > 5) {
    return false;
  }

  return true;
}

const comprasSemDuplicacao = [];

for (
  const compra of comprasFormatadas
) {
  const duplicada =
    comprasSemDuplicacao.find(
      (existente) =>
        comprasSaoDuplicadas(
          compra,
          existente,
        ),
    );

  if (duplicada) {
    console.log(
      "🗑️ COMPRA DUPLICADA REMOVIDA:",
      compra.nome,
      "→ R$",
      compra.valorTotal,
    );

    continue;
  }

  comprasSemDuplicacao.push(
    compra,
  );
}

    // ==========================================
    // DEBUG AEROVIAS
    // ==========================================

    const aerovias =
      comprasSemDuplicacao.filter(
        (compra) =>
          normalizarDescricao(
            compra.nome,
          ).includes(
            "aerovias",
          ),
      );

    if (aerovias.length) {
      console.log(
        "==========================================",
      );

      console.log(
        "✈️ AEROVIAS CORRIGIDA:",
        JSON.stringify(
          aerovias,
          null,
          2,
        ),
      );

      console.log(
        "==========================================",
      );
    }

    res.json({
      sucesso: true,

      dataInicio,

      dataFim,

      quantidade:
        comprasSemDuplicacao.length,

      compras:
        comprasSemDuplicacao,

      resumo:
        dadosPierre?.data?.summary ||
        null,
    });
  } catch (erro) {
    console.error(
      "Erro ao buscar parcelamentos do Pierre:",
      erro.message,
    );

    res.status(500).json({
      sucesso: false,

      erro:
        erro.message ||
        "Erro ao buscar parcelamentos",
    });
  }
});

app.get("/api/debug/transacoes", exigirAdmin, async (req, res) => {
  try {
    const hoje = new Date();

    const tresMesesAtras = new Date(hoje);

    tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3);

    const dados = await pierreRequest("get-transactions", {
      startDate: tresMesesAtras.toISOString().slice(0, 10),

     endDate:
  new Date(
    hoje.getTime() +
      24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10),

      format: "raw",
    });

    res.json({
      sucesso: true,

      quantidade: Array.isArray(dados.data) ? dados.data.length : 0,

      transacoes: Array.isArray(dados.data) ? dados.data : [],
    });
  } catch (erro) {
    console.error("Erro ao buscar transações brutas:", erro.message);

    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// ==========================================
// HEALTH
// ==========================================

app.get("/api/health", async (req, res) => {
  try {
    const dados = await pierreRequest("get-accounts");

    res.json({
      conectado: true,

      registros: Array.isArray(dados.data) ? dados.data.length : 0,
    });
  } catch (erro) {
    res.status(500).json({
      conectado: false,
      erro: erro.message,
    });
  }
});

// ==========================================
// CAIXINHAS - BUSCAR
// ==========================================

app.get("/api/caixinhas", exigirAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("caixinhas")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      throw error;
    }

    res.json({
      sucesso: true,
      caixinhas: data,
    });
  } catch (erro) {
    console.error("Erro ao buscar caixinhas:", erro.message);

    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// ==========================================
// CAIXINHAS - CRIAR
// ==========================================

app.post("/api/caixinhas", exigirAdmin, async (req, res) => {
  try {
    const { nome, meta, saldo, descricao } = req.body;

    if (!nome || nome.trim() === "") {
      return res.status(400).json({
        sucesso: false,
        erro: "O nome da caixinha é obrigatório.",
      });
    }

    const metaNumerica = Number(meta);

    const saldoNumerico = Number(saldo) || 0;

    if (!Number.isFinite(metaNumerica) || metaNumerica <= 0) {
      return res.status(400).json({
        sucesso: false,
        erro: "A meta deve ser maior que zero.",
      });
    }

    if (!Number.isFinite(saldoNumerico) || saldoNumerico < 0) {
      return res.status(400).json({
        sucesso: false,
        erro: "O saldo inicial não pode ser negativo.",
      });
    }

    const { data, error } = await supabase
      .from("caixinhas")
      .insert([
        {
          nome: nome.trim(),

          meta: metaNumerica,

          saldo: saldoNumerico,

          descricao: descricao?.trim() || null,
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json({
      sucesso: true,

      mensagem: "Caixinha criada com sucesso.",

      caixinha: data,
    });
  } catch (erro) {
    console.error("Erro ao criar caixinha:", erro.message);

    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// ==========================================
// MOVIMENTAÇÕES DAS CAIXINHAS
// ==========================================

app.post("/api/caixinhas/:id/movimentacoes", exigirAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { tipo, valor, descricao } = req.body;

    if (!tipo || !valor) {
      return res.status(400).json({
        sucesso: false,
        erro: "Tipo e valor são obrigatórios.",
      });
    }

    const tiposPermitidos = [
  "ENTRADA",
  "SAIDA",
  "RENDIMENTO",
];

    if (!tiposPermitidos.includes(tipo)) {
      return res.status(400).json({
        sucesso: false,
        erro: "Tipo de movimentação inválido. Use ENTRADA, SAIDA ou RENDIMENTO.",
      });
    }

    const valorNumerico = Number(valor);

    if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
      return res.status(400).json({
        sucesso: false,
        erro: "O valor deve ser maior que zero.",
      });
    }

    const { data: caixinha, error: erroCaixinha } = await supabase
      .from("caixinhas")
      .select("id, saldo")
      .eq("id", id)
      .single();

    if (erroCaixinha) {
      return res.status(404).json({
        sucesso: false,
        erro: "Caixinha não encontrada.",
      });
    }

    const saldoAtual = Number(caixinha.saldo || 0);

    let novoSaldo;

    if (
  tipo === "ENTRADA" ||
  tipo === "RENDIMENTO"
) {
  novoSaldo =
    saldoAtual + valorNumerico;
} else {
  novoSaldo =
    saldoAtual - valorNumerico;
}

    if (novoSaldo < 0) {
      return res.status(400).json({
        sucesso: false,
        erro: "A caixinha não possui saldo suficiente para essa saída.",
      });
    }

    const { data, error } = await supabase
      .from("movimentacoes_caixinhas")
      .insert([
        {
          caixinha_id: caixinha.id,

          tipo,

          valor: valorNumerico,

          descricao: descricao?.trim() || null,
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    const { data: caixinhaAtualizada, error: erroAtualizacao } = await supabase
      .from("caixinhas")
      .update({
        saldo: novoSaldo,

        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (erroAtualizacao) {
      throw erroAtualizacao;
    }

    res.status(201).json({
      sucesso: true,

      mensagem: "Movimentação registrada com sucesso.",

      movimentacao: data,

      caixinha: caixinhaAtualizada,
    });
  } catch (erro) {
    console.error("Erro ao movimentar caixinha:", erro.message);

    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// ==========================================
// SINCRONIZAR CAIXINHAS COM O PIERRE
// ==========================================

app.post("/api/caixinhas/sincronizar", exigirAdmin, async (req, res) => {
  try {
    console.log("🔄 Iniciando sincronização das caixinhas...");

    const { data: caixinhas, error: erroCaixinhas } = await supabase
      .from("caixinhas")
      .select("id, nome, saldo");

    if (erroCaixinhas) {
      throw erroCaixinhas;
    }

    if (!caixinhas || caixinhas.length === 0) {
      return res.json({
        sucesso: true,

        mensagem: "Nenhuma caixinha cadastrada para sincronizar.",

        sincronizadas: [],

        ignoradas: [],
      });
    }

    console.log(`📦 ${caixinhas.length} caixinhas encontradas.`);

    let { data: controleSincronizacao, error: erroControle } = await supabase
      .from("sincronizacoes")
      .select("id, ultima_sincronizacao")
      .eq("id", 1)
      .maybeSingle();

    if (erroControle) {
      throw erroControle;
    }

    if (!controleSincronizacao) {
      const { data: novoControle, error: erroCriarControle } = await supabase
        .from("sincronizacoes")
        .insert([
          {
            id: 1,

            ultima_sincronizacao: null,
          },
        ])
        .select()
        .single();

      if (erroCriarControle) {
        throw erroCriarControle;
      }

      controleSincronizacao = novoControle;
    }

    const agora = new Date();

    const dataInicio = new Date(agora);

    dataInicio.setDate(dataInicio.getDate() - 3);

    console.log(
      "🔄 Buscando movimentações dos últimos 3 dias para identificar novidades.",
    );

    const dataInicioFormatada = dataInicio.toISOString().slice(0, 10);

    const dataFim = new Date(agora);

dataFim.setDate(dataFim.getDate() + 1);

const dataFimFormatada = dataFim
  .toISOString()
  .slice(0, 10);

    console.log("📅 Período:", dataInicioFormatada, "até", dataFimFormatada);

    const respostaPierre = await pierreRequest("get-transactions", {
      startDate: dataInicioFormatada,

      endDate: dataFimFormatada,

      format: "raw",
    });

    const transacoes = Array.isArray(respostaPierre?.data)
      ? respostaPierre.data
      : [];

    console.log(`📊 ${transacoes.length} transações encontradas.`);

    const sincronizadas = [];

    const ignoradas = [];

    for (const transacao of transacoes) {
      const transacaoId =
        transacao.id || transacao.transaction_id || transacao.transactionId;

      const descricao = String(
        transacao.description || transacao.descricao || "",
      ).trim();

      const tipoPierre = String(transacao.type || "")
        .trim()
        .toUpperCase();

      const valorOriginal = Number(transacao.amount);

      if (!transacaoId) {
        ignoradas.push({
          motivo: "Transação sem ID.",

          descricao,
        });

        continue;
      }

      if (!descricao) {
        ignoradas.push({
          transacao_id: transacaoId,

          motivo: "Transação sem descrição.",
        });

        continue;
      }

      if (!Number.isFinite(valorOriginal) || valorOriginal === 0) {
        ignoradas.push({
          transacao_id: transacaoId,

          descricao,

          motivo: "Valor inválido ou igual a zero.",
        });

        continue;
      }

      const descricaoNormalizada = normalizarTexto(descricao);

      // ==========================================
      // RENDIMENTOS SÃO MANUAIS
      // ==========================================

      if (descricaoNormalizada.includes("rendimento")) {
        ignoradas.push({
          transacao_id: transacaoId,

          descricao,

          valor: valorOriginal,

          tipoPierre,

          motivo:
            "Rendimento ignorado: os rendimentos são adicionados manualmente no app.",
        });

        console.log("📈 Rendimento ignorado:", descricao, valorOriginal);

        continue;
      }

      // ==========================================
      // IDENTIFICAR MOVIMENTAÇÃO AUTOMÁTICA
      // ==========================================

      const ehReserva =
  descricaoNormalizada.includes(
    "reserva por gastos"
  ) ||
  descricaoNormalizada.includes(
    "dinheiro reservado"
  );

const ehRetirada =
  descricaoNormalizada.includes(
    "dinheiro retirado"
  );

      if (!ehReserva && !ehRetirada) {
        ignoradas.push({
          transacao_id: transacaoId,

          descricao,

          valor: valorOriginal,

          tipoPierre,

          motivo:
            "Transação não identificada como reserva ou retirada de caixinha.",
        });

        continue;
      }

      // ==========================================
      // EVITAR DUPLICAÇÃO
      // ==========================================

      const { data: movimentacaoExistente, error: erroMovimentacaoExistente } =
        await supabase
          .from("movimentacoes_caixinhas")
          .select("id")
          .eq("transacao_pierre_id", String(transacaoId))
          .maybeSingle();

      if (erroMovimentacaoExistente) {
        throw erroMovimentacaoExistente;
      }

     if (movimentacaoExistente) {
  console.log(
    "ℹ️ Transação já sincronizada:",
    descricao,
    transacaoId
  );

  ignoradas.push({
    transacao_id: transacaoId,

    descricao,

    motivo:
      "Transação já sincronizada anteriormente. Nenhuma duplicação criada.",
  });

  continue;
}

      // ==========================================
      // ENCONTRAR CAIXINHA
      // ==========================================

      const caixinhaEncontrada = caixinhas.find((caixinha) => {
        const nomeCaixinha = normalizarTexto(caixinha.nome);

        if (!nomeCaixinha) {
          return false;
        }

        return (
          descricaoNormalizada.includes(nomeCaixinha) ||
          nomeCaixinha.includes(descricaoNormalizada)
        );
      });

      if (!caixinhaEncontrada) {
        ignoradas.push({
          transacao_id: transacaoId,

          descricao,

          valor: valorOriginal,

          tipoPierre,

          motivo:
            "Movimentação de caixinha encontrada, mas nenhuma caixinha compatível foi localizada na descrição.",
        });

        console.log("⚠️ Caixinha não encontrada:", descricao);

        continue;
      }

      console.log(
        "📦 Caixinha encontrada:",
        caixinhaEncontrada.nome,
        "<-",
        descricao,
      );

      // ==========================================
      // TIPO DA MOVIMENTAÇÃO
      // ==========================================

      let tipoMovimentacao;

      if (tipoPierre === "DEBIT") {
        tipoMovimentacao = "ENTRADA";
      } else if (tipoPierre === "CREDIT") {
        tipoMovimentacao = "SAIDA";
      } else {
        ignoradas.push({
          transacao_id: transacaoId,

          descricao,

          tipoPierre,

          motivo: `Tipo do Pierre não reconhecido: ${tipoPierre}`,
        });

        continue;
      }

      const valor = Math.abs(valorOriginal);

      const saldoAtual = Number(caixinhaEncontrada.saldo || 0);

      let novoSaldo;

      if (tipoMovimentacao === "ENTRADA") {
        novoSaldo = saldoAtual + valor;
      } else {
        novoSaldo = saldoAtual - valor;
      }

      if (novoSaldo < 0) {
        ignoradas.push({
          transacao_id: transacaoId,

          caixinha: caixinhaEncontrada.nome,

          descricao,

          valor,

          motivo: "A saída deixaria o saldo da caixinha negativo.",
        });

        continue;
      }

      console.log("➡️ TENTANDO SINCRONIZAR:", {
        caixinha: caixinhaEncontrada.nome,

        

        tipo: tipoMovimentacao,

        valor,

        transacaoId,

        descricao,
      });

      console.log(
  "🔎 TESTE SALÁRIOS:",
  {
    transacaoId,
    descricao,
    valorOriginal,
    tipoPierre,
  }
);

      const { data: movimentacao, error: erroInsercao } = await supabase
        .from("movimentacoes_caixinhas")
        .insert([
          {
            caixinha_id: caixinhaEncontrada.id,

            tipo: tipoMovimentacao,

            valor,

            descricao: `Pierre: ${descricao}`,

            transacao_pierre_id: String(transacaoId),
          },
        ])
        .select()
        .single();

      if (erroInsercao) {
        if (erroInsercao.code === "23505") {
          ignoradas.push({
            transacao_id: transacaoId,

            descricao,

            motivo: "Transação já existente no banco.",
          });

          continue;
        }

        throw erroInsercao;
      }

      const { data: caixinhaAtualizada, error: erroAtualizacao } =
        await supabase
          .from("caixinhas")
          .update({
            saldo: novoSaldo,

            updated_at: new Date().toISOString(),
          })
          .eq("id", caixinhaEncontrada.id)
          .select()
          .single();

      if (erroAtualizacao) {
        throw erroAtualizacao;
      }

      caixinhaEncontrada.saldo = Number(caixinhaAtualizada.saldo || 0);

      sincronizadas.push({
        transacao_id: transacaoId,

        caixinha: caixinhaEncontrada.nome,

        tipo: tipoMovimentacao,

        valor,

        saldoAnterior: saldoAtual,

        saldoAtual: caixinhaEncontrada.saldo,

        descricao,
      });
    }

    // ==========================================
    // SALVAR ÚLTIMA SINCRONIZAÇÃO
    // ==========================================

    const { error: erroSalvarSincronizacao } = await supabase
      .from("sincronizacoes")
      .update({
        ultima_sincronizacao: agora.toISOString(),
      })
      .eq("id", 1);

    if (erroSalvarSincronizacao) {
      throw erroSalvarSincronizacao;
    }

    console.log(`✅ ${sincronizadas.length} movimentações sincronizadas.`);

    console.log(`⚠️ ${ignoradas.length} movimentações ignoradas.`);

    console.log(
  "📋 MOTIVOS DAS MOVIMENTAÇÕES IGNORADAS:"
);

ignoradas.forEach((item) => {
  console.log(
    "⚠️",
    item.descricao,
    "→",
    item.motivo
  );
});

    res.json({
      sucesso: true,

      mensagem: "Sincronização concluída.",

      periodoBusca: {
        inicio: dataInicioFormatada,

        fim: dataFimFormatada,
      },

      totalEncontradas: transacoes.length,

      totalSincronizadas: sincronizadas.length,

      totalIgnoradas: ignoradas.length,

      sincronizadas,

      ignoradas,

      ultima_sincronizacao: agora.toISOString(),
    });
  } catch (erro) {
    console.error("❌ Erro ao sincronizar caixinhas:", erro.message);

    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// ==========================================
// ADICIONAR RENDIMENTO À CAIXINHA
// ==========================================

app.post("/api/caixinhas/:id/rendimento", exigirAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { valor, descricao } = req.body;

    const valorNumerico = Number(valor);

    if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
      return res.status(400).json({
        sucesso: false,

        erro: "O valor do rendimento deve ser maior que zero.",
      });
    }

    const { data: caixinha, error: erroCaixinha } = await supabase
      .from("caixinhas")
      .select("id, nome, saldo")
      .eq("id", id)
      .single();

    if (erroCaixinha || !caixinha) {
      return res.status(404).json({
        sucesso: false,

        erro: "Caixinha não encontrada.",
      });
    }

    const { data: rendimento, error: erroRendimento } = await supabase
      .from("rendimentos_caixinhas")
      .insert([
        {
          caixinha_id: id,

          valor: valorNumerico,

          descricao: descricao?.trim() || "Rendimento",
        },
      ])
      .select()
      .single();

    if (erroRendimento) {
      throw erroRendimento;
    }

    const saldoAtual = Number(caixinha.saldo) || 0;

    const novoSaldo = saldoAtual + valorNumerico;

    const { data: caixinhaAtualizada, error: erroAtualizacao } = await supabase
      .from("caixinhas")
      .update({
        saldo: novoSaldo,

        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (erroAtualizacao) {
      throw erroAtualizacao;
    }

    res.json({
      sucesso: true,

      mensagem: "Rendimento adicionado com sucesso.",

      rendimento,

      caixinha: caixinhaAtualizada,
    });
  } catch (erro) {
    console.error("Erro ao adicionar rendimento:", erro.message);

    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// ==========================================
// EDITAR CAIXINHA
// ==========================================

app.put("/api/caixinhas/:id", exigirAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { nome, meta, descricao } = req.body;

    if (!nome || meta === undefined) {
      return res.status(400).json({
        sucesso: false,

        erro: "Nome e meta são obrigatórios.",
      });
    }

    const metaNumerica = Number(meta);

    if (!Number.isFinite(metaNumerica) || metaNumerica <= 0) {
      return res.status(400).json({
        sucesso: false,

        erro: "A meta deve ser maior que zero.",
      });
    }

    const { data, error } = await supabase
      .from("caixinhas")
      .update({
        nome: nome.trim(),

        meta: metaNumerica,

        descricao: descricao?.trim() || null,

        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      sucesso: true,

      mensagem: "Caixinha atualizada com sucesso.",

      caixinha: data,
    });
  } catch (erro) {
    console.error("Erro ao editar caixinha:", erro.message);

    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// ==========================================
// EXCLUIR CAIXINHA
// ==========================================

app.delete("/api/caixinhas/:id", exigirAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { error: erroMovimentacoes } = await supabase
      .from("movimentacoes_caixinhas")
      .delete()
      .eq("caixinha_id", id);

    if (erroMovimentacoes) {
      throw erroMovimentacoes;
    }

    const { data, error } = await supabase
      .from("caixinhas")
      .delete()
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      sucesso: true,

      mensagem: "Caixinha excluída com sucesso.",

      caixinha: data,
    });
  } catch (erro) {
    console.error("Erro ao excluir caixinha:", erro.message);

    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// ==========================================
// DASHBOARD DA CAIXINHA
// ==========================================

app.get("/api/caixinhas/:id/dashboard", exigirAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // ==========================================
    // BUSCAR CAIXINHA
    // ==========================================

    const { data: caixinha, error: erroCaixinha } = await supabase
      .from("caixinhas")
      .select("id, nome, descricao, saldo, meta, created_at, updated_at")
      .eq("id", id)
      .single();

    if (erroCaixinha || !caixinha) {
      return res.status(404).json({
        sucesso: false,
        erro: "Caixinha não encontrada.",
      });
    }

    // ==========================================
    // BUSCAR MOVIMENTAÇÕES
    // ==========================================

    const {
      data: movimentacoes,
      error: erroMovimentacoes,
    } = await supabase
      .from("movimentacoes_caixinhas")
      .select(
        "id, caixinha_id, tipo, valor, descricao, transacao_pierre_id, created_at",
      )
      .eq("caixinha_id", id)
      .order("created_at", {
        ascending: false,
      });

    if (erroMovimentacoes) {
      throw erroMovimentacoes;
    }

    // ==========================================
    // BUSCAR RENDIMENTOS
    // ==========================================

    const {
      data: rendimentos,
      error: erroRendimentos,
    } = await supabase
      .from("rendimentos_caixinhas")
      .select("id, caixinha_id, valor, descricao, created_at")
      .eq("caixinha_id", id)
      .order("created_at", {
        ascending: false,
      });

    if (erroRendimentos) {
      throw erroRendimentos;
    }

    // ==========================================
    // CALCULAR TOTAIS
    // ==========================================

    const listaMovimentacoes = movimentacoes || [];
    const listaRendimentos = rendimentos || [];

    const totalEntradas = listaMovimentacoes
      .filter((item) => item.tipo === "ENTRADA")
      .reduce((total, item) => {
        return total + Number(item.valor || 0);
      }, 0);

    const totalSaidas = listaMovimentacoes
      .filter((item) => item.tipo === "SAIDA")
      .reduce((total, item) => {
        return total + Number(item.valor || 0);
      }, 0);

    const totalRendimentos = listaRendimentos.reduce(
      (total, item) => {
        return total + Number(item.valor || 0);
      },
      0,
    );

    // ==========================================
    // PROGRESSO DA META
    // ==========================================

    const saldo = Number(caixinha.saldo || 0);
    const meta = Number(caixinha.meta || 0);

    const progresso =
      meta > 0
        ? Math.min((saldo / meta) * 100, 100)
        : 0;

    // ==========================================
    // HISTÓRICO UNIFICADO
    // ==========================================

    const historicoMovimentacoes = listaMovimentacoes.map(
      (item) => ({
        id: item.id,
        tipo: item.tipo,
        valor: Number(item.valor || 0),
        descricao: item.descricao || "",
        transacao_pierre_id:
          item.transacao_pierre_id || null,
        data: item.created_at,
        origem: item.transacao_pierre_id
          ? "AUTOMATICO"
          : "MANUAL",
      }),
    );

    const historicoRendimentos = listaRendimentos.map(
      (item) => ({
        id: item.id,
        tipo: "RENDIMENTO",
        valor: Number(item.valor || 0),
        descricao: item.descricao || "Rendimento",
        transacao_pierre_id: null,
        data: item.created_at,
        origem: "MANUAL",
      }),
    );

    const historico = [
      ...historicoMovimentacoes,
      ...historicoRendimentos,
    ].sort((a, b) => {
      return new Date(b.data) - new Date(a.data);
    });

    // ==========================================
    // RESPOSTA
    // ==========================================

    res.json({
      sucesso: true,

      caixinha: {
        ...caixinha,

        saldo,

        meta,

        progresso,
      },

      resumo: {
        totalEntradas,
        totalSaidas,
        totalRendimentos,
      },

      historico,
    });
  } catch (erro) {
    console.error(
      "Erro ao carregar dashboard da caixinha:",
      erro.message,
    );

    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// ==========================================
// CONTAS FIXAS - BUSCAR
// ==========================================

app.get("/api/contas-fixas", exigirAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("contas_fixas")
      .select("*")
      .eq("user_id", req.usuario.id)
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      throw error;
    }

    res.json({
      sucesso: true,
      contas: data || [],
    });
  } catch (erro) {
    console.error(
      "Erro ao buscar contas fixas:",
      erro.message,
    );

    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// ==========================================
// CONTAS FIXAS - CRIAR
// ==========================================

app.post("/api/contas-fixas", exigirAdmin, async (req, res) => {
  try {
    const {
      id,
      name,
      amount,
      day,
      category,
      tipo,
      totalParcelas,
      parcelaAtual,
      anoInicioParcela,
      mesInicioParcela,
      pagamentos,
      finalizada,
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        sucesso: false,
        erro: "O nome da conta é obrigatório.",
      });
    }

    const valor = Number(amount);
    const dia = Number(day);

    if (!Number.isFinite(valor) || valor <= 0) {
      return res.status(400).json({
        sucesso: false,
        erro: "O valor da conta deve ser maior que zero.",
      });
    }

    if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
      return res.status(400).json({
        sucesso: false,
        erro: "O dia deve estar entre 1 e 31.",
      });
    }

    const conta = {
      user_id: req.usuario.id,

      name: String(name).trim(),

      amount: valor,

      day: dia,

      category: category || "Outros",

      tipo: tipo || "fixa",

      total_parcelas:
        totalParcelas !== null &&
        totalParcelas !== undefined &&
        totalParcelas !== ""
          ? Number(totalParcelas)
          : null,

      parcela_atual:
        parcelaAtual !== null &&
        parcelaAtual !== undefined &&
        parcelaAtual !== ""
          ? Number(parcelaAtual)
          : null,

      ano_inicio_parcela:
        anoInicioParcela !== null &&
        anoInicioParcela !== undefined
          ? Number(anoInicioParcela)
          : null,

      mes_inicio_parcela:
        mesInicioParcela !== null &&
        mesInicioParcela !== undefined
          ? Number(mesInicioParcela)
          : null,

      pagamentos:
        Array.isArray(pagamentos)
          ? pagamentos
          : [],

      finalizada:
        finalizada === true,
    };

    // Preservar o ID antigo durante a migração
    if (id) {
      conta.id = id;
    }

    const { data, error } = await supabase
      .from("contas_fixas")
      .insert([conta])
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json({
      sucesso: true,
      mensagem: "Conta fixa criada com sucesso.",
      conta: data,
    });
  } catch (erro) {
    console.error(
      "Erro ao criar conta fixa:",
      erro.message,
    );

    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// ==========================================
// CONTAS FIXAS - ATUALIZAR
// ==========================================

app.put("/api/contas-fixas/:id", exigirAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      amount,
      day,
      category,
      tipo,
      totalParcelas,
      parcelaAtual,
      anoInicioParcela,
      mesInicioParcela,
      pagamentos,
      finalizada,
    } = req.body;

    const { data, error } = await supabase
      .from("contas_fixas")
      .update({
        name: String(name || "").trim(),

        amount: Number(amount),

        day: Number(day),

        category: category || "Outros",

        tipo: tipo || "fixa",

        total_parcelas:
          totalParcelas !== null &&
          totalParcelas !== undefined &&
          totalParcelas !== ""
            ? Number(totalParcelas)
            : null,

        parcela_atual:
          parcelaAtual !== null &&
          parcelaAtual !== undefined &&
          parcelaAtual !== ""
            ? Number(parcelaAtual)
            : null,

        ano_inicio_parcela:
          anoInicioParcela !== null &&
          anoInicioParcela !== undefined
            ? Number(anoInicioParcela)
            : null,

        mes_inicio_parcela:
          mesInicioParcela !== null &&
          mesInicioParcela !== undefined
            ? Number(mesInicioParcela)
            : null,

        pagamentos:
          Array.isArray(pagamentos)
            ? pagamentos
            : [],

        finalizada:
          finalizada === true,

        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", req.usuario.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      sucesso: true,
      mensagem: "Conta fixa atualizada.",
      conta: data,
    });
  } catch (erro) {
    console.error(
      "Erro ao atualizar conta fixa:",
      erro.message,
    );

    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// ==========================================
// CONTAS FIXAS - EXCLUIR
// ==========================================

app.delete("/api/contas-fixas/:id", exigirAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("contas_fixas")
      .delete()
      .eq("id", id)
      .eq("user_id", req.usuario.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      sucesso: true,
      mensagem: "Conta fixa excluída.",
      conta: data,
    });
  } catch (erro) {
    console.error(
      "Erro ao excluir conta fixa:",
      erro.message,
    );

    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// ==========================================
// ABRIR O SITE
// ==========================================

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================

app.listen(PORT, () => {
  console.log("");

  console.log("=================================");

  console.log("      MEU APP FINANCEIRO");

  console.log("=================================");

  console.log("");

  console.log(`Servidor: http://localhost:${PORT}`);

  console.log("");

  console.log("Conexão com o Pierre preparada.");

  console.log("");
});

setInterval(() => {
  console.log("Servidor continua rodando...");
}, 5000);
