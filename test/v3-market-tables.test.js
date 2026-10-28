const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buscarCambioUsdBrlMercado,
  buscarCambioBrapiUsdBrl,
  buscarCotacoesAtuais,
} = require("../routes/v3");

function respostaJson(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

test("cotação USD/BRL comercial normaliza bid, ask e horário", async () => {
  const fetchOriginal = global.fetch;
  const keyOriginal = process.env.AWESOME_API_KEY;

  delete process.env.AWESOME_API_KEY;

  global.fetch = async (url) => {
    assert.match(String(url), /economia\.awesomeapi\.com\.br\/json\/last\/USD-BRL/);

    return respostaJson({
      USDBRL: {
        bid: "5.2500",
        ask: "5.2600",
        high: "5.3000",
        low: "5.2000",
        varBid: "0.0100",
        pctChange: "0.19",
        timestamp: "1793196000",
      },
    });
  };

  try {
    const cotacao = await buscarCambioUsdBrlMercado();

    assert.equal(cotacao.compra, 5.25);
    assert.equal(cotacao.venda, 5.26);
    assert.equal(cotacao.meio, 5.255);
    assert.equal(cotacao.variacaoPercentual, 0.19);
    assert.equal(cotacao.fonte, "AwesomeAPI - dólar comercial");
    assert.match(cotacao.atualizadoEm, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    global.fetch = fetchOriginal;
    if (keyOriginal === undefined) delete process.env.AWESOME_API_KEY;
    else process.env.AWESOME_API_KEY = keyOriginal;
  }
});

test("cotações da carteira são buscadas em lote na Brapi", async () => {
  const fetchOriginal = global.fetch;
  const tokenOriginal = process.env.BRAPI_TOKEN;

  process.env.BRAPI_TOKEN = "token-teste";

  global.fetch = async (url, opcoes = {}) => {
    const texto = String(url);

    assert.match(texto, /\/api\/quote\/MXRF11,XPML11/);
    assert.equal(opcoes.headers.Authorization, "Bearer token-teste");

    return respostaJson({
      results: [
        {
          symbol: "MXRF11",
          shortName: "MXRF11",
          currency: "BRL",
          regularMarketPrice: 9.45,
          regularMarketChange: 0.03,
          regularMarketChangePercent: 0.32,
          regularMarketTime: 1793196000,
        },
        {
          symbol: "XPML11",
          shortName: "XPML11",
          currency: "BRL",
          regularMarketPrice: 111.2,
          regularMarketChange: -0.5,
          regularMarketChangePercent: -0.45,
          regularMarketTime: 1793196000,
        },
      ],
    });
  };

  try {
    const cotacoes = await buscarCotacoesAtuais(["MXRF11", "XPML11", "MXRF11"]);

    assert.equal(cotacoes.length, 2);
    assert.equal(cotacoes[0].ticker, "MXRF11");
    assert.equal(cotacoes[0].precoAtual, 9.45);
    assert.equal(cotacoes[1].ticker, "XPML11");
    assert.equal(cotacoes[1].variacaoPercentual, -0.45);
    assert.match(cotacoes[0].atualizadoEm, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    global.fetch = fetchOriginal;
    if (tokenOriginal === undefined) delete process.env.BRAPI_TOKEN;
    else process.env.BRAPI_TOKEN = tokenOriginal;
  }
});


test("fallback cambial da Brapi usa a BRAPI_TOKEN existente", async () => {
  const fetchOriginal = global.fetch;
  const tokenOriginal = process.env.BRAPI_TOKEN;

  process.env.BRAPI_TOKEN = "token-cambio-teste";

  global.fetch = async (url, opcoes = {}) => {
    assert.match(String(url), /brapi\.dev\/api\/v2\/currency\?currency=USD-BRL/);
    assert.equal(opcoes.headers.Authorization, "Bearer token-cambio-teste");

    return respostaJson({
      currency: [
        {
          fromCurrency: "USD",
          toCurrency: "BRL",
          bidPrice: "5.2100",
          askPrice: "5.2300",
          high: "5.2500",
          low: "5.1800",
          bidVariation: "0.0200",
          percentageChange: "0.38",
          updatedAtTimestamp: "1793196000",
        },
      ],
    });
  };

  try {
    const cotacao = await buscarCambioBrapiUsdBrl();

    assert.equal(cotacao.compra, 5.21);
    assert.equal(cotacao.venda, 5.23);
    assert.equal(cotacao.meio, 5.22);
    assert.equal(cotacao.fonte, "Brapi - câmbio");
    assert.equal(cotacao.fallback, true);
    assert.match(cotacao.atualizadoEm, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    global.fetch = fetchOriginal;
    if (tokenOriginal === undefined) delete process.env.BRAPI_TOKEN;
    else process.env.BRAPI_TOKEN = tokenOriginal;
  }
});
