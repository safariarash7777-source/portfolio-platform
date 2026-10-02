// Lightweight synthetic UI fixture, not the Next server or a native acceptance environment.
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const output = path.resolve(".task/p04-fixture");
await mkdir(output, { recursive: true });
await promisify(execFile)(process.execPath, ["node_modules/tailwindcss/lib/cli.js", "-i", "app/globals.css", "-o", path.join(output, "fixture.css"), "--minify"]);
await build({ entryPoints: ["docs/ops/seasonal-program/p04/fixtures/product.tsx"], outfile: path.join(output, "fixture.js"), bundle: true, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error" });
await writeFile(path.join(output, "index.html"), `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>P04 نمونه نمایشی</title><link rel="stylesheet" href="/fixture.css"><style>@font-face{font-family:Vazirmatn;src:url(/font.woff2)}:root{--font-body:Vazirmatn;--font-display:Vazirmatn}body{padding:16px}main{max-width:1040px;margin:auto}pre{white-space:pre-wrap}</style><div id="root"></div><script src="/fixture.js"></script></html>`);
const server = createServer(async (req, res) => {
  if (!["/", "/fixture.js", "/fixture.css", "/font.woff2"].includes(req.url)) { res.writeHead(404); res.end(); return; }
  res.setHeader("Content-Type", req.url === "/" ? "text/html; charset=utf-8" : req.url === "/fixture.css" ? "text/css" : req.url === "/font.woff2" ? "font/woff2" : "text/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(await readFile(req.url === "/font.woff2" ? "public/fonts/Vazirmatn-Variable.woff2" : path.join(output, req.url === "/" ? "index.html" : req.url.slice(1))));
});
server.listen(3444, "127.0.0.1", () => process.stdout.write("P04 synthetic fixture http://127.0.0.1:3444; no database/Next/native API\n"));
