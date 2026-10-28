const express = require("express");
const {
  aplicarOperacaoInvestimento,
  calcularLedgerDolar,
  configuracaoPeriodo,
} = require("../lib/v3-finance");
const {
  wiseConfigurada,
  belvoConfigurada,
  buscarSaldosWise,
  buscarInvestimentosBelvo,
} = require("../lib/v3-integrations");

const BRAPI_URL = "https://brapi.dev/api/quote";
const BCB_PTAX_URL =
  "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo";
const AWESOME_USD_BRL_URL =
  "https://economia.awesomeapi.com.br/json/last/USD-BRL";

let cacheCambioUsdBrl = {
  valor: null,
  expiraEm: 0,
};

function erroTabelaAusente(erro) {
  return ["42P01", "PGRST205"].includes(String(erro?.code || ""));
}

function responderErroBanco(res, erro) {
  if (erroTabelaAusente(erro)) {
    return res.status(503).json({
      sucesso: false,
      codigo: "V3_SCHEMA_REQUIRED",
      erro: "O schema V3 ainda não foi aplicado no Supabase.",
    });
  }

  console.error("Erro V3 no Supabase:", erro);
  return res.status(500).json({
    sucesso: false,
    erro: "Não foi possível acessar os dados do Meu Financeiro V3.",
  });
}

function tickerSeguro(valor) {
  const ticker = String(valor || "")
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9^.]/g, "");

  if (!ticker || ticker.length > 16) {
    throw new Error("Ticker inválido.");
  }

  return ticker;
}

function textoSeguro(valor, limite = 80) {
  return String(valor || "").trim().slice(0, limite);
}

function numeroPositivo(valor, nome) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${nome} deve ser maior que zero.`);
  }
  return n;
}

function dataMercadoIso(valor) {
  if (valor == null || valor === "") return null;

  const numero = Number(valor);
  const data = Number.isFinite(numero) && String(valor).trim() !== ""
    ? new Date(numero < 1e12 ? numero * 1000 : numero)
    : new Date(valor);

  return Number.isNaN(data.getTime())
    ? null
    : data.toISOString();
}

function dataIsoOuHoje(valor) {
  if (!valor) return new Date().toISOString().slice(0, 10);
  const data = new Date(`${String(valor).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(data.getTime())) throw new Error("Data inválida.");
  return data.toISOString().slice(0, 10);
}

function formatarDataPtax(data) {
  const mm = String(data.getMonth() + 1).padStart(2, "0");
  const dd = String(data.getDate()).padStart(2, "0");
  return `${mm}-${dd}-${data.getFullYear()}`;
}

async function buscarPtaxUsdBrl() {
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 10);

  const query = new URLSearchParams({
    "@dataInicial": `'${formatarDataPtax(inicio)}'`,
    "@dataFinalCotacao": `'${formatarDataPtax(fim)}'`,
    "$format": "json",
    "$orderby": "dataHoraCotacao desc",
  });

  const resposta = await fetch(`${BCB_PTAX_URL}(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?${query.toString()}`, {
    headers: { Accept: "application/json" },
  });

  if (!resposta.ok) {
    throw new Error(`BCB PTAX respondeu HTTP ${resposta.status}.`);
  }

  const json = await resposta.json();
  const registros = Array.isArray(json?.value) ? json.value : [];

  if (!registros.length) {
    throw new Error("Banco Central não retornou cotação USD/BRL.");
  }

  const ultimo = registros[0];
  const compra = Number(ultimo.cotacaoCompra || 0);
  const venda = Number(ultimo.cotacaoVenda || 0);
  const meio = compra && venda
    ? Number(((compra + venda) / 2).toFixed(6))
    : compra || venda;

  return {
    par: "USD/BRL",
    compra,
    venda,
    meio,
    atualizadoEm: ultimo.dataHoraCotacao || null,
    fonte: "Banco Central do Brasil - PTAX",
    frequencia: "diária",
    atrasada: true,
  };
}

async function buscarCambioUsdBrlMercado() {
  const agora = Date.now();

  if (cacheCambioUsdBrl.valor && cacheCambioUsdBrl.expiraEm > agora) {
    return cacheCambioUsdBrl.valor;
  }

  const headers = { Accept: "application/json" };
  const awesomeApiKey = String(process.env.AWESOME_API_KEY || "").trim();

  if (awesomeApiKey) {
    headers["x-api-key"] = awesomeApiKey;
  }

  const resposta = await fetch(AWESOME_USD_BRL_URL, {
    headers,
    signal: AbortSignal.timeout(10000),
  });

  if (!resposta.ok) {
    throw new Error(`AwesomeAPI respondeu HTTP ${resposta.status}.`);
  }

  const json = await resposta.json();
  const item = json?.USDBRL;

  if (!item) {
    throw new Error("AwesomeAPI não retornou USD/BRL.");
  }

  const compra = Number(item.bid || 0);
  const venda = Number(item.ask || 0);
  const meio = compra && venda
    ? Number(((compra + venda) / 2).toFixed(6))
    : compra || venda;

  if (!meio) {
    throw new Error("Cotação USD/BRL inválida.");
  }

  const timestamp = Number(item.timestamp || 0);
  const atualizadoEm = timestamp
    ? new Date(timestamp * 1000).toISOString()
    : null;

  const valor = {
    par: "USD/BRL",
    compra,
    venda,
    meio,
    maxima: Number(item.high || 0),
    minima: Number(item.low || 0),
    variacao: Number(item.varBid || 0),
    variacaoPercentual: Number(item.pctChange || 0),
    atualizadoEm,
    fonte: "AwesomeAPI - dólar comercial",
    frequencia: awesomeApiKey
      ? "tempo real"
      : "atualização frequente · cache de até 1 min",
    atrasada: false,
    cacheSegundos: awesomeApiKey ? 15 : 55,
  };

  cacheCambioUsdBrl = {
    valor,
    expiraEm: agora + (awesomeApiKey ? 15000 : 55000),
  };

  return valor;
}

async function buscarCambioBrapiUsdBrl() {
  const token = String(process.env.BRAPI_TOKEN || "").trim();

  if (!token) {
    throw new Error("BRAPI_TOKEN não configurada para fallback cambial.");
  }

  const resposta = await fetch(
    "https://brapi.dev/api/v2/currency?currency=USD-BRL",
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10000),
    },
  );

  const texto = await resposta.text();
  let json = {};

  try {
    json = texto ? JSON.parse(texto) : {};
  } catch {
    json = {};
  }

  if (!resposta.ok) {
    throw new Error(
      json?.message ||
        json?.error ||
        `Brapi câmbio respondeu HTTP ${resposta.status}.`,
    );
  }

  const item = Array.isArray(json?.currency) ? json.currency[0] : null;

  if (!item) {
    throw new Error("Brapi não retornou USD/BRL.");
  }

  const compra = Number(item.bidPrice || 0);
  const venda = Number(item.askPrice || 0);
  const meio = compra && venda
    ? Number(((compra + venda) / 2).toFixed(6))
    : compra || venda;

  if (!meio) {
    throw new Error("Cotação USD/BRL inválida na Brapi.");
  }

  return {
    par: "USD/BRL",
    compra,
    venda,
    meio,
    maxima: Number(item.high || 0),
    minima: Number(item.low || 0),
    variacao: Number(item.bidVariation || 0),
    variacaoPercentual: Number(item.percentageChange || 0),
    atualizadoEm: dataMercadoIso(
      item.updatedAtTimestamp ||
      item.updatedAtDate ||
      null,
    ),
    fonte: "Brapi - câmbio",
    frequencia: "cotação de referência",
    atrasada: true,
    fallback: true,
    aviso:
      "Cotação comercial principal indisponível; usando câmbio da Brapi como referência.",
  };
}

async function buscarCambioFrankfurterUsdBrl() {
  const resposta = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=BRL", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(9000),
  });
  if (!resposta.ok) throw new Error(`Frankfurter respondeu HTTP ${resposta.status}.`);
  const json = await resposta.json();
  const meio = Number(json?.rates?.BRL);
  if (!Number.isFinite(meio) || meio <= 0) throw new Error("Frankfurter não retornou USD/BRL válido.");
  return { par: "USD/BRL", compra: meio, venda: meio, meio, atualizadoEm: json.date ? `${json.date}T00:00:00Z` : null, fonte: "Frankfurter - referência diária (BCE)", frequencia: "diária", atrasada: true, fallback: true, aviso: "Cotação de referência diária; não é cotação comercial em tempo real." };
}

async function buscarCotacaoUsdBrlAtual() {
  const fontes = [buscarCambioUsdBrlMercado, buscarCambioBrapiUsdBrl, buscarPtaxUsdBrl, buscarCambioFrankfurterUsdBrl];
  const erros = [];
  for (const fonte of fontes) {
    try {
      const cotacao = await fonte();
      if (Number.isFinite(Number(cotacao?.meio)) && Number(cotacao.meio) > 0) return cotacao;
    } catch (erro) {
      erros.push(`${fonte.name}: ${erro.message}`);
      console.warn("[V3 USD/BRL] Fonte indisponível:", fonte.name, erro.message);
    }
  }
  const erro = new Error("Todas as fontes de câmbio estão indisponíveis temporariamente.");
  erro.codigo = "FX_SOURCES_UNAVAILABLE";
  console.error("[V3 USD/BRL]", erros.join(" | "));
  throw erro;
}

async function buscarCotacoesAtuais(tickers) {
  const lista = [...new Set(
    (Array.isArray(tickers) ? tickers : String(tickers || "").split(","))
      .map((ticker) => tickerSeguro(ticker))
      .filter(Boolean),
  )].slice(0, 20);

  if (!lista.length) {
    return [];
  }

  const token = String(process.env.BRAPI_TOKEN || "").trim();
  const liberadosSemToken = new Set(["PETR4", "MGLU3", "VALE3", "ITUB4"]);

  if (!token && lista.some((ticker) => !liberadosSemToken.has(ticker))) {
    const erro = new Error("Configure BRAPI_TOKEN no servidor para consultar a carteira.");
    erro.status = 503;
    erro.codigo = "BRAPI_TOKEN_REQUIRED";
    throw erro;
  }

  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const params = new URLSearchParams({
    fundamental: "false",
  });

  const resposta = await fetch(
    `${BRAPI_URL}/${lista.map(encodeURIComponent).join(",")}?${params.toString()}`,
    {
      headers,
      signal: AbortSignal.timeout(12000),
    },
  );

  const texto = await resposta.text();
  let json = {};

  try {
    json = texto ? JSON.parse(texto) : {};
  } catch {
    json = {};
  }

  if (!resposta.ok) {
    const erro = new Error(
      json?.message ||
        json?.error ||
        `Brapi respondeu HTTP ${resposta.status}.`,
    );
    erro.status = resposta.status;
    erro.codigo = json?.code || "BRAPI_ERROR";
    throw erro;
  }

  return (Array.isArray(json?.results) ? json.results : []).map((item) => ({
    ticker: item.symbol,
    nome: item.longName || item.shortName || item.symbol,
    moeda: item.currency || "BRL",
    precoAtual: Number(item.regularMarketPrice || 0),
    variacao: Number(item.regularMarketChange || 0),
    variacaoPercentual: Number(item.regularMarketChangePercent || 0),
    maximaDia: Number(item.regularMarketDayHigh || 0),
    minimaDia: Number(item.regularMarketDayLow || 0),
    atualizadoEm: dataMercadoIso(
      item.regularMarketTime ||
      item.updatedAt ||
      null,
    ),
    fonte: "Brapi",
    atrasoMinutos: Number(process.env.BRAPI_DELAY_MINUTES || 30),
    atrasada: true,
  }));
}

async function buscarMercado(ticker, periodo) {
  const simbolo = tickerSeguro(ticker);
  const cfg = configuracaoPeriodo(periodo);
  const token = String(process.env.BRAPI_TOKEN || "").trim();
  const liberadosSemToken = new Set(["PETR4", "MGLU3", "VALE3", "ITUB4"]);

  if (!token && !liberadosSemToken.has(simbolo)) {
    const erro = new Error("Configure BRAPI_TOKEN no servidor para consultar este ativo.");
    erro.status = 503;
    erro.codigo = "BRAPI_TOKEN_REQUIRED";
    throw erro;
  }

  const incluirDividendos =
    String(process.env.BRAPI_INCLUDE_DIVIDENDS || "")
      .trim()
      .toLowerCase() === "true";

  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  async function consultar(params) {
    const resposta = await fetch(
      `${BRAPI_URL}/${encodeURIComponent(simbolo)}?${params.toString()}`,
      { headers },
    );

    const texto = await resposta.text();
    let json = {};
    try {
      json = texto ? JSON.parse(texto) : {};
    } catch {
      json = {};
    }

    return { resposta, json };
  }

  const params = new URLSearchParams({
    range: cfg.range,
    interval: cfg.interval,
    fundamental: "false",
  });

  if (incluirDividendos) {
    params.set("dividends", "true");
  }

  let { resposta, json } = await consultar(params);
  let historicoLimitado = false;
  let avisoPlano = incluirDividendos
    ? null
    : "Dividendos/JCP da Brapi desativados para compatibilidade com o plano atual.";

  const mensagemErroInicial = String(
    json?.message || json?.error || "",
  );

  if (
    !resposta.ok &&
    incluirDividendos &&
    /dividend|jcp|provento|startup|plano/i.test(mensagemErroInicial)
  ) {
    const semDividendos = new URLSearchParams({
      range: cfg.range,
      interval: cfg.interval,
      fundamental: "false",
    });

    ({ resposta, json } = await consultar(semDividendos));
    avisoPlano =
      "Dividendos/JCP indisponíveis no plano atual; cotação mantida sem proventos.";
  }

  const mensagemErroHistorico = String(
    json?.message || json?.error || "",
  );

  if (
    !resposta.ok &&
    /hist[oó]ric|range|interval|startup|plano|pro\b/i.test(mensagemErroHistorico)
  ) {
    const somenteCotacao = new URLSearchParams({
      fundamental: "false",
    });

    ({ resposta, json } = await consultar(somenteCotacao));
    historicoLimitado = true;
    avisoPlano =
      avisoPlano ||
      "O plano atual não liberou o histórico solicitado; exibindo apenas a cotação disponível.";
  }

  if (!resposta.ok) {
    const erro = new Error(
      json?.message ||
        json?.error ||
        `Brapi respondeu HTTP ${resposta.status}.`,
    );
    erro.status = resposta.status;
    erro.codigo = json?.code || "BRAPI_ERROR";
    throw erro;
  }

  const item = Array.isArray(json?.results) ? json.results[0] : null;
  if (!item) {
    const erro = new Error("Ativo não encontrado na Brapi.");
    erro.status = 404;
    erro.codigo = "ASSET_NOT_FOUND";
    throw erro;
  }

  const agora = Date.now();
  const limiteMs = cfg.dias ? cfg.dias * 24 * 60 * 60 * 1000 : null;

  const historico = (Array.isArray(item.historicalDataPrice)
    ? item.historicalDataPrice
    : [])
    .map((ponto) => ({
      timestamp: Number(ponto.date || ponto.timestamp || 0),
      abertura: Number(ponto.open || 0),
      maxima: Number(ponto.high || 0),
      minima: Number(ponto.low || 0),
      fechamento: Number(ponto.close || 0),
      volume: Number(ponto.volume || 0),
    }))
    .filter((ponto) => {
      if (!ponto.timestamp || !Number.isFinite(ponto.fechamento)) return false;
      if (!limiteMs) return true;
      return agora - ponto.timestamp * 1000 <= limiteMs;
    });

  const dividendos = item?.dividendsData?.cashDividends ||
    item?.dividendsData?.dividends ||
    [];

  return {
    ticker: item.symbol || simbolo,
    nome: item.longName || item.shortName || simbolo,
    moeda: item.currency || "BRL",
    precoAtual: Number(item.regularMarketPrice || 0),
    variacaoPercentual: Number(item.regularMarketChangePercent || 0),
    atualizadoEm: dataMercadoIso(
      item.regularMarketTime ||
      item.updatedAt ||
      null,
    ),
    historico,
    dividendos:
      incluirDividendos && Array.isArray(dividendos)
        ? dividendos
        : [],
    fonte: "Brapi",
    atrasoMinutos: Number(process.env.BRAPI_DELAY_MINUTES || 30),
    atrasada: true,
    periodo: String(periodo || "1M").toUpperCase(),
    recursos: {
      historicoDisponivel: historico.length > 0 && !historicoLimitado,
      dividendosSolicitados: incluirDividendos,
      dividendosDisponiveis:
        incluirDividendos &&
        Array.isArray(dividendos) &&
        dividendos.length > 0,
    },
    avisoPlano,
  };
}

function criarRouterV3({ supabaseAdmin }) {
  if (!supabaseAdmin) throw new Error("supabaseAdmin é obrigatório.");

  const router = express.Router();

  router.get("/status", async (req, res) => {
    const { error } = await supabaseAdmin
      .from("investimentos_posicoes")
      .select("id")
      .eq("user_id", req.usuario.id)
      .limit(1);

    res.json({
      sucesso: true,
      schemaPronto: !error,
      schemaErro: erroTabelaAusente(error) ? "V3_SCHEMA_REQUIRED" : error?.code || null,
      integracoes: {
        pierreContasInvestimento: true,
        pierreSincronizacaoUsdAutomatica: false,
        mercado: "Brapi",
        cambio: "AwesomeAPI - dólar comercial, com fallback para PTAX",
      },
    });
  });

  router.post("/investimentos/bootstrap", async (req, res) => {
    const iniciais = [
      {
        user_id: req.usuario.id,
        ticker: "MXRF11",
        classe: "FII",
        quantidade: 15,
        preco_medio: 9.38,
      },
      {
        user_id: req.usuario.id,
        ticker: "XPML11",
        classe: "FII",
        quantidade: 1,
        preco_medio: 109.27,
      },
    ];

    const { data, error } = await supabaseAdmin
      .from("investimentos_posicoes")
      .upsert(iniciais, {
        onConflict: "user_id,ticker",
        ignoreDuplicates: true,
      })
      .select();

    if (error) return responderErroBanco(res, error);

    res.json({ sucesso: true, inseridos: data || [] });
  });

  router.get("/investimentos", async (req, res) => {
    const [posicoes, operacoes, dividendos] = await Promise.all([
      supabaseAdmin
        .from("investimentos_posicoes")
        .select("*")
        .eq("user_id", req.usuario.id)
        .order("ticker"),
      supabaseAdmin
        .from("investimentos_operacoes")
        .select("*")
        .eq("user_id", req.usuario.id)
        .order("data", { ascending: false }),
      supabaseAdmin
        .from("investimentos_dividendos")
        .select("*")
        .eq("user_id", req.usuario.id)
        .order("data_pagamento", { ascending: false }),
    ]);

    const erro = posicoes.error || operacoes.error || dividendos.error;
    if (erro) return responderErroBanco(res, erro);

    res.json({
      sucesso: true,
      posicoes: posicoes.data || [],
      operacoes: operacoes.data || [],
      dividendos: dividendos.data || [],
    });
  });

  router.post("/investimentos/posicoes", async (req, res) => {
    try {
      const ticker = tickerSeguro(req.body.ticker);
      const quantidade = numeroPositivo(req.body.quantidade, "Quantidade");
      const precoMedio = numeroPositivo(req.body.precoMedio, "Preço médio");
      const classe = textoSeguro(req.body.classe || "OUTRO", 24).toUpperCase();

      const { data, error } = await supabaseAdmin
        .from("investimentos_posicoes")
        .upsert(
          {
            user_id: req.usuario.id,
            ticker,
            classe,
            quantidade,
            preco_medio: precoMedio,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,ticker" },
        )
        .select()
        .single();

      if (error) return responderErroBanco(res, error);
      res.json({ sucesso: true, posicao: data });
    } catch (erro) {
      res.status(400).json({ sucesso: false, erro: erro.message });
    }
  });

  router.post("/investimentos/operacoes", async (req, res) => {
    try {
      const ticker = tickerSeguro(req.body.ticker);
      const tipo = String(req.body.tipo || "").toUpperCase();
      const quantidade = numeroPositivo(req.body.quantidade, "Quantidade");
      const precoUnitario = numeroPositivo(req.body.precoUnitario, "Preço unitário");
      const taxas = Math.max(0, Number(req.body.taxas || 0));
      const data = dataIsoOuHoje(req.body.data);

      if (!["COMPRA", "VENDA"].includes(tipo)) {
        return res.status(400).json({ sucesso: false, erro: "Tipo de operação inválido." });
      }

      if (tipo === "RENDIMENTO" && (totalBrl !== 0 || iof !== 0 || tarifas !== 0)) {\n        return res.status(400).json({ sucesso: false, erro: "Rendimento em USD não pode incluir custo em BRL, IOF ou tarifas." });\n      }\n\n      const { data: atual, error: erroAtual } = await supabaseAdmin
        .from("investimentos_posicoes")
        .select("*")
        .eq("user_id", req.usuario.id)
        .eq("ticker", ticker)
        .maybeSingle();

      if (erroAtual) return responderErroBanco(res, erroAtual);

      const nova = aplicarOperacaoInvestimento(
        {
          quantidade: atual?.quantidade || 0,
          precoMedio: atual?.preco_medio || 0,
        },
        { tipo, quantidade, precoUnitario, taxas },
      );

      const { data: operacao, error: erroOperacao } = await supabaseAdmin
        .from("investimentos_operacoes")
        .insert({
          user_id: req.usuario.id,
          ticker,
          tipo,
          quantidade,
          preco_unitario: precoUnitario,
          taxas,
          data,
        })
        .select()
        .single();

      if (erroOperacao) return responderErroBanco(res, erroOperacao);

      const { data: posicao, error: erroPosicao } = await supabaseAdmin
        .from("investimentos_posicoes")
        .upsert(
          {
            user_id: req.usuario.id,
            ticker,
            classe: atual?.classe || textoSeguro(req.body.classe || "OUTRO", 24).toUpperCase(),
            quantidade: nova.quantidade,
            preco_medio: nova.precoMedio,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,ticker" },
        )
        .select()
        .single();

      if (erroPosicao) {
        await supabaseAdmin
          .from("investimentos_operacoes")
          .delete()
          .eq("id", operacao.id)
          .eq("user_id", req.usuario.id);
        return responderErroBanco(res, erroPosicao);
      }

      res.json({ sucesso: true, operacao, posicao });
    } catch (erro) {
      res.status(400).json({ sucesso: false, erro: erro.message });
    }
  });

  router.post("/investimentos/dividendos", async (req, res) => {
    try {
      const ticker = tickerSeguro(req.body.ticker);
      const valor = numeroPositivo(req.body.valor, "Valor");
      const dataPagamento = dataIsoOuHoje(req.body.dataPagamento);

      const { data, error } = await supabaseAdmin
        .from("investimentos_dividendos")
        .insert({
          user_id: req.usuario.id,
          ticker,
          valor,
          data_pagamento: dataPagamento,
          anunciado: req.body.anunciado === true,
          recebido: req.body.recebido !== false,
          origem: textoSeguro(req.body.origem || "MANUAL", 24).toUpperCase(),
        })
        .select()
        .single();

      if (error) return responderErroBanco(res, error);
      res.json({ sucesso: true, dividendo: data });
    } catch (erro) {
      res.status(400).json({ sucesso: false, erro: erro.message });
    }
  });

  router.get("/mercado-cotacoes", async (req, res) => {
    try {
      const tickers = String(req.query.tickers || "")
        .split(",")
        .map((ticker) => ticker.trim())
        .filter(Boolean);

      const cotacoes = await buscarCotacoesAtuais(tickers);

      res.json({
        sucesso: true,
        cotacoes,
        atrasoMinutos: Number(process.env.BRAPI_DELAY_MINUTES || 30),
        atualizadoEm: new Date().toISOString(),
      });
    } catch (erro) {
      res.status(erro.status || 502).json({
        sucesso: false,
        codigo: erro.codigo || "MARKET_DATA_ERROR",
        erro: erro.message,
      });
    }
  });

  router.get("/mercado/:ticker", async (req, res) => {
    try {
      const dados = await buscarMercado(req.params.ticker, req.query.periodo || "1M");
      res.json({ sucesso: true, ...dados });
    } catch (erro) {
      res.status(erro.status || 502).json({
        sucesso: false,
        codigo: erro.codigo || "MARKET_DATA_ERROR",
        erro: erro.message,
      });
    }
  });

  router.get("/moedas/usdbrl", async (_req, res) => {
    try {
      const cotacao = await buscarCotacaoUsdBrlAtual();
      res.json({ sucesso: true, cotacao });
    } catch (erro) {
      res.status(502).json({ sucesso: false, erro: erro.message });
    }
  });

  router.get("/moedas/contas", async (req, res) => {
    const [contas, movimentos] = await Promise.all([
      supabaseAdmin
        .from("moedas_contas")
        .select("*")
        .eq("user_id", req.usuario.id)
        .eq("moeda", "USD")
        .order("instituicao"),
      supabaseAdmin
        .from("moedas_movimentacoes")
        .select("*")
        .eq("user_id", req.usuario.id)
        .eq("moeda", "USD")
        .order("data", { ascending: true }),
    ]);

    const erro = contas.error || movimentos.error;
    if (erro) return responderErroBanco(res, erro);

    const todas = movimentos.data || [];
    const resultado = (contas.data || []).map((conta) => {
      const transacoes = todas.filter((tx) => String(tx.conta_id) === String(conta.id));
      const ledger = calcularLedgerDolar(transacoes);
      const saldoSincronizado =
        conta.saldo_sincronizado == null
          ? null
          : Number(conta.saldo_sincronizado);
      const temSaldoSincronizado =
        Number.isFinite(saldoSincronizado);
      const saldoEfetivo =
        temSaldoSincronizado
          ? saldoSincronizado
          : ledger.saldoUsd;
      const custoHistoricoCompleto =
        !temSaldoSincronizado ||
        Math.abs(Number(ledger.saldoUsd || 0) - saldoSincronizado) < 0.01;

      return {
        ...conta,
        ...ledger,
        saldoLedgerUsd: ledger.saldoUsd,
        saldoSincronizadoUsd: temSaldoSincronizado ? saldoSincronizado : null,
        saldoUsd: saldoEfetivo,
        modoSaldo: temSaldoSincronizado ? "SINCRONIZADO" : "MANUAL",
        custoHistoricoCompleto,
        transacoes: transacoes.slice().reverse(),
      };
    });

    res.json({ sucesso: true, contas: resultado });
  });

  router.post("/moedas/contas", async (req, res) => {
    const instituicao = textoSeguro(req.body.instituicao, 80);
    const nome = textoSeguro(req.body.nome || req.body.instituicao, 80);

    if (!instituicao) {
      return res.status(400).json({ sucesso: false, erro: "Informe a instituição." });
    }

    const { data, error } = await supabaseAdmin
      .from("moedas_contas")
      .insert({
        user_id: req.usuario.id,
        instituicao,
        nome,
        moeda: "USD",
      })
      .select()
      .single();

    if (error) return responderErroBanco(res, error);
    res.json({ sucesso: true, conta: data });
  });

  router.post("/moedas/movimentacoes", async (req, res) => {
    try {
      const contaId = textoSeguro(req.body.contaId, 64);
      const tipo = String(req.body.tipo || "").toUpperCase();
      const tipos = ["COMPRA", "VENDA", "GASTO", "AJUSTE_ENTRADA", "AJUSTE_SAIDA", "RENDIMENTO"];

      if (!tipos.includes(tipo)) {
        return res.status(400).json({ sucesso: false, erro: "Tipo de movimentação inválido." });
      }

      const quantidadeUsd = numeroPositivo(req.body.quantidadeUsd, "Quantidade em USD");
      const totalBrl = Math.max(0, Number(req.body.totalBrl || 0));
      const iof = Math.max(0, Number(req.body.iof || 0));
      const tarifas = Math.max(0, Number(req.body.tarifas || 0));
      const data = dataIsoOuHoje(req.body.data);

      const { data: conta, error: erroConta } = await supabaseAdmin
        .from("moedas_contas")
        .select("id")
        .eq("id", contaId)
        .eq("user_id", req.usuario.id)
        .maybeSingle();

      if (erroConta) return responderErroBanco(res, erroConta);
      if (!conta) return res.status(404).json({ sucesso: false, erro: "Conta não encontrada." });

      if (["COMPRA", "AJUSTE_ENTRADA"].includes(tipo) && totalBrl <= 0) {
        return res.status(400).json({ sucesso: false, erro: "Informe o total pago em reais." });
      }

      const { data: atual, error: erroAtual } = await supabaseAdmin
        .from("moedas_movimentacoes")
        .select("*")
        .eq("conta_id", contaId)
        .eq("user_id", req.usuario.id)
        .order("data", { ascending: true });

      if (erroAtual) return responderErroBanco(res, erroAtual);

      const ledger = calcularLedgerDolar(atual || []);
      if (["VENDA", "GASTO", "AJUSTE_SAIDA"].includes(tipo) && quantidadeUsd > ledger.saldoUsd) {
        return res.status(400).json({ sucesso: false, erro: "Saldo em USD insuficiente." });
      }

      const cotacaoEfetiva =
        tipo === "COMPRA"
          ? (totalBrl + iof + tarifas) / quantidadeUsd
          : totalBrl > 0
            ? totalBrl / quantidadeUsd
            : null;

      const { data: movimento, error } = await supabaseAdmin
        .from("moedas_movimentacoes")
        .insert({
          user_id: req.usuario.id,
          conta_id: contaId,
          moeda: "USD",
          tipo,
          data,
          quantidade_usd: quantidadeUsd,
          total_brl: totalBrl,
          iof,
          tarifas,
          cotacao_efetiva: cotacaoEfetiva,
          observacao: textoSeguro(req.body.observacao, 160) || null,
        })
        .select()
        .single();

      if (error) return responderErroBanco(res, error);
      res.json({ sucesso: true, movimentacao: movimento });
    } catch (erro) {
      res.status(400).json({ sucesso: false, erro: erro.message });
    }
  });

  router.post("/moedas/transferencias", async (req, res) => {
    try {
      const origemId = textoSeguro(req.body.origemId, 64);
      const destinoId = textoSeguro(req.body.destinoId, 64);
      const quantidadeUsd = numeroPositivo(req.body.quantidadeUsd, "Quantidade em USD");
      const data = dataIsoOuHoje(req.body.data);

      if (!origemId || !destinoId || origemId === destinoId) {
        return res.status(400).json({ sucesso: false, erro: "Contas de origem e destino inválidas." });
      }

      const { data: contas, error: erroContas } = await supabaseAdmin
        .from("moedas_contas")
        .select("id")
        .eq("user_id", req.usuario.id)
        .in("id", [origemId, destinoId]);

      if (erroContas) return responderErroBanco(res, erroContas);
      if ((contas || []).length !== 2) {
        return res.status(404).json({ sucesso: false, erro: "Conta de origem ou destino não encontrada." });
      }

      const { data: origemMovs, error: erroMovs } = await supabaseAdmin
        .from("moedas_movimentacoes")
        .select("*")
        .eq("conta_id", origemId)
        .eq("user_id", req.usuario.id)
        .order("data", { ascending: true });

      if (erroMovs) return responderErroBanco(res, erroMovs);

      const ledger = calcularLedgerDolar(origemMovs || []);
      if (quantidadeUsd > ledger.saldoUsd) {
        return res.status(400).json({ sucesso: false, erro: "Saldo em USD insuficiente para transferir." });
      }

      const custoTransferido = quantidadeUsd * ledger.custoMedio;
      const transferenciaId = require("crypto").randomUUID();

      const base = {
        user_id: req.usuario.id,
        moeda: "USD",
        data,
        quantidade_usd: quantidadeUsd,
        total_brl: custoTransferido,
        iof: 0,
        tarifas: 0,
        cotacao_efetiva: ledger.custoMedio || null,
        transferencia_id: transferenciaId,
      };

      const { data: saida, error: erroSaida } = await supabaseAdmin
        .from("moedas_movimentacoes")
        .insert({ ...base, conta_id: origemId, tipo: "TRANSFERENCIA_SAIDA" })
        .select()
        .single();

      if (erroSaida) return responderErroBanco(res, erroSaida);

      const { data: entrada, error: erroEntrada } = await supabaseAdmin
        .from("moedas_movimentacoes")
        .insert({ ...base, conta_id: destinoId, tipo: "TRANSFERENCIA_ENTRADA" })
        .select()
        .single();

      if (erroEntrada) {
        await supabaseAdmin
          .from("moedas_movimentacoes")
          .delete()
          .eq("id", saida.id)
          .eq("user_id", req.usuario.id);
        return responderErroBanco(res, erroEntrada);
      }

      res.json({ sucesso: true, saida, entrada });
    } catch (erro) {
      res.status(400).json({ sucesso: false, erro: erro.message });
    }
  });

  router.get("/integracoes/wise/preview", async (_req, res) => {
    try {
      const dados = await buscarSaldosWise();
      res.json({ sucesso: true, ...dados });
    } catch (erro) {
      res.status(erro.status || 502).json({
        sucesso: false,
        codigo: erro.codigo || "WISE_ERROR",
        erro: erro.message,
      });
    }
  });

  router.post("/integracoes/wise/sincronizar", async (req, res) => {
    try {
      const dados = await buscarSaldosWise();
      const usd = dados.saldos.filter((item) => item.moeda === "USD");

      if (!usd.length) {
        return res.status(404).json({
          sucesso: false,
          codigo: "WISE_USD_NOT_FOUND",
          erro: "A Wise não retornou saldo em USD para o perfil configurado.",
        });
      }

      const sincronizados = [];

      for (const saldo of usd) {
        const { data: existentes, error: erroBusca } = await supabaseAdmin
          .from("moedas_contas")
          .select("*")
          .eq("user_id", req.usuario.id)
          .eq("moeda", "USD")
          .order("created_at", { ascending: true });

        if (erroBusca) return responderErroBanco(res, erroBusca);

        const existente =
          (existentes || []).find(
            (conta) =>
              String(conta.external_id || "") === String(saldo.id),
          ) ||
          (existentes || []).find(
            (conta) =>
              String(conta.instituicao || "").trim().toLowerCase() === "wise" &&
              !conta.external_id,
          );

        const payload = {
          user_id: req.usuario.id,
          instituicao: "Wise",
          nome: existente?.nome || saldo.nome || "Wise · Dólares",
          moeda: "USD",
          fonte: "WISE_API",
          external_id: String(saldo.id),
          saldo_sincronizado: saldo.saldo,
          sincronizado_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        let respostaBanco;

        if (existente?.id) {
          respostaBanco = await supabaseAdmin
            .from("moedas_contas")
            .update(payload)
            .eq("id", existente.id)
            .eq("user_id", req.usuario.id)
            .select()
            .single();
        } else {
          respostaBanco = await supabaseAdmin
            .from("moedas_contas")
            .insert(payload)
            .select()
            .single();
        }

        if (respostaBanco.error) {
          return responderErroBanco(res, respostaBanco.error);
        }

        sincronizados.push(respostaBanco.data);
      }

      res.json({
        sucesso: true,
        contas: sincronizados,
        profileId: dados.profileId,
        sincronizadoEm: new Date().toISOString(),
      });
    } catch (erro) {
      res.status(erro.status || 502).json({
        sucesso: false,
        codigo: erro.codigo || "WISE_SYNC_ERROR",
        erro: erro.message,
      });
    }
  });

  router.get("/integracoes/belvo/investimentos/preview", async (_req, res) => {
    try {
      const dados = await buscarInvestimentosBelvo();
      res.json({ sucesso: true, ...dados });
    } catch (erro) {
      res.status(erro.status || 502).json({
        sucesso: false,
        codigo: erro.codigo || "BELVO_ERROR",
        erro: erro.message,
      });
    }
  });

  router.post("/integracoes/belvo/investimentos/sincronizar", async (req, res) => {
    try {
      const dados = await buscarInvestimentosBelvo();
      const sincronizados = [];
      const ignorados = [];

      for (const item of dados.reconhecidos) {
        if (
          item.moeda !== "BRL" ||
          !item.ticker ||
          !Number.isFinite(item.quantidade) ||
          item.quantidade <= 0
        ) {
          ignorados.push(item);
          continue;
        }

        const { data: existente, error: erroAtual } = await supabaseAdmin
          .from("investimentos_posicoes")
          .select("*")
          .eq("user_id", req.usuario.id)
          .eq("ticker", item.ticker)
          .maybeSingle();

        if (erroAtual) return responderErroBanco(res, erroAtual);

        const precoMedioBelvo =
          Number.isFinite(item.precoCompra) && item.precoCompra > 0
            ? item.precoCompra
            : null;

        if (!existente && !precoMedioBelvo) {
          ignorados.push({
            ...item,
            motivo: "Preço médio não informado pela fonte e não existe posição manual para preservar.",
          });
          continue;
        }

        const payload = {
          user_id: req.usuario.id,
          ticker: item.ticker,
          classe: existente?.classe || item.classe || "OUTRO",
          quantidade: item.quantidade,
          preco_medio: existente
            ? Number(existente.preco_medio || 0)
            : precoMedioBelvo,
          fonte: "BELVO",
          external_id: item.externalId || existente?.external_id || null,
          nome_produto: item.nomeProduto || existente?.nome_produto || null,
          preco_referencia_sincronizado:
            item.precoReferencia > 0 ? item.precoReferencia : null,
          valor_bruto_sincronizado:
            item.valorBruto > 0 ? item.valorBruto : null,
          sincronizado_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data: posicao, error } = await supabaseAdmin
          .from("investimentos_posicoes")
          .upsert(payload, { onConflict: "user_id,ticker" })
          .select()
          .single();

        if (error) return responderErroBanco(res, error);
        sincronizados.push(posicao);
      }

      res.json({
        sucesso: true,
        sincronizados,
        ignorados,
        pendentesMapeamento: dados.pendentesMapeamento,
        sincronizadoEm: new Date().toISOString(),
      });
    } catch (erro) {
      res.status(erro.status || 502).json({
        sucesso: false,
        codigo: erro.codigo || "BELVO_SYNC_ERROR",
        erro: erro.message,
      });
    }
  });

  router.get("/integracoes", (_req, res) => {
    res.json({
      sucesso: true,
      pierre: {
        contasInvestimento: "O app reconhece contas Pierre do tipo INVESTMENT, mas não depende dele para posições detalhadas.",
        moedas: "Não há sincronização automática de saldos USD implementada pelo Pierre neste projeto.",
      },
      wise: {
        configurada: wiseConfigurada(),
        modo: wiseConfigurada() ? "API" : "MANUAL",
        observacao: wiseConfigurada()
          ? "Credencial Wise disponível no servidor. A sincronização depende das permissões do token/perfil."
          : "Sem credencial Wise compatível. Conta pessoal comum pode permanecer em modo manual/importação.",
      },
      belvo: {
        configurada: belvoConfigurada(),
        modo: belvoConfigurada() ? "OPEN_FINANCE" : "MANUAL",
        observacao: belvoConfigurada()
          ? "Conector Belvo preparado para investimentos do link Nubank configurado."
          : "Sem credenciais/link Belvo. A carteira Nubank continua manual com cotações pela Brapi.",
      },
      brapi: {
        configurada: Boolean(String(process.env.BRAPI_TOKEN || "").trim()),
        atrasoMinutosEstimado: Number(process.env.BRAPI_DELAY_MINUTES || 30),
      },
      cambio: {
        fonte: "AwesomeAPI - dólar comercial",
        frequencia: "atualização frequente; sem chave pode haver cache de até 1 min",
        fallback: "Banco Central do Brasil - PTAX",
      },
    });
  });

  return router;
}

module.exports = {
  criarRouterV3,
  buscarPtaxUsdBrl,
  buscarCambioUsdBrlMercado,
  buscarCambioBrapiUsdBrl,
  buscarCotacaoUsdBrlAtual,
  buscarCotacoesAtuais,
  buscarMercado,
};
