const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizarSaldosWise,
  buscarSaldosWise,
  extrairTickerSeguroBelvo,
  normalizarInvestimentoBelvo,
  buscarInvestimentosBelvo,
} = require("../lib/v3-integrations");

function respostaJson(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

test("Wise: normaliza saldo usando totalWorth sem expor token", () => {
  const saldos = normalizarSaldosWise([
    {
      id: 200001,
      currency: "USD",
      type: "STANDARD",
      amount: { value: 120.5, currency: "USD" },
      cashAmount: { value: 120.5, currency: "USD" },
      totalWorth: { value: 121.25, currency: "USD" },
      reservedAmount: { value: 0.75, currency: "USD" },
      modificationTime: "2026-10-27T12:00:00Z",
    },
  ]);

  assert.equal(saldos.length, 1);
  assert.equal(saldos[0].id, "200001");
  assert.equal(saldos[0].moeda, "USD");
  assert.equal(saldos[0].saldo, 121.25);
  assert.equal(saldos[0].reservado, 0.75);
});

test("Wise: busca saldos de perfil configurado", async () => {
  const antigos = {
    token: process.env.WISE_API_TOKEN,
    profile: process.env.WISE_PROFILE_ID,
  };

  process.env.WISE_API_TOKEN = "token-de-teste";
  process.env.WISE_PROFILE_ID = "123";

  try {
    const urls = [];
    const dados = await buscarSaldosWise({
      fetchImpl: async (url, options) => {
        urls.push({ url: String(url), auth: options.headers.Authorization });
        return respostaJson([
          {
            id: 99,
            currency: "USD",
            type: "STANDARD",
            totalWorth: { value: 500, currency: "USD" },
          },
        ]);
      },
    });

    assert.equal(dados.profileId, "123");
    assert.equal(dados.saldos[0].saldo, 500);
    assert.match(urls[0].url, /profiles\/123\/balances/);
    assert.equal(urls[0].auth, "Bearer token-de-teste");
  } finally {
    if (antigos.token === undefined) delete process.env.WISE_API_TOKEN;
    else process.env.WISE_API_TOKEN = antigos.token;
    if (antigos.profile === undefined) delete process.env.WISE_PROFILE_ID;
    else process.env.WISE_PROFILE_ID = antigos.profile;
  }
});

test("Belvo: identifica ticker somente quando há padrão seguro", () => {
  assert.equal(extrairTickerSeguroBelvo({ product_name: "MXRF11" }), "MXRF11");
  assert.equal(extrairTickerSeguroBelvo({ product_name: "Fundo Imobiliário XP Malls" }), null);
});

test("Belvo: normaliza investimento e preserva preço de compra/referência", () => {
  const item = normalizarInvestimentoBelvo({
    id: "abc",
    type: "VARIABLE_INCOME",
    currency: "BRL",
    product_name: "ITUB4",
    isin_number: "BRITUBACNPR1",
    balance: {
      quantity: 10,
      purchase_unit_price: 31.5,
      closing_price: 34.2,
      gross_value: 342,
      reference_date: "2026-10-27T12:00:00Z",
    },
  });

  assert.equal(item.ticker, "ITUB4");
  assert.equal(item.classe, "AÇÃO");
  assert.equal(item.quantidade, 10);
  assert.equal(item.precoCompra, 31.5);
  assert.equal(item.precoReferencia, 34.2);
  assert.equal(item.valorBruto, 342);
});

test("Belvo: consulta investimentos com autenticação Basic e link configurado", async () => {
  const antigos = {
    id: process.env.BELVO_SECRET_ID,
    password: process.env.BELVO_SECRET_PASSWORD,
    link: process.env.BELVO_LINK_ID_NUBANK,
  };

  process.env.BELVO_SECRET_ID = "id-teste";
  process.env.BELVO_SECRET_PASSWORD = "senha-teste";
  process.env.BELVO_LINK_ID_NUBANK = "link-teste";

  try {
    let chamada;
    const dados = await buscarInvestimentosBelvo({
      fetchImpl: async (url, options) => {
        chamada = { url: String(url), auth: options.headers.Authorization };
        return respostaJson({
          results: [
            {
              id: "inv-1",
              type: "VARIABLE_INCOME",
              currency: "BRL",
              product_name: "BBSE3",
              balance: {
                quantity: 4,
                purchase_unit_price: 32,
                closing_price: 35,
                gross_value: 140,
              },
            },
          ],
        });
      },
    });

    assert.equal(dados.reconhecidos.length, 1);
    assert.equal(dados.reconhecidos[0].ticker, "BBSE3");
    assert.match(chamada.url, /link=link-teste/);
    assert.match(chamada.auth, /^Basic /);
  } finally {
    if (antigos.id === undefined) delete process.env.BELVO_SECRET_ID;
    else process.env.BELVO_SECRET_ID = antigos.id;
    if (antigos.password === undefined) delete process.env.BELVO_SECRET_PASSWORD;
    else process.env.BELVO_SECRET_PASSWORD = antigos.password;
    if (antigos.link === undefined) delete process.env.BELVO_LINK_ID_NUBANK;
    else process.env.BELVO_LINK_ID_NUBANK = antigos.link;
  }
});
