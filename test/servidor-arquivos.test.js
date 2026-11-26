// Sobe o servidor de verdade e confere a entrega dos arquivos do site:
// gzip, cache longo para JS/CSS versionados (?v=) e index.html sempre conferido.
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const zlib = require("node:zlib");

const PORTA = 39000 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORTA}`;
let servidor;

test.before(async () => {
  servidor = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: {
      ...process.env,
      PORT: String(PORTA),
      HOST: "127.0.0.1",
      SUPABASE_URL: "http://127.0.0.1:9",
      SUPABASE_PUBLISHABLE_KEY: "teste",
      SUPABASE_SERVICE_ROLE_KEY: "teste",
      PIERRE_API_KEY: "teste",
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(BASE + "/index.html");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("servidor não subiu");
});

test.after(() => servidor?.kill());

test("JS versionado vai comprimido e com cache longo", async () => {
  const r = await fetch(BASE + "/v4.js?v=teste", { headers: { "accept-encoding": "gzip" } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-encoding"), "gzip");
  assert.match(r.headers.get("cache-control"), /max-age=2592000/);
  assert.match(r.headers.get("content-type"), /javascript/);
  assert.match(await r.text(), /MEU FINANCEIRO V4/);
});

test("index.html vai comprimido e sem cache longo", async () => {
  const r = await fetch(BASE + "/", { headers: { "accept-encoding": "gzip" } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-encoding"), "gzip");
  assert.equal(r.headers.get("cache-control"), "no-cache");
  assert.match(await r.text(), /<!DOCTYPE html>/i);
});

test("ETag repetido devolve 304", async () => {
  const r1 = await fetch(BASE + "/style.css?v=1", { headers: { "accept-encoding": "gzip" } });
  await r1.arrayBuffer();
  const etag = r1.headers.get("etag");
  assert.ok(etag);
  const r2 = await fetch(BASE + "/style.css?v=1", { headers: { "accept-encoding": "gzip", "if-none-match": etag } });
  assert.equal(r2.status, 304);
});

test("sem gzip continua funcionando e não sai da pasta pública", async () => {
  const http = require("node:http");
  const corpo = await new Promise((ok, erro) => {
    http.get(BASE + "/app.js", { headers: { "accept-encoding": "identity" } }, (res) => {
      let t = "";
      res.on("data", (c) => (t += c));
      res.on("end", () => ok({ status: res.statusCode, enc: res.headers["content-encoding"], t }));
    }).on("error", erro);
  });
  assert.equal(corpo.status, 200);
  assert.equal(corpo.enc, undefined);

  const fora = await fetch(BASE + "/..%2fserver.js", { headers: { "accept-encoding": "gzip" } });
  assert.notEqual(fora.headers.get("content-encoding"), "gzip");
  assert.doesNotMatch(await fora.text(), /PIERRE_API_KEY/);
  assert.ok(zlib);
});
