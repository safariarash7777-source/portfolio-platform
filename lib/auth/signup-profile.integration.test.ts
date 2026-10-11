// Disposable CI database only. SQL behavior, NOT real Auth/member acceptance.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { execFileSync } from "../ops/test-postgres";
const env = { ...process.env, PGHOST: process.env.PGHOST ?? "127.0.0.1", PGPORT: process.env.PGPORT ?? "5433", PGUSER: process.env.PGUSER ?? "postgres", PGPASSWORD: process.env.PGPASSWORD ?? "postgres" };
if (!["127.0.0.1", "localhost", "::1"].includes(env.PGHOST)) throw new Error("Signup tests require CI-local synthetic Postgres");
const db = "reset02_signup_synthetic";
const A = "11111111-1111-4111-8111-111111111111", OWNER = "33333333-3333-4333-8333-333333333333";
function sql(query: string, database = db) { return execFileSync("psql", ["-d", database, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
function file(path: string) { execFileSync("psql", ["-d", db, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", join(process.cwd(), path)], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
before(() => {
  sql(`DROP DATABASE IF EXISTS ${db}`, "postgres"); sql(`CREATE DATABASE ${db}`, "postgres");
  file("sql/test/supabase_bootstrap.sql");
  sql(`ALTER TABLE auth.users ADD COLUMN email text, ADD COLUMN raw_user_meta_data jsonb;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin') $$;
    CREATE POLICY profiles_self_insert ON public.profiles FOR INSERT WITH CHECK(auth.uid()=id);
    CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE USING(auth.uid()=id);
    CREATE POLICY profiles_admin_update ON public.profiles FOR UPDATE USING(public.is_admin());
    CREATE POLICY profiles_self_read ON public.profiles FOR SELECT USING(auth.uid()=id);
    GRANT SELECT, UPDATE ON public.profiles TO authenticated;
    CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    INSERT INTO auth.users(id,email) VALUES('${OWNER}','owner@example.test');
    INSERT INTO public.profiles(id,email,role) VALUES('${OWNER}','owner@example.test','admin');`);
  file("sql/recovery_profile_role_guard_20261006.sql");
  file("sql/recovery_signup_profile_trigger_20261011.sql");
});
after(() => sql(`DROP DATABASE IF EXISTS ${db}`, "postgres"));
test("Auth insert preserves UUID/metadata but cannot acquire a client-supplied admin role", () => {
  sql(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('${A}','fixture@example.test','{"role":"admin","full_name":"Synthetic fixture","national_id":"0000000000","phone":"09000000000"}');`);
  const actual = JSON.parse(sql(`SELECT json_build_object('id',id,'role',role,'name',full_name,'national_id',national_id,'phone',phone) FROM public.profiles WHERE id='${A}'`));
  assert.deepEqual(actual, { id: A, role: "user", name: "Synthetic fixture", national_id: "0000000000", phone: "09000000000" });
  assert.equal(sql(`SELECT role FROM public.profiles WHERE id='${OWNER}'`), "admin");
});
test("role guard and RLS still reject member elevation", () => {
  assert.throws(() => sql(`BEGIN; SELECT set_config('request.jwt.claims','{"sub":"${A}","role":"authenticated"}',true); SET LOCAL ROLE authenticated; UPDATE public.profiles SET role='admin' WHERE id='${A}'; COMMIT;`));
  assert.equal(sql(`SELECT role FROM public.profiles WHERE id='${A}'`), "user");
});
test("profile function is not a public RPC and repeat installation fails without alteration", () => {
  assert.equal(sql("SELECT has_function_privilege('authenticated','public.handle_new_user()','EXECUTE')"), "f");
  assert.throws(() => file("sql/recovery_signup_profile_trigger_20261011.sql"));
  assert.equal(sql(`SELECT count(*) FROM public.profiles`), "2");
  assert.equal(sql(`SELECT tgenabled FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='on_auth_user_created'`), "O");
});
