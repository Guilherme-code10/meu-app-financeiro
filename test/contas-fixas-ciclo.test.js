const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function carregarFuncao(contas) {
  const fonte = fs.readFileSync("public/app.js", "utf8");
  const inicio = fonte.indexOf("function obterResumoContasFixasPorCiclo");
  const fim = fonte.indexOf("\n\nfunction obterResumoContasFixasMesAtual", inicio);

  assert.ok(inicio >= 0, "função de resumo por ciclo não encontrada");
  assert.ok(fim > inicio, "fim da função de resumo por ciclo não encontrado");

  const trecho = fonte.slice(inicio, fim);
  const contexto = {
    pegarContasFixas: () => contas,
    resultado: null,
  };

  vm.createContext(contexto);
  vm.runInContext(
    trecho + "\nresultado = obterResumoContasFixasPorCiclo;",
    contexto,
  );

  return contexto.resultado;
}

test("ciclo 11/10 a 10/11 usa novembro para conta que vence dia 10", () => {
  const resumo = carregarFuncao([
    {
      name: "Faculdade",
      amount: 161,
      day: 10,
      tipo: "fixa",
      pagamentos: ["2026-10"],
      finalizada: false,
    },
  ])({
    anoReferencia: 2026,
    mesReferencia: 9,
  });

  assert.equal(resumo.total, 161);
  assert.equal(resumo.pago, 0);
  assert.equal(resumo.pendente, 161);
  assert.equal(resumo.pendentes[0].vencimento, "2026-11");
});

test("ciclo 11/10 a 10/11 mantém outubro para conta que vence dia 30", () => {
  const resumo = carregarFuncao([
    {
      name: "Aluguel",
      amount: 300,
      day: 30,
      tipo: "fixa",
      pagamentos: ["2026-10"],
      finalizada: false,
    },
  ])({
    anoReferencia: 2026,
    mesReferencia: 9,
  });

  assert.equal(resumo.total, 300);
  assert.equal(resumo.pago, 300);
  assert.equal(resumo.pendente, 0);
});

test("parcela do dia 10 avança para a competência seguinte no ciclo", () => {
  const resumo = carregarFuncao([
    {
      name: "Euro",
      amount: 150,
      day: 10,
      tipo: "parcelada",
      pagamentos: ["2026-10"],
      finalizada: false,
      anoInicioParcela: 2026,
      mesInicioParcela: 9,
      totalParcelas: 2,
      parcelaAtual: 1,
    },
  ])({
    anoReferencia: 2026,
    mesReferencia: 9,
  });

  assert.equal(resumo.parcelasTotal, 150);
  assert.equal(resumo.parcelasPago, 0);
  assert.equal(resumo.parcelasPendente, 150);
  assert.equal(resumo.pendentes[0].vencimento, "2026-11");
});
