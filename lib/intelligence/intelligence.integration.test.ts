import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ENV = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? "127.0.0.1",
  PGPORT: process.env.PGPORT ?? "5433",
  PGUSER: process.env.PGUSER ?? "postgres",
  PGPASSWORD: process.env.PGPASSWORD ?? "postgres",
};
const ROOT = process.cwd();
const BOOTSTRAP = join(ROOT, "sql", "test", "supabase_bootstrap.sql");
const MIGRATION = join(ROOT, "sql", "phase20_intelligence_model.sql");
const PROFILES = {
  legacy: join(ROOT, "sql", "test", "profile_legacy_default_privileges.sql"),
  explicit: join(ROOT, "sql", "test", "profile_explicit_grants.sql"),
} as const;
const INTEL_TABLES = [
  "intel_sources", "intel_evidence", "intel_events", "intel_analyses", "intel_claims",
  "intel_claim_evidence", "intel_effects", "intel_portfolio_effects",
  "intel_analysis_signals", "intel_runs", "intel_run_inputs",
  "intel_reference_portfolios", "intel_reference_versions",
  "intel_reference_positions", "intel_corrections",
] as const;
const ADMIN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SIGNAL = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function psql(db: string, sql: string): string {
  return execFileSync("psql", ["-d", db, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function psqlFile(db: string, file: string): void {
  execFileSync("psql", ["-d", db, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", file], {
    env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
}
function expectError(db: string, sql: string): string {
  try { psql(db, sql); } catch (error) {
    return String((error as { stderr?: Buffer | string }).stderr ?? "");
  }
  return "";
}
function wrap(role: "anon" | "authenticated" | "service_role", sub: string | null, sql: string): string {
  const claims = sub ? `{"sub":"${sub}","role":"${role}"}` : `{"role":"${role}"}`;
  return `BEGIN; SELECT set_config('request.jwt.claims','${claims}',true); SET LOCAL ROLE ${role}; ${sql}; COMMIT;`;
}
const asRole = (db: string, role: "anon" | "authenticated" | "service_role", sub: string | null, sql: string) =>
  psql(db, wrap(role, sub, sql));
const asRoleError = (db: string, role: "anon" | "authenticated" | "service_role", sub: string | null, sql: string) =>
  expectError(db, wrap(role, sub, sql));

function createDb(db: string, profile: string): void {
  psql("postgres", `DROP DATABASE IF EXISTS ${db}`);
  psql("postgres", `CREATE DATABASE ${db}`);
  psqlFile(db, BOOTSTRAP);
  psqlFile(db, profile);
  psql(db, `
    CREATE TABLE public.signals (id uuid UNIQUE NOT NULL, seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY);
    INSERT INTO auth.users(id) VALUES ('${ADMIN}'),('${USER}');
    INSERT INTO public.profiles(id,role) VALUES ('${ADMIN}','admin'),('${USER}','user');
    INSERT INTO public.signals(id) VALUES ('${SIGNAL}');
  `);
  psqlFile(db, MIGRATION);
}

const requireDb = process.env.CI === "true" || process.env.REQUIRE_DB === "1";
let dbError: string | null = null;
try { psql("postgres", "SELECT 1"); } catch (error) { dbError = String(error); }
if (dbError && requireDb) throw new Error(`Postgres is required in CI: ${dbError}`);
const skip = dbError ? "Postgres is unavailable outside CI" : false;

for (const [profileName, profile] of Object.entries(PROFILES)) {
  describe(`intelligence ledger — ${profileName} privilege profile`, { skip }, () => {
    const db = `intel_it_${profileName}`;
    let source = "";
    let evidence1 = "";
    let evidence2 = "";
    let analysis = "";
    let claim = "";
    let version = "";

    before(() => { createDb(db, profile); });

    test("all fifteen intelligence tables exist with RLS enabled", () => {
      const count = psql(db, `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname LIKE 'intel_%' AND c.relkind='r' AND c.relrowsecurity`);
      assert.equal(count, "15");
    });

    test("ordinary user cannot read drafts or create an analysis", () => {
      const draft = asRole(db, "authenticated", ADMIN, `INSERT INTO public.intel_analyses(domain,title,body_md)
        VALUES ('macro_ir','draft visibility','body') RETURNING id`);
      assert.equal(asRole(db, "authenticated", USER, `SELECT count(*) FROM public.intel_analyses WHERE id='${draft.split("\n").pop()}'`).split("\n").pop(), "0");
      assert.match(asRoleError(db, "authenticated", USER, `INSERT INTO public.intel_analyses(domain,title,body_md)
        VALUES ('macro_ir','forbidden','body')`), /row-level security|permission denied/i);
    });

    test("admin creates the evidence, event, pending analysis and claim graph", () => {
      source = asRole(db, "authenticated", ADMIN, `INSERT INTO public.intel_sources(kind,name) VALUES ('official','CBI') RETURNING id`).split("\n").pop()!;
      evidence1 = asRole(db, "authenticated", ADMIN, `INSERT INTO public.intel_evidence(source_id,excerpt,observed_at,content_hash)
        VALUES ('${source}','first source',now(),'1111111111111111') RETURNING id`).split("\n").pop()!;
      evidence2 = asRole(db, "authenticated", ADMIN, `INSERT INTO public.intel_evidence(source_id,excerpt,observed_at,content_hash)
        VALUES ('${source}','second source',now(),'2222222222222222') RETURNING id`).split("\n").pop()!;
      const event = asRole(db, "authenticated", ADMIN, `INSERT INTO public.intel_events(domain,title,occurred_at,scope)
        VALUES ('macro_ir','policy event',now(),'iran') RETURNING id`).split("\n").pop()!;
      analysis = asRole(db, "authenticated", ADMIN, `INSERT INTO public.intel_analyses(domain,title,body_md,status)
        VALUES ('macro_ir','publish test','body','pending_approval') RETURNING id`).split("\n").pop()!;
      claim = asRole(db, "authenticated", ADMIN, `INSERT INTO public.intel_claims(analysis_id,event_id,kind,statement,confidence)
        VALUES ('${analysis}','${event}','FACT','documented fact',90) RETURNING id`).split("\n").pop()!;
      assert.ok(source && evidence1 && evidence2 && analysis && claim);
    });

    test("publication fails while a claim has no evidence", () => {
      assert.match(asRoleError(db, "authenticated", ADMIN, `SELECT public.publish_intel_analysis('${analysis}')`), /requires evidence/i);
    });

    test("one claim accepts several evidence links", () => {
      asRole(db, "authenticated", ADMIN, `INSERT INTO public.intel_claim_evidence(claim_id,evidence_id)
        VALUES ('${claim}','${evidence1}'),('${claim}','${evidence2}')`);
      assert.equal(asRole(db, "authenticated", ADMIN, `SELECT count(*) FROM public.intel_claim_evidence WHERE claim_id='${claim}'`).split("\n").pop(), "2");
    });

    test("controlled publish records the human approver and all timestamps", () => {
      asRole(db, "authenticated", ADMIN, `SELECT public.publish_intel_analysis('${analysis}')`);
      const row = psql(db, `SELECT status || '|' || approved_by || '|' || (approved_at IS NOT NULL) || '|' || (published_at IS NOT NULL)
        FROM public.intel_analyses WHERE id='${analysis}'`);
      assert.equal(row, `published|${ADMIN}|true|true`);
    });

    // Two layers stop a service_role rewrite, and which one fires first changed
    // when the grant was tightened. Before, service_role held UPDATE, so the
    // append-only trigger was the thing that spoke. Now the privilege check
    // rejects it first and the trigger is never reached — a strictly stronger
    // outcome, so the assertion accepts either voice rather than demanding the
    // weaker one.
    const BLOCKED = /append-only|permission denied/i;

    test("published analysis and append-only evidence/effects cannot be rewritten", () => {
      assert.match(asRoleError(db, "authenticated", ADMIN, `UPDATE public.intel_analyses SET title='rewritten' WHERE id='${analysis}'`), /immutable/i);
      assert.match(asRoleError(db, "service_role", null, `UPDATE public.intel_evidence SET excerpt='rewritten' WHERE id='${evidence1}'`), BLOCKED);
      const effect = asRole(db, "authenticated", ADMIN, `INSERT INTO public.intel_portfolio_effects
        (analysis_id,asset_class,suggested_direction,horizon,confidence,rationale)
        VALUES ('${analysis}','gold','hold','medium_term',70,'risk balance') RETURNING id`).split("\n").pop();
      assert.match(asRoleError(db, "service_role", null, `UPDATE public.intel_portfolio_effects SET rationale='changed' WHERE id='${effect}'`), BLOCKED);
    });

    test("analysis-to-signal rejects a nonexistent signal FK", () => {
      assert.match(asRoleError(db, "authenticated", ADMIN, `INSERT INTO public.intel_analysis_signals(analysis_id,signal_id)
        VALUES ('${analysis}','dddddddd-dddd-dddd-dddd-dddddddddddd')`), /foreign key/i);
      asRole(db, "authenticated", ADMIN, `INSERT INTO public.intel_analysis_signals(analysis_id,signal_id) VALUES ('${analysis}','${SIGNAL}')`);
    });

    test("reference version cannot finalize below 100 percent", () => {
      const portfolio = asRole(db, "authenticated", ADMIN, `INSERT INTO public.intel_reference_portfolios(name) VALUES ('Public Reference') RETURNING id`).split("\n").pop();
      version = asRole(db, "authenticated", ADMIN, `INSERT INTO public.intel_reference_versions(portfolio_id,version_no,effective_at,reason_text)
        VALUES ('${portfolio}',1,now(),'initial public basket') RETURNING id`).split("\n").pop()!;
      asRole(db, "authenticated", ADMIN, `INSERT INTO public.intel_reference_positions(version_id,asset_class,weight_pct)
        VALUES ('${version}','equity_ir',50),('${version}','gold',30)`);
      assert.match(asRoleError(db, "authenticated", ADMIN, `SELECT public.finalize_reference_version('${version}')`), /exactly 100/i);
    });

    test("a complete 100 percent reference version finalizes atomically", () => {
      asRole(db, "authenticated", ADMIN, `INSERT INTO public.intel_reference_positions(version_id,asset_class,weight_pct)
        VALUES ('${version}','fixed_income',20)`);
      asRole(db, "authenticated", ADMIN, `SELECT public.finalize_reference_version('${version}')`);
      assert.equal(psql(db, `SELECT status FROM public.intel_reference_versions WHERE id='${version}'`), "finalized");
    });

    test("finalized version and its positions are immutable", () => {
      assert.match(asRoleError(db, "authenticated", ADMIN, `UPDATE public.intel_reference_positions SET weight_pct=40
        WHERE version_id='${version}' AND asset_class='equity_ir'`), /immutable/i);
      assert.match(asRoleError(db, "authenticated", ADMIN, `UPDATE public.intel_reference_versions SET reason_text='changed' WHERE id='${version}'`), /immutable/i);
    });

    test("ordinary user has neither DELETE nor TRUNCATE", () => {
      for (const table of ["intel_analyses", "intel_evidence", "intel_reference_positions"]) {
        assert.match(asRoleError(db, "authenticated", USER, `TRUNCATE public.${table}`), /permission denied/i);
        assert.match(asRoleError(db, "authenticated", USER, `DELETE FROM public.${table}`), /permission denied|row-level security/i);
      }
    });

    // The test above covered only `authenticated`, which is why the staging
    // rehearsal in `P2-G3-002` still found service_role holding TRUNCATE on all
    // fifteen tables. TRUNCATE does not fire triggers, so that one grant made
    // every append-only guard in this file decorative. Checking the role that
    // actually runs server-side is the whole point.
    test("service_role cannot TRUNCATE or DELETE any intelligence table", () => {
      for (const table of INTEL_TABLES) {
        assert.match(asRoleError(db, "service_role", null, `TRUNCATE public.${table}`),
          /permission denied/i, `service_role can TRUNCATE ${table}`);
        assert.match(asRoleError(db, "service_role", null, `DELETE FROM public.${table}`),
          /permission denied|append-only|cannot be deleted|immutable/i, `service_role can DELETE ${table}`);
      }
    });

    test("failability control proves the service_role revoke is material", () => {
      const granted = expectError(db, `BEGIN; GRANT TRUNCATE ON public.intel_corrections TO service_role;
        SET LOCAL ROLE service_role; TRUNCATE public.intel_corrections; ROLLBACK;`);
      assert.equal(granted, "", "granting TRUNCATE back must make the same statement succeed");
    });

    test("failability control proves the immutable trigger is material", () => {
      const changed = psql(db, `BEGIN; ALTER TABLE public.intel_evidence DISABLE TRIGGER trg_intel_evidence_immutable;
        UPDATE public.intel_evidence SET excerpt='mutation control' WHERE id='${evidence1}';
        SELECT excerpt FROM public.intel_evidence WHERE id='${evidence1}'; ROLLBACK;`);
      assert.match(changed, /mutation control/);
    });
  });
}

