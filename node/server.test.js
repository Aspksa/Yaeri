"use strict";
const assert = require("node:assert/strict");
const http = require("node:http");
const { test } = require("node:test");
const { createServer } = require("./server");

function listen(server) {
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}
function close(server) { return new Promise(resolve => server.close(resolve)); }
function request(port, path, method = "GET", body = "", host = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method,
      headers: { host: host || "127.0.0.1:" + port, "content-length": Buffer.byteLength(body) } },
    res => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.end(body);
  });
}
test("Node frontend proxies GET and POST and rejects invalid hosts/methods", async () => {
  const backend = http.createServer((req, res) => {
    let data = "";
    req.on("data", chunk => data += chunk);
    req.on("end", () => res.end(req.method + " " + req.url + " " + data));
  });
  const backendPort = await listen(backend);
  const frontend = createServer(backendPort);
  const port = await listen(frontend);
  try {
    assert.deepEqual(await request(port, "/api/test"), { status: 200, body: "GET /api/test " });
    assert.deepEqual(await request(port, "/api/test", "POST", "hello"), { status: 200, body: "POST /api/test hello" });
    assert.equal((await request(port, "/", "GET", "", "evil.example")).status, 403);
    assert.equal((await request(port, "/", "DELETE")).status, 405);
  } finally {
    await close(frontend);
    await close(backend);
  }
});

test("Node serves static UI directly and does not proxy it", async () => {
  let backendRequests = 0;
  const backend = http.createServer((req, res) => { backendRequests++; res.end("backend"); });
  const backendPort = await listen(backend);
  const frontend = createServer(backendPort);
  const port = await listen(frontend);
  try {
    const page = await request(port, "/");
    assert.equal(page.status, 200);
    assert.match(page.body, /html/i);
    assert.equal((await request(port, "/index.html", "HEAD")).status, 200);
    assert.equal((await request(port, "/index.html", "POST")).status, 405);
    assert.equal((await request(port, "/nonexistent-yaeri-asset.js")).status, 404);
    assert.equal((await request(port, "/%2e%2e/%2e%2e/config/yaeri.config.json")).status !== 200, true);
    assert.equal(backendRequests, 0);
  } finally {
    await close(frontend);
    await close(backend);
  }
});

test("native Node runtime API responds without PowerShell and preserves proxy routes", async () => {
  let backendRequests = 0;
  const backend = http.createServer((req, res) => {
    backendRequests++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ legacy: true }));
  });
  const backendPort = await listen(backend);
  const frontend = createServer(backendPort);
  const port = await listen(frontend);
  try {
    const runtime = await request(port, "/api/runtime");
    assert.equal(runtime.status, 200);
    assert.deepEqual(JSON.parse(runtime.body).frontend, "node");
    assert.equal(backendRequests, 0);
    assert.equal((await request(port, "/api/runtime", "HEAD")).status, 200);
    assert.equal((await request(port, "/api/runtime", "POST", "{}")).status, 405);
    assert.equal(backendRequests, 0);
    assert.deepEqual(JSON.parse((await request(port, "/api/status")).body), { legacy: true });
    assert.equal(backendRequests, 1);
  } finally {
    await close(frontend);
    await close(backend);
  }
});
