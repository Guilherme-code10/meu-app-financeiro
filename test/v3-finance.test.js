const test = require("node:test");
const assert = require("node:assert/strict");

const {
  aplicarOperacaoInvestimento,
  calcularLedgerDolar,
  simularInvestimento,
  configuracaoPeriodo,
} = require("../lib/v3-finance");

test("compra recalcula preço médio ponderado incluindo taxas", () => {
  const resultado = aplicarOperacaoInvestimento(
    { quantidade: 10, precoMedio: 10 },
    { tipo: "COMPRA", quantidade: 5, precoUnitario: 12, taxas: 3 },
  );

  assert.equal(resultado.quantidade, 15);
  assert.equal(resultado.precoMedio, 10.87);
});

test("venda reduz quantidade sem alterar preço médio remanescente", () => {
  const resultado = aplicarOperacaoInvestimento(
    { quantidade: 15, precoMedio: 9.38 },
    { tipo: "VENDA", quantidade: 5, precoUnitario: 10.2, taxas: 0 },
  );

  assert.equal(resultado.quantidade, 10);
  assert.equal(resultado.precoMedio, 9.38);
});

test("ledger de dólar preserva custo médio em gasto e transferência", () => {
  const ledger = calcularLedgerDolar([
    { tipo: "COMPRA", data: "2026-01-01", quantidade_usd: 100, total_brl: 500, iof: 10, tarifas: 0 },
    { tipo: "COMPRA", data: "2026-02-01", quantidade_usd: 100, total_brl: 600, iof: 0, tarifas: 0 },
    { tipo: "GASTO", data: "2026-03-01", quantidade_usd: 50, total_brl: 0, iof: 0, tarifas: 0 },
  ]);

  assert.equal(ledger.saldoUsd, 150);
  assert.equal(ledger.custoMedio, 5.55);
  assert.equal(ledger.custoBaseBrl, 832.5);
});

test("simulador sem reinvestimento não inventa rendimento", () => {
  const resultado = simularInvestimento({
    aporteInicial: 1000,
    aporteMensal: 100,
    anos: 1,
    taxaAnual: 20,
    reinvestir: false,
  });

  assert.equal(resultado.totalAportado, 2200);
  assert.equal(resultado.patrimonioFinal, 2200);
  assert.equal(resultado.rendimentoEstimado, 0);
});

test("períodos de gráfico mapeiam para janelas válidas", () => {
  assert.equal(configuracaoPeriodo("1D").dias, 1);
  assert.equal(configuracaoPeriodo("7D").dias, 7);
  assert.equal(configuracaoPeriodo("5A").range, "5y");
  assert.equal(configuracaoPeriodo("MAX").dias, null);
});

test("ajuste manual de dólar exige base histórica explícita e preserva custo na saída", () => {
  const ledger = calcularLedgerDolar([
    { tipo: "AJUSTE_ENTRADA", data: "2026-04-01", quantidade_usd: 200, total_brl: 1100, iof: 0, tarifas: 0 },
    { tipo: "AJUSTE_SAIDA", data: "2026-04-02", quantidade_usd: 50, total_brl: 0, iof: 0, tarifas: 0 },
  ]);

  assert.equal(ledger.saldoUsd, 150);
  assert.equal(ledger.custoMedio, 5.5);
  assert.equal(ledger.custoBaseBrl, 825);
});
