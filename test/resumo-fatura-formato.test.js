// O get-bill-summary por cartão passou a responder data = { totalAmount, ... }
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("incorporarResumos entende data.totalAmount da consulta por cartão", () => {
  const fonte = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const ini = fonte.indexOf("    const resumoPorConta = new Map();");
  const fim = fonte.indexOf("    // ==========================================\n    // RESUMO POR CARTÃO");
  assert.ok(ini > 0 && fim > ini);
  const montar = new Function("accountId", fonte.slice(ini, fim) + "\nreturn { resumoPorConta, incorporarResumos };");
  const { resumoPorConta, incorporarResumos } = montar(null);
  const orig = console.info;
  console.info = () => {};
  incorporarResumos(
    { success: true, data: { totalTransactions: 12, totalAmount: 1018.65, isOfficialBillAmount: false, accounts: [{ id: "x" }], generatedAt: "2026-11-27", userId: "u" } },
    "3cd203e1-a5a4-44d4-8868-5fb50be563ba",
  );
  incorporarResumos(
    { success: true, data: { totalTransactions: 0, totalAmount: 0, isOfficialBillAmount: false, accounts: [], generatedAt: "2026-11-27", userId: "u" } },
    "0881d673-2da4-4eb2-aff3-c2f57e259963",
  );
  console.info = orig;
  assert.equal(resumoPorConta.get("3cd203e1-a5a4-44d4-8868-5fb50be563ba").approx_current_bill_amount, 1018.65);
  assert.equal(resumoPorConta.get("0881d673-2da4-4eb2-aff3-c2f57e259963").approx_current_bill_amount, 0);
});
