"use strict";
// Dependency-free Node.js runtime self-check for the staged Yaeri migration.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const required = ["site/index.html", "launcher/yaeri-api.ps1", "python/local_embeddings.py"];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) {
    process.stderr.write("Yaeri missing required component: " + file + "\n");
    process.exitCode = 1;
  }
}
if (!process.exitCode) process.stdout.write("Yaeri Node runtime OK\n");
