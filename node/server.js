"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const backendPort = Number(process.argv[2]);
const portFile = process.argv[3];
if (!Number.isInteger(backendPort) || backendPort < 1 || backendPort > 65535 || !portFile) process.exit(2);
const server = http.createServer((req, res) => {
  const host = req.headers.host || "";
  if (!/^127\.0\.0\.1:\d+$/.test(host) && !/^localhost:\d+$/i.test(host)) {
    res.writeHead(403); res.end("Forbidden host"); return;
  }
  if (!["GET", "HEAD", "POST"].includes(req.method)) {
    res.writeHead(405); res.end("Method not allowed"); return;
  }
  const upstream = http.request({
    hostname: "127.0.0.1", port: backendPort, method: req.method, path: req.url,
    headers: { ...req.headers, host: "127.0.0.1:" + backendPort },
    timeout: 190000
  }, upstreamRes => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on("timeout", () => upstream.destroy(new Error("Backend timeout")));
  upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end("Yaeri backend unavailable"); });
  req.pipe(upstream);
});
server.listen(0, "127.0.0.1", () => {
  const port = server.address().port;
  fs.writeFileSync(path.resolve(portFile), String(port), { flag: "w" });
  process.stdout.write("Yaeri Node HTTP frontend on 127.0.0.1:" + port + "\n");
});
