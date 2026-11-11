"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const SITE_ROOT = fs.realpathSync(path.join(__dirname, "..", "site"));
const MIME = Object.freeze({
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp",
  ".ico": "image/x-icon"
});

function serveStatic(req, res) {
  if (req.method === "POST") {
    res.writeHead(405); res.end("Method not allowed"); return;
  }
  let decoded;
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    decoded = decodeURIComponent(pathname);
    if (decoded.includes("\\") || decoded.includes("\0") || decoded.split("/").includes("..")) {
      throw new Error("invalid path");
    }
  } catch {
    res.writeHead(400); res.end("Invalid path"); return;
  }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const candidate = path.resolve(SITE_ROOT, relative);
  if (!candidate.startsWith(SITE_ROOT + path.sep)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  fs.realpath(candidate, (error, resolved) => {
    if (error) { res.writeHead(404); res.end("Not found"); return; }
    if (!resolved.startsWith(SITE_ROOT + path.sep)) {
      res.writeHead(403); res.end("Forbidden"); return;
    }
    fs.stat(resolved, (statError, stat) => {
      if (statError || !stat.isFile()) { res.writeHead(404); res.end("Not found"); return; }
      res.writeHead(200, {
        "content-type": MIME[path.extname(resolved).toLowerCase()] || "application/octet-stream",
        "content-length": stat.size, "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      });
      if (req.method === "HEAD") { res.end(); return; }
      const file = fs.createReadStream(resolved);
      file.on("error", () => res.destroy());
      file.pipe(res);
    });
  });
}

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
    if (!req.url.startsWith('/api/')) { serveStatic(req, res); return; }
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
