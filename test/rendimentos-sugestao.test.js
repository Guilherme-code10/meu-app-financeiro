// Sugestão de caixinha para os rendimentos do Mercado Pago (pela ordem do saldo)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const fonte = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const ini = fonte.indexOf("function sugerirCaixinhas(");
const fim = fonte.indexOf("async function buscarRendimentosPendentes()");
const sugerirCaixinhas = new Function(fonte.slice(ini, fim) + "\nreturn sugerirCaixinhas;")();

const caixinhas = [
  { id: "fox", saldo: "12403.09" },
  { id: "salarios", saldo: "3512.80" },
  { id: "reembolso", saldo: "1024.84" },
  { id: "multa", saldo: "230.51" },
  { id: "euro", saldo: "150.82" },
  { id: "ajuda", saldo: "121.00" },
  { id: "zerada", saldo: "0.00" },
];
const historico = new Set(["fox", "salarios", "reembolso", "multa", "ajuda", "zerada"]);
const dia = [5.6, 0.18, 0.07, 0.13, 0.11].map((valor, i) => ({ transacaoId: "t" + i, valor }));

test("maior rendimento vai para a caixinha com mais saldo, e assim por diante", () => {
  const s = sugerirCaixinhas(dia, caixinhas, historico);
  assert.equal(s.get("t0"), "fox");
  assert.equal(s.get("t1"), "salarios");
  assert.equal(s.get("t3"), "reembolso");
  assert.equal(s.get("t4"), "multa");
  assert.equal(s.get("t2"), "ajuda");
});

test("ignora caixinha zerada e quem nunca rendeu (quando há histórico)", () => {
  const s = sugerirCaixinhas(dia, caixinhas, historico);
  assert.ok(![...s.values()].includes("zerada"));
  assert.ok(![...s.values()].includes("euro"));
});

test("sem histórico usa todas com saldo; rendimento a mais fica sem sugestão", () => {
  const muitos = Array.from({ length: 8 }, (_, i) => ({ transacaoId: "x" + i, valor: 8 - i }));
  const s = sugerirCaixinhas(muitos, caixinhas, new Set());
  assert.equal(s.size, 6);
  assert.equal(s.get("x0"), "fox");
  assert.equal(s.get("x7"), undefined);
});
