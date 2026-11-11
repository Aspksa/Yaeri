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
