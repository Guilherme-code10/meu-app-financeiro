// Garante que o cache do Pierre entrega uma cópia nova a cada chamada:
// alterar a resposta numa rota não pode afetar a próxima chamada.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("pierreRequest devolve cópia independente do cache", async () => {
  const fonte = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const inicio = fonte.indexOf("const TEMPO_CACHE_PIERRE");
  const fim = fonte.indexOf("async function pierreRequestSemCache");
  assert.ok(inicio > 0 && fim > inicio);

  let chamadasPierre = 0;
  const { AsyncLocalStorage } = require("node:async_hooks");
  const montar = new Function(
    "AsyncLocalStorage",
    "pierreRequestSemCache",
    fonte.slice(inicio, fim) + "\nreturn pierreRequest;",
  );
  const pierreRequest = montar(AsyncLocalStorage, async () => {
    chamadasPierre++;
    return { data: [{ id: "f1", totalAmount: "100.00" }] };
  });

  const a = await pierreRequest("get-bills", {});
  a.data.push({ id: "virtual" });
  a.data[0].totalAmount = "999";

  const b = await pierreRequest("get-bills", {});
  assert.equal(b.data.length, 1);
  assert.equal(b.data[0].totalAmount, "100.00");
  assert.equal(chamadasPierre, 1);
});
