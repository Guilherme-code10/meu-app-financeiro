function numeroSeguro(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function arredondarMoeda(valor) {
  return Math.round((numeroSeguro(valor) + Number.EPSILON) * 100) / 100;
}

function aplicarOperacaoInvestimento(posicao, operacao) {
  const quantidadeAtual = Math.max(0, numeroSeguro(posicao?.quantidade));
  const precoMedioAtual = Math.max(0, numeroSeguro(posicao?.precoMedio));
  const quantidade = Math.max(0, numeroSeguro(operacao?.quantidade));
  const precoUnitario = Math.max(0, numeroSeguro(operacao?.precoUnitario));
  const taxas = Math.max(0, numeroSeguro(operacao?.taxas));
  const tipo = String(operacao?.tipo || "").toUpperCase();

  if (!quantidade) throw new Error("Quantidade deve ser maior que zero.");

  if (tipo === "COMPRA") {
    if (!precoUnitario) throw new Error("Preço unitário deve ser maior que zero.");
    const novaQuantidade = quantidadeAtual + quantidade;
    const custoAtual = quantidadeAtual * precoMedioAtual;
    const custoCompra = quantidade * precoUnitario + taxas;
    return {
      quantidade: novaQuantidade,
      precoMedio: novaQuantidade
        ? arredondarMoeda((custoAtual + custoCompra) / novaQuantidade)
        : 0,
    };
  }

  if (tipo === "VENDA") {
    if (quantidade > quantidadeAtual) {
      throw new Error("Venda maior que a quantidade disponível.");
    }
    return {
      quantidade: arredondarMoeda(quantidadeAtual - quantidade),
      precoMedio: quantidadeAtual - quantidade > 0 ? precoMedioAtual : 0,
    };
  }

  throw new Error("Tipo de operação inválido.");
}

function calcularLedgerDolar(transacoes = []) {
  let saldoUsd = 0;
  let custoBaseBrl = 0;

  const ordenadas = [...transacoes].sort((a, b) =>
    String(a.data || a.date || "").localeCompare(String(b.data || b.date || ""))
  );

  for (const tx of ordenadas) {
    const tipo = String(tx.tipo || tx.type || "").toUpperCase();
    const usd = Math.max(0, numeroSeguro(tx.quantidade_usd ?? tx.usdAmount));
    const brl = Math.max(0, numeroSeguro(tx.total_brl ?? tx.brlTotal));
    const iof = Math.max(0, numeroSeguro(tx.iof));
    const tarifas = Math.max(0, numeroSeguro(tx.tarifas ?? tx.fees));

    if (!usd) continue;

    if (tipo === "RENDIMENTO") {\n      saldoUsd += usd;\n      continue;\n    }\n\n    if (["COMPRA", "TRANSFERENCIA_ENTRADA", "AJUSTE_ENTRADA"].includes(tipo)) {
      saldoUsd += usd;
      custoBaseBrl += ["COMPRA", "AJUSTE_ENTRADA"].includes(tipo) ? brl + iof + tarifas : brl;
      continue;
    }

    if (["VENDA", "GASTO", "TRANSFERENCIA_SAIDA", "AJUSTE_SAIDA"].includes(tipo)) {
      const removido = Math.min(usd, saldoUsd);
      const custoMedioAntes = saldoUsd > 0 ? custoBaseBrl / saldoUsd : 0;
      saldoUsd -= removido;
      custoBaseBrl -= removido * custoMedioAntes;
      if (saldoUsd <= 0.0000001) {
        saldoUsd = 0;
        custoBaseBrl = 0;
      }
    }
  }

  return {
    saldoUsd: Math.round(saldoUsd * 1e8) / 1e8,
    custoBaseBrl: arredondarMoeda(custoBaseBrl),
    custoMedio: saldoUsd > 0 ? arredondarMoeda(custoBaseBrl / saldoUsd) : 0,
  };
}

function simularInvestimento({
  aporteInicial = 1000,
  aporteMensal = 100,
  anos = 10,
  taxaAnual = 8,
  reinvestir = true,
} = {}) {
  const inicial = Math.max(0, numeroSeguro(aporteInicial));
  const mensal = Math.max(0, numeroSeguro(aporteMensal));
  const meses = Math.max(0, Math.round(numeroSeguro(anos) * 12));
  const taxa = numeroSeguro(taxaAnual) / 100;
  const taxaMensal = Math.pow(1 + taxa, 1 / 12) - 1;

  let patrimonio = inicial;
  let aportado = inicial;
  const pontos = [{ mes: 0, patrimonio: arredondarMoeda(patrimonio), aportado: arredondarMoeda(aportado) }];

  for (let mes = 1; mes <= meses; mes += 1) {
    if (reinvestir) patrimonio *= 1 + taxaMensal;
    patrimonio += mensal;
    aportado += mensal;

    if (mes % 12 === 0 || mes === meses) {
      pontos.push({
        mes,
        patrimonio: arredondarMoeda(patrimonio),
        aportado: arredondarMoeda(aportado),
      });
    }
  }

  return {
    patrimonioFinal: arredondarMoeda(patrimonio),
    totalAportado: arredondarMoeda(aportado),
    rendimentoEstimado: arredondarMoeda(patrimonio - aportado),
    pontos,
  };
}

function configuracaoPeriodo(periodo) {
  const chave = String(periodo || "1M").toUpperCase();
  const mapa = {
    "1D": { range: "5d", interval: "15m", dias: 1 },
    "7D": { range: "1mo", interval: "1h", dias: 7 },
    "1M": { range: "1mo", interval: "1d", dias: 31 },
    "3M": { range: "6mo", interval: "1d", dias: 93 },
    "6M": { range: "6mo", interval: "1d", dias: 186 },
    "1A": { range: "1y", interval: "1d", dias: 366 },
    "5A": { range: "5y", interval: "1wk", dias: 1830 },
    MAX: { range: "max", interval: "1mo", dias: null },
  };
  return mapa[chave] || mapa["1M"];
}

module.exports = {
  numeroSeguro,
  arredondarMoeda,
  aplicarOperacaoInvestimento,
  calcularLedgerDolar,
  simularInvestimento,
  configuracaoPeriodo,
};
