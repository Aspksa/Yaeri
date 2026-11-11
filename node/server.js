"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

function createServer(backendPort, options = {}) {
  if (!Number.isInteger(backendPort) || backendPort < 1 || backendPort > 65535) {
    throw new Error("Invalid backend port");
  }
  const maxBody = 8 * 1024 * 1024;
  return http.createServer((req, res) => {
    const host = req.headers.host || "";
    if (!/^(?:127\.0\.0\.1|localhost):\d+$/i.test(host)) {
      res.writeHead(403); res.end("Forbidden host"); return;
    }
    if (!["GET", "HEAD", "POST"].includes(req.method)) {
      res.writeHead(405); res.end("Method not allowed"); return;
    }
    if (req.headers["transfer-encoding"] || (req.headers["content-length"] &&
        (!/^\d+$/.test(req.headers["content-length"]) ||
         Number(req.headers["content-length"]) > maxBody))) {
      res.writeHead(413); res.end("Unsupported or oversized request body"); return;
    }
    let received = 0;
    let failed = false;
    const upstream = http.request({
      hostname: "127.0.0.1", port: backendPort, method: req.method, path: req.url,
      headers: { ...req.headers, host: "127.0.0.1:" + backendPort },
      timeout: 190000
    }, upstreamRes => {
      if (failed) { upstreamRes.resume(); return; }
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    });
    upstream.on("timeout", () => upstream.destroy(new Error("Backend timeout")));
    upstream.on("error", () => {
      if (failed || res.destroyed) return;
      failed = true;
      if (!res.headersSent) res.writeHead(502);
      res.end("Yaeri backend unavailable");
    });
    req.on("data", chunk => {
      received += chunk.length;
      if (received > maxBody && !failed) {
        failed = true;
        upstream.destroy();
        if (!res.headersSent) res.writeHead(413);
        res.end("Payload too large");
      }
    });
    req.on("aborted", () => upstream.destroy());
    req.pipe(upstream);
  });
}

if (require.main === module) {
  const backendPort = Number(process.argv[2]);
  const portFile = process.argv[3];
  if (!portFile) process.exit(2);
  const server = createServer(backendPort);
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    fs.writeFileSync(path.resolve(portFile), String(port), { flag: "w" });
    process.stdout.write("Yaeri Node HTTP frontend on 127.0.0.1:" + port + "\n");
  });
}
module.exports = { createServer };
