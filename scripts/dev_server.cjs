/**
 * Local preview server used only for testing the static site together with the
 * serverless API. Vercel serves exactly these files in production.
 *
 *   node scripts/dev_server.cjs
 *   → http://localhost:4173
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "public");
const handler = require("../api/predict.js");
const port = Number(process.env.PORT || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

http
  .createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];

    if (url.startsWith("/api/predict")) {
      handler(req, res);
      return;
    }

    let target = decodeURIComponent(url);
    if (target === "/") target = "/index.html";
    const file = path.join(root, target);

    if (!file.startsWith(root)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }

    fs.readFile(file, (error, data) => {
      if (error) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Not found");
        return;
      }
      res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
      res.end(data);
    });
  })
  .listen(port, () => {
    console.log(`CardioCare preview running at http://localhost:${port}`);
  });
