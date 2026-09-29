import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * `phase34` روی Postgresِ **واقعی** — #142.
 *
 * تستِ واحد (`workbook-store.test.ts`) قواعد را در برنامه می‌سنجد؛ این فایل
 * ثابت می‌کند دیتابیس **مستقل از برنامه** همان قواعد را نگه می‌دارد: کسی که با
 * نشستِ ادمین مستقیم روی PostgREST بنویسد هم نمی‌تواند نسخه را بازنویسی کند،
 * از روی نسخه بپرد، نسخهٔ کهنه را تأیید کند یا نسخهٔ بی‌شاهد را تأیید کند.
 */

const ENV = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? "127.0.0.1",
  PGPORT: process.env.PGPORT ?? "5433",
  PGUSER: process.env.PGUSER ?? "postgres",
  PGPASSWORD: process.env.PGPASSWORD ?? "postgres",
};
const ROOT = process.cwd();
const BOOTSTRAP = join(ROOT, "sql", "test", "supabase_bootstrap.sql");
const PHASE34 = join(ROOT, "sql", "phase34_research_workbook_versions.sql");
const PROFILES = {
  legacy: join(ROOT, "sql", "test", "profile_legacy_default_privileges.sql"),
  explicit: join(ROOT, "sql", "test", "profile_explicit_grants.sql"),
} as const;

const ADMIN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const WB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function psql(db: string, sql: string): string {
  return execFileSync("psql", ["-d", db, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function psqlFile(db: string, file: string): string {
  return execFileSync("psql", ["-d", db, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", file], {
    env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
}
function expectError(db: string, sql: string): string {
  try { psql(db, sql); } catch (error) {
    return String((error as { stderr?: Buffer | string }).stderr ?? "");
  }
  return "";
}
type Role = "anon" | "authenticated" | "service_role";
function wrap(role: Role, sub: string | null, sql: string): string {
  const claims = sub ? `{"sub":"${sub}","role":"${role}"}` : `{"role":"${role}"}`;
  return `BEGIN; SELECT set_config('request.jwt.claims','${claims}',true); SET LOCAL ROLE ${role}; ${sql}; COMMIT;`;
}
const asRole = (db: string, role: Role, sub: string | null, sql: string) => psql(db, wrap(role, sub, sql));
const asRoleError = (db: string, role: Role, sub: string | null, sql: string) => expectError(db, wrap(role, sub, sql));
const last = (s: string) => s.split("\n").pop()!.trim();

const EVIDENCE = `[{"id":"e1","statement":"گزاره","sourceUrl":"https://codal.ir/x","observedOn":"2026-09-20","publishedOn":"2026-09-19"}]`;
const body = (evidence: string) => `'{"version":1,"title":"t","domain":"macro_ir","evidence":${evidence}}'::jsonb`;
const insertVersion = (version: number, evidence = EVIDENCE, extra = "") =>
  `INSERT INTO public.research_workbook_versions (workbook_id, version, title, body${extra ? ", created_by, created_at" : ""})
   VALUES ('${WB}', ${version}, 'عنوان', ${body(evidence)}${extra}) RETURNING id`;
const versionId = (db: string, version: number) =>
  psql(db, `SELECT id FROM public.research_workbook_versions WHERE workbook_id='${WB}' AND version=${version}`);

function createDb(db: string, profile: string): void {
  psql("postgres", `DROP DATABASE IF EXISTS ${db}`);
  psql("postgres", `CREATE DATABASE ${db}`);
  psqlFile(db, BOOTSTRAP);
  psqlFile(db, profile);
  psql(db, `
    INSERT INTO auth.users(id) VALUES ('${ADMIN}'),('${USER}');
    INSERT INTO public.profiles(id,role) VALUES ('${ADMIN}','admin'),('${USER}','user');
  `);
  psqlFile(db, PHASE34);
}

const requireDb = process.env.CI === "true" || process.env.REQUIRE_DB === "1";
let dbError: string | null = null;
try { psql("postgres", "SELECT 1"); } catch (error) { dbError = String(error); }
if (dbError && requireDb) throw new Error(`Postgres is required in CI: ${dbError}`);
const skip = dbError ? "Postgres is unavailable outside CI" : false;

for (const [profileName, profile] of Object.entries(PROFILES)) {
  describe(`research workbook versions (phase34) — ${profileName} privilege profile`, { skip }, () => {
    const db = `wb_versions_${profileName}`;
    before(() => { createDb(db, profile); });

    test("rerunning the migration is a no-op and keeps both tables under RLS", () => {
      psqlFile(db, PHASE34);
      const count = psql(db, `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname IN ('research_workbook_versions','research_workbook_reviews')
          AND c.relkind='r' AND c.relrowsecurity`);
      assert.equal(count, "2");
    });

    test("anon and a non-admin member can neither read nor write", () => {
      assert.match(asRoleError(db, "anon", null, `SELECT count(*) FROM public.research_workbook_versions`), /permission denied/);
      assert.match(asRoleError(db, "anon", null, insertVersion(1)), /permission denied/);
      assert.match(asRoleError(db, "authenticated", USER, insertVersion(1)), /row-level security/);
    });

    test("the admin saves version 1; author and time come from the session, not the payload", () => {
      const forged = `, '${USER}', '2000-01-01T00:00:00Z'`;
      asRole(db, "authenticated", ADMIN, insertVersion(1, EVIDENCE, forged));
      const row = psql(db, `SELECT created_by, created_at > now() - interval '1 minute'
        FROM public.research_workbook_versions WHERE workbook_id='${WB}' AND version=1`);
      assert.equal(row, `${ADMIN}|t`);
      // عضوِ عادی حتی ردیفِ موجود را نمی‌بیند.
      assert.equal(last(asRole(db, "authenticated", USER, `SELECT count(*) FROM public.research_workbook_versions`)), "0");
    });

    test("a second version is a new row; a duplicate or a skipped number is refused", () => {
      asRole(db, "authenticated", ADMIN, insertVersion(2, "[]"));
      assert.match(asRoleError(db, "authenticated", ADMIN, insertVersion(2)), /duplicate key|research_workbook_versions_unique/);
      assert.match(asRoleError(db, "authenticated", ADMIN, insertVersion(4)), /version gap/);
      assert.equal(psql(db, `SELECT string_agg(version::text, ',' ORDER BY version) FROM public.research_workbook_versions`), "1,2");
    });

    test("history is append-only for every role, including the owner", () => {
      for (const role of ["authenticated", "service_role"] as const) {
        const upd = asRoleError(db, role, ADMIN, `UPDATE public.research_workbook_versions SET title='x'`);
        const del = asRoleError(db, role, ADMIN, `DELETE FROM public.research_workbook_versions`);
        const trn = asRoleError(db, role, ADMIN, `TRUNCATE public.research_workbook_versions`);
        for (const e of [upd, del, trn]) assert.match(e, /permission denied|append-only/, `${role}: ${e}`);
      }
      // مالک (postgres) امتیاز دارد؛ پس این تریگر است که جلویش را می‌گیرد.
      assert.match(expectError(db, `UPDATE public.research_workbook_versions SET title='x'`), /append-only/);
      assert.match(expectError(db, `DELETE FROM public.research_workbook_versions`), /append-only/);
      assert.match(expectError(db, `TRUNCATE public.research_workbook_versions CASCADE`), /append-only/);
      assert.match(expectError(db, `TRUNCATE public.research_workbook_reviews`), /append-only/);
    });

    test("service_role reads for backup/ops but cannot write", () => {
      assert.equal(last(asRole(db, "service_role", null, `SELECT count(*) FROM public.research_workbook_versions`)), "2");
      assert.match(asRoleError(db, "service_role", null, insertVersion(3)), /permission denied/);
    });

    test("approval is refused on a stale version and on a version without evidence", () => {
      const v1 = versionId(db, 1);
      const v2 = versionId(db, 2);
      assert.match(
        asRoleError(db, "authenticated", ADMIN, `INSERT INTO public.research_workbook_reviews (version_id, decision) VALUES ('${v1}','approved_internal')`),
        /stale version/,
      );
      assert.match(
        asRoleError(db, "authenticated", ADMIN, `INSERT INTO public.research_workbook_reviews (version_id, decision) VALUES ('${v2}','approved_internal')`),
        /approval requires evidence/,
      );
      // «بازگرداندن» نیاز به شاهد ندارد — دقیقاً برای همین نسخه‌ها است.
      asRole(db, "authenticated", ADMIN, `INSERT INTO public.research_workbook_reviews (version_id, decision, note) VALUES ('${v2}','returned','شاهد ندارد')`);
    });

    test("the latest evidenced version is approved once; a member cannot approve at all", () => {
      asRole(db, "authenticated", ADMIN, insertVersion(3));
      const v3 = versionId(db, 3);
      assert.match(
        asRoleError(db, "authenticated", USER, `INSERT INTO public.research_workbook_reviews (version_id, decision) VALUES ('${v3}','approved_internal')`),
        /version not found|row-level security/,
      );
      asRole(db, "authenticated", ADMIN, `INSERT INTO public.research_workbook_reviews (version_id, decision, reviewed_by) VALUES ('${v3}','approved_internal','${USER}')`);
      assert.equal(psql(db, `SELECT reviewed_by FROM public.research_workbook_reviews WHERE version_id='${v3}'`), ADMIN);
      assert.match(
        asRoleError(db, "authenticated", ADMIN, `INSERT INTO public.research_workbook_reviews (version_id, decision) VALUES ('${v3}','approved_internal')`),
        /duplicate key|one_approval/,
      );
      assert.match(
        asRoleError(db, "authenticated", ADMIN, `INSERT INTO public.research_workbook_reviews (version_id, decision) VALUES ('${v3}','published')`),
        /check constraint/,
      );
    });

    test("the evidence floor rejects malformed evidence shapes", () => {
      const cases: Array<[string, string]> = [
        [`NULL::jsonb`, "f"],
        [`'{}'::jsonb`, "f"],
        [`'{"evidence":null}'::jsonb`, "f"],
        [`'{"evidence":"x"}'::jsonb`, "f"],
        [`'{"evidence":[]}'::jsonb`, "f"],
        [`'{"evidence":[1]}'::jsonb`, "f"],
        [`'{"evidence":[{"statement":"s","sourceUrl":"javascript:alert(1)","observedOn":"2026-09-20","publishedOn":"2026-09-19"}]}'::jsonb`, "f"],
        [`'{"evidence":[{"statement":" ","sourceUrl":"https://a.ir","observedOn":"2026-09-20","publishedOn":"2026-09-19"}]}'::jsonb`, "f"],
        [`'{"evidence":[{"statement":"s","sourceUrl":"https://a.ir","observedOn":"","publishedOn":"2026-09-19"}]}'::jsonb`, "f"],
        [`'{"evidence":[{"statement":"s","sourceUrl":"https://a.ir","observedOn":"2026-09-20","publishedOn":"2026-09-19"}]}'::jsonb`, "t"],
      ];
      for (const [input, expected] of cases) {
        assert.equal(psql(db, `SELECT public.research_workbook_has_evidence(${input})`), expected, input);
      }
    });

    test("a version cannot be edited after approval — only superseded by a new one", () => {
      assert.match(
        asRoleError(db, "authenticated", ADMIN, `UPDATE public.research_workbook_versions SET body='{}'::jsonb WHERE version=3`),
        /permission denied|append-only/,
      );
      asRole(db, "authenticated", ADMIN, insertVersion(4));
      const approvals = psql(db, `SELECT string_agg(v.version::text, ',') FROM public.research_workbook_reviews r
        JOIN public.research_workbook_versions v ON v.id = r.version_id WHERE r.decision='approved_internal'`);
      assert.equal(approvals, "3", "تأیید به نسخهٔ ۳ بسته ماند؛ نسخهٔ ۴ به ارث نبرد");
    });
  });
}
