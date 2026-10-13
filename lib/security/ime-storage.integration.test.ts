import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

// Disposable CI Postgres only. Never run this against a deployed database.
const env = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? "127.0.0.1",
  PGPORT: process.env.PGPORT ?? "5433",
  PGUSER: process.env.PGUSER ?? "postgres",
  PGPASSWORD: process.env.PGPASSWORD ?? "postgres",
};
if (!["127.0.0.1", "localhost", "::1"].includes(env.PGHOST)) {
  throw new Error("IME integration tests require a disposable loopback Postgres");
}
const root = process.cwd();
const migration = readFileSync(join(root, "sql/phase19_ime_tables.sql"), "utf8");
const tables = ["ime_certificate_history", "ime_physical_trades"];
function sql(db: string, query: string) {
  return execFileSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", db], {
    env, input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
function failure(db: string, query: string) {
  try { sql(db, query); } catch (error) {
    return String((error as { stderr?: string }).stderr ?? "");
  }
  assert.fail("expected database operation to fail");
}
function asRole(db: string, role: string, query: string) {
  return sql(db, `BEGIN; SET LOCAL ROLE ${role}; ${query}; COMMIT;`);
}
function forbidden(db: string, role: string, query: string) {
  assert.match(failure(db, `BEGIN; SET LOCAL ROLE ${role}; ${query}; COMMIT;`), /permission denied/);
}

for (const profile of ["legacy_default_privileges", "explicit_grants"]) {
  describe(`IME absent-table installation: ${profile}`, () => {
    const db = `ime_test_${profile}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    let createdByThisRun = false;
    before(() => {
      sql("postgres", `CREATE DATABASE ${db}`);
      createdByThisRun = true;
      sql(db, readFileSync(join(root, "sql/test/supabase_bootstrap.sql"), "utf8"));
      sql(db, readFileSync(join(root, `sql/test/profile_${profile}.sql`), "utf8"));
      // Include sequence defaults and PUBLIC to make revocation non-vacuous.
      if (profile.startsWith("legacy")) sql(db, `
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO PUBLIC, anon, authenticated, service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC;`);
      sql(db, "CREATE TABLE public.ime_snapshots (marker text); INSERT INTO public.ime_snapshots VALUES ('retained');");
      sql(db, migration);
    });
    after(() => { if (createdByThisRun) sql("postgres", `DROP DATABASE ${db} WITH (FORCE)`); });

    test("writer appends, complete-key retries deduplicate, distinct nullable rows survive", () => {
      asRole(db, "service_role", `
        INSERT INTO public.ime_certificate_history (trade_date, contract_code) VALUES ('2026-01-01','SYNTHETIC')
          ON CONFLICT (trade_date, contract_code) DO NOTHING;
        INSERT INTO public.ime_certificate_history (trade_date, contract_code) VALUES ('2026-01-01','SYNTHETIC')
          ON CONFLICT (trade_date, contract_code) DO NOTHING;
        INSERT INTO public.ime_physical_trades (trade_jdate, symbol_code, supplier, type_contract)
          VALUES ('1404-10-11','SYNTHETIC','supplier-a','cash')
          ON CONFLICT (trade_jdate,symbol_code,producer,price_close_rial,volume_contract) DO NOTHING;
        INSERT INTO public.ime_physical_trades (trade_jdate, symbol_code, supplier, type_contract)
          VALUES ('1404-10-11','SYNTHETIC','supplier-b','forward')
          ON CONFLICT (trade_jdate,symbol_code,producer,price_close_rial,volume_contract) DO NOTHING`);
      assert.equal(sql(db, "SELECT count(*) FROM public.ime_certificate_history"), "1");
      assert.equal(sql(db, "SELECT count(*) FROM public.ime_physical_trades"), "2");
      for (let attempt = 0; attempt < 2; attempt++) asRole(db, "service_role", `INSERT INTO public.ime_physical_trades
        (trade_jdate,symbol_code,producer,price_close_rial,volume_contract)
        VALUES ('1404-10-11','SYNTHETIC','producer-a',123,10)
        ON CONFLICT (trade_jdate,symbol_code,producer,price_close_rial,volume_contract) DO NOTHING`);
      assert.equal(sql(db, "SELECT count(*) FROM public.ime_physical_trades"), "3");
    });

    test("anonymous and signed-in users can read but cannot write", () => {
      for (const role of ["anon", "authenticated"]) for (const table of tables) {
        assert.ok(Number(asRole(db, role, `SELECT count(*) FROM public.${table}`)) > 0);
        forbidden(db, role, `INSERT INTO public.${table} DEFAULT VALUES`);
        forbidden(db, role, `UPDATE public.${table} SET source='changed'`);
        forbidden(db, role, `DELETE FROM public.${table}`);
        forbidden(db, role, `TRUNCATE public.${table}`);
      }
    });

    test("writer cannot mutate history or bypass append-only with TRUNCATE", () => {
      for (const table of tables) {
        forbidden(db, "service_role", `UPDATE public.${table} SET source='changed'`);
        forbidden(db, "service_role", `DELETE FROM public.${table}`);
        forbidden(db, "service_role", `TRUNCATE public.${table}`);
        for (const query of [`UPDATE public.${table} SET source='changed'`, `DELETE FROM public.${table}`, `TRUNCATE public.${table}`]) {
          assert.match(failure(db, query), /append-only table/);
        }
      }
    });

    test("RLS, ACLs, identity sequences and invoker function are exact", () => {
      assert.match(sql(db, readFileSync(join(root, "sql/test/verify_ime_storage.sql"), "utf8")), /ime_storage_schema_acl_verified/);
      for (const table of tables) {
        assert.equal(sql(db, `SELECT relrowsecurity FROM pg_class WHERE oid='public.${table}'::regclass`), "t");
        for (const role of ["anon", "authenticated", "service_role"]) {
          for (const privilege of ["UPDATE", "DELETE", "TRUNCATE", "TRIGGER", "REFERENCES"]) {
            assert.equal(sql(db, `SELECT has_table_privilege('${role}','public.${table}','${privilege}')`), "f");
          }
          const sequence = `public.${table}_id_seq`;
          assert.equal(sql(db, `SELECT has_sequence_privilege('${role}','${sequence}','USAGE')`), role === "service_role" ? "t" : "f");
          assert.equal(sql(db, `SELECT has_sequence_privilege('${role}','${sequence}','UPDATE')`), "f");
          assert.equal(sql(db, `SELECT has_sequence_privilege('${role}','${sequence}','SELECT')`), "f");
          assert.equal(sql(db, `SELECT has_function_privilege('${role}','public.reject_mutation_ime()','EXECUTE')`), "f");
        }
      }
      assert.equal(sql(db, "SELECT prosecdef FROM pg_proc WHERE oid='public.reject_mutation_ime()'::regprocedure"), "f");
    });

    test("repeat installation fails before changing retained data", () => {
      assert.match(failure(db, migration), /expects absent IME/);
      assert.equal(sql(db, "SELECT marker FROM public.ime_snapshots"), "retained");
      assert.equal(sql(db, "SELECT count(*) FROM public.ime_certificate_history"), "1");
    });
  });
}

describe("IME installation transaction boundaries", () => {
  const db = `ime_test_atomic_${randomUUID().replaceAll("-", "")}`;
  let createdByThisRun = false;
  before(() => {
    sql("postgres", `CREATE DATABASE ${db}`);
    createdByThisRun = true;
    sql(db, readFileSync(join(root, "sql/test/supabase_bootstrap.sql"), "utf8"));
  });
  after(() => { if (createdByThisRun) sql("postgres", `DROP DATABASE ${db} WITH (FORCE)`); });
  test("mid-installation failure leaves no history table or guard behind", () => {
    assert.match(failure(db, migration.replace("COMMIT;", "SELECT 1/0; COMMIT;")), /division by zero/);
    assert.equal(sql(db, `SELECT to_regclass('public.ime_certificate_history') IS NULL
      AND to_regclass('public.ime_physical_trades') IS NULL
      AND to_regprocedure('public.reject_mutation_ime()') IS NULL`), "t");
  });
  test("a pre-existing partial table is never adopted or altered", () => {
    sql(db, "CREATE TABLE public.ime_physical_trades (marker text); INSERT INTO public.ime_physical_trades VALUES ('retained');");
    assert.match(failure(db, migration), /expects absent IME/);
    assert.equal(sql(db, "SELECT marker FROM public.ime_physical_trades"), "retained");
    assert.equal(sql(db, "SELECT to_regclass('public.ime_certificate_history') IS NULL"), "t");
  });
});
