const { randomUUID } = require("crypto");

const WISE_API_BASE_URL =
  String(process.env.WISE_API_BASE_URL || "https://api.wise.com/2026Q4").replace(/\/$/, "");
const BELVO_API_BASE_URL =
  String(process.env.BELVO_API_BASE_URL || "https://api.belvo.com").replace(/\/$/, "");

function erroIntegracao(message, status = 502, codigo = "INTEGRATION_ERROR") {
  const erro = new Error(message);
  erro.status = status;
  erro.codigo = codigo;
  return erro;
}

function wiseConfigurada() {
  return Boolean(String(process.env.WISE_API_TOKEN || "").trim());
}

function belvoConfigurada() {
  return Boolean(
    String(process.env.BELVO_SECRET_ID || "").trim() &&
    String(process.env.BELVO_SECRET_PASSWORD || "").trim() &&
    String(process.env.BELVO_LINK_ID_NUBANK || "").trim()
  );
}

async function requisicaoJson(url, opcoes = {}, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const resposta = await fetchImpl(url, {
      ...opcoes,
      signal: controller.signal,
    });

    const texto = await resposta.text();
    let json = null;

    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = null;
    }

    if (!resposta.ok) {
      const mensagem =
        json?.message ||
        json?.error ||
        json?.detail ||
        `Integração respondeu HTTP ${resposta.status}.`;

      throw erroIntegracao(
        mensagem,
        resposta.status,
        resposta.status === 401 || resposta.status === 403
          ? "INTEGRATION_AUTH_ERROR"
          : "INTEGRATION_HTTP_ERROR",
      );
    }

    return json;
  } catch (erro) {
    if (erro?.name === "AbortError") {
      throw erroIntegracao("A integração demorou demais para responder.", 504, "INTEGRATION_TIMEOUT");
    }
    throw erro;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizarPerfisWise(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.profiles)) return payload.profiles;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizarSaldosWise(payload) {
  const lista = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.balances)
      ? payload.balances
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

  return lista
    .map((item) => {
      const moeda = String(
        item?.currency ||
        item?.amount?.currency ||
        item?.cashAmount?.currency ||
        "",
      ).toUpperCase();

      const valor = Number(
        item?.totalWorth?.value ??
        item?.cashAmount?.value ??
        item?.amount?.value ??
        0,
      );

      return {
        id: String(item?.id ?? ""),
        moeda,
        tipo: String(item?.type || "STANDARD").toUpperCase(),
        nome: item?.name ? String(item.name) : null,
        saldo: Number.isFinite(valor) ? valor : 0,
        disponivel: Number(item?.amount?.value ?? valor ?? 0),
        reservado: Number(item?.reservedAmount?.value ?? 0),
        investmentState: String(item?.investmentState || "UNKNOWN"),
        atualizadoEm: item?.modificationTime || null,
      };
    })
    .filter((item) => item.id && /^[A-Z]{3}$/.test(item.moeda));
}

async function buscarSaldosWise({ fetchImpl = fetch } = {}) {
  const token = String(process.env.WISE_API_TOKEN || "").trim();

  if (!token) {
    throw erroIntegracao(
      "WISE_API_TOKEN não configurado no servidor.",
      503,
      "WISE_NOT_CONFIGURED",
    );
  }

  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "X-External-Correlation-Id": randomUUID(),
  };

  let profileId = String(process.env.WISE_PROFILE_ID || "").trim();

  if (!profileId) {
    const perfisPayload = await requisicaoJson(
      `${WISE_API_BASE_URL}/profiles`,
      { headers },
      fetchImpl,
    );

    const perfis = normalizarPerfisWise(perfisPayload);
    const perfil =
      perfis.find((item) => String(item?.type || "").toLowerCase() === "business") ||
      perfis[0];

    if (!perfil?.id) {
      throw erroIntegracao(
        "A Wise não retornou um perfil acessível para este token.",
        404,
        "WISE_PROFILE_NOT_FOUND",
      );
    }

    profileId = String(perfil.id);
  }

  const saldosPayload = await requisicaoJson(
    `${WISE_API_BASE_URL}/profiles/${encodeURIComponent(profileId)}/balances?types=STANDARD,SAVINGS`,
    { headers },
    fetchImpl,
  );

  return {
    profileId,
    saldos: normalizarSaldosWise(saldosPayload),
    fonte: "Wise API",
    apiVersion: WISE_API_BASE_URL.split("/").pop(),
  };
}

function classeBelvo(tipo) {
  const mapa = {
    VARIABLE_INCOME: "AÇÃO",
    INVESTMENT_FUND: "FUNDO",
    TREASURY_BOND: "TESOURO",
    FIXED_INCOME_BANKING: "RENDA_FIXA",
    FIXED_INCOME_CREDIT: "RENDA_FIXA",
  };

  return mapa[String(tipo || "").toUpperCase()] || "OUTRO";
}

function extrairTickerSeguroBelvo(investimento) {
  const candidatos = [
    investimento?.ticker,
    investimento?.symbol,
    investimento?.product_name,
    investimento?.name,
  ].filter(Boolean);

  for (const candidato of candidatos) {
    const texto = String(candidato).toUpperCase();
    const encontrados = texto.match(/\b[A-Z]{4}\d{1,2}\b/g);

    if (encontrados?.length === 1) {
      return encontrados[0];
    }

    if (/^[A-Z]{4}\d{1,2}$/.test(texto.trim())) {
      return texto.trim();
    }
  }

  return null;
}

function normalizarInvestimentoBelvo(item) {
  const balance = item?.balance || {};
  const quantidade = Number(balance?.quantity ?? 0);
  const precoCompra = Number(balance?.purchase_unit_price ?? item?.issue_unit_price ?? 0);
  const precoReferencia = Number(
    balance?.closing_price ??
    balance?.gross_unit_price ??
    0,
  );
  const valorBruto = Number(balance?.gross_value ?? 0);

  return {
    externalId: String(item?.id || ""),
    ticker: extrairTickerSeguroBelvo(item),
    nomeProduto: String(item?.product_name || ""),
    tipo: String(item?.type || "OUTRO"),
    classe: classeBelvo(item?.type),
    moeda: String(item?.currency || "BRL").toUpperCase(),
    isin: item?.isin_number ? String(item.isin_number) : null,
    quantidade: Number.isFinite(quantidade) ? quantidade : 0,
    precoCompra: Number.isFinite(precoCompra) ? precoCompra : 0,
    precoReferencia: Number.isFinite(precoReferencia) ? precoReferencia : 0,
    valorBruto: Number.isFinite(valorBruto) ? valorBruto : 0,
    referenciaEm: balance?.reference_date || null,
  };
}

async function buscarInvestimentosBelvo({ fetchImpl = fetch } = {}) {
  const secretId = String(process.env.BELVO_SECRET_ID || "").trim();
  const secretPassword = String(process.env.BELVO_SECRET_PASSWORD || "").trim();
  const linkId = String(process.env.BELVO_LINK_ID_NUBANK || "").trim();

  if (!secretId || !secretPassword || !linkId) {
    throw erroIntegracao(
      "Credenciais/link da Belvo não configurados no servidor.",
      503,
      "BELVO_NOT_CONFIGURED",
    );
  }

  const auth = Buffer.from(`${secretId}:${secretPassword}`).toString("base64");
  const query = new URLSearchParams({
    link: linkId,
    page_size: "1000",
  });

  const payload = await requisicaoJson(
    `${BELVO_API_BASE_URL}/api/br/investments/?${query.toString()}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${auth}`,
      },
    },
    fetchImpl,
  );

  const lista = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
      ? payload.results
      : [];

  const investimentos = lista.map(normalizarInvestimentoBelvo);

  return {
    linkId,
    investimentos,
    reconhecidos: investimentos.filter((item) => item.ticker),
    pendentesMapeamento: investimentos.filter((item) => !item.ticker),
    fonte: "Belvo Open Finance",
  };
}

module.exports = {
  WISE_API_BASE_URL,
  BELVO_API_BASE_URL,
  wiseConfigurada,
  belvoConfigurada,
  normalizarSaldosWise,
  buscarSaldosWise,
  classeBelvo,
  extrairTickerSeguroBelvo,
  normalizarInvestimentoBelvo,
  buscarInvestimentosBelvo,
};
