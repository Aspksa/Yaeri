"use strict";

/**
 * Browser-facing API policy. The legacy PowerShell backend also validates
 * requests independently; this is a defense-in-depth migration step.
 */
function rejectApiRequest(req) {
  const site = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (site === "cross-site") return "Cross-site API request denied";
  const origin = req.headers.origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      const host = String(req.headers.host || "").toLowerCase();
      if (parsed.origin === "null" || !["http:", "https:"].includes(parsed.protocol) ||
          !["127.0.0.1", "localhost"].includes(parsed.hostname.toLowerCase()) ||
          parsed.host.toLowerCase() !== host) {
        return "Invalid API origin";
      }
    } catch {
      return "Invalid API origin";
    }
  }
  if (req.method === "POST" &&
      !/^application\/json(?:\s*;|\s*$)/i.test(String(req.headers["content-type"] || ""))) {
    return "API POST requires application/json";
  }
  return null;
}
module.exports = { rejectApiRequest };
