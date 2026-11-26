require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const zlib = require("zlib");
const { AsyncLocalStorage } = require("async_hooks");
const { reconstruirParcelas, lerParcela, adicionarMeses } = require("./lib/parcelamentos");
const { criarRouterV3 } = require("./routes/v3");

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY,
);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const PIERRE_API_URL = "https://www.pierre.finance/tools/api";

app.use(express.json());

// Guarda, por requisição, se o usuário pediu para atualizar (ignora o cache do Pierre)
app.use((req, _res, next) => {
  contextoRequisicao.run({ forcarAtualizacao: req.get("x-atualizar") === "1" }, next);
});

// ==========================================
// ARQUIVOS DO SITE (velocidade)
// JS e CSS vão comprimidos (gzip) e, como o index.html usa ?v=, o navegador
// pode guardá-los por 30 dias. O index.html é sempre conferido.
// ==========================================

const PASTA_PUBLICA = path.join(__dirname, "public");
const TIPOS_TEXTO = {
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};
const cacheGzip = new Map();

app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (!/\bgzip\b/.test(req.get("accept-encoding") || "")) return next();

  const caminhoUrl = req.path === "/" ? "/index.html" : req.path;
  const ext = path.extname(caminhoUrl).toLowerCase();
  if (!TIPOS_TEXTO[ext]) return next();

  const arquivo = path.join(PASTA_PUBLICA, path.normalize(caminhoUrl));
  if (!arquivo.startsWith(PASTA_PUBLICA + path.sep)) return next();

  let info;
  try {
    info = fs.statSync(arquivo);
  } catch {
    return next();
  }
  if (!info.isFile()) return next();

  const chave = arquivo + ":" + info.mtimeMs;
  let item = cacheGzip.get(arquivo);
  if (!item || item.chave !== chave) {
    const corpo = zlib.gzipSync(fs.readFileSync(arquivo), { level: 9 });
    item = { chave, corpo, etag: '"' + crypto.createHash("sha1").update(corpo).digest("hex").slice(0, 20) + '"' };
    cacheGzip.set(arquivo, item);
  }

  res.set("Content-Type", TIPOS_TEXTO[ext]);
  res.set("Content-Encoding", "gzip");
  res.set("Vary", "Accept-Encoding");
  res.set("ETag", item.etag);
  res.set(
    "Cache-Control",
    ext === ".html" || !req.query.v ? "no-cache" : "public, max-age=2592000, immutable",
  );

  if (req.get("if-none-match") === item.etag) return res.status(304).end();
  res.set("Content-Length", String(item.corpo.length));
  if (req.method === "HEAD") return res.end();
  return res.end(item.corpo);
});

app.use(express.static(PASTA_PUBLICA));

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

async function verificarUsuarioAdminSemCache(token) {
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
// CACHE DA VERIFICAÇÃO (velocidade)
// Ao abrir o app, o navegador faz ~15 chamadas ao mesmo tempo e cada uma
// verificava usuário + perfil no Supabase. Agora a sessão guarda a última
// verificação por 60s e chamadas simultâneas esperam a mesma verificação.
// ==========================================

const TEMPO_CACHE_VERIFICACAO = 60 * 1000;

async function verificarUsuarioAdmin(token) {
  const sessao = token ? sessoes.get(token) : null;

  if (!sessao || Date.now() > sessao.expiraEm) {
    return verificarUsuarioAdminSemCache(token);
  }

  if (sessao.verificacao && sessao.verificacao.ate > Date.now()) {
    return sessao.verificacao.resultado;
  }

  if (!sessao.verificando) {
    sessao.verificando = verificarUsuarioAdminSemCache(token)
      .then((resultado) => {
        if (resultado.autorizado) {
          sessao.verificacao = { resultado, ate: Date.now() + TEMPO_CACHE_VERIFICACAO };
        }
        return resultado;
      })
      .finally(() => {
        sessao.verificando = null;
      });
  }

  return sessao.verificando;
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
// MEU FINANCEIRO V3
// ==========================================

app.use("/api/v3", exigirAdmin, criarRouterV3({ supabaseAdmin }));

// ==========================================
// CLASSIFICAÇÕES FINANCEIRAS SINCRONIZADAS
// ==========================================

app.get(
  "/api/classificacoes-financeiras",
  exigirAdmin,
  async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("classificacoes_financeiras")
        .select("chave_transacao, classificacao");

      if (error) throw error;

      const internas = [];
      const externas = [];

      (data || []).forEach((item) => {
        if (item.classificacao === "INTERNA") {
          internas.push(item.chave_transacao);
        }

        if (item.classificacao === "EXTERNA") {
          externas.push(item.chave_transacao);
        }
      });

      res.json({
        sucesso: true,
        internas,
        externas,
      });
    } catch (erro) {
      console.error(
        "Erro ao carregar classificações financeiras:",
        erro.message,
      );

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  },
);

app.post(
  "/api/classificacoes-financeiras",
  exigirAdmin,
  async (req, res) => {
    try {
      const { chave, classificacao } = req.body;

      if (
        !chave ||
        !["INTERNA", "EXTERNA"].includes(classificacao)
      ) {
        return res.status(400).json({
          sucesso: false,
          erro: "Classificação financeira inválida.",
        });
      }

      const { data, error } = await supabaseAdmin
        .from("classificacoes_financeiras")
        .upsert(
          {
            chave_transacao: String(chave),
            classificacao,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "chave_transacao",
          },
        )
        .select()
        .single();

      if (error) throw error;

      res.json({
        sucesso: true,
        classificacao: data,
      });
    } catch (erro) {
      console.error(
        "Erro ao salvar classificação financeira:",
        erro.message,
      );

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  },
);

app.delete(
  "/api/classificacoes-financeiras",
  exigirAdmin,
  async (req, res) => {
    try {
      const { chave } = req.body;

      if (!chave) {
        return res.status(400).json({
          sucesso: false,
          erro: "Chave não informada.",
        });
      }

      const { error } = await supabaseAdmin
        .from("classificacoes_financeiras")
        .delete()
        .eq("chave_transacao", String(chave));

      if (error) throw error;

      res.json({
        sucesso: true,
      });
    } catch (erro) {
      console.error(
        "Erro ao remover classificação financeira:",
        erro.message,
      );

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  },
);

app.post(
  "/api/classificacoes-financeiras/importar",
  exigirAdmin,
  async (req, res) => {
    try {
      const internas =
        Array.isArray(req.body.internas)
          ? req.body.internas
          : [];

      const externas =
        Array.isArray(req.body.externas)
          ? req.body.externas
          : [];

      const registros = new Map();

      internas.forEach((chave) => {
        if (chave) {
          registros.set(String(chave), "INTERNA");
        }
      });

      externas.forEach((chave) => {
        if (chave) {
          registros.set(String(chave), "EXTERNA");
        }
      });

      const linhas =
        [...registros.entries()].map(
          ([chave_transacao, classificacao]) => ({
            chave_transacao,
            classificacao,
            updated_at: new Date().toISOString(),
          }),
        );

      if (linhas.length) {
        const { error } = await supabaseAdmin
          .from("classificacoes_financeiras")
          .upsert(linhas, {
            onConflict: "chave_transacao",
          });

        if (error) throw error;
      }

      res.json({
        sucesso: true,
        quantidade: linhas.length,
      });
    } catch (erro) {
      console.error(
        "Erro ao importar classificações financeiras:",
        erro.message,
      );

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  },
);


// ==========================================
// COMPETÊNCIA MANUAL DAS TRANSAÇÕES
// ==========================================

app.get(
  "/api/competencias-transacoes",
  exigirAdmin,
  async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("competencias_transacoes")
        .select("chave_transacao, competencia");

      if (error) throw error;

      const competencias = {};

      (data || []).forEach((item) => {
        competencias[item.chave_transacao] =
          item.competencia;
      });

      res.json({
        sucesso: true,
        competencias,
      });
    } catch (erro) {
      console.error(
        "Erro ao carregar competências:",
        erro.message,
      );

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  },
);

app.post(
  "/api/competencias-transacoes",
  exigirAdmin,
  async (req, res) => {
    try {
      const { chave, competencia } = req.body;

      if (
        !chave ||
        !/^\d{4}-\d{2}$/.test(
          String(competencia || ""),
        )
      ) {
        return res.status(400).json({
          sucesso: false,
          erro: "Competência inválida.",
        });
      }

      const { data, error } = await supabaseAdmin
        .from("competencias_transacoes")
        .upsert(
          {
            chave_transacao: String(chave),
            competencia: String(competencia),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "chave_transacao",
          },
        )
        .select()
        .single();

      if (error) throw error;

      res.json({
        sucesso: true,
        competencia: data,
      });
    } catch (erro) {
      console.error(
        "Erro ao salvar competência:",
        erro.message,
      );

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  },
);

app.delete(
  "/api/competencias-transacoes",
  exigirAdmin,
  async (req, res) => {
    try {
      const { chave } = req.body;

      if (!chave) {
        return res.status(400).json({
          sucesso: false,
          erro: "Chave não informada.",
        });
      }

      const { error } = await supabaseAdmin
        .from("competencias_transacoes")
        .delete()
        .eq("chave_transacao", String(chave));

      if (error) throw error;

      res.json({
        sucesso: true,
      });
    } catch (erro) {
      console.error(
        "Erro ao remover competência:",
        erro.message,
      );

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  },
);


// ==========================================
// ORIGEM DAS ENTRADAS
// ==========================================

app.get(
  "/api/origens-entradas",
  exigirAdmin,
  async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("origens_entradas")
        .select("chave_transacao, origem");

      if (error) throw error;

      const origens = {};

      (data || []).forEach((item) => {
        origens[item.chave_transacao] =
          item.origem;
      });

      res.json({
        sucesso: true,
        origens,
      });
    } catch (erro) {
      console.error(
        "Erro ao carregar origens das entradas:",
        erro.message,
      );

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  },
);


app.post(
  "/api/origens-entradas",
  exigirAdmin,
  async (req, res) => {
    try {
      const { chave, origem } = req.body;

      const permitidas = [
        "SALARIO_CALVO",
        "RAFA",
        "OUTRAS",
        "REEMBOLSO",
        "RENDIMENTO",
        "RENDA_EXTRA",
      ];

      if (
        !chave ||
        !permitidas.includes(
          String(origem || ""),
        )
      ) {
        return res.status(400).json({
          sucesso: false,
          erro: "Origem inválida.",
        });
      }

      const { data, error } = await supabaseAdmin
        .from("origens_entradas")
        .upsert(
          {
            chave_transacao: String(chave),
            origem: String(origem),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "chave_transacao",
          },
        )
        .select()
        .single();

      if (error) throw error;

      res.json({
        sucesso: true,
        origem: data,
      });
    } catch (erro) {
      console.error(
        "Erro ao salvar origem da entrada:",
        erro.message,
      );

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  },
);


app.delete(
  "/api/origens-entradas",
  exigirAdmin,
  async (req, res) => {
    try {
      const { chave } = req.body;

      if (!chave) {
        return res.status(400).json({
          sucesso: false,
          erro: "Chave não informada.",
        });
      }

      const { error } = await supabaseAdmin
        .from("origens_entradas")
        .delete()
        .eq(
          "chave_transacao",
          String(chave),
        );

      if (error) throw error;

      res.json({
        sucesso: true,
      });
    } catch (erro) {
      console.error(
        "Erro ao remover origem da entrada:",
        erro.message,
      );

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  },
);

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

// ==========================================
// CACHE CURTO DO PIERRE (velocidade)
// Várias telas pedem get-accounts/get-transactions quase ao mesmo tempo.
// Respostas iguais ficam guardadas por 60s e pedidos simultâneos
// compartilham a mesma chamada. O botão Atualizar envia X-Atualizar: 1
// e ignora o cache.
// ==========================================

const TEMPO_CACHE_PIERRE = 60 * 1000;
const cachePierre = new Map();
const contextoRequisicao = new AsyncLocalStorage();

function pierreForcarAtualizacao() {
  return contextoRequisicao.getStore()?.forcarAtualizacao === true;
}

// Cada chamada recebe a SUA cópia: várias rotas alteram a resposta
// (ex.: /api/bills acrescenta a próxima fatura na lista). Sem a cópia,
// a lista guardada no cache crescia a cada pedido e as faturas duplicavam.
async function pierreRequest(endpoint, params = {}) {
  return structuredClone(await pierreRequestCompartilhado(endpoint, params));
}

async function pierreRequestCompartilhado(endpoint, params = {}) {
  const chave = endpoint + "?" + new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ).toString();

  const guardado = cachePierre.get(chave);
  if (!pierreForcarAtualizacao() && guardado && guardado.ate > Date.now()) {
    return guardado.promessa;
  }

  const promessa = pierreRequestSemCache(endpoint, params);
  cachePierre.set(chave, { promessa, ate: Date.now() + TEMPO_CACHE_PIERRE });
  promessa.catch(() => {
    if (cachePierre.get(chave)?.promessa === promessa) cachePierre.delete(chave);
  });

  if (cachePierre.size > 200) {
    const agora = Date.now();
    for (const [k, v] of cachePierre) if (v.ate <= agora) cachePierre.delete(k);
  }

  return promessa;
}

async function pierreRequestSemCache(endpoint, params = {}) {
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

  const textoResposta = await resposta.text();

  let dados;

  try {
    dados = JSON.parse(textoResposta);
  } catch {
    throw new Error(
      `Pierre retornou resposta inválida. HTTP ${resposta.status}. ` +
      `Content-Type: ${resposta.headers.get("content-type") || "não informado"}.`
    );
  }

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

// Pré-diagnóstico Pierre — leitura estrita; não altera a carteira.
app.get("/api/investments/pierre-capabilities", exigirAdmin, async (_req, res) => {
  try {
    const retorno = await pierreRequest("get-accounts");
    const contas = Array.isArray(retorno?.data) ? retorno.data : [];
    const investimentos = contas.filter(c => c?.type === "INVESTMENT" && c.itemIsActive !== false);
    // Um saldo não comprova as compras individuais; só identificar dados
    // de posições se a própria fonte fornecer explicitamente os campos.
    const posicoes = investimentos.flatMap(c => {
      const colecoes = [c.holdings, c.positions, c.investments, c.investmentData?.holdings]
        .filter(Array.isArray);
      return colecoes.flatMap(lista => lista).map(p => {
        const ticker = String(p.ticker || p.symbol || "").toUpperCase().trim();
        const quantidade = Number(p.quantity ?? p.quantidade);
        const precoMedio = Number(p.averagePurchasePrice ?? p.average_price ?? p.purchaseUnitPrice);
        return { ticker, quantidade, precoMedio };
      }).filter(p => /^[A-Z]{4}\d{1,2}$/.test(p.ticker) && Number.isFinite(p.quantidade) && p.quantidade > 0 && Number.isFinite(p.precoMedio) && p.precoMedio > 0);
    });
    res.json({
      sucesso: true,
      fonte: "Pierre get-accounts",
      contasInvestimento: investimentos.length,
      posicoesDetalhadas: posicoes.length,
      contasComSaldo: investimentos.filter(c => Number.isFinite(Number(c.balance))).length,
      diagnostico: investimentos.length === 0
        ? "A API não retornou contas INVESTMENT ativas nesta consulta."
        : posicoes.length
          ? "Há dados detalhados candidatos à comparação; nenhuma posição foi alterada."
          : "O Pierre trouxe contas de investimento, mas não forneceu posições com ticker, quantidade e custo verificáveis. Não é seguro importar compras.",
      // Evita vazamento de saldos e dados bancários neste diagnóstico.
      verificadoEm: new Date().toISOString(),
    });
  } catch (erro) {
    res.status(502).json({ sucesso: false, codigo: "PIERRE_CAPABILITIES_ERROR",
      erro: "Não foi possível conferir os dados de investimento retornados pelo Pierre." });
  }
});

// ==========================================
// CONTAS
// ==========================================

app.get("/api/accounts", exigirAdmin, async (req, res) => {
  try {
    const dados = await pierreRequest("get-accounts");

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

        // V3: expõe somente metadados não sensíveis.
        // Mesmo que a origem forneça um número, nunca devolvemos mais que os 4 finais.
        ultimos4: (() => {
          const bruto =
            credito.lastFourDigits ||
            credito.last4 ||
            credito.number ||
            credito.cardNumber ||
            cartao.number ||
            "";

          const digitos = String(bruto).replace(/\D/g, "");

          return digitos.length >= 4
            ? digitos.slice(-4)
            : null;
        })(),

        bandeira:
          credito.brand ||
          credito.network ||
          credito.cardBrand ||
          null,

        modalidade:
          credito.level ||
          credito.productType ||
          credito.cardType ||
          null,
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
// SINCRONIZAR FATURAS DO PIERRE
// ==========================================

app.post("/api/bills/sync-pierre", exigirAdmin, async (req, res) => {
  try {
    const { cards, periodKey } = req.body;

    if (!periodKey || !/^\d{4}-\d{2}$/.test(String(periodKey))) {
      return res.status(400).json({
        sucesso: false,
        erro: "Competência inválida.",
      });
    }

    if (!Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({
        sucesso: false,
        erro: "Nenhum cartão recebido.",
      });
    }

    const registros = cards
      .filter((cartao) => cartao && cartao.id)
      .map((cartao) => ({
        account_id: String(cartao.id),
        competencia: String(periodKey),
        nome_cartao: cartao.name || null,
        final_cartao: cartao.number ? String(cartao.number) : null,
        valor_fatura: Number(cartao.currentBillAmount) || 0,
        pagamento_minimo: Number(cartao.minimumPayment) || 0,
        data_vencimento: cartao.balanceDueDate
          ? String(cartao.balanceDueDate).substring(0, 10)
          : null,
        dia_fechamento: Number.isFinite(Number(cartao.closingDay))
          ? Number(cartao.closingDay)
          : null,
        oficial: cartao.isOfficialBillAmount === true,
        estimada: cartao.isEstimatedFromTransactions === true,
        origem: "pierre-dashboard",
        atualizado_em: new Date().toISOString(),
      }));

    if (!registros.length) {
      return res.status(400).json({
        sucesso: false,
        erro: "Nenhum cartão válido recebido.",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("faturas_sincronizadas")
      .upsert(registros, {
        onConflict: "account_id,competencia",
      })
      .select();

    if (error) {
      throw error;
    }

    res.json({
      sucesso: true,
      competencia: periodKey,
      quantidade: data.length,
      faturas: data,
    });
  } catch (erro) {
    console.error(
      "Erro ao sincronizar faturas do Pierre:",
      erro.message,
    );

    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// ==========================================
// FATURAS DOS CARTÕES
// ==========================================

// ==========================================
// CARTÕES: COMO MOSTRAR CADA CONTA DE CARTÃO
// Um banco pode ter mais de um cartão (titular, adicional, virtual) e o
// Pierre traz cada um como uma conta. Aqui você escolhe, por cartão:
// SEPARADO (aparece sozinho), SOMAR (soma na fatura de outro cartão)
// ou ESCONDER. Tabela: supabase/cartoes_agrupamento.sql
// ==========================================

// ==========================================
// DIAGNÓSTICO DAS FATURAS
// Quando a tela Cartões abre, o app manda o valor que mostrou para cada
// cartão; o servidor junta com o que o Pierre devolve (contas de crédito,
// faturas, resumo e soma das compras por cartão) e guarda uma foto em
// diagnostico_faturas para conferir por que um valor não bate com o banco.
// Não guarda número de cartão (só os 4 finais que o app já mostra).
// ==========================================

app.post("/api/cartoes/diagnostico", exigirAdmin, async (req, res) => {
  try {
    const mostrados = Array.isArray(req.body?.cartoes) ? req.body.cartoes.slice(0, 30) : [];
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 75);
    const fim = new Date(hoje);
    fim.setDate(fim.getDate() + 1);

    const [contas, faturas, resumo, transacoes] = await Promise.all([
      pierreRequest("get-accounts"),
      pierreRequest("get-bills", {}),
      pierreRequest("get-bill-summary", {}).catch((e) => ({ erro: e.message })),
      pierreRequest("get-transactions", {
        startDate: inicio.toISOString().slice(0, 10),
        endDate: fim.toISOString().slice(0, 10),
        format: "raw",
      }).catch((e) => ({ erro: e.message })),
    ]);

    const credito = (Array.isArray(contas?.data) ? contas.data : []).filter((c) => c.type === "CREDIT");
    const listaFaturas = Array.isArray(faturas?.data) ? faturas.data : [];
    const listaResumo = Array.isArray(resumo?.data) ? resumo.data : [];
    const listaTx = Array.isArray(transacoes?.data) ? transacoes.data : [];

    const porConta = credito.map((c) => {
      const cd = c.creditData || {};
      const faturasConta = listaFaturas
        .filter((f) => String(f.accountId) === String(c.id))
        .sort((a, b) => String(b.dueDate).localeCompare(String(a.dueDate)))
        .slice(0, 4)
        .map((f) => ({
          fechamento: String(f.billClosingDate || "").slice(0, 10),
          vencimento: String(f.dueDate || "").slice(0, 10),
          total: f.totalAmount,
          minimo: f.minimumPaymentAmount,
          status: f.status,
        }));
      const ultimoFechamento = faturasConta[0]?.fechamento || null;
      const txConta = listaTx.filter((t) => String(t.accountId) === String(c.id));
      const desdeFechamento = ultimoFechamento
        ? txConta.filter((t) => String(t.date || "").slice(0, 10) > ultimoFechamento)
        : [];
      const soma = (l) => Math.round(l.reduce((s, t) => s + Number(t.amount || 0), 0) * 100) / 100;
      const r = listaResumo.find((x) => String(x.account_id || x.accountId) === String(c.id));
      return {
        id: c.id,
        nome: c.customName || c.name,
        banco: c.connectorName || c.marketingName,
        subtipo: c.subtype,
        ativa: c.itemIsActive !== false,
        saldoPierre: c.balance,
        limite: cd.creditLimit ?? cd.limit ?? null,
        limiteDisponivel: cd.availableCreditLimit ?? cd.availableLimit ?? null,
        fechamentoCartao: cd.balanceCloseDate || null,
        vencimentoCartao: cd.balanceDueDate || null,
        final: String(cd.lastFourDigits || cd.last4 || c.number || "").replace(/\D/g, "").slice(-4) || null,
        resumo: r ? { aproxFaturaAtual: r.approx_current_bill_amount ?? r.approxCurrentBillAmount, limite: r.credit_limit ?? r.creditLimit } : null,
        faturas: faturasConta,
        compras75dias: { quantidade: txConta.length, soma: soma(txConta) },
        comprasDesdeUltimoFechamento: { quantidade: desdeFechamento.length, soma: soma(desdeFechamento) },
        mostradoNoApp: mostrados.find((m) => String(m.id) === String(c.id)) || null,
      };
    });

    const dados = {
      geradoEm: hoje.toISOString(),
      erros: { resumo: resumo?.erro || null, transacoes: transacoes?.erro || null },
      cartoes: porConta,
    };

    const { error } = await supabaseAdmin.from("diagnostico_faturas").insert([{ dados }]);
    if (error) throw error;

    res.json({ sucesso: true });
  } catch (erro) {
    console.error("Erro no diagnóstico de faturas:", erro.message);
    res.status(500).json({ sucesso: false, erro: "Não foi possível gerar o diagnóstico." });
  }
});

app.get("/api/cartoes/agrupamento", exigirAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from("cartoes_agrupamento").select("account_id, modo, somar_em");
    if (error) throw error;
    const agrupamento = {};
    (data || []).forEach((r) => {
      agrupamento[r.account_id] = { modo: r.modo, somarEm: r.somar_em || null };
    });
    res.json({ sucesso: true, agrupamento });
  } catch (erro) {
    console.error("Erro ao buscar agrupamento de cartões:", erro.message);
    res.status(500).json({ sucesso: false, erro: "Não foi possível carregar os cartões." });
  }
});

app.put("/api/cartoes/agrupamento", exigirAdmin, async (req, res) => {
  try {
    const accountId = String(req.body?.accountId || "").slice(0, 80);
    const modo = String(req.body?.modo || "SEPARADO").toUpperCase();
    const somarEm = modo === "SOMAR" ? String(req.body?.somarEm || "").slice(0, 80) : null;
    if (!accountId || !["SEPARADO", "SOMAR", "ESCONDER"].includes(modo)) {
      return res.status(400).json({ sucesso: false, erro: "Dados inválidos." });
    }
    if (modo === "SOMAR" && (!somarEm || somarEm === accountId)) {
      return res.status(400).json({ sucesso: false, erro: "Escolha em qual cartão somar." });
    }
    const { error } = await supabaseAdmin
      .from("cartoes_agrupamento")
      .upsert({ account_id: accountId, modo, somar_em: somarEm, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
    if (error) throw error;
    res.json({ sucesso: true });
  } catch (erro) {
    console.error("Erro ao salvar agrupamento de cartões:", erro.message);
    res.status(500).json({ sucesso: false, erro: "Não foi possível salvar." });
  }
});

app.get("/api/bills", exigirAdmin, async (req, res) => {
  try {
    const accountId = req.query.accountId || null;

    // ==========================================
    // BUSCAR FATURAS DO PIERRE
    // ==========================================

    const avisosFaturas = [];
    let faturas = [];
    try {
      const dadosFaturas = await pierreRequest(
        "get-bills",
        accountId ? { accountId } : {},
      );
      faturas = Array.isArray(dadosFaturas?.data) ? dadosFaturas.data : [];
    } catch (erroPierre) {
      console.warn("Pierre get-bills indisponível:", erroPierre.message);
      avisosFaturas.push("Não foi possível consultar as faturas recentes no Pierre. Os dados disponíveis podem estar desatualizados.");
    }

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

        if (!ultimaFatura.billClosingDate || !ultimaFatura.dueDate ||
            Number.isNaN(fechamentoUltima.getTime()) || Number.isNaN(vencimentoUltima.getTime())) {
          avisosFaturas.push("Uma fatura não tem datas válidas; não foi possível projetar o vencimento seguinte.");
        } else {
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
        }
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
      }
    }

    // ==========================================
    // RESUMO DA FATURA ATUAL
    // ==========================================

    let resumos = [];
    try {
      const dadosResumo = await pierreRequest(
        "get-bill-summary",
        accountId ? { accountId } : {},
      );
      resumos = Array.isArray(dadosResumo?.data) ? dadosResumo.data : [];
    } catch (erroResumo) {
      console.warn("Pierre get-bill-summary indisponível:", erroResumo.message);
      avisosFaturas.push("O resumo de faturas não pôde ser consultado. Confira valores e vencimentos no banco.");
    }

    // ==========================================
    // FATURAS SINCRONIZADAS DO PAINEL DO PIERRE
    // ==========================================

    let consultaSincronizadas = supabaseAdmin
      .from("faturas_sincronizadas")
      .select("*");

    if (accountId) {
      consultaSincronizadas = consultaSincronizadas.eq(
        "account_id",
        String(accountId),
      );
    }

    const {
      data: faturasSincronizadas,
      error: erroFaturasSincronizadas,
    } = await consultaSincronizadas;

    if (erroFaturasSincronizadas) {
      console.warn("Falha ao consultar faturas salvas:", erroFaturasSincronizadas.message);
      avisosFaturas.push("Não foi possível consultar as faturas sincronizadas anteriormente.");
    }

    for (const sincronizada of faturasSincronizadas || []) {
      if (
        !sincronizada.account_id ||
        !sincronizada.competencia ||
        !sincronizada.data_vencimento
      ) {
        continue;
      }

      const competencia = String(sincronizada.competencia);

      const diaFechamento = Math.min(
        Math.max(Number(sincronizada.dia_fechamento) || 1, 1),
        28,
      );

      const dataFechamento =
        `${competencia}-${String(diaFechamento).padStart(2, "0")}` +
        "T00:00:00.000Z";

      const dataVencimento =
        String(sincronizada.data_vencimento).substring(0, 10) +
        "T00:00:00.000Z";

      const faturaSincronizada = {
        id:
          `sincronizada-${sincronizada.account_id}-` +
          competencia,

        accountId: String(sincronizada.account_id),

        billClosingDate: dataFechamento,

        dueDate: dataVencimento,

        totalAmount: String(
          Number(sincronizada.valor_fatura) || 0,
        ),

        totalAmountCurrencyCode: "BRL",

        minimumPaymentAmount: String(
          Number(sincronizada.pagamento_minimo) || 0,
        ),

        status: "OPEN",

        virtual: false,

        sincronizada: true,
        atualizadaEm: sincronizada.atualizado_em || null,

        oficial: sincronizada.oficial === true,

        estimada: sincronizada.estimada === true,

        origem:
          sincronizada.origem || "pierre-dashboard",
      };

      const indiceExistente = faturas.findIndex((fatura) => {
        return (
          String(fatura.accountId) ===
            String(sincronizada.account_id) &&
          String(fatura.dueDate || "").substring(0, 7) ===
            competencia
        );
      });

      if (indiceExistente >= 0) {
        faturas[indiceExistente] = {
          ...faturas[indiceExistente],
          ...faturaSincronizada,
        };
      } else {
        faturas.push(faturaSincronizada);
      }
    }

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
      parcial: avisosFaturas.length > 0,
      avisos: avisosFaturas,
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

    const transacoesBrutas =
      Array.isArray(dados.data) ? dados.data : [];

    // O Pierre eventualmente retorna transações fora
    // do período solicitado. Garantimos o filtro aqui
    // antes de enviar os dados para o frontend.
    const transacoes = transacoesBrutas.filter((transacao) => {
      const dataTransacao =
        String(transacao.date || "").substring(0, 10);

      if (!dataTransacao) {
        return false;
      }

      if (dataInicio && dataTransacao < dataInicio) {
        return false;
      }

      // endDate é tratado como limite exclusivo.
      if (dataFim && dataTransacao >= dataFim) {
        return false;
      }

      return true;
    });

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

      creditCardData:
        transacao.credit_card_data ||
        transacao.creditCardData ||
        null,

      installmentDueDate:
        transacao.installment_due_date ||
        transacao.installmentDueDate ||
        null,

      originalDescription:
        transacao.original_description ||
        transacao.originalDescription ||
        "",

      merchant: transacao.merchant || null,

      accountId:
        transacao.account_id ||
        transacao.accountId ||
        null,

      accountSubtype:
        transacao.account_subtype ||
        transacao.accountSubtype ||
        "",
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

  const restanteInformado =
    Math.max(
      Number(existente.amountRemaining || 0),
      Number(compra.amountRemaining || 0),
    );

  const restanteMapeado =
    existente.installments
      .filter(
        (parcela) =>
          parcela.isPaid !== true,
      )
      .reduce(
        (total, parcela) =>
          total +
          Math.abs(
            Number(
              parcela.amount || 0,
            ),
          ),
        0,
      );

  // Preserva o saldo restante informado pelo Pierre.
  // A lista de installments pode vir incompleta e, por isso,
  // não deve substituir um amountRemaining maior e confiável.
  existente.amountRemaining =
    Math.max(
      restanteInformado,
      restanteMapeado,
    );

  // Preserva o valor-base do parcelamento.
  // A primeira parcela pode ter valor diferente das demais.
  if (
    Number(existente.installmentValue || 0) <= 0 &&
    Number(compra.installmentValue || 0) > 0
  ) {
    existente.installmentValue =
      Number(compra.installmentValue);
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

      const info = lerParcela(transacao.description);
      const totalCompra = Number(compra.totalInstallments || compra.totalParcelas || lerParcela(compra.description)?.total || 0);
      if (info && totalCompra > 1 && info.total !== totalCompra) return false;
      if (info && compra.purchaseDate && transacao.date) {
        const inicioEstimado = adicionarMeses(transacao.date, 1 - info.numero);
        const distancia = Math.min(
          Math.abs(new Date(inicioEstimado) - new Date(compra.purchaseDate)),
          Math.abs(new Date(transacao.date) - new Date(compra.purchaseDate)),
        );
        if (Number.isFinite(distancia) && distancia > 45 * 86400000) return false;
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

    // get-installments pode omitir compras presentes no histórico bruto.
    // Recupera somente lançamentos parcelados de cartões identificados.
    const transacoesOrdenadas = [...transacoes].sort((a, b) =>
      (lerParcela(a.description)?.numero || 999) -
      (lerParcela(b.description)?.numero || 999),
    );
    for (const transacao of transacoesOrdenadas) {
      const info = lerParcela(transacao.description);
      const accountId = transacao.account_id || transacao.accountId;
      if (!info || info.total <= 1 || !mapaCartoes.has(String(accountId))) continue;
      if (String(transacao.type || "").toUpperCase() === "CREDIT") continue;
      if (!Number.isFinite(Number(transacao.amount)) || Number(transacao.amount) === 0) continue;
      const dataInicioCompra = adicionarMeses(transacao.date, 1 - info.numero);
      if (!dataInicioCompra) continue;

      const jaRepresentada = comprasMescladas.some(compra =>
        encontrarTransacoes(compra, compra.description || compra.name ||
          compra.installments?.[0]?.description || "").includes(transacao),
      );
      if (jaRepresentada) continue;

      comprasMescladas.push({
        id: `recuperada-${accountId}-${transacao.id || normalizarDescricao(transacao.description)}-${dataInicioCompra}`,
        description: String(transacao.description).replace(/\d+\s*\/\s*\d+/g, "").trim(),
        accountId,
        purchaseDate: dataInicioCompra,
        totalInstallments: info.total,
        installments: [],
      });
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
                        compra.totalInstallments ||
                        compra.totalParcelas ||
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

                  projetada:
                    parcela.isProjected === true,

                  paga:
                    typeof parcela.isPaid === "boolean" ? parcela.isPaid : undefined,
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
            compra.description ||
              parcelas[0]?.descricao ||
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
              lerParcela(transacao.description)?.numero === 1,
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

        const totalParcelasDaTransacao =
          matchParcela
            ? Number(
                matchParcela[2],
              )
            : 0;

        const reconstrucao = reconstruirParcelas(
          compra, parcelas, transacoesRelacionadas, nomeCompra, cartaoId,
        );
        parcelas = reconstrucao.parcelas;

        // ======================================
        // TOTAL DE PARCELAS
        // ======================================

        const totalParcelas =
          Math.max(
            Number(
              compra.totalInstallments ||
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

          valorTotal: Math.round(valorTotal * 100) / 100,
          valorEstimado: reconstrucao.valorEstimado,

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

  // Datas da primeira parcela
  const vencimentoA =
    String(
      primeiraA.vencimento || "",
    ).slice(0, 10);

  const vencimentoB =
    String(
      primeiraB.vencimento || "",
    ).slice(0, 10);

  // Se as duas datas existem, permite diferença de até 10 dias
  if (vencimentoA && vencimentoB) {
    const dataA = new Date(vencimentoA);
    const dataB = new Date(vencimentoB);

    const diferencaDias =
      Math.abs(
        dataA.getTime() -
        dataB.getTime(),
      ) /
      (1000 * 60 * 60 * 24);

    if (diferencaDias > 10) {
      return false;
    }
  }

  // Valor total
  const valorA = Number(
    compraA.valorTotal || 0,
  );

  const valorB = Number(
    compraB.valorTotal || 0,
  );

  const diferencaTotal =
    Math.abs(valorA - valorB);

  // Se o total for praticamente igual,
  // consideramos a mesma compra.
  if (diferencaTotal <= 5) {
    return true;
  }

  // Caso o total seja diferente,
  // comparamos o valor da primeira parcela.
  const valorParcelaA =
    Number(primeiraA.valor || 0);

  const valorParcelaB =
    Number(primeiraB.valor || 0);

  const diferencaParcela =
    Math.abs(
      valorParcelaA -
      valorParcelaB,
    );

  if (diferencaParcela <= 5) {
    return true;
  }

  return false;
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
    continue;
  }

  comprasSemDuplicacao.push(
    compra,
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
    const { data, error } = await supabaseAdmin
      .from("caixinhas")
      .select("*")
      .order("saldo", { ascending: false })
      .order("nome", { ascending: true });

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

    const { data, error } = await supabaseAdmin
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

    const { data: caixinha, error: erroCaixinha } = await supabaseAdmin
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

    const { data, error } = await supabaseAdmin
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

    const { data: caixinhaAtualizada, error: erroAtualizacao } = await supabaseAdmin
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

    const { data: caixinhas, error: erroCaixinhas } = await supabaseAdmin
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

    let { data: controleSincronizacao, error: erroControle } = await supabaseAdmin
      .from("sincronizacoes")
      .select("id, ultima_sincronizacao")
      .eq("id", 1)
      .maybeSingle();

    if (erroControle) {
      throw erroControle;
    }

    if (!controleSincronizacao) {
      const { data: novoControle, error: erroCriarControle } = await supabaseAdmin
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

    dataInicio.setDate(dataInicio.getDate() - 90);

    console.log(
      "🔄 Buscando movimentações dos últimos 90 dias para identificar novidades.",
    );

    // Saldos conciliados com extrato do Mercado Pago em 09/11/2026.
    // Nunca reaplicar transações históricas sobre esses saldos-base.
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

    // Não importar transações anteriores ao saldo-base, mesmo se a API ignorar o filtro.
    const dataCorte = "2026-11-10";

    console.log(`📊 ${transacoes.length} transações encontradas.`);

    const sincronizadas = [];

    const ignoradas = [];
    const pendencias = [];
    const historicasAntesDaBase = [];

    for (const transacao of transacoes) {
      const dataTransacao = String(transacao.date || transacao.transaction_date || transacao.transactionDate || transacao.postedAt || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataTransacao)) {
        ignoradas.push({ transacao_id: transacao.id || null, motivo: "Transação sem data verificável." });
        continue;
      }
      if (dataTransacao < dataCorte) {
        const descricaoHistorica = String(transacao.description || transacao.descricao || "");
        const nomeHistorico = normalizarTexto(descricaoHistorica);
        const relacionada = caixinhas.some(c => nomeHistorico.includes(normalizarTexto(c.nome)));
        if (relacionada && /reserv|retirad|resgat|guardar dinheiro/.test(nomeHistorico)) {
          historicasAntesDaBase.push({ transacao_id: transacao.id || null, data: dataTransacao, descricao: descricaoHistorica, valor: transacao.amount });
        }
        continue;
      }
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
        descricaoNormalizada.includes("reserva por gastos") ||
        descricaoNormalizada.includes("dinheiro reservado") ||
        descricaoNormalizada.includes("valor reservado") ||
        descricaoNormalizada.includes("reserva ") ||
        descricaoNormalizada.includes("guardar dinheiro");

      const ehRetirada =
        descricaoNormalizada.includes("dinheiro retirado") ||
        descricaoNormalizada.includes("valor retirado") ||
        descricaoNormalizada.includes("retirada ") ||
        descricaoNormalizada.includes("resgate");

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
        await supabaseAdmin
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
          descricaoNormalizada.includes(nomeCaixinha)
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

      if (ehReserva && !ehRetirada) {
        tipoMovimentacao = "ENTRADA";
      } else if (ehRetirada && !ehReserva) {
        tipoMovimentacao = "SAIDA";
      } else {
        ignoradas.push({
          transacao_id: transacaoId,

          descricao,

          tipoPierre,

          motivo: `Descrição ambígua: ${descricao}`,
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
        pendencias.push({
          transacao_id: transacaoId,
          caixinha: caixinhaEncontrada.nome,
          descricao,
          valor,
          motivo: "Saída superior ao saldo registrado; requer conciliação.",
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

      const { data: movimentacao, error: erroInsercao } = await supabaseAdmin
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
        await supabaseAdmin
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

    const { error: erroSalvarSincronizacao } = await supabaseAdmin
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

      mensagem: "Novas movimentações processadas. Transações anteriores ao saldo-base são apenas diagnosticadas e não alteram os saldos.",

      periodoBusca: {
        inicio: dataInicioFormatada,

        fim: dataFimFormatada,
      },

      totalEncontradas: transacoes.length,

      totalSincronizadas: sincronizadas.length,

      totalIgnoradas: ignoradas.length,

      sincronizadas,

      ignoradas,
      pendencias,
      totalPendencias: pendencias.length,
      totalHistoricasAntesDaBase: historicasAntesDaBase.length,
      historicasAntesDaBase,
      conciliacaoCompleta: pendencias.length === 0,

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

// ==========================================
// RENDIMENTOS AUTOMÁTICOS DAS CAIXINHAS
// O Mercado Pago rende cada cofrinho separadamente e o extrato do Pierre
// mostra só "Rendimentos", sem dizer de qual cofrinho. O app busca esses
// rendimentos, sugere a caixinha pela proporção do saldo (a taxa é a mesma
// para todos) e você confirma. Cada rendimento guarda o id da transação do
// Pierre, então nunca entra duas vezes. Tabelas: supabase/rendimentos_automaticos.sql
// ==========================================

// Saldos conciliados até 10/11/2026 (mesma data-base da sincronização):
// rendimentos anteriores já foram lançados à mão.
const RENDIMENTOS_DESDE = "2026-11-11";

function ehRendimentoPierre(transacao) {
  const texto = normalizarTexto(transacao?.description || transacao?.descricao || "");
  return texto.includes("rendimento") && Number(transacao?.amount) > 0;
}

function idTransacaoPierre(transacao) {
  return String(transacao?.id || transacao?.transaction_id || transacao?.transactionId || "");
}

function dataTransacaoPierre(transacao) {
  return String(transacao?.date || transacao?.transaction_date || transacao?.transactionDate || transacao?.postedAt || "").slice(0, 10);
}

// Sugestão: o rendimento de cada cofrinho é proporcional ao saldo (a taxa é a
// mesma para todos). Então, em cada dia, o maior rendimento vai para a caixinha
// com mais saldo, o segundo para a segunda, e assim por diante. Só entram
// caixinhas com saldo e, se houver histórico, só as que já receberam rendimento.
function sugerirCaixinhas(rendimentosDoDia, caixinhas, comHistorico = new Set()) {
  let candidatas = caixinhas.filter((c) => Number(c.saldo) > 0);
  if (comHistorico.size && candidatas.some((c) => comHistorico.has(c.id))) {
    candidatas = candidatas.filter((c) => comHistorico.has(c.id));
  }
  candidatas.sort((a, b) => Number(b.saldo) - Number(a.saldo));
  const ordenados = [...rendimentosDoDia].sort((a, b) => b.valor - a.valor);
  const sugestoes = new Map();
  ordenados.forEach((r, i) => {
    if (candidatas[i]) sugestoes.set(r.transacaoId, candidatas[i].id);
  });
  return sugestoes;
}

async function buscarRendimentosPendentes() {
  const fim = new Date();
  fim.setDate(fim.getDate() + 1);

  const [respostaPierre, contasPierre, caixinhasRes, lancadosRes, ignoradosRes, historicoRes] = await Promise.all([
    pierreRequest("get-transactions", {
      startDate: RENDIMENTOS_DESDE,
      endDate: fim.toISOString().slice(0, 10),
      format: "raw",
    }),
    pierreRequest("get-accounts").catch(() => ({ data: [] })),
    supabaseAdmin.from("caixinhas").select("id, nome, saldo").order("nome"),
    supabaseAdmin.from("rendimentos_caixinhas").select("transacao_pierre_id").not("transacao_pierre_id", "is", null),
    supabaseAdmin.from("rendimentos_ignorados").select("transacao_pierre_id"),
    supabaseAdmin.from("rendimentos_caixinhas").select("caixinha_id"),
  ]);

  for (const r of [caixinhasRes, lancadosRes, ignoradosRes, historicoRes]) if (r.error) throw r.error;
  const comHistorico = new Set((historicoRes.data || []).map((r) => r.caixinha_id));

  const jaTratados = new Set([
    ...(lancadosRes.data || []).map((r) => r.transacao_pierre_id),
    ...(ignoradosRes.data || []).map((r) => r.transacao_pierre_id),
  ]);

  const contas = new Map(
    (Array.isArray(contasPierre?.data) ? contasPierre.data : []).map((c) => [
      String(c.id),
      c.connectorName || c.marketingName || c.customName || c.name || "",
    ]),
  );

  const transacoes = Array.isArray(respostaPierre?.data) ? respostaPierre.data : [];
  const pendentes = transacoes
    .filter(ehRendimentoPierre)
    .map((t) => ({
      transacaoId: idTransacaoPierre(t),
      data: dataTransacaoPierre(t),
      valor: Math.round(Number(t.amount) * 100) / 100,
      descricao: String(t.description || "Rendimento"),
      banco: contas.get(String(t.accountId)) || "",
    }))
    .filter((r) => r.transacaoId && r.data >= RENDIMENTOS_DESDE && !jaTratados.has(r.transacaoId))
    .sort((a, b) => (a.data === b.data ? b.valor - a.valor : b.data.localeCompare(a.data)));

  const caixinhas = caixinhasRes.data || [];
  const porDia = new Map();
  pendentes.forEach((r) => porDia.set(r.data, [...(porDia.get(r.data) || []), r]));
  for (const lista of porDia.values()) {
    const sugestoes = sugerirCaixinhas(lista, caixinhas, comHistorico);
    lista.forEach((r) => (r.caixinhaSugerida = sugestoes.get(r.transacaoId) || null));
  }

  return { pendentes, caixinhas };
}

app.get("/api/caixinhas/rendimentos-pendentes", exigirAdmin, async (_req, res) => {
  try {
    const { pendentes, caixinhas } = await buscarRendimentosPendentes();
    res.json({
      sucesso: true,
      desde: RENDIMENTOS_DESDE,
      pendentes,
      caixinhas: caixinhas.map((c) => ({ id: c.id, nome: c.nome, saldo: Number(c.saldo) || 0 })),
    });
  } catch (erro) {
    console.error("Erro ao buscar rendimentos pendentes:", erro.message);
    res.status(500).json({ sucesso: false, erro: "Não foi possível buscar os rendimentos agora." });
  }
});

// Mostra o que o Pierre manda em cada "Rendimentos" (últimos 10), para ver se
// existe algum campo que identifique o cofrinho. Só leitura.
app.get("/api/caixinhas/rendimentos-brutos", exigirAdmin, async (_req, res) => {
  try {
    const fim = new Date();
    fim.setDate(fim.getDate() + 1);
    const resposta = await pierreRequest("get-transactions", {
      startDate: RENDIMENTOS_DESDE,
      endDate: fim.toISOString().slice(0, 10),
      format: "raw",
    });
    const lista = (Array.isArray(resposta?.data) ? resposta.data : [])
      .filter(ehRendimentoPierre)
      .slice(0, 10)
      .map((t) => {
        // Achata 1 nível e esconde sequências longas de números (contas/cartões)
        const plano = {};
        for (const [k, v] of Object.entries(t)) {
          if (v && typeof v === "object" && !Array.isArray(v)) {
            for (const [k2, v2] of Object.entries(v)) {
              if (v2 === null || typeof v2 !== "object") plano[`${k}.${k2}`] = v2;
            }
          } else if (!Array.isArray(v)) {
            plano[k] = v;
          }
        }
        for (const k of Object.keys(plano)) {
          if (typeof plano[k] === "string") plano[k] = plano[k].replace(/\d{6,}/g, (m) => "•••" + m.slice(-3));
        }
        return plano;
      });
    res.json({ sucesso: true, rendimentos: lista });
  } catch (erro) {
    console.error("Erro ao buscar rendimentos brutos:", erro.message);
    res.status(500).json({ sucesso: false, erro: "Não foi possível consultar o Pierre." });
  }
});

// Lança uma lista de rendimentos pendentes. Recebe [{ transacaoId, caixinhaId }]
// ou [{ transacaoId, ignorar: true }]. O valor sempre vem do Pierre.
async function lancarRendimentos(itens, { pendentes, caixinhas }) {
  const porId = new Map(pendentes.map((p) => [p.transacaoId, p]));
  const saldos = new Map(caixinhas.map((c) => [c.id, Number(c.saldo) || 0]));
  const nomes = new Map(caixinhas.map((c) => [c.id, c.nome]));
  const lancados = [];
  const ignorados = [];
  const recusados = [];

  for (const item of itens) {
    const pendente = porId.get(String(item?.transacaoId || ""));
    if (!pendente) {
      recusados.push({ transacaoId: item?.transacaoId, motivo: "Já lançado, ignorado ou não encontrado no Pierre." });
      continue;
    }

    if (item.ignorar === true) {
      const { error } = await supabaseAdmin
        .from("rendimentos_ignorados")
        .upsert({ transacao_pierre_id: pendente.transacaoId }, { onConflict: "transacao_pierre_id" });
      if (error) throw error;
      ignorados.push(pendente.transacaoId);
      porId.delete(pendente.transacaoId);
      continue;
    }

    const caixinhaId = String(item?.caixinhaId || "");
    if (!saldos.has(caixinhaId)) {
      recusados.push({ transacaoId: pendente.transacaoId, motivo: "Caixinha não encontrada." });
      continue;
    }

    const { error: erroInsert } = await supabaseAdmin.from("rendimentos_caixinhas").insert([
      {
        caixinha_id: caixinhaId,
        valor: pendente.valor,
        descricao: `Rendimento ${pendente.banco || "automático"} · ${pendente.data.split("-").reverse().join("/")}`,
        transacao_pierre_id: pendente.transacaoId,
        created_at: `${pendente.data}T12:00:00Z`,
      },
    ]);
    if (erroInsert) {
      // 23505 = já existe (outro aparelho lançou ao mesmo tempo)
      if (erroInsert.code === "23505") {
        recusados.push({ transacaoId: pendente.transacaoId, motivo: "Já lançado." });
        continue;
      }
      throw erroInsert;
    }

    const novoSaldo = Math.round((saldos.get(caixinhaId) + pendente.valor) * 100) / 100;
    const { error: erroSaldo } = await supabaseAdmin
      .from("caixinhas")
      .update({ saldo: novoSaldo, updated_at: new Date().toISOString() })
      .eq("id", caixinhaId);
    if (erroSaldo) throw erroSaldo;

    saldos.set(caixinhaId, novoSaldo);
    porId.delete(pendente.transacaoId);
    lancados.push({ transacaoId: pendente.transacaoId, caixinhaId, caixinha: nomes.get(caixinhaId), valor: pendente.valor, data: pendente.data });
  }

  return { lancados, ignorados, recusados };
}

app.post("/api/caixinhas/rendimentos-pendentes/confirmar", exigirAdmin, async (req, res) => {
  try {
    const itens = Array.isArray(req.body?.itens) ? req.body.itens.slice(0, 200) : [];
    if (!itens.length) {
      return res.status(400).json({ sucesso: false, erro: "Nenhum rendimento informado." });
    }
    const resultado = await lancarRendimentos(itens, await buscarRendimentosPendentes());
    res.json({ sucesso: true, ...resultado });
  } catch (erro) {
    console.error("Erro ao confirmar rendimentos:", erro.message);
    res.status(500).json({ sucesso: false, erro: "Não foi possível lançar os rendimentos." });
  }
});

// Lança sozinho cada rendimento novo que tem caixinha sugerida.
// Cada transação só é lançada automaticamente UMA vez (rendimentos_auto):
// se você apagar o rendimento da caixinha, ele volta para "conferir" e não
// é relançado sozinho.
app.post("/api/caixinhas/rendimentos-pendentes/automatico", exigirAdmin, async (_req, res) => {
  try {
    const contexto = await buscarRendimentosPendentes();
    const { data: jaAuto, error } = await supabaseAdmin.from("rendimentos_auto").select("transacao_pierre_id");
    if (error) throw error;
    const vistos = new Set((jaAuto || []).map((r) => r.transacao_pierre_id));

    const itens = contexto.pendentes
      .filter((p) => p.caixinhaSugerida && !vistos.has(p.transacaoId))
      .map((p) => ({ transacaoId: p.transacaoId, caixinhaId: p.caixinhaSugerida }));

    const resultado = itens.length ? await lancarRendimentos(itens, contexto) : { lancados: [], ignorados: [], recusados: [] };

    if (resultado.lancados.length) {
      const { error: erroAuto } = await supabaseAdmin
        .from("rendimentos_auto")
        .upsert(resultado.lancados.map((l) => ({ transacao_pierre_id: l.transacaoId })), { onConflict: "transacao_pierre_id" });
      if (erroAuto) throw erroAuto;
    }

    res.json({ sucesso: true, lancados: resultado.lancados });
  } catch (erro) {
    console.error("Erro ao lançar rendimentos automáticos:", erro.message);
    res.status(500).json({ sucesso: false, erro: "Não foi possível lançar os rendimentos automaticamente." });
  }
});

// Rendimentos lançados a partir do Pierre nos últimos 30 dias (para trocar de caixinha)
app.get("/api/caixinhas/rendimentos-recentes", exigirAdmin, async (_req, res) => {
  try {
    const desde = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("rendimentos_caixinhas")
      .select("id, caixinha_id, valor, created_at, transacao_pierre_id")
      .not("transacao_pierre_id", "is", null)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json({
      sucesso: true,
      recentes: (data || []).map((r) => ({
        transacaoId: r.transacao_pierre_id,
        caixinhaId: r.caixinha_id,
        valor: Number(r.valor) || 0,
        data: String(r.created_at).slice(0, 10),
      })),
    });
  } catch (erro) {
    console.error("Erro ao buscar rendimentos recentes:", erro.message);
    res.status(500).json({ sucesso: false, erro: "Não foi possível buscar os rendimentos lançados." });
  }
});

// Move um rendimento lançado para outra caixinha (ajusta os dois saldos)
app.post("/api/caixinhas/rendimentos-recentes/mover", exigirAdmin, async (req, res) => {
  try {
    const transacaoId = String(req.body?.transacaoId || "");
    const destinoId = String(req.body?.caixinhaId || "");
    if (!transacaoId || !destinoId) {
      return res.status(400).json({ sucesso: false, erro: "Informe o rendimento e a caixinha." });
    }

    const { data: rend, error: erroRend } = await supabaseAdmin
      .from("rendimentos_caixinhas")
      .select("id, caixinha_id, valor")
      .eq("transacao_pierre_id", transacaoId)
      .maybeSingle();
    if (erroRend) throw erroRend;
    if (!rend) return res.status(404).json({ sucesso: false, erro: "Rendimento não encontrado." });
    if (rend.caixinha_id === destinoId) return res.json({ sucesso: true });

    const { data: cxs, error: erroCx } = await supabaseAdmin
      .from("caixinhas")
      .select("id, saldo")
      .in("id", [rend.caixinha_id, destinoId]);
    if (erroCx) throw erroCx;
    const origem = cxs.find((c) => c.id === rend.caixinha_id);
    const destino = cxs.find((c) => c.id === destinoId);
    if (!destino) return res.status(404).json({ sucesso: false, erro: "Caixinha não encontrada." });

    const valor = Number(rend.valor) || 0;
    const agora = new Date().toISOString();
    const arred = (v) => Math.round(v * 100) / 100;

    const { error: e1 } = await supabaseAdmin.from("rendimentos_caixinhas").update({ caixinha_id: destinoId }).eq("id", rend.id);
    if (e1) throw e1;
    if (origem) {
      const { error: e2 } = await supabaseAdmin
        .from("caixinhas")
        .update({ saldo: arred((Number(origem.saldo) || 0) - valor), updated_at: agora })
        .eq("id", origem.id);
      if (e2) throw e2;
    }
    const { error: e3 } = await supabaseAdmin
      .from("caixinhas")
      .update({ saldo: arred((Number(destino.saldo) || 0) + valor), updated_at: agora })
      .eq("id", destino.id);
    if (e3) throw e3;

    res.json({ sucesso: true });
  } catch (erro) {
    console.error("Erro ao mover rendimento:", erro.message);
    res.status(500).json({ sucesso: false, erro: "Não foi possível trocar a caixinha." });
  }
});

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

    const { data: caixinha, error: erroCaixinha } = await supabaseAdmin
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

    const { data: rendimento, error: erroRendimento } = await supabaseAdmin
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

    const { data: caixinhaAtualizada, error: erroAtualizacao } = await supabaseAdmin
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
// EDITAR MOVIMENTAÇÃO MANUAL DA CAIXINHA
// ==========================================

app.put(
  "/api/caixinhas/:id/movimentacoes/:movimentacaoId",
  exigirAdmin,
  async (req, res) => {
    try {
      const { id, movimentacaoId } = req.params;
      const { tipo, valor, descricao } = req.body;

      const tiposPermitidos = ["ENTRADA", "SAIDA"];

      if (!tiposPermitidos.includes(tipo)) {
        return res.status(400).json({
          sucesso: false,
          erro: "Tipo inválido. Use ENTRADA ou SAIDA.",
        });
      }

      const valorNumerico = Number(valor);

      if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
        return res.status(400).json({
          sucesso: false,
          erro: "O valor deve ser maior que zero.",
        });
      }

      const { data: movimentacao, error: erroMovimentacao } = await supabaseAdmin
        .from("movimentacoes_caixinhas")
        .select("id, caixinha_id, tipo, valor, descricao, transacao_pierre_id")
        .eq("id", movimentacaoId)
        .eq("caixinha_id", id)
        .single();

      if (erroMovimentacao || !movimentacao) {
        return res.status(404).json({
          sucesso: false,
          erro: "Movimentação não encontrada.",
        });
      }

      if (movimentacao.transacao_pierre_id) {
        return res.status(403).json({
          sucesso: false,
          erro: "Movimentações automáticas do Pierre não podem ser editadas.",
        });
      }

      const { data: caixinha, error: erroCaixinha } = await supabaseAdmin
        .from("caixinhas")
        .select("id, saldo")
        .eq("id", id)
        .single();

      if (erroCaixinha || !caixinha) {
        return res.status(404).json({
          sucesso: false,
          erro: "Caixinha não encontrada.",
        });
      }

      const saldoAtual = Number(caixinha.saldo || 0);
      const valorAntigo = Number(movimentacao.valor || 0);

      const efeitoAntigo =
        movimentacao.tipo === "SAIDA"
          ? -valorAntigo
          : valorAntigo;

      const efeitoNovo =
        tipo === "SAIDA"
          ? -valorNumerico
          : valorNumerico;

      const novoSaldo =
        saldoAtual - efeitoAntigo + efeitoNovo;

      if (novoSaldo < 0) {
        return res.status(400).json({
          sucesso: false,
          erro: "Essa alteração deixaria a caixinha com saldo negativo.",
        });
      }

      const { data: movimentacaoAtualizada, error: erroAtualizacao } =
        await supabaseAdmin
          .from("movimentacoes_caixinhas")
          .update({
            tipo,
            valor: valorNumerico,
            descricao: descricao?.trim() || null,
          })
          .eq("id", movimentacaoId)
          .eq("caixinha_id", id)
          .select()
          .single();

      if (erroAtualizacao) {
        throw erroAtualizacao;
      }

      const { data: caixinhaAtualizada, error: erroSaldo } = await supabaseAdmin
        .from("caixinhas")
        .update({
          saldo: novoSaldo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (erroSaldo) {
        throw erroSaldo;
      }

      res.json({
        sucesso: true,
        mensagem: "Movimentação atualizada com sucesso.",
        movimentacao: movimentacaoAtualizada,
        caixinha: caixinhaAtualizada,
      });
    } catch (erro) {
      console.error("Erro ao editar movimentação:", erro.message);

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  },
);


// ==========================================
// EDITAR QUALQUER LANÇAMENTO MANUAL DA CAIXINHA
// ENTRADA / SAIDA / RENDIMENTO / SALDO INICIAL
// ==========================================

app.put(
  "/api/caixinhas/:id/lancamentos/:origem/:lancamentoId",
  exigirAdmin,
  async (req, res) => {
    try {
      const { id, origem, lancamentoId } = req.params;
      const { tipoDestino, valor, descricao } = req.body;

      const tiposPermitidos = [
        "ENTRADA",
        "SAIDA",
        "RENDIMENTO",
        "SALDO_INICIAL",
      ];

      if (!tiposPermitidos.includes(tipoDestino)) {
        return res.status(400).json({
          sucesso: false,
          erro: "Tipo de lançamento inválido.",
        });
      }

      const valorNumerico = Number(valor);

      if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
        return res.status(400).json({
          sucesso: false,
          erro: "O valor deve ser maior que zero.",
        });
      }

      let efeitoAntigo;

      if (origem === "RENDIMENTO") {
        const { data, error } = await supabaseAdmin
          .from("rendimentos_caixinhas")
          .select("id, caixinha_id, valor, descricao")
          .eq("id", lancamentoId)
          .eq("caixinha_id", id)
          .single();

        if (error || !data) {
          return res.status(404).json({
            sucesso: false,
            erro: "Rendimento não encontrado.",
          });
        }

        efeitoAntigo = Number(data.valor || 0);
      } else if (origem === "MOVIMENTACAO") {
        const { data, error } = await supabaseAdmin
          .from("movimentacoes_caixinhas")
          .select(
            "id, caixinha_id, tipo, valor, descricao, transacao_pierre_id",
          )
          .eq("id", lancamentoId)
          .eq("caixinha_id", id)
          .single();

        if (error || !data) {
          return res.status(404).json({
            sucesso: false,
            erro: "Movimentação não encontrada.",
          });
        }

        if (data.transacao_pierre_id) {
          return res.status(403).json({
            sucesso: false,
            erro: "Movimentações automáticas do Pierre não podem ser editadas.",
          });
        }

        efeitoAntigo =
          data.tipo === "SAIDA"
            ? -Number(data.valor || 0)
            : Number(data.valor || 0);
      } else {
        return res.status(400).json({
          sucesso: false,
          erro: "Origem inválida.",
        });
      }

      const { data: caixinha, error: erroCaixinha } = await supabaseAdmin
        .from("caixinhas")
        .select("id, saldo")
        .eq("id", id)
        .single();

      if (erroCaixinha || !caixinha) {
        return res.status(404).json({
          sucesso: false,
          erro: "Caixinha não encontrada.",
        });
      }

      const efeitoNovo =
        tipoDestino === "SAIDA"
          ? -valorNumerico
          : valorNumerico;

      const novoSaldo =
        Number(caixinha.saldo || 0) -
        efeitoAntigo +
        efeitoNovo;

      if (novoSaldo < 0) {
        return res.status(400).json({
          sucesso: false,
          erro: "Essa alteração deixaria a caixinha com saldo negativo.",
        });
      }

      const descricaoFinal =
        descricao?.trim() ||
        (tipoDestino === "RENDIMENTO"
          ? "Rendimento"
          : tipoDestino === "SALDO_INICIAL"
            ? "Saldo inicial"
            : "");

      if (
        origem === "MOVIMENTACAO" &&
        tipoDestino !== "RENDIMENTO"
      ) {
        const tipoBanco =
          tipoDestino === "SALDO_INICIAL"
            ? "ENTRADA"
            : tipoDestino;

        const { error } = await supabaseAdmin
          .from("movimentacoes_caixinhas")
          .update({
            tipo: tipoBanco,
            valor: valorNumerico,
            descricao: descricaoFinal || null,
          })
          .eq("id", lancamentoId)
          .eq("caixinha_id", id);

        if (error) throw error;
      } else if (
        origem === "RENDIMENTO" &&
        tipoDestino === "RENDIMENTO"
      ) {
        const { error } = await supabaseAdmin
          .from("rendimentos_caixinhas")
          .update({
            valor: valorNumerico,
            descricao: descricaoFinal,
          })
          .eq("id", lancamentoId)
          .eq("caixinha_id", id);

        if (error) throw error;
      } else if (
        origem === "MOVIMENTACAO" &&
        tipoDestino === "RENDIMENTO"
      ) {
        const { data: novoRendimento, error: erroInsercao } =
          await supabaseAdmin
            .from("rendimentos_caixinhas")
            .insert([
              {
                caixinha_id: id,
                valor: valorNumerico,
                descricao: descricaoFinal,
              },
            ])
            .select()
            .single();

        if (erroInsercao) throw erroInsercao;

        const { error: erroExclusao } = await supabaseAdmin
          .from("movimentacoes_caixinhas")
          .delete()
          .eq("id", lancamentoId)
          .eq("caixinha_id", id);

        if (erroExclusao) {
          await supabaseAdmin
            .from("rendimentos_caixinhas")
            .delete()
            .eq("id", novoRendimento.id);

          throw erroExclusao;
        }
      } else {
        const tipoBanco =
          tipoDestino === "SALDO_INICIAL"
            ? "ENTRADA"
            : tipoDestino;

        const { data: novaMovimentacao, error: erroInsercao } =
          await supabaseAdmin
            .from("movimentacoes_caixinhas")
            .insert([
              {
                caixinha_id: id,
                tipo: tipoBanco,
                valor: valorNumerico,
                descricao: descricaoFinal || null,
              },
            ])
            .select()
            .single();

        if (erroInsercao) throw erroInsercao;

        const { error: erroExclusao } = await supabaseAdmin
          .from("rendimentos_caixinhas")
          .delete()
          .eq("id", lancamentoId)
          .eq("caixinha_id", id);

        if (erroExclusao) {
          await supabaseAdmin
            .from("movimentacoes_caixinhas")
            .delete()
            .eq("id", novaMovimentacao.id);

          throw erroExclusao;
        }
      }

      const { data: caixinhaAtualizada, error: erroSaldo } =
        await supabaseAdmin
          .from("caixinhas")
          .update({
            saldo: novoSaldo,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select()
          .single();

      if (erroSaldo) throw erroSaldo;

      res.json({
        sucesso: true,
        mensagem: "Lançamento atualizado com sucesso.",
        caixinha: caixinhaAtualizada,
      });
    } catch (erro) {
      console.error("Erro ao editar lançamento:", erro.message);

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  },
);

// ==========================================
// EXCLUIR MOVIMENTAÇÃO MANUAL DA CAIXINHA
// ==========================================

app.delete(
  "/api/caixinhas/:id/movimentacoes/:movimentacaoId",
  exigirAdmin,
  async (req, res) => {
    try {
      const { id, movimentacaoId } = req.params;

      const { data: movimentacao, error: erroMovimentacao } = await supabaseAdmin
        .from("movimentacoes_caixinhas")
        .select("id, caixinha_id, tipo, valor, transacao_pierre_id")
        .eq("id", movimentacaoId)
        .eq("caixinha_id", id)
        .single();

      if (erroMovimentacao || !movimentacao) {
        return res.status(404).json({
          sucesso: false,
          erro: "Movimentação não encontrada.",
        });
      }

      if (movimentacao.transacao_pierre_id) {
        return res.status(403).json({
          sucesso: false,
          erro: "Movimentações automáticas do Pierre não podem ser excluídas.",
        });
      }

      const { data: caixinha, error: erroCaixinha } = await supabaseAdmin
        .from("caixinhas")
        .select("id, saldo")
        .eq("id", id)
        .single();

      if (erroCaixinha || !caixinha) {
        return res.status(404).json({
          sucesso: false,
          erro: "Caixinha não encontrada.",
        });
      }

      const valor = Number(movimentacao.valor || 0);

      const efeito =
        movimentacao.tipo === "SAIDA"
          ? -valor
          : valor;

      const novoSaldo =
        Number(caixinha.saldo || 0) - efeito;

      if (novoSaldo < 0) {
        return res.status(400).json({
          sucesso: false,
          erro: "Não é possível excluir pois o saldo ficaria negativo.",
        });
      }

      const { error: erroExclusao } = await supabaseAdmin
        .from("movimentacoes_caixinhas")
        .delete()
        .eq("id", movimentacaoId)
        .eq("caixinha_id", id);

      if (erroExclusao) {
        throw erroExclusao;
      }

      const { data: caixinhaAtualizada, error: erroSaldo } = await supabaseAdmin
        .from("caixinhas")
        .update({
          saldo: novoSaldo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (erroSaldo) {
        throw erroSaldo;
      }

      res.json({
        sucesso: true,
        mensagem: "Movimentação excluída com sucesso.",
        caixinha: caixinhaAtualizada,
      });
    } catch (erro) {
      console.error("Erro ao excluir movimentação:", erro.message);

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  },
);

// ==========================================
// EDITAR RENDIMENTO MANUAL
// ==========================================

app.put(
  "/api/caixinhas/:id/rendimentos/:rendimentoId",
  exigirAdmin,
  async (req, res) => {
    try {
      const { id, rendimentoId } = req.params;

      const {
        valor,
        descricao,
        converterParaSaldoInicial = false,
      } = req.body;

      const valorNumerico = Number(valor);

      if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
        return res.status(400).json({
          sucesso: false,
          erro: "O valor deve ser maior que zero.",
        });
      }

      const { data: rendimento, error: erroRendimento } = await supabaseAdmin
        .from("rendimentos_caixinhas")
        .select("id, caixinha_id, valor, descricao")
        .eq("id", rendimentoId)
        .eq("caixinha_id", id)
        .single();

      if (erroRendimento || !rendimento) {
        return res.status(404).json({
          sucesso: false,
          erro: "Rendimento não encontrado.",
        });
      }

      const { data: caixinha, error: erroCaixinha } = await supabaseAdmin
        .from("caixinhas")
        .select("id, saldo")
        .eq("id", id)
        .single();

      if (erroCaixinha || !caixinha) {
        return res.status(404).json({
          sucesso: false,
          erro: "Caixinha não encontrada.",
        });
      }

      const valorAntigo = Number(rendimento.valor || 0);

      const novoSaldo =
        Number(caixinha.saldo || 0) -
        valorAntigo +
        valorNumerico;

      if (novoSaldo < 0) {
        return res.status(400).json({
          sucesso: false,
          erro: "Essa alteração deixaria a caixinha com saldo negativo.",
        });
      }

      if (converterParaSaldoInicial === true) {
        const { data: novaMovimentacao, error: erroInsercao } =
          await supabaseAdmin
            .from("movimentacoes_caixinhas")
            .insert([
              {
                caixinha_id: id,
                tipo: "ENTRADA",
                valor: valorNumerico,
                descricao: descricao?.trim() || "Saldo inicial",
              },
            ])
            .select()
            .single();

        if (erroInsercao) {
          throw erroInsercao;
        }

        const { error: erroExcluirRendimento } = await supabaseAdmin
          .from("rendimentos_caixinhas")
          .delete()
          .eq("id", rendimentoId)
          .eq("caixinha_id", id);

        if (erroExcluirRendimento) {
          await supabaseAdmin
            .from("movimentacoes_caixinhas")
            .delete()
            .eq("id", novaMovimentacao.id);

          throw erroExcluirRendimento;
        }

        const { data: caixinhaAtualizada, error: erroSaldo } = await supabaseAdmin
          .from("caixinhas")
          .update({
            saldo: novoSaldo,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select()
          .single();

        if (erroSaldo) {
          throw erroSaldo;
        }

        return res.json({
          sucesso: true,
          mensagem: "Rendimento convertido para saldo inicial.",
          movimentacao: novaMovimentacao,
          caixinha: caixinhaAtualizada,
        });
      }

      const { data: rendimentoAtualizado, error: erroAtualizacao } =
        await supabaseAdmin
          .from("rendimentos_caixinhas")
          .update({
            valor: valorNumerico,
            descricao: descricao?.trim() || "Rendimento",
          })
          .eq("id", rendimentoId)
          .eq("caixinha_id", id)
          .select()
          .single();

      if (erroAtualizacao) {
        throw erroAtualizacao;
      }

      const { data: caixinhaAtualizada, error: erroSaldo } = await supabaseAdmin
        .from("caixinhas")
        .update({
          saldo: novoSaldo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (erroSaldo) {
        throw erroSaldo;
      }

      res.json({
        sucesso: true,
        mensagem: "Rendimento atualizado com sucesso.",
        rendimento: rendimentoAtualizado,
        caixinha: caixinhaAtualizada,
      });
    } catch (erro) {
      console.error("Erro ao editar rendimento:", erro.message);

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  },
);

// ==========================================
// EXCLUIR RENDIMENTO MANUAL
// ==========================================

app.delete(
  "/api/caixinhas/:id/rendimentos/:rendimentoId",
  exigirAdmin,
  async (req, res) => {
    try {
      const { id, rendimentoId } = req.params;

      const { data: rendimento, error: erroRendimento } = await supabaseAdmin
        .from("rendimentos_caixinhas")
        .select("id, caixinha_id, valor")
        .eq("id", rendimentoId)
        .eq("caixinha_id", id)
        .single();

      if (erroRendimento || !rendimento) {
        return res.status(404).json({
          sucesso: false,
          erro: "Rendimento não encontrado.",
        });
      }

      const { data: caixinha, error: erroCaixinha } = await supabaseAdmin
        .from("caixinhas")
        .select("id, saldo")
        .eq("id", id)
        .single();

      if (erroCaixinha || !caixinha) {
        return res.status(404).json({
          sucesso: false,
          erro: "Caixinha não encontrada.",
        });
      }

      const novoSaldo =
        Number(caixinha.saldo || 0) -
        Number(rendimento.valor || 0);

      if (novoSaldo < 0) {
        return res.status(400).json({
          sucesso: false,
          erro: "Não é possível excluir pois o saldo ficaria negativo.",
        });
      }

      const { error: erroExclusao } = await supabaseAdmin
        .from("rendimentos_caixinhas")
        .delete()
        .eq("id", rendimentoId)
        .eq("caixinha_id", id);

      if (erroExclusao) {
        throw erroExclusao;
      }

      const { data: caixinhaAtualizada, error: erroSaldo } = await supabaseAdmin
        .from("caixinhas")
        .update({
          saldo: novoSaldo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (erroSaldo) {
        throw erroSaldo;
      }

      res.json({
        sucesso: true,
        mensagem: "Rendimento excluído com sucesso.",
        caixinha: caixinhaAtualizada,
      });
    } catch (erro) {
      console.error("Erro ao excluir rendimento:", erro.message);

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  },
);

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

    const { data, error } = await supabaseAdmin
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

    const { error: erroMovimentacoes } = await supabaseAdmin
      .from("movimentacoes_caixinhas")
      .delete()
      .eq("caixinha_id", id);

    if (erroMovimentacoes) {
      throw erroMovimentacoes;
    }

    const { data, error } = await supabaseAdmin
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

    const { data: caixinha, error: erroCaixinha } = await supabaseAdmin
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
    } = await supabaseAdmin
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
    } = await supabaseAdmin
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
// PLANO (checklist e ideias) - BUSCAR E SALVAR
// Tabela: supabase/plano.sql
// ==========================================

function limparPlano(dados) {
  const texto = (valor, max) => String(valor ?? "").slice(0, max);
  const lista = (valor) => (Array.isArray(valor) ? valor.slice(0, 300) : []);
  const done = {};

  if (dados && typeof dados.done === "object" && !Array.isArray(dados.done)) {
    for (const [id, marcado] of Object.entries(dados.done).slice(0, 600)) {
      if (marcado === true) done[texto(id, 40)] = true;
    }
  }

  return {
    done,
    tasks: lista(dados?.tasks).map((t) => ({
      id: texto(t?.id, 40),
      t: texto(t?.t, 200),
      f: Math.min(3, Math.max(0, Number(t?.f) || 0)),
      a: texto(t?.a, 40),
      q: texto(t?.q, 20),
      o: texto(t?.o, 300),
    })),
    ideas: lista(dados?.ideas).map((i) => ({
      id: texto(i?.id, 40),
      t: texto(i?.t, 200),
      p: texto(i?.p, 300),
    })),
  };
}

app.get("/api/plano", exigirAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("plano_usuario")
      .select("dados, updated_at")
      .eq("user_id", req.usuario.id)
      .maybeSingle();

    if (error) throw error;

    res.json({ sucesso: true, plano: data ? limparPlano(data.dados) : null });
  } catch (erro) {
    console.error("Erro ao buscar plano:", erro.message);
    res.status(500).json({ sucesso: false, erro: "Não foi possível carregar o plano." });
  }
});

app.put("/api/plano", exigirAdmin, async (req, res) => {
  try {
    const dados = limparPlano(req.body?.plano);

    const { error } = await supabaseAdmin.from("plano_usuario").upsert(
      { user_id: req.usuario.id, dados, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

    if (error) throw error;

    res.json({ sucesso: true });
  } catch (erro) {
    console.error("Erro ao salvar plano:", erro.message);
    res.status(500).json({ sucesso: false, erro: "Não foi possível salvar o plano." });
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

  contas: (data || []).map((conta) => ({
    id: conta.id,

    name: conta.name,

    amount: Number(conta.amount || 0),

    day: Number(conta.day || 1),

    category: conta.category || "Outros",

    tipo: conta.tipo || "fixa",

    totalParcelas:
      conta.total_parcelas !== null &&
      conta.total_parcelas !== undefined
        ? Number(conta.total_parcelas)
        : null,

    parcelaAtual:
      conta.parcela_atual !== null &&
      conta.parcela_atual !== undefined
        ? Number(conta.parcela_atual)
        : null,

    anoInicioParcela:
      conta.ano_inicio_parcela !== null &&
      conta.ano_inicio_parcela !== undefined
        ? Number(conta.ano_inicio_parcela)
        : null,

    mesInicioParcela:
      conta.mes_inicio_parcela !== null &&
      conta.mes_inicio_parcela !== undefined
        ? Number(conta.mes_inicio_parcela)
        : null,

    pagamentos:
      Array.isArray(conta.pagamentos)
        ? conta.pagamentos
        : [],

    finalizada: conta.finalizada === true,

    created_at: conta.created_at,

    updated_at: conta.updated_at,
  })),
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

    // ==========================================
    // EVITAR DUPLICAÇÃO DE CONTA FIXA
    // ==========================================

    const {
      data: contaExistente,
      error: erroExistente,
    } = await supabase
      .from("contas_fixas")
      .select("id")
      .eq("user_id", req.usuario.id)
      .eq("name", conta.name)
      .eq("amount", conta.amount)
      .eq("day", conta.day)
      .eq("tipo", conta.tipo)
      .maybeSingle();

    if (erroExistente) {
      throw erroExistente;
    }

    if (contaExistente) {
      return res.status(409).json({
        sucesso: false,
        erro: "Essa conta já está cadastrada.",
      });
    }

    const {
      data,
      error,
    } = await supabase
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
// HEALTH CHECK
// ==========================================

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    sucesso: true,
    status: "ok",
  });
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

const servidor = app.listen(PORT, HOST, () => {
  console.log("");

  console.log("=================================");

  console.log("      MEU APP FINANCEIRO");

  console.log("=================================");

  console.log("");

  console.log(`Servidor: http://${HOST}:${PORT}`);

  console.log("");

  console.log("Conexão com o Pierre preparada.");

  console.log("");
});

servidor.on("error", (erro) => {
  console.error("Erro ao iniciar servidor:", erro);
  process.exitCode = 1;
});
