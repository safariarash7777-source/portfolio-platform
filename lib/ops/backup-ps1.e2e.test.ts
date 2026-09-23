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
 * جعلی: `docker` (`info`، `run … sh -c`، `ps`، `cp`، `exec … sh -c` را با sh/busyboxِ
 * محلی اجرا می‌کند و هر argv را ثبت می‌کند — معادلِ آنچه `docker inspect` نشان می‌دهد)
 * و `supabase` (پیش‌فرض dump را رد می‌کند؛ با FAKE_SUPA_FULL=1 همهٔ مسیر را با pg_dump و
 * یک پایگاهِ verifyِ محلی شبیه‌سازی می‌کند).
 *
 * حالتِ Legacy: `$PSNativeCommandArgumentPassing='Legacy'` همان رفتارِ Windows
 * PowerShell 5.1 در ساختنِ خطِ فرمانِ native است (نقل‌قولِ دوتایی escape نمی‌شود).
 * نسخهٔ پیشین در این حالت با رشتهٔ اتصالِ **درست** «Could not connect» می‌داد.
 *
 * ⚠️ آنچه اینجا اثبات **نمی‌شود**: خودِ Windows PowerShell 5.1، کدگذاریِ کنسولِ ویندوز،
 * Docker Desktop، و CRLFِ پایپِ ویندوز
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
const VERIFY_DB = "bk_ps1_verify";

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
adm() { psql -d postgres -X -q -v ON_ERROR_STOP=1 -c "$1"; }
case "$1" in
  info) [ "\${FAKE_DOCKER_DOWN:-0}" = 1 ] && { echo "Cannot connect to the Docker daemon" >&2; exit 1; }; exit 0 ;;
  run) shift; mounts=(); inner=""
    while [ $# -gt 0 ]; do case "$1" in -v) mounts+=("$2"); shift 2;; -c) inner="$2"; shift 2;; *) shift;; esac; done
    for m in "\${mounts[@]}"; do h="\${m%%:*}"; r="\${m#*:}"; c="\${r%%:*}"; inner="\${inner//$c\\//$h/}"; done
    # psql از PATH پیدا می‌شود؛ پوشهٔ wrap جلوتر است تا argvِ **خودِ psql** ثبت شود —
    # همان چیزی که \`ps\` روی ماشینِ Docker نشان می‌دهد. نشتِ قبلی همین‌جا بود.
    PATH="\${FAKE_WRAP:?}:$PATH" exec \${FAKE_SH:-sh} -c "$inner" ;;
  # «استکِ یک‌بارمصرف»: up یک پایگاهِ verifyِ محلی با همان auth/storageِ مبدأ می‌سازد.
  compose) sub=""; for a in "$@"; do case "$a" in version|up|down) sub="$a";; esac; done
    case "$sub" in
      version) echo "Docker Compose version v2.99.0-fake"; exit 0 ;;
      up) adm "DROP DATABASE IF EXISTS \${FAKE_VERIFY_DB:?}" && adm "CREATE DATABASE $FAKE_VERIFY_DB" \\
            && psql -d "$FAKE_VERIFY_DB" -X -q -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; \${FAKE_MANAGED_DDL:?}; INSERT INTO auth.schema_migrations VALUES ('\${FAKE_LOCAL_AUTH:-20260831180000}'); \${FAKE_MANAGED_DRIFT:-}" ;;
      down) adm "DROP DATABASE IF EXISTS \${FAKE_VERIFY_DB:?}" ;;
      *) echo "fake docker compose: unsupported $*" >&2; exit 2 ;;
    esac ;;
  ps) id=""; db=0; quiet=0
    for a in "$@"; do case "$a" in label=com.portfolio.backup-verify=*) id="\${a#label=com.portfolio.backup-verify=}";; label=com.docker.compose.service=db) db=1;; -q) quiet=1;; esac; done
    [ "$quiet" = 1 ] && exit 0
    if [ "$db" = 1 ]; then echo "$id-db-1"; exit 0; fi
    printf '%s-db-1|%s\n' "$id" "\${FAKE_PORTS:-5432/tcp}"
    printf '%s-auth-1|%s\n' "$id" "\${FAKE_PORTS_AUTH:-}"
    printf '%s-storage-1|%s\n' "$id" "\${FAKE_PORTS_STORAGE:-5000/tcp}"
    exit 0 ;;
  inspect) name="\${@: -1}"; id="\${name%-*-1}"; bind="\${FAKE_BINDINGS:-}"; [ -n "$bind" ] || bind='{}'
    printf '%s|%s|%s_verify;\n' "$bind" "\${FAKE_PUBLISH_ALL:-false}" "$id"; exit 0 ;;
  network) case "$2" in inspect) echo "\${FAKE_INTERNAL:-true}";; ls) : ;; esac; exit 0 ;;
  volume) exit 0 ;;
  cp) src="$2"; dst="$3"
    case "$dst" in *:/*) dst="\${FAKE_CFS:?}\${dst#*:}";; esac
    case "$src" in *:/*) src="\${FAKE_CFS:?}\${src#*:}";; esac
    exec cp "$src" "$dst" ;;
  exec) shift; shift  # «exec» و نامِ کانتینر
    if [ "$1" = mkdir ]; then shift; exec mkdir "$1" "\${FAKE_CFS:?}$2"; fi
    [ "$1" = sh ] && [ "$2" = -c ] || { echo "fake docker exec: unexpected $*" >&2; exit 2; }
    [ $# -eq 3 ] || { echo "fake docker exec: $# args — the sh -c string was split" >&2; exit 2; }
    from=/tmp/restore/; to="\${FAKE_CFS}/tmp/restore/"; inner="\${3//"$from"/"$to"}"
    PATH="\${FAKE_DBWRAP:?}:$PATH" exec \${FAKE_SH:-sh} -c "$inner" ;;
  *) echo "fake docker: unsupported $1" >&2; exit 2 ;;
esac
`;
const SUPABASE = `#!/usr/bin/env bash
printf 'supabase %s\\n' "$*" >> "\${FAKE_LOG:?}"
# اسکریپت پیش از پرسیدنِ رمز یک بار --version می‌گیرد (CLIِ خراب را زود بگیرد).
[ "$1" = "--version" ] && { [ "\${FAKE_SUPA_BROKEN:-0}" = 1 ] && exit 1; echo "2.99.0-fake"; exit 0; }
[ "\${FAKE_SUPA_FULL:-0}" = 1 ] || { echo "fake supabase: '$1 $2' disabled in this test" >&2; exit 1; }
arg() { local want="$1"; shift; while [ $# -gt 0 ]; do [ "$1" = "$want" ] && { echo "$2"; return; }; shift; done; }
has() { local want="$1"; shift; for a in "$@"; do [ "$a" = "$want" ] && return 0; done; return 1; }
adm() { psql -d postgres -X -q -v ON_ERROR_STOP=1 -c "$1"; }
case "$1 $2" in
  "db dump") url="$(arg --db-url "$@")"; out="$(arg -f "$@")"
    if has --role-only "$@"; then printf -- '-- no custom roles\\nSELECT 1;\\n' > "$out"
    elif has --data-only "$@"; then pg_dump --data-only -n public -n auth -n storage --exclude-table-data=auth.schema_migrations --exclude-table-data=storage.migrations --no-owner "$url" > "$out"  # مثلِ CLI
    else pg_dump --schema-only -n public "$url" > "$out"; fi ;;  # مالک و گرنت مثلِ dumpِ واقعیِ Supabase حفظ می‌شوند
  "--version ") echo "2.99.0-fake" ;;
  *) echo "fake supabase: unsupported $*" >&2; exit 2 ;;
esac
`;

let work = "";

function runPs1(input: string, extraEnv: Record<string, string> = {}, legacy = false) {
  const log = join(work, `log-${Math.random().toString(36).slice(2)}`);
  writeFileSync(log, "");
  const out = mkdtempSync(join(tmpdir(), "bk-out-"));
  const cfs = mkdtempSync(join(tmpdir(), "bk-cfs-"));
  // 'Legacy' همان رفتارِ Windows PowerShell 5.1 در ساختنِ خطِ فرمانِ native است.
  const argv = legacy
    ? ["-NoLogo", "-NoProfile", "-Command", `$PSNativeCommandArgumentPassing='Legacy'; & '${PS1}'; exit $LASTEXITCODE`]
    : ["-NoLogo", "-NoProfile", "-File", PS1];
  const r = spawnSync("python3", [join(work, "ptydrive.py"), "pwsh", ...argv], {
    input: `${input}\r`,
    env: {
      PATH: `${join(work, "bin")}:${process.env.PATH}`,
      HOME: process.env.HOME ?? tmpdir(),
      FAKE_LOG: log,
      FAKE_WRAP: join(work, "wrap"),
      FAKE_DBWRAP: join(work, "dbwrap"),
      FAKE_CFS: cfs,
      FAKE_VERIFY_DB: VERIFY_DB,
      FAKE_MANAGED_DDL: MANAGED_DDL,
      PGHOST: ENV.PGHOST, PGPORT: ENV.PGPORT, PGUSER: ENV.PGUSER, PGPASSWORD: ENV.PGPASSWORD,
      REAL_PGPASSWORD: ENV.PGPASSWORD,
      FAKE_SH: which("busybox") ? "busybox sh" : "sh",
      BACKUP_DIR: out,
      NODE_ENV: "test",
      ...extraEnv,
    } as NodeJS.ProcessEnv,
    encoding: "utf8",
    timeout: 240_000,
  });
  const text = (r.stdout ?? "").replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07/g, "").replace(/\r/g, "");
  const dockerLog = readFileSync(log, "utf8").replace(/\0/g, " ");
  const inv = existsSync(join(out, "inventory-source.txt")) ? readFileSync(join(out, "inventory-source.txt"), "utf8") : "";
  const file = (n: string) => (existsSync(join(out, n)) ? readFileSync(join(out, n)) : Buffer.alloc(0));
  return { code: r.status, text, dockerLog, inv, file };
}

/**
 * همان ساختارِ auth/storage در مبدأ و در «استکِ» verify — managed-schemas.sql هر
 * دو را دوطرفه مقایسه می‌کند. `FAKE_MANAGED_DRIFT` یک ستونِ اضافه به مقصد می‌دهد.
 */
const MANAGED_DDL =
  "CREATE SCHEMA auth; CREATE SCHEMA storage; " +
  "CREATE TABLE auth.schema_migrations (version text PRIMARY KEY); " +
  "CREATE TABLE auth.users (id uuid PRIMARY KEY, encrypted_password text); " +
  "CREATE TABLE storage.migrations (id int PRIMARY KEY, name text); " +
  "INSERT INTO storage.migrations VALUES (72, 'drop-bucketid-objname-index')";

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
    // «داخلِ کانتینرِ db»: `-U supabase_admin -d postgres` به پایگاهِ verifyِ محلی نگاشت می‌شود.
    execFileSync("mkdir", ["-p", join(work, "dbwrap")]);
    writeFileSync(join(work, "dbwrap", "psql"), `#!/bin/bash
printf 'exec-psql %s\\n' "$*" >> "$FAKE_LOG"
args=(); while [ $# -gt 0 ]; do case "$1" in
  -U) [ "$2" = supabase_admin ] || { echo "not supabase_admin: $2" >&2; exit 3; }; args+=(-U "$PGUSER"); shift 2;;
  -d) args+=(-d "$FAKE_VERIFY_DB"); shift 2;;
  -h) args+=(-h "$PGHOST" -p "$PGPORT"); shift 2;;
  *) args+=("$1"); shift;; esac; done
PGPASSWORD="$REAL_PGPASSWORD" exec ${realPsql} "\${args[@]}"
`);
    chmodSync(join(work, "dbwrap", "psql"), 0o755);
    admin(`DROP DATABASE IF EXISTS ${DB}`);
    admin(`DROP ROLE IF EXISTS ${ROLE}`);
    admin(`CREATE ROLE ${ROLE} LOGIN PASSWORD '${PW.replace(/'/g, "''")}'`);
    admin(`CREATE DATABASE ${DB} OWNER ${ROLE}`);
    admin(`${MANAGED_DDL}; CREATE TABLE public.t (id int); INSERT INTO public.t VALUES (1),(2)`, DB);
    // نسخهٔ طرحِ Auth مثلِ Production (۲۰۲۶-۰۹-۲۳) و یک کاربرِ مصنوعی.
    admin(`INSERT INTO auth.schema_migrations VALUES ('20260831180000'); INSERT INTO auth.users VALUES (gen_random_uuid(), 'hash-1')`, DB);
    admin(`ALTER SCHEMA auth OWNER TO ${ROLE}; ALTER SCHEMA storage OWNER TO ${ROLE}; ALTER TABLE public.t OWNER TO ${ROLE};
      ALTER TABLE auth.schema_migrations OWNER TO ${ROLE}; ALTER TABLE auth.users OWNER TO ${ROLE}; ALTER TABLE storage.migrations OWNER TO ${ROLE}`, DB);
  });

  after(() => {
    try { admin(`DROP DATABASE IF EXISTS ${VERIFY_DB}`); admin(`DROP DATABASE IF EXISTS ${DB}`); admin(`DROP ROLE IF EXISTS ${ROLE}`); } catch { /* best effort */ }
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

  // ── مسیرِ کامل: dump → پشتهٔ محلی → بررسیِ پورت → بازگردانی → مقایسه ─────────
  for (const legacy of [false, true]) {
    const mode = legacy ? "Legacy (رفتارِ خطِ فرمانِ PS 5.1)" : "Standard";
    test(`مسیرِ کامل تا PASS — ${mode}`, () => {
      const r = runPs1(url(PW), { FAKE_SUPA_FULL: "1" }, legacy);
      assert.equal(r.code, 0, r.text.slice(-1500));
      assert.match(r.text, /no published port on any of 3 containers; network prodverify\d+_verify is internal/);
      assert.match(r.text, /auth\/storage structure identical to production \(both directions\)/);
      assert.match(r.text, /\[OK\] Backup created AND it passed the restore test/);
      assert.match(r.text, /NOT IN BACKUP: +pg_cron jobs - production has 0 \(pg_cron not installed\)/);
      // پیش‌درآمد بینِ roles و schema و داخلِ همان تراکنش اجرا شد.
      assert.match(r.dockerLog, /exec-psql [^\n]*--file \/[^\n]*roles\.sql --file \/[^\n]*restore-prelude\.sql --file \/[^\n]*schema\.sql/);
      assert.match(r.text, /result: +PASS/);
      assert.match(r.text, /auth schema: +production 20260831180000 \/ verify stack 20260831180000/);
      // بازگردانی واقعاً با supabase_admin و داخلِ «کانتینر» اجرا شد.
      assert.match(r.dockerLog, /exec-psql [^\n]*-U supabase_admin[^\n]*--single-transaction/);
      assert.doesNotMatch(r.dockerLog, /network host/);
      // هیچ فایلی BOM ندارد و فهرستِ مقصد همان بایت‌هایی است که psql نوشت.
      for (const f of ["inventory-source.txt", "inventory-source-after.txt", "inventory-restored.txt", "managed-source.txt", "managed-target.txt", "MANIFEST.txt"]) {
        const b = r.file(f);
        assert.ok(b.length > 0, `${f} خالی است`);
        assert.equal(b.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false, `${f} BOM دارد`);
      }
      assert.match(r.file("inventory-restored.txt").toString("utf8"), /rowcount\|public\.t\|2/);
      assert.match(r.file("inventory-restored.txt").toString("utf8"), /digest\|auth\.users\.credentials\|[0-9a-f]{32}/);
      // رمز جز در `supabase db dump` (نشتِ مستند) هیچ‌جا نیست.
      const leaks = r.dockerLog.split("\n").filter((l) => l.includes(ENC) || l.includes(PW));
      assert.ok(leaks.every((l) => l.startsWith("supabase db dump")), leaks.join("\n"));
      assert.equal(r.text.includes(PW) || r.text.includes(ENC), false);
      assert.match(r.dockerLog, /^compose -p prodverify\d+ -f \S+ down --volumes --remove-orphans/m, "پشتهٔ موقت پاک شد");
    });
  }

  /** شکستِ پیش از بازگردانی: هیچ دادهٔ Production واردِ مقصد نشد، ولی بکاپ ماند. */
  function assertStoppedBeforeRestore(r: ReturnType<typeof runPs1>) {
    assert.equal(r.code, 1);
    assert.doesNotMatch(r.dockerLog, /--single-transaction/, "بازگردانی نباید شروع شود");
    assert.match(r.dockerLog, /^compose -p prodverify\d+ -f \S+ down --volumes/m, "پشته پاک شد");
    for (const f of ["roles.sql", "schema.sql", "data.sql"]) assert.ok(r.file(f).length > 0, `${f} باید بماند`);
    assert.match(r.file("MANIFEST.txt").toString("utf8"), /result: +RESTORE UNVERIFIED/);
  }

  test("پورتِ عمومی: هیچ دادهٔ Production بازگردانی نمی‌شود، بکاپ می‌ماند و پشته پاک می‌شود", () => {
    const r = runPs1(url(PW), { FAKE_SUPA_FULL: "1", FAKE_PORTS: "0.0.0.0:54322->5432/tcp" }, true);
    assert.match(r.text, /publishes ports on every network interface/);
    assert.doesNotMatch(r.dockerLog, /^cp /m, "هیچ فایلی به کانتینر نرفت");
    assertStoppedBeforeRestore(r);
  });

  test("پورتِ منتشرشده روی 127.0.0.1 هم رد می‌شود — مقصد هیچ پورتی نباید داشته باشد", () => {
    const r = runPs1(url(PW), { FAKE_SUPA_FULL: "1", FAKE_PORTS: "127.0.0.1:54322->5432/tcp" }, true);
    assert.match(r.text, /The restore target publishes a port/);
    assertStoppedBeforeRestore(r);
  });

  test("binding در HostConfig بدونِ نمایش در docker ps هم گرفته می‌شود", () => {
    const r = runPs1(url(PW), { FAKE_SUPA_FULL: "1", FAKE_BINDINGS: '{"5432/tcp":[{"HostIp":"","HostPort":"5432"}]}' }, true);
    assert.match(r.text, /is not isolated/);
    assertStoppedBeforeRestore(r);
  });

  test("شبکهٔ غیر internal رد می‌شود", () => {
    const r = runPs1(url(PW), { FAKE_SUPA_FULL: "1", FAKE_INTERNAL: "false" }, true);
    assert.match(r.text, /is not internal/);
    assertStoppedBeforeRestore(r);
  });

  test("ساختارِ auth/storageِ متفاوت با شمارهٔ نسخهٔ برابر: پیش از بازگردانی متوقف می‌شود", () => {
    // «شمارهٔ نسخه ساختار نیست»: همان 20260831180000، ولی یک ستونِ اضافه در مقصد.
    const r = runPs1(url(PW), { FAKE_SUPA_FULL: "1", FAKE_MANAGED_DRIFT: "ALTER TABLE auth.users ADD COLUMN extra text" }, true);
    assert.match(r.text, /local Auth schema 20260831180000 >= production 20260831180000/);
    assert.match(r.text, /auth\/storage structure differs from production/);
    assert.match(r.file("managed-comparison.txt").toString("utf8"), /auth\.users\.extra/);
    assertStoppedBeforeRestore(r);
  });

  test("CLIِ خراب پیش از پرسیدنِ رمز گرفته می‌شود", () => {
    const r = runPs1(url(PW), { FAKE_SUPA_BROKEN: "1" });
    assert.equal(r.code, 1);
    assert.match(r.text, /The Supabase CLI does not run on this machine/);
    assert.doesNotMatch(r.text, /connection string:/, "رمز نباید پرسیده شود");
    assert.equal(/^run /m.test(r.dockerLog), false);
  });

  test("Authِ محلیِ قدیمی‌تر از Production: پیش از بازگردانی متوقف می‌شود", () => {
    const r = runPs1(url(PW), { FAKE_SUPA_FULL: "1", FAKE_LOCAL_AUTH: "20260625000000" }, true);
    assert.equal(r.code, 1);
    assert.match(r.text, /production Auth schema: 20260831180000/);
    assert.match(r.text, /local Supabase Auth schema \(20260625000000\) is older than production \(20260831180000\)/);
    assert.doesNotMatch(r.dockerLog, /--single-transaction/, "بازگردانی نباید شروع شود");
    assert.equal(r.file("auth-version.txt").toString("utf8").trim(), "20260831180000");
  });

  test("پورتِ عمومیِ IPv6 هم گرفته می‌شود", () => {
    const r = runPs1(url(PW), { FAKE_SUPA_FULL: "1", FAKE_PORTS_AUTH: ":::54321->9999/tcp" }, true);
    assert.match(r.text, /publishes ports on every network interface/);
    assertStoppedBeforeRestore(r);
  });
});
