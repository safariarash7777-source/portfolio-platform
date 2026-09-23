import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";

/**
 * بستهٔ آماده‌سازیِ Supabaseِ خودمیزبان (انتقال به زیرساختِ ایرانی).
 *
 * این تست‌ها **ابزار** را می‌سنجند، نه استقرار را: هیچ سرورِ واقعی، هیچ Docker و
 * هیچ دادهٔ واقعی در کار نیست. اسکریپت‌های bash واقعاً اجرا می‌شوند — با `ss` و
 * سرورِ HTTPِ جعلی — تا رفتارشان ثابت شود، نه فقط متنشان.
 */

const ROOT = process.cwd();
const DIR = join(ROOT, "scripts", "selfhost");
const read = (f: string) => readFileSync(join(DIR, f), "utf8");
const require = createRequire(import.meta.url);

// ── CSP ──────────────────────────────────────────────────────────────────────

test("CSP: آدرسِ https خودمیزبان به connect-src اضافه می‌شود؛ http و ابری نه", () => {
  const { supabaseConnectSrc } = require(join(ROOT, "lib", "csp-supabase.js")) as {
    supabaseConnectSrc: (u?: string) => string;
  };
  const base = "https://*.supabase.co wss://*.supabase.co";
  assert.equal(supabaseConnectSrc("https://api.example.ir/"), `${base} https://api.example.ir`);
  assert.equal(supabaseConnectSrc("https://api.example.ir:8443/x"), `${base} https://api.example.ir:8443`);
  assert.equal(supabaseConnectSrc("http://1.2.3.4:8000"), base, "http هرگز");
  assert.equal(supabaseConnectSrc("https://abc.supabase.co"), base, "ابری تکراری نمی‌شود");
  assert.equal(supabaseConnectSrc(""), base);
  assert.equal(supabaseConnectSrc("not a url"), base);
});

test("CSP: next.config واقعاً از همان helper می‌خواند", async () => {
  const prev = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://api.example.ir";
  try {
    const path = join(ROOT, "next.config.js");
    delete require.cache[require.resolve(path)];
    const cfg = require(path) as { headers: () => Promise<Array<{ headers: Array<{ key: string; value: string }> }>> };
    const csp = (await cfg.headers())[0].headers.find((h) => h.key === "Content-Security-Policy")!.value;
    assert.match(csp, /connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co https:\/\/api\.example\.ir/);
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prev;
  }
});

// ── پیکربندی: چیزی روی رابطِ عمومی منتشر نشود ─────────────────────────────────

test("override: پورت‌های Postgres و Studio فقط روی 127.0.0.1؛ سرویس‌های بی‌مصرف خاموش", () => {
  const y = read("docker-compose.portfolio.yml");
  const portLines = y.split("\n").filter((l) => /^\s+- "[^"]*:\d+"/.test(l));
  assert.ok(portLines.length >= 3, "پورت‌های بازتعریف‌شده پیدا نشد");
  for (const l of portLines) assert.match(l, /"127\.0\.0\.1:/, `منتشرشده روی رابطِ عمومی: ${l.trim()}`);
  for (const svc of ["supavisor", "studio"]) {
    assert.match(y, new RegExp(`\\n  ${svc}:\\n    ports: !override`), `${svc} باید پورت‌هایش را کامل جایگزین کند`);
  }
  for (const svc of ["storage", "imgproxy", "realtime", "functions"]) {
    assert.match(y, new RegExp(`\\n  ${svc}:\\n    profiles: \\["unused"\\]`), `${svc} باید خاموش باشد`);
  }
  assert.match(y, /\.\/portfolio\/Caddyfile:\/etc\/caddy\/Caddyfile:ro/);
});

test("override: Auth دست‌کم v2.197.0 (طرحِ Authِ Production = 20260831180000)", () => {
  const m = read("docker-compose.portfolio.yml").match(/\n  auth:\n    image: supabase\/gotrue:v(\d+)\.(\d+)\.(\d+)/);
  assert.ok(m, "تصویرِ auth سنجاق نشده");
  const [maj, min] = [Number(m![1]), Number(m![2])];
  assert.ok(maj > 2 || (maj === 2 && min >= 197), `gotrue v${m![1]}.${m![2]} قدیمی‌تر از v2.197.0 است`);
});

test("Caddyfile: فقط /auth/v1 و /rest/v1 عمومی‌اند؛ Studio و basic_auth نیست", () => {
  const c = read("Caddyfile").split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  assert.match(c, /@api path \/auth\/v1\/\* \/rest\/v1\/\*\s*\n/);
  assert.match(c, /reverse_proxy api-gw:8000/);
  assert.doesNotMatch(c, /studio|basic_auth|\/mcp|graphql|storage|functions|realtime/i);
  assert.match(c, /handle \{\s*\n\s*respond 404/);
  assert.equal((c.match(/reverse_proxy/g) ?? []).length, 1, "فقط یک مقصد");
});

test("restore: تک‌تراکنش، ON_ERROR_STOP، supabase_admin، مقصدِ تازه، بدونِ رمز در argv", () => {
  const s = read("restore-to-selfhost.sh");
  assert.match(s, /--single-transaction/);
  assert.match(s, /ON_ERROR_STOP=1/);
  assert.match(s, /-U supabase_admin/);
  assert.match(s, /PGPASSWORD="\$POSTGRES_PASSWORD"/, "رمز از محیطِ خودِ کانتینر، نه از argvِ میزبان");
  assert.doesNotMatch(s, /-e PGPASSWORD|--env PGPASSWORD|POSTGRES_PASSWORD=\$/);
  assert.match(s, /schemaname = 'public'/, "بررسیِ تازه‌بودنِ مقصد");
  assert.match(s, /\$BACKUP_SQL\/inventory\.sql/, "همان inventory.sqlِ #155");
  assert.match(s, /\$BACKUP_SQL\/compare\.mjs/, "همان compare.mjsِ #155");
  assert.match(s, /\$BACKUP_SQL\/assert-managed-schemas\.sql/);
  assert.doesNotMatch(s, /\|\|\s*true\s*$/m, "شکست پنهان نشود");
});

test("healthcheck: TLS خاموش نمی‌شود و کلیدِ service_role نمی‌گیرد", () => {
  const s = read("healthcheck.sh").split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  assert.doesNotMatch(s, /curl[^\n]*(\s-k\b|--insecure)/);
  assert.doesNotMatch(s, /SERVICE_ROLE/);
  assert.match(s, /https:\/\/\*\) ;;/);
});

// ── رفتار: preflight با `ss` جعلی ─────────────────────────────────────────────

function preflight(ssOutput: string) {
  const dir = mkdtempSync(join(tmpdir(), "preflight-"));
  const file = join(dir, "ss.txt");
  writeFileSync(file, ssOutput + "\n");
  try {
    return spawnSync("bash", [join(DIR, "preflight-vps.sh")], {
      env: { ...process.env, PREFLIGHT_SKIP_HOST: "1", PREFLIGHT_SS_CMD: `cat ${file}` },
      encoding: "utf8",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("preflight: فقط 22/80/443 روی رابطِ عمومی قبول است", () => {
  const ok = preflight([
    "LISTEN 0 4096 0.0.0.0:22 0.0.0.0:*",
    "LISTEN 0 4096 [::]:443 [::]:*",
    "LISTEN 0 4096 0.0.0.0:80 0.0.0.0:*",
    "LISTEN 0 4096 127.0.0.1:5432 0.0.0.0:*",
    "LISTEN 0 4096 127.0.0.1:3000 0.0.0.0:*",
  ].join("\n"));
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);

  // پیش‌فرضِ upstream: pooler روی همهٔ رابط‌ها.
  const bad = preflight([
    "LISTEN 0 4096 0.0.0.0:22 0.0.0.0:*",
    "LISTEN 0 4096 0.0.0.0:5432 0.0.0.0:*",
    "LISTEN 0 4096 [::]:8000 [::]:*",
  ].join("\n"));
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /0\.0\.0\.0:5432/);
  assert.match(bad.stdout, /\[::\]:8000/);
});

// ── رفتار: healthcheck در برابرِ سرورِ جعلی ───────────────────────────────────

function stub(opts: { studioOpen?: boolean; leakRow?: boolean; authDown?: boolean }): Promise<Server> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const send = (code: number, body = "") => { res.writeHead(code, { "content-type": "application/json" }); res.end(body); };
    if (url.pathname === "/auth/v1/health") return send(opts.authDown ? 503 : 200, "{}");
    if (url.pathname === "/rest/v1/ir_market_snapshots") return send(200, '[{"key":"latest"}]');
    if (url.pathname === "/rest/v1/profiles") return send(200, opts.leakRow ? '[{"id":"x"}]' : "[]");
    if (url.pathname === "/" && opts.studioOpen) return send(200, "<html>studio</html>");
    return send(404);
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

function runHealth(port: number, closedPorts: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn("bash", [join(DIR, "healthcheck.sh")], {
      env: {
        ...process.env,
        SELFHOST_URL: `http://127.0.0.1:${port}`,
        SELFHOST_ANON_KEY: "anon-test-key",
        HEALTHCHECK_ALLOW_HTTP: "1",
        SELFHOST_CLOSED_PORTS: closedPorts,
      },
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

async function unusedPort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  const port = (s.address() as AddressInfo).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

test("healthcheck: استکِ درست سالم است؛ هر «نباید» مردودش می‌کند", async () => {
  const closed = String(await unusedPort());

  const good = await stub({});
  const gp = (good.address() as AddressInfo).port;
  const g = await runHealth(gp, closed);
  good.close();
  assert.equal(g.code, 0, g.out);
  assert.doesNotMatch(g.out, /anon-test-key/, "کلید در خروجی چاپ نشود");

  for (const [name, opts] of [["studio", { studioOpen: true }], ["leak", { leakRow: true }], ["auth", { authDown: true }]] as const) {
    const s = await stub(opts);
    const r = await runHealth((s.address() as AddressInfo).port, closed);
    s.close();
    assert.equal(r.code, 1, `${name}: باید مردود شود\n${r.out}`);
  }

  // پورتی که باید بسته باشد ولی باز است (خودِ سرورِ جعلی) هم مردود می‌کند.
  const open = await stub({});
  const op = (open.address() as AddressInfo).port;
  const r = await runHealth(op, String(op));
  open.close();
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, new RegExp(`پورتِ ${op} از بیرون باز است`));
});

test("healthcheck: http بدونِ اجازهٔ صریحِ آزمون رد می‌شود", () => {
  const r = spawnSync("bash", [join(DIR, "healthcheck.sh")], {
    env: { ...process.env, SELFHOST_URL: "http://127.0.0.1:1", SELFHOST_ANON_KEY: "k", HEALTHCHECK_ALLOW_HTTP: "" },
    encoding: "utf8",
  });
  assert.equal(r.status, 64);
});
