"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");

const STORE_NAMES = Object.freeze(["notes", "memory", "history", "docs"]);
const DEFAULT_DATA = path.resolve(__dirname, "..", "data");

async function inspectStore(dataDir = DEFAULT_DATA) {
  const result = {};
  for (const name of STORE_NAMES) {
    const file = path.join(dataDir, name + ".json");
    try {
      const raw = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        result[name] = { status: "invalid" }; continue;
      }
      const key = name === "history" ? "messages" : name === "docs" ? "docs" : "items";
      result[name] = {
        status: Array.isArray(parsed[key]) ? "ok" : "invalid",
        count: Array.isArray(parsed[key]) ? parsed[key].length : null,
        version: Number.isInteger(parsed.version) ? parsed.version : null
      };
    } catch (error) {
      result[name] = { status: error.code === "ENOENT" ? "missing" : "unavailable" };
    }
  }
  return { stores: result };
}
module.exports = { inspectStore };
