import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(__dirname, "public");
const port = Number(process.env.PORT || 8080);
const apiTarget = String(process.env.API_TARGET || "http://127.0.0.1:4000").replace(/\/$/, "");

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const resolved = path.resolve(publicRoot, `.${decoded}`);
  return resolved.startsWith(publicRoot) ? resolved : null;
}

async function proxyApi(req, res) {
  try {
    const body = ["GET", "HEAD"].includes(req.method) ? undefined : await new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
    const upstream = await fetch(`${apiTarget}${req.url}`, {
      method: req.method,
      body,
      headers: {
        accept: req.headers.accept || "application/json",
        "content-type": req.headers["content-type"] || "application/json",
        "user-agent": req.headers["user-agent"] || "SupaPlay-Website-Dev"
      }
    });
    res.writeHead(upstream.status, Object.fromEntries([...upstream.headers].filter(([key]) => !["content-encoding", "transfer-encoding"].includes(key.toLowerCase()))));
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ success: false, error: `Local API proxy failed: ${error.message}` }));
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/api" || req.url.startsWith("/api/")) return proxyApi(req, res);
  try {
    let filePath = safePath(req.url);
    if (!filePath) throw new Error("Invalid path");
    let stat;
    try { stat = await fs.stat(filePath); } catch { stat = null; }
    if (stat?.isDirectory()) filePath = path.join(filePath, "index.html");
    if (!stat || !stat.isFile()) filePath = path.join(publicRoot, "index.html");
    const data = await fs.readFile(filePath);
    const extension = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": types[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`SupaPlay dev server error: ${error.message}`);
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`SupaPlay website: http://localhost:${port}`);
  console.log(`API proxy target: ${apiTarget}`);
});
