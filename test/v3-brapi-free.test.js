const test = require("node:test");
const assert = require("node:assert/strict");

const { buscarMercado } = require("../routes/v3");

function respostaJson(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

test("Brapi gratuita não solicita dividendos por padrão e mantém cotação", async () => {
  const fetchOriginal = global.fetch;
  const tokenOriginal = process.env.BRAPI_TOKEN;
  const dividendsOriginal = process.env.BRAPI_INCLUDE_DIVIDENDS;
  const chamadas = [];

  process.env.BRAPI_TOKEN = "token-teste";
  delete process.env.BRAPI_INCLUDE_DIVIDENDS;

  global.fetch = async (url) => {
    chamadas.push(String(url));
    return respostaJson({
      results: [
        {
          symbol: "MXRF11",
          shortName: "MXRF11",
          currency: "BRL",
          regularMarketPrice: 9.41,
          regularMarketChangePercent: 0.42,
          regularMarketTime: "2026-10-27T16:00:00Z",
          historicalDataPrice: [
            {
              date: Math.floor(Date.now() / 1000) - 86400,
              close: 9.35,
              open: 9.30,
              high: 9.45,
              low: 9.28,
              volume: 1000,
            },
          ],
        },
      ],
    });
  };

  try {
    const dados = await buscarMercado("MXRF11", "1M");

    assert.equal(dados.precoAtual, 9.41);
    assert.equal(dados.historico.length, 1);
    assert.equal(dados.recursos.dividendosSolicitados, false);
    assert.match(dados.avisoPlano, /Dividendos\/JCP/);
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].includes("dividends=true"), false);
  } finally {
    global.fetch = fetchOriginal;
    if (tokenOriginal === undefined) delete process.env.BRAPI_TOKEN;
    else process.env.BRAPI_TOKEN = tokenOriginal;
    if (dividendsOriginal === undefined) delete process.env.BRAPI_INCLUDE_DIVIDENDS;
    else process.env.BRAPI_INCLUDE_DIVIDENDS = dividendsOriginal;
  }
});

test("Brapi faz fallback sem dividendos quando plano bloqueia proventos", async () => {
  const fetchOriginal = global.fetch;
  const tokenOriginal = process.env.BRAPI_TOKEN;
  const dividendsOriginal = process.env.BRAPI_INCLUDE_DIVIDENDS;
  const chamadas = [];

  process.env.BRAPI_TOKEN = "token-teste";
  process.env.BRAPI_INCLUDE_DIVIDENDS = "true";

  global.fetch = async (url) => {
    chamadas.push(String(url));

    if (String(url).includes("dividends=true")) {
      return respostaJson(
        {
          message: "Dividendos e JCP requer o plano Startup.",
        },
        403,
      );
    }

    return respostaJson({
      results: [
        {
          symbol: "XPML11",
          shortName: "XPML11",
          currency: "BRL",
          regularMarketPrice: 110.25,
          regularMarketChangePercent: 0.11,
          historicalDataPrice: [],
        },
      ],
    });
  };

  try {
    const dados = await buscarMercado("XPML11", "1M");

    assert.equal(dados.precoAtual, 110.25);
    assert.equal(chamadas.length, 2);
    assert.equal(chamadas[0].includes("dividends=true"), true);
    assert.equal(chamadas[1].includes("dividends=true"), false);
    assert.match(dados.avisoPlano, /indisponíveis no plano atual/i);
  } finally {
    global.fetch = fetchOriginal;
    if (tokenOriginal === undefined) delete process.env.BRAPI_TOKEN;
    else process.env.BRAPI_TOKEN = tokenOriginal;
    if (dividendsOriginal === undefined) delete process.env.BRAPI_INCLUDE_DIVIDENDS;
    else process.env.BRAPI_INCLUDE_DIVIDENDS = dividendsOriginal;
  }
});
