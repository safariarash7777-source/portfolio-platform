import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * `scripts/selfhost/restore-to-selfhost.sh` روی Postgresِ **واقعی** — بدونِ Docker.
 *
 * اسکریپت در تولید psql را داخلِ کانتینرِ db اجرا می‌کند؛ اینجا همان نقطه با
 * `SELFHOST_TEST_PSQL` به یک wrapper روی Postgresِ محلی وصل می‌شود. بقیهٔ
 * اسکریپت — بررسی‌ها، تراکنش، مقایسه با `compare.mjs`ِ #155، و post-restore —
 * بی‌تغییر اجرا می‌شود.
 *
 * دادهٔ این تست **ساختگی** است و در یک پوشهٔ موقتِ mode 700 ساخته و پاک می‌شود.
 * این فایل **ابزار** را می‌سنجد، نه بکاپِ Production را.
 */

const ENV = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? "127.0.0.1",
  PGPORT: process.env.PGPORT ?? "5433",
  PGUSER: process.env.PGUSER ?? "postgres",
  PGPASSWORD: process.env.PGPASSWORD ?? "postgres",
};
const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts", "selfhost", "restore-to-selfhost.sh");
const INVENTORY = join(ROOT, "scripts", "backup", "inventory.sql");
const SRC = "sh_src";
const DST = "sh_dst";
const LIMITED = "sh_limited_restorer";

function psql(db: string, sql: string, env = ENV): string {
  return execFileSync("psql", ["-d", db, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

// مقصد مثلِ استکِ Supabaseِ تازه: اسکیماهای مدیریت‌شده با جدول‌هایشان، و
// pg_cronِ ساختگی (همان سطحی که post-restore لمس می‌کند).
const MANAGED = `
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, encrypted_password text);
CREATE TABLE storage.objects (id uuid PRIMARY KEY, name text);
CREATE TABLE auth.schema_migrations (version text PRIMARY KEY);
INSERT INTO auth.schema_migrations VALUES ('20260831180000');
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, jobname text, command text, schedule text DEFAULT '*/30 * * * *', active boolean DEFAULT true);
CREATE FUNCTION cron.unschedule(job_id bigint) RETURNS boolean LANGUAGE sql AS
  $$ DELETE FROM cron.job WHERE jobid = job_id RETURNING true $$;
INSERT INTO cron.job (jobname, command) VALUES
  ('telegram-sync-30m', $c$ select net.http_get('https://abcdefgh.supabase.co/functions/v1/telegram-sync') $c$),
  ('local-maintenance', 'select 1');
`;

let dir = "";
let wrapper = "";

function freshTarget(): void {
  psql("postgres", `DROP DATABASE IF EXISTS ${DST}`);
  psql("postgres", `CREATE DATABASE ${DST}`);
  psql(DST, MANAGED);
}

function writeWrapper(user: string, password?: string): string {
  const w = join(dir, `psql-${user}.sh`);
  const pw = password ? `PGPASSWORD='${password}' ` : "";
  writeFileSync(w, `#!/bin/sh\n${pw}exec psql -d ${DST} -U ${user} "$@"\n`);
  chmodSync(w, 0o700);
  return w;
}

function run(backupDir: string, psqlWrapper = wrapper) {
  return spawnSync("bash", [SCRIPT, backupDir], {
    env: { ...ENV, SELFHOST_TEST_PSQL: psqlWrapper },
    encoding: "utf8",
  });
}

function makeBackup(name: string): string {
  const b = join(dir, name);
  execFileSync("mkdir", ["-p", b]);
  chmodSync(b, 0o700);
  const dump = (args: string[]) =>
    execFileSync("pg_dump", ["-d", SRC, "--no-owner", "--no-privileges", ...args], { env: ENV, encoding: "utf8" });
  writeFileSync(join(b, "roles.sql"), "-- no custom roles in this synthetic source\nSELECT 1;\n");
  writeFileSync(join(b, "schema.sql"), dump(["--schema-only", "-n", "public"]));
  writeFileSync(join(b, "data.sql"), dump(["--data-only", "-n", "public", "-n", "auth", "-n", "storage"]));
  writeFileSync(join(b, "auth-version.txt"), "20260831180000\n");
  writeFileSync(join(b, "inventory-source.txt"),
    execFileSync("psql", ["-d", SRC, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", INVENTORY], { env: ENV, encoding: "utf8" }));
  return b;
}

const requireDb = process.env.CI === "true" || process.env.REQUIRE_DB === "1";
let dbError: string | null = null;
try { psql("postgres", "SELECT 1"); } catch (error) { dbError = String(error); }
if (dbError && requireDb) throw new Error(`Postgres is required in CI: ${dbError}`);
const skip = dbError ? "Postgres is unavailable outside CI" : false;

describe("restore-to-selfhost.sh", { skip }, () => {
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "selfhost-restore-"));
    chmodSync(dir, 0o700);
    psql("postgres", `DROP DATABASE IF EXISTS ${SRC}`);
    psql("postgres", `CREATE DATABASE ${SRC}`);
    psql(SRC, `
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, encrypted_password text);
      CREATE TABLE storage.objects (id uuid PRIMARY KEY, name text);
      INSERT INTO auth.users VALUES
        ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test', '$2a$10$syntheticsyntheticsyntheticsyntheticsyntheticsyntheti'),
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test', '$2a$10$syntheticsyntheticsyntheticsyntheticsyntheticsyntheti');
      CREATE TABLE public.symbol_history (symbol text, trade_date date, close numeric, PRIMARY KEY (symbol, trade_date));
      INSERT INTO public.symbol_history SELECT 'نماد' || (g % 7), date '2026-01-01' + g, g FROM generate_series(1, 300) g;
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL DEFAULT 'user');
      INSERT INTO public.profiles VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','admin'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','user');
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      CREATE POLICY own ON public.profiles FOR SELECT USING (true);
    `);
    psql("postgres", `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${LIMITED}') THEN
        CREATE ROLE ${LIMITED} LOGIN PASSWORD 'limited-test-only'; END IF; END $$`);
    wrapper = writeWrapper(ENV.PGUSER);
  });

  after(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    psql("postgres", `DROP DATABASE IF EXISTS ${DST}`);
    psql("postgres", `DROP DATABASE IF EXISTS ${SRC}`);
  });

  test("بازگردانیِ کامل: PASS، ردیف‌ها و هشِ رمزها برابر؛ کارِ cronِ ابری فقط گزارش می‌شود", () => {
    freshTarget();
    const b = makeBackup("ok");
    const r = run(b);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /PASS/);
    assert.equal(psql(DST, "SELECT count(*) FROM public.symbol_history"), "300");
    assert.equal(
      psql(DST, "SELECT string_agg(md5(encrypted_password), ',' ORDER BY id) FROM auth.users"),
      psql(SRC, "SELECT string_agg(md5(encrypted_password), ',' ORDER BY id) FROM auth.users"),
      "هشِ رمزها دست‌نخورده منتقل شد — اعضا با همان رمز وارد می‌شوند",
    );
    assert.equal(psql(DST, "SELECT relrowsecurity FROM pg_class WHERE oid='public.profiles'::regclass"), "t");
    // هیچ زمان‌بندی‌ای حذف یا غیرفعال نشد (بدونِ تأییدِ مالک مجاز نیست).
    assert.equal(psql(DST, "SELECT string_agg(jobname, ',' ORDER BY jobid) FROM cron.job"), "telegram-sync-30m,local-maintenance");
    assert.match(r.stdout, /cron job 1 \(telegram-sync-30m\) .*abcdefgh\.supabase\.co\/functions\/v1\/telegram-sync - left UNCHANGED/);
    assert.match(r.stdout, /1 job\(s\) target the cloud project; 2 job\(s\) in total; nothing was changed/);
    assert.equal((statSync(join(b, "restore-selfhost.log")).mode & 0o777).toString(8), "600");
    assert.doesNotMatch(r.stdout + r.stderr, /\$2a\$10\$/, "هیچ داده‌ای چاپ نشد");
  });

  test("مقصدِ غیرتازه: اجرا نمی‌شود و چیزی را لمس نمی‌کند", () => {
    // مقصد از آزمونِ قبل پر است.
    const before = psql(DST, "SELECT count(*) FROM public.symbol_history");
    const r = run(makeBackup("again"));
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /مقصد تازه نیست/);
    assert.equal(psql(DST, "SELECT count(*) FROM public.symbol_history"), before);
  });

  test("خطا وسطِ data.sql: کلِ تراکنش برمی‌گردد و مقصد تازه می‌ماند", () => {
    freshTarget();
    const b = makeBackup("broken");
    appendFileSync(join(b, "data.sql"), "\nINSERT INTO public.no_such_table VALUES (1);\n");
    const r = run(b);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /شکست خورد/);
    assert.equal(psql(DST, "SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "0");
    assert.equal(psql(DST, "SELECT count(*) FROM auth.users"), "0");
  });

  test("پوشهٔ بکاپِ قابل‌خواندن برای دیگران رد می‌شود", () => {
    freshTarget();
    const b = makeBackup("open");
    chmodSync(b, 0o755);
    const r = run(b);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /mode 700/);
  });

  test("نقشِ غیر superuser رد می‌شود (همان شکستِ log_min_messages)", () => {
    freshTarget();
    const r = run(makeBackup("limited"), writeWrapper(LIMITED, "limited-test-only"));
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /superuser نیست/);
    assert.equal(psql(DST, "SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "0");
  });

  test("Authِ مقصد قدیمی‌تر از Production: پیش از بازگردانی متوقف می‌شود", () => {
    freshTarget();
    psql(DST, "DELETE FROM auth.schema_migrations; INSERT INTO auth.schema_migrations VALUES ('20260625000000')");
    const r = run(makeBackup("oldauth"));
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /طرحِ Authِ مقصد \(20260625000000\) از Production \(20260831180000\) قدیمی‌تر است/);
    assert.equal(psql(DST, "SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "0");
  });

  test("بکاپِ بدونِ auth-version.txt (پیش از این نسخه) رد می‌شود", () => {
    freshTarget();
    const b = makeBackup("noauth");
    rmSync(join(b, "auth-version.txt"));
    const r = run(b);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /auth-version\.txt/);
  });

  test("بکاپِ ناقص (بدونِ اثرِ انگشتِ مبدأ) رد می‌شود", () => {
    freshTarget();
    const b = makeBackup("noinv");
    rmSync(join(b, "inventory-source.txt"));
    const r = run(b);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /inventory-source\.txt/);
  });
});
