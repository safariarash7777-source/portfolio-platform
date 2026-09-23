import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * B-057 — خودِ `scripts/backup-production.ps1`، با PowerShellِ واقعی، اجرا می‌شود.
 *
 * ── چه چیزی واقعی است و چه چیزی جعلی ──────────────────────────────────────
 * واقعی: اسکریپتِ ps1 (بی‌تغییر)، `Read-Host -AsSecureString` زیرِ یک pty،
 * `scripts/backup/pgurl.sh`، psql، Postgres، `inventory.sql`.
 * جعلی: `docker` (فقط `info` و `run … sh -c` را با sh/busyboxِ محلی اجرا می‌کند
 * و هر argv را ثبت می‌کند — معادلِ آنچه `docker inspect` نشان می‌دهد) و
 * `supabase` (dump را رد می‌کند تا اجرا پیش از بکاپِ واقعی متوقف شود).
 *
 * ⚠️ آنچه اینجا اثبات **نمی‌شود**: Windows PowerShell 5.1 و CRLFِ پایپِ ویندوز
 * (روی لینوکس `[Environment]::NewLine` = LF است). CRLF در
 * `backup-restore.integration.test.ts` با همان بایت‌ها روی بخشِ sh سنجیده می‌شود.
 * و البته هیچ بکاپی از Production.
 */

const ROOT = process.cwd();
const PS1 = join(ROOT, "scripts", "backup-production.ps1");
const ENV = {
  PGHOST: process.env.PGHOST ?? "127.0.0.1",
  PGPORT: process.env.PGPORT ?? "5433",
  PGUSER: process.env.PGUSER ?? "postgres",
  PGPASSWORD: process.env.PGPASSWORD ?? "postgres",
};
const which = (b: string) => spawnSync("sh", ["-c", `command -v ${b}`], { encoding: "utf8" }).status === 0;
const requireDb = process.env.CI === "true" || process.env.REQUIRE_DB === "1";

let dbError = "";
try {
  execFileSync("psql", ["-d", "postgres", "-X", "-q", "-c", "SELECT 1"], { env: { ...process.env, ...ENV }, stdio: "pipe" });
} catch (e) {
  dbError = e instanceof Error ? e.message : String(e);
}
const missing = [!which("pwsh") && "pwsh", !which("python3") && "python3", dbError && "postgres"].filter(Boolean);
// در CI هر سه باید باشند (runnerِ ubuntu هر سه را دارد)؛ محلی بی‌آن‌ها skip می‌شود.
if (missing.length && requireDb) throw new Error(`backup-ps1 e2e: missing: ${missing.join(", ")}`);

/** رمزِ دشمن‌خو: هر نویسه‌ای که در URL، sh یا PowerShell معنای خاص دارد. */
const PW = `p@ss w"o'rd$%:/#?`;
const ENC = encodeURIComponent(PW);
const ROLE = "bk_ps1_hostile";
const DB = "bk_ps1";

const PTY = `
import os, pty, sys, select, time, signal
line = sys.stdin.buffer.read()
pid, fd = pty.fork()
if pid == 0:
    os.execvp(sys.argv[1], sys.argv[1:])
out = b""; sent = False; status = None; deadline = time.time() + 180
def pump(timeout):
    global out, sent
    r, _, _ = select.select([fd], [], [], timeout)
    if fd not in r: return True
    try: chunk = os.read(fd, 65536)
    except OSError: return False
    if not chunk: return False
    out += chunk
    # PowerShell پیش از هر نویسه با ESC[6n مکانِ نشانگر را می‌پرسد و منتظرِ پاسخ
    # می‌ماند. بی‌پاسخ، هر کلید تا پایانِ مهلت معطل می‌شد و نویسه‌هایی گم می‌شدند
    # (۸۲ ستاره برای ۸۶ نویسه) — URL خراب می‌رسید و اجرا ~۱۸۰ ثانیه طول می‌کشید.
    for _ in range(chunk.count(b"\x1b[6n")):
        os.write(fd, b"\x1b[1;1R")
    if not sent and b"connection string:" in out:
        time.sleep(0.3); os.write(fd, line); sent = True
    return True
while status is None and time.time() < deadline:
    alive = pump(0.2)
    done, st = os.waitpid(pid, os.WNOHANG)
    if done: status = st
    elif not alive: status = os.waitpid(pid, 0)[1]
# نوادگانی که pty را باز نگه داشته‌اند منتظرمان نگذارند: پس از خروجِ فرایندِ اصلی فقط کمی تخلیه.
end = time.time() + 1.0
while time.time() < end and pump(0.1): pass
if status is None:
    os.kill(pid, signal.SIGKILL); status = os.waitpid(pid, 0)[1]
sys.stdout.buffer.write(out)
sys.exit(os.waitstatus_to_exitcode(status))
`;

const DOCKER = `#!/usr/bin/env bash
printf '%s\\0' "$@" >> "\${FAKE_LOG:?}"; printf '\\n' >> "$FAKE_LOG"
case "$1" in
  info) [ "\${FAKE_DOCKER_DOWN:-0}" = 1 ] && { echo "Cannot connect to the Docker daemon" >&2; exit 1; }; exit 0 ;;
  run) shift; mounts=(); inner=""
    while [ $# -gt 0 ]; do case "$1" in -v) mounts+=("$2"); shift 2;; -c) inner="$2"; shift 2;; *) shift;; esac; done
    for m in "\${mounts[@]}"; do h="\${m%%:*}"; r="\${m#*:}"; c="\${r%%:*}"; inner="\${inner//$c\\//$h/}"; done
    # psql از PATH پیدا می‌شود؛ پوشهٔ wrap جلوتر است تا argvِ **خودِ psql** ثبت شود —
    # همان چیزی که \`ps\` روی ماشینِ Docker نشان می‌دهد. نشتِ قبلی همین‌جا بود.
    PATH="\${FAKE_WRAP:?}:$PATH" exec \${FAKE_SH:-sh} -c "$inner" ;;
  *) echo "fake docker: unsupported $1" >&2; exit 2 ;;
esac
`;
const SUPABASE = `#!/usr/bin/env bash
printf 'supabase %s\\n' "$*" >> "\${FAKE_LOG:?}"
echo "fake supabase: '$1 $2' disabled in this test" >&2; exit 1
`;

let work = "";

function runPs1(input: string, extraEnv: Record<string, string> = {}) {
  const log = join(work, `log-${Math.random().toString(36).slice(2)}`);
  writeFileSync(log, "");
  const out = mkdtempSync(join(tmpdir(), "bk-out-"));
  const r = spawnSync("python3", [join(work, "ptydrive.py"), "pwsh", "-NoLogo", "-NoProfile", "-File", PS1], {
    input: `${input}\r`,
    env: {
      PATH: `${join(work, "bin")}:${process.env.PATH}`,
      HOME: process.env.HOME ?? tmpdir(),
      FAKE_LOG: log,
      FAKE_WRAP: join(work, "wrap"),
      FAKE_SH: which("busybox") ? "busybox sh" : "sh",
      BACKUP_DIR: out,
      NODE_ENV: "test",
      ...extraEnv,
    } as NodeJS.ProcessEnv,
    encoding: "utf8",
    timeout: 240_000,
  });
  // eslint-disable-next-line no-control-regex
  const text = (r.stdout ?? "").replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07/g, "").replace(/\r/g, "");
  const dockerLog = readFileSync(log, "utf8").replace(/\0/g, " ");
  const inv = existsSync(join(out, "inventory-source.txt")) ? readFileSync(join(out, "inventory-source.txt"), "utf8") : "";
  return { code: r.status, text, dockerLog, inv };
}

const url = (pw: string) =>
  `postgresql://${ROLE}:${encodeURIComponent(pw)}@${ENV.PGHOST}:${ENV.PGPORT}/${DB}?sslmode=disable`;

describe("backup-production.ps1 end-to-end (B-057)", {
  skip: missing.length ? `نیاز: ${missing.join(", ")}` : false,
}, () => {
  const admin = (sql: string, db = "postgres") =>
    execFileSync("psql", ["-d", db, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { env: { ...process.env, ...ENV }, stdio: "pipe" });

  before(() => {
    work = mkdtempSync(join(tmpdir(), "bk-ps1-"));
    execFileSync("mkdir", ["-p", join(work, "bin")]);
    writeFileSync(join(work, "ptydrive.py"), PTY);
    writeFileSync(join(work, "bin", "docker"), DOCKER);
    writeFileSync(join(work, "bin", "supabase"), SUPABASE);
    chmodSync(join(work, "bin", "docker"), 0o755);
    chmodSync(join(work, "bin", "supabase"), 0o755);
    const realPsql = execFileSync("sh", ["-c", "command -v psql"], { encoding: "utf8" }).trim();
    execFileSync("mkdir", ["-p", join(work, "wrap")]);
    writeFileSync(join(work, "wrap", "psql"), `#!/bin/sh\nprintf 'psql-argv %s\\n' "$*" >> "$FAKE_LOG"\nexec ${realPsql} "$@"\n`);
    chmodSync(join(work, "wrap", "psql"), 0o755);
    admin(`DROP DATABASE IF EXISTS ${DB}`);
    admin(`DROP ROLE IF EXISTS ${ROLE}`);
    admin(`CREATE ROLE ${ROLE} LOGIN PASSWORD '${PW.replace(/'/g, "''")}'`);
    admin(`CREATE DATABASE ${DB} OWNER ${ROLE}`);
    admin(`CREATE SCHEMA auth AUTHORIZATION ${ROLE}; CREATE SCHEMA storage AUTHORIZATION ${ROLE}; CREATE TABLE public.t (id int); INSERT INTO public.t VALUES (1),(2); ALTER TABLE public.t OWNER TO ${ROLE}`, DB);
  });

  after(() => {
    try { admin(`DROP DATABASE IF EXISTS ${DB}`); admin(`DROP ROLE IF EXISTS ${ROLE}`); } catch { /* best effort */ }
  });

  test("رمزِ دشمن‌خو: وصل می‌شود، موجودی خوانده می‌شود، و رمز در هیچ خروجی و argvِ docker نیست", () => {
    const r = runPs1(url(PW));
    assert.match(r.text, /connection OK/, r.text.slice(-800));
    assert.match(r.text, /\d+ inventory rows recorded/);
    assert.match(r.text, /roles dump failed/, "باید در dumpِ جعلی متوقف شود، نه زودتر");
    assert.equal(r.code, 1);
    assert.match(r.inv, /rowcount\|public\.t\|2/);
    for (const [where, s] of [["console", r.text], ["inventory", r.inv]] as const) {
      assert.equal(s.includes(PW), false, `رمزِ خام در ${where}`);
      assert.equal(s.includes(ENC), false, `رمزِ کدگذاری‌شده در ${where}`);
    }
    const dockerRuns = r.dockerLog.split("\n").filter((l) => l.startsWith("run "));
    assert.ok(dockerRuns.length >= 2, "دست‌کم probe و inventory");
    for (const l of dockerRuns) assert.equal(l.includes(ENC) || l.includes(PW), false, `رمز در argvِ docker: ${l.slice(0, 80)}`);
    // argvِ خودِ psql داخلِ «کانتینر» — همان که با \`ps\` دیده می‌شد.
    const psqlRuns = r.dockerLog.split("\n").filter((l) => l.startsWith("psql-argv "));
    assert.ok(psqlRuns.length >= 2, "wrapperِ psql اجرا نشد — آزمون چیزی نمی‌بیند");
    for (const l of psqlRuns) assert.equal(l.includes(ENC) || l.includes(PW), false, `رمز در argvِ psql: ${l.slice(0, 60)}…`);
    // تنها نشتِ مستند: `supabase db dump --db-url` — همین‌جا ثبت می‌شود تا اگر جای دیگری اضافه شد دیده شود.
    const leaks = r.dockerLog.split("\n").filter((l) => l.includes(ENC) || l.includes(PW));
    assert.ok(leaks.every((l) => l.startsWith("supabase db dump")), leaks.join("\n"));
  });

  test("Docker در حال اجرا نیست: توقف با پیامِ روشن، بدونِ هیچ docker run", () => {
    const r = runPs1(url(PW), { FAKE_DOCKER_DOWN: "1" });
    assert.equal(r.code, 1);
    assert.match(r.text, /Docker is installed but not running/);
    assert.equal(r.dockerLog.includes("run "), false);
  });

  test("ورودیِ خالی: توقف پیش از هر اتصال", () => {
    const r = runPs1("");
    assert.equal(r.code, 1);
    assert.match(r.text, /Nothing was entered/);
    assert.equal(/^run /m.test(r.dockerLog), false);
  });

  test("ورودیِ غیر URI: توقف پیش از هر اتصال", () => {
    const r = runPs1(`host=${ENV.PGHOST} password=x`);
    assert.equal(r.code, 1);
    assert.match(r.text, /does not look like a connection string/);
    assert.equal(/^run /m.test(r.dockerLog), false);
  });

  test("رمزِ غلط: شکستِ روشن، بدونِ بازتابِ رمز", () => {
    const wrong = `WRONG-${PW}`;
    const r = runPs1(url(wrong));
    assert.equal(r.code, 1);
    assert.match(r.text, /Could not connect to production/);
    assert.equal(r.text.includes(wrong) || r.text.includes(encodeURIComponent(wrong)), false);
  });
});
