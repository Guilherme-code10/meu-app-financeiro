"use strict";

const centavos = (valor) => {
  const numero = Math.abs(Number(valor));
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
};

function lerParcela(descricao) {
  const match = String(descricao || "").match(/(?:^|[^\d/])(\d{1,3})\s*\/\s*(\d{1,3})(?![\d/])/);
  if (!match) return null;
  const numero = Number(match[1]);
  const total = Number(match[2]);
  return numero > 0 && numero <= total && total <= 600 ? { numero, total } : null;
}

function adicionarMeses(dataOriginal, quantidade) {
  const data = new Date(dataOriginal);
  if (!dataOriginal || !Number.isFinite(data.getTime())) return null;
  const dia = data.getUTCDate();
  data.setUTCDate(1);
  data.setUTCMonth(data.getUTCMonth() + quantidade);
  const ultimoDia = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 0)).getUTCDate();
  data.setUTCDate(Math.min(dia, ultimoDia));
  return data.toISOString().slice(0, 10);
}

function paga(parcela) {
  if (parcela.projetada) return false;
  if (typeof parcela.paga === "boolean") return parcela.paga;
  // Compatibilidade com o histórico que só fornece status do lançamento.
  return ["POSTED", "PAID", "SETTLED"].includes(parcela.status);
}

function valorFrequente(valores) {
  const frequencias = new Map();
  for (const valor of valores) if (valor > 0) frequencias.set(valor, (frequencias.get(valor) || 0) + 1);
  return [...frequencias].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] || 0;
}

function reconstruirParcelas(compra, parcelas, transacoes, nome, cartaoId) {
  const identificadas = transacoes.map(transacao => ({
    transacao, info: lerParcela(transacao.description),
  })).filter(item => item.info);
  const totalDeclarado = Math.max(Number(compra.totalInstallments || 0), Number(compra.totalParcelas || 0), lerParcela(compra.description)?.total || 0);
  const total = totalDeclarado > 1 ? totalDeclarado : Math.max(totalDeclarado, ...identificadas.map(item => item.info.total), ...parcelas.map(item => item.totalParcelas || 0));
  if (!Number.isInteger(total) || total < 1 || total > 600) return { parcelas, valorEstimado: false };

  const mapa = new Map();
  for (const parcela of parcelas) {
    const numero = Number(parcela.parcelaAtual);
    if (numero < 1 || numero > total || !Number.isInteger(numero)) continue;
    const anterior = mapa.get(numero);
    if (!anterior || (anterior.projetada && !parcela.projetada)) mapa.set(numero, { ...parcela });
  }
  // Inclui também transações reais ausentes da lista get-installments.
  for (const { transacao, info } of identificadas) {
    if (info.total !== total || !centavos(transacao.amount)) continue;
    const anterior = mapa.get(info.numero);
    mapa.set(info.numero, {
      ...anterior,
      descricao: nome,
      parcelaAtual: info.numero,
      totalParcelas: total,
      valor: centavos(transacao.amount) / 100,
      vencimento: anterior?.vencimento || transacao.date || null,
      status: String(transacao.status || anterior?.status || "PENDING").toUpperCase(),
      paga: anterior?.projetada ? undefined : anterior?.paga,
      accountId: transacao.account_id || transacao.accountId || cartaoId,
      projetada: false,
    });
  }
  const reais = [...mapa.values()].filter(p => !p.projetada && centavos(p.valor) > 0);
  const faltantes = Array.from({ length: total }, (_, i) => i + 1).filter(i => !reais.some(p => p.parcelaAtual === i));
  const somaReal = reais.reduce((soma, p) => soma + centavos(p.valor), 0);
  const totalInformado = centavos(compra.totalAmount);
  const baseReal = valorFrequente(reais.filter(p => p.parcelaAtual > 1).map(p => centavos(p.valor)));
  const baseInformada = centavos(compra.installmentValue) || centavos(compra.installmentAmount);
  const baseProjetada = valorFrequente([...mapa.values()].filter(p => p.projetada && p.parcelaAtual > 1).map(p => centavos(p.valor)));
  const baseTotal = faltantes.length && totalInformado > somaReal ? (totalInformado - somaReal) / faltantes.length : 0;
  // O restante inclui parcelas reais ainda pendentes: não se divide pelo número de linhas ausentes.
  const restante = centavos(compra.amountRemaining);
  const pendentesConhecidas = reais.filter(p => !paga(p)).reduce((soma, p) => soma + centavos(p.valor), 0);
  const baseRestante = faltantes.length && restante > pendentesConhecidas ? (restante - pendentesConhecidas) / faltantes.length : 0;
  const baseConfiavel = baseReal || baseInformada || baseProjetada || baseTotal || baseRestante;
  const base = baseConfiavel || centavos(reais[0]?.valor);
  const referencia = reais.find(p => p.vencimento) || [...mapa.values()].find(p => p.vencimento);
  const dataReferencia = referencia?.vencimento || compra.purchaseDate;
  const numeroReferencia = referencia?.parcelaAtual || 1;
  const resultado = [];
  for (let numero = 1; numero <= total; numero++) {
    const existente = mapa.get(numero);
    const real = reais.find(p => p.parcelaAtual === numero);
    resultado.push({
      ...(existente || {}),
      descricao: existente?.descricao || nome,
      parcelaAtual: numero,
      totalParcelas: total,
      valor: real ? centavos(real.valor) / 100 : Math.round(base) / 100,
      vencimento: existente?.vencimento || adicionarMeses(dataReferencia, numero - numeroReferencia),
      status: real ? real.status : "PENDING",
      paga: real ? real.paga : false,
      accountId: existente?.accountId || cartaoId,
      projetada: !real,
    });
  }
  // Ajusta somente centavos de arredondamento nas projeções; nunca altera um lançamento real.
  const diferenca = totalInformado - resultado.reduce((soma, p) => soma + centavos(p.valor), 0);
  if (totalInformado > 0 && faltantes.length && Math.abs(diferenca) <= faltantes.length) {
    let ajuste = diferenca;
    for (const parcela of [...resultado].reverse()) {
      if (!ajuste) break;
      if (!parcela.projetada || centavos(parcela.valor) + Math.sign(ajuste) <= 0) continue;
      parcela.valor = (centavos(parcela.valor) + Math.sign(ajuste)) / 100;
      ajuste -= Math.sign(ajuste);
    }
  }
  return { parcelas: resultado, valorEstimado: faltantes.length > 0 && !baseConfiavel };
}

module.exports = { reconstruirParcelas, lerParcela, adicionarMeses };
