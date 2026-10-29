// Disposable offline browser fixture. Synthetic data only; no app/API credentials.
// Run from repo: node scripts/testing/fund-comparison/browser-fixture.mjs
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createServer } from "node:http";
const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const root = process.cwd();
const output = resolve(root, "../outputs/research-tools-20261024/funds-fixture");
mkdirSync(output, { recursive: true });
const observation = { value: 0, periodStart: "2026-09-21", periodEnd: "2026-09-30", startField: "close", endField: "close", method: "unadjusted-price", source: "symbol_history" };
const funds = ["نمونه‌الف", "نمونه‌ب", "نمونه‌ج", "نمونه‌د", "نمونه‌پنجم‌با‌نماد‌بلند"].map((id, index) => ({
  id, type: "صندوق اهرمی نمونه", unit: "toman", price: 100 + index * 10, closingPrice: 100 + index * 10,
  nav: 100, navDate: "1405-07-08", navTime: index === 1 ? null : "13:20:00",
  sourceDate: "1405-07-08", sourceTime: "13:25:00", navState: index === 1 ? "stale" : "ready",
  navReason: index === 1 ? "NAV منبع کهنه است" : null, returnObservations: { w1: observation },
}));
funds.push({ ...funds[0], id: "نمونه‌طلا", type: "صندوق طلا نمونه" });
funds.push({ ...funds[0], id: "نمونه‌ارز‌دیگر", unit: "usd" });
await build({
  absWorkingDir: root, stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import Panel from './components/market/FundComparisonPanel'; createRoot(document.getElementById('root')).render(<Panel funds={${JSON.stringify(funds)}} from="/market/funds?type=test"/>);`, resolveDir: root, loader: "tsx" },
  bundle: true, platform: "browser", outfile: join(output, "fixture.js"), jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "offline-next-link", setup(plugin) {
    plugin.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "offline" }));
    plugin.onLoad({ filter: /.*/, namespace: "offline" }, () => ({ contents: "import React from 'react'; export default function Link({children,...props}) { return React.createElement('a',props,children) }", loader: "js", resolveDir: root }));
  } }],
});
const css = await postcss([tailwind(require(join(root, "tailwind.config.js")))])
  .process(readFileSync(join(root, "app/globals.css"), "utf8"), { from: join(root, "app/globals.css") });
writeFileSync(join(output, "fixture.css"), css.css);
const html = `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>آزمون مقایسه صندوق — نمونهٔ نمایشی</title><link rel="stylesheet" href="/fixture.css"><style>@font-face{font-family:Vazirmatn;src:url('/font.woff2')}body{font-family:Vazirmatn,sans-serif;background:var(--bg);padding:12px}main{max-width:1100px;margin:auto}</style><body><main><p style="padding:8px">نمونهٔ نمایشی — داده مصنوعی آزمون؛ مشاهده بازار نیست</p><div id="root"></div></main><script src="/fixture.js"></script></body></html>`;
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const pathname = url.pathname;
  const files = { "/fixture.js": [join(output, "fixture.js"), "text/javascript"], "/fixture.css": [join(output, "fixture.css"), "text/css"], "/font.woff2": [join(root, "public/fonts/Vazirmatn-Variable.woff2"), "font/woff2"] };
  if (files[pathname]) { res.writeHead(200, { "Content-Type": files[pathname][1] }); res.end(readFileSync(files[pathname][0])); }
  else if (pathname === "/app") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html); }
  else if (pathname === "/") {
    const requested = Number(url.searchParams.get("width"));
    const width = [320, 390, 1100].includes(requested) ? requested : 390;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>آزمون واقعی عرض ${width} — نمونهٔ نمایشی</title><body style="margin:0;background:#eee"><p>نمونهٔ نمایشی — عرض واقعی قاب ${width} پیکسل</p><iframe title="قاب آزمون مقایسه صندوق" src="/app" width="${width}" height="1600" style="display:block;border:0;margin:auto"></iframe></body></html>`);
  }
  else { res.writeHead(404); res.end(); }
});
server.listen(3218, "127.0.0.1", () => console.log("Synthetic offline fixture: http://127.0.0.1:3218/?width=320 (actual /app iframe viewport)"));
