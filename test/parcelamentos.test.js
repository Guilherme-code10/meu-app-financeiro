const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const helpers = require('../lib/parcelamentos');
const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const start = server.indexOf('app.get("/api/installments"');
const end = server.indexOf('\n});', start) + 4;
const appSource = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const uiStart = appSource.indexOf('function mostrarParcelas()');
const uiEnd = appSource.indexOf('function mostrarParcelasForaCartao()', uiStart);

async function executar(compra, transacoes = [], todas = false) {
  let handler;
  const context = {
    ...helpers, console, exigirAdmin() {},
    app: { get: (_path, _auth, callback) => { handler = callback; } },
    pierreRequest: async endpoint => {
      if (endpoint === 'get-installments') return { data: { purchases: compra == null ? [] : [compra] } };
      if (endpoint === 'get-transactions') return { data: transacoes };
      return { data: [{ id: 'card', type: 'CREDIT', name: 'Cartão teste' }] };
    },
  };
  vm.runInNewContext(server.slice(start, end), context);
  let resultado;
  await handler({ query: {} }, { json: value => { resultado = value; }, status: code => { throw Error(`HTTP ${code}`); } });
  assert.equal(resultado.sucesso, true);
  return todas ? resultado.compras : resultado.compras[0];
}
function render(compra, status = 'ANDAMENTO') {
  const elementos = new Map();
  const context = {
    state: { parcelamentos: [compra], cartoes: [], transacoes: [] },
    window: { parcelasStatus: status },
    document: { querySelector: selector => {
      if (selector.includes('Filtro')) return null;
      if (!elementos.has(selector)) elementos.set(selector, { style: {}, textContent: '', innerHTML: '' });
      return elementos.get(selector);
    } },
    dinheiro: value => Number(value).toFixed(2), escapar: value => String(value),
    dataBR: value => String(value),
  };
  vm.runInNewContext(appSource.slice(uiStart, uiEnd) + '\nmostrarParcelas();', context);
  return { total: elementos.get('#parcelasValorTotal').textContent, pago: elementos.get('#parcelasJaPago').textContent,
    restante: elementos.get('#parcelasRestante').textContent, html: elementos.get('#parcelasLista').innerHTML };
}
const compra = (nome = 'Aerovias', total = 10) => ({ description: nome, totalInstallments: total, accountId: 'card', purchaseDate: '2026-01-31', installments: [] });
const tx = (numero, valor, nome = 'Aerovias', total = 10) => ({ description: `${nome} ${numero}/${total}`, amount: valor, account_id: 'card', date: helpers.adicionarMeses('2026-01-31', numero - 1), status: 'POSTED' });

test('Aerovias: preserva 803,03, usa transação 2/10 e reconstrói as dez parcelas', async () => {
  const c = await executar(compra(), [tx(1, 803.03), tx(2, 346.50)]);
  assert.equal(c.parcelas.length, 10);
  assert.equal(c.valorTotal, 3921.53);
  assert.equal(c.parcelas[0].valor, 803.03);
  assert.equal(c.parcelas[9].valor, 346.50);
  assert.equal(c.parcelas[1].vencimento, '2026-02-28');
  assert.equal(c.parcelas[9].vencimento, '2026-10-31');
  const ui = render(c);
  assert.equal(ui.total, '3921.53'); assert.equal(ui.pago, '1149.53'); assert.equal(ui.restante, '2772.00');
  assert.match(ui.html, /3\/10/); assert.match(ui.html, /Projetada/);
});

test('Aerovias: só primeira real e base explícita, futuras zeradas ou incorretas são reconstruídas', async () => {
  const raw = compra(); raw.installmentValue = 346.50;
  raw.installments = Array.from({ length: 10 }, (_, i) => ({ installmentNumber: i + 1, amount: i ? (i % 2 ? 0 : 803.03) : 803.03, isProjected: i > 0, status: 'POSTED' }));
  const c = await executar(raw, [tx(1, 803.03)]);
  assert.equal(c.valorTotal, 3921.53);
  const ui = render(c); assert.equal(ui.pago, '803.03'); assert.equal(ui.restante, '3118.50');
  assert.match(ui.html, /2\/10/);
});

test('Mercado Pago: 15 parcelas, centavos, pago e restante no frontend', async () => {
  const raw = compra('Mercado Pago', 15); raw.totalAmount = 2002.89;
  const c = await executar(raw, [tx(1, 133.61, 'Mercado Pago', 15)]);
  assert.equal(c.parcelas.length, 15); assert.equal(c.valorTotal, 2002.89);
  assert.equal(c.parcelas[0].valor, 133.61); assert.ok(c.parcelas.slice(1).every(p => p.valor === 133.52));
  const ui = render(c); assert.equal(ui.pago, '133.61'); assert.equal(ui.restante, '1869.28');
  assert.match(ui.html, /2\/15/); assert.match(ui.html, /2027-03-31/);
});

test('valor de parcela real posterior prevalece sobre base e projeções incorretas', async () => {
  const raw = compra(); raw.installmentValue = 803.03;
  const c = await executar(raw, [tx(1, 803.03), tx(3, 346.50)]);
  assert.equal(c.valorTotal, 3921.53); assert.equal(c.parcelas[1].projetada, true);
});

test('somente 3/15: retrocede datas sem inventar pagamento de 1 e 2', async () => {
  const c = await executar(compra('Loja', 15), [tx(3, 100, 'Loja', 15)]);
  assert.equal(c.parcelas.length, 15); assert.equal(c.parcelas[0].vencimento, '2026-01-31');
  assert.equal(render(c).pago, '100.00'); assert.equal(render(c).restante, '1400.00');
});

test('saldo restante desconta parcelas conhecidas pendentes antes de inferir base', async () => {
  const raw = compra(); raw.amountRemaining = 3465;
  raw.installments = [{ installmentNumber: 1, amount: 346.5, status: 'PENDING', isPaid: false }];
  const c = await executar(raw); assert.equal(c.valorTotal, 3465); assert.equal(render(c).pago, '0.00');
});

test('apenas primeira sem referência é identificada como estimativa', async () => {
  const c = await executar(compra(), [tx(1, 803.03)]);
  assert.equal(c.parcelas.length, 10); assert.equal(c.valorEstimado, true);
  assert.match(render(c).html, /Total da compra \(estimado\)/);
});

test('não mistura cartão, outro total de parcelas ou compra distante', async () => {
  const raw = compra(); raw.installmentValue = 346.5;
  const c = await executar(raw, [tx(1, 803.03), { ...tx(2, 999), account_id: 'other' }, tx(2, 888, 'Aerovias', 15), { ...tx(2, 777), date: '2025-02-28' }]);
  assert.equal(c.valorTotal, 3921.53);
});

test('finalizada exige todas as parcelas pagas; isPaid false prevalece sobre POSTED', async () => {
  const raw = compra('Loja', 2);
  raw.installments = [1, 2].map(i => ({ installmentNumber: i, amount: 100, isPaid: true, status: 'POSTED' }));
  let c = await executar(raw); assert.match(render(c, 'FINALIZADAS').html, /Finalizada/);
  raw.installments[0].isPaid = false;
  c = await executar(raw); assert.equal(render(c).pago, '100.00'); assert.equal(render(c).restante, '100.00');
});

test('arredondamento ajusta apenas centavos projetados', async () => {
  const raw = compra('Loja', 3); raw.totalAmount = 100;
  const c = await executar(raw, [tx(1, 33.33, 'Loja', 3)]);
  assert.equal(c.valorTotal, 100); assert.equal(c.parcelas[0].valor, 33.33);
});

test('totalInstallments 1 malformado é recuperado da descrição 1/10', async () => {
  const raw = compra(); raw.totalInstallments = 1; raw.installmentValue = 346.5;
  const c = await executar(raw, [tx(1, 803.03)]);
  assert.equal(c.parcelas.length, 10); assert.equal(c.totalParcelas, 10); assert.equal(c.valorTotal, 3921.53);
});

test('compra ausente de purchases é recuperada das transações do cartão', async () => {
  const c = await executar(null, [tx(1, 803.03), tx(2, 346.50)]);
  assert.ok(c, 'Aerovias não pode desaparecer quando só existe em get-transactions');
  assert.equal(c.totalParcelas, 10); assert.equal(c.valorTotal, 3921.53);
  assert.match(render(c).html, /Aerovias/);
});

test('descrição sem espaço AEROVIAS1/10 não vira compra finalizada de uma parcela', async () => {
  const raw = compra('AEROVIAS', 1);
  raw.installments = [{ installmentNumber: 1, totalInstallments: 1, amount: 803.03, status: 'POSTED' }];
  const c = await executar(raw, [ { ...tx(1, 803.03), description: 'AEROVIAS1/10' }, { ...tx(2, 346.50), description: 'AEROVIAS2/10' } ]);
  assert.equal(c.parcelas.length, 10); assert.equal(c.valorTotal, 3921.53);
  assert.match(render(c).html, /AEROVIAS/);
});

test('recuperação não duplica a compra já retornada pelo Pierre', async () => {
  const compras = await executar(compra(), [tx(1, 803.03), tx(2, 346.50)], true);
  assert.equal(compras.length, 1);
});

test('recuperação exclui estornos, contas não identificadas e datas inválidas', async () => {
  const compras = await executar(null, [
    { ...tx(1, 100), type: 'CREDIT' },
    { ...tx(1, 100), account_id: 'conta-corrente' },
    { ...tx(1, 100), date: null },
  ], true);
  assert.equal(compras.length, 0);
});

test('reconhece descrição colada sem interpretar uma data como parcela', () => {
  assert.deepEqual(helpers.lerParcela('AEROVIAS01/10BR'), { numero: 1, total: 10 });
  assert.equal(helpers.lerParcela('COMPRA 10/12/2026'), null);
  assert.equal(helpers.lerParcela('COMPRA 11/10'), null);
});
