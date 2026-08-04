import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * `phase22` روی Postgresِ **واقعی** — `G3-003`.
 *
 * چرا این فایل جدا از `intelligence.integration.test.ts` است: آن فایل قرارداد
 * `phase20` را قفل می‌کند. این یکی می‌سنجد که `phase22` آن قرارداد را **تنگ‌تر**
 * کرده باشد، نه بازتر. اگر روزی کسی `phase22` را بردارد، آن فایل همچنان سبز
 * می‌ماند و این یکی قرمز می‌شود — که دقیقاً همان چیزی است که باید.
 *
 * قاعدهٔ سختِ زیرِ همهٔ این تست‌ها: **`approved_internal` ≠ `published`**.
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
const PHASE20 = join(ROOT, "sql", "phase20_intelligence_model.sql");
const PHASE22 = join(ROOT, "sql", "phase22_manual_intelligence_workflow.sql");
const PROFILES = {
  legacy: join(ROOT, "sql", "test", "profile_legacy_default_privileges.sql"),
  explicit: join(ROOT, "sql", "test", "profile_explicit_grants.sql"),
} as const;

const ADMIN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const NEW_TABLES = ["intel_workflow_events", "intel_rehearsal_days"] as const;

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
const last = (s: string) => s.split("\n").pop()!.trim();

function createDb(db: string, profile: string): void {
  psql("postgres", `DROP DATABASE IF EXISTS ${db}`);
  psql("postgres", `CREATE DATABASE ${db}`);
  psqlFile(db, BOOTSTRAP);
  psqlFile(db, profile);
  psql(db, `
    CREATE TABLE public.signals (id uuid UNIQUE NOT NULL, seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY);
    INSERT INTO auth.users(id) VALUES ('${ADMIN}'),('${USER}');
    INSERT INTO public.profiles(id,role) VALUES ('${ADMIN}','admin'),('${USER}','user');
  `);
  psqlFile(db, PHASE20);
  psqlFile(db, PHASE22);
}

const requireDb = process.env.CI === "true" || process.env.REQUIRE_DB === "1";
let dbError: string | null = null;
try { psql("postgres", "SELECT 1"); } catch (error) { dbError = String(error); }
if (dbError && requireDb) throw new Error(`Postgres is required in CI: ${dbError}`);
const skip = dbError ? "Postgres is unavailable outside CI" : false;

for (const [profileName, profile] of Object.entries(PROFILES)) {
  describe(`manual intelligence workflow — ${profileName} privilege profile`, { skip }, () => {
    const db = `intel_wf_${profileName}`;
    let source = "";
    let evidence = "";
    let analysis = "";
    let claim = "";

    before(() => { createDb(db, profile); });

    // ── ساختار ──────────────────────────────────────────────────────────────

    test("both new tables exist with RLS enabled", () => {
      const count = psql(db, `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname IN ('intel_workflow_events','intel_rehearsal_days')
          AND c.relkind='r' AND c.relrowsecurity`);
      assert.equal(count, "2");
    });

    test("the lifecycle really carries the two new states", () => {
      const def = psql(db, `SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conrelid='public.intel_analyses'::regclass AND conname='intel_analyses_status_check'`);
      for (const s of ["draft", "pending_approval", "approved_internal", "rejected", "published", "superseded"]) {
        assert.match(def, new RegExp(`'${s}'`), `حالتِ ${s} در قید نیست`);
      }
    });

    // ── گردشِ کامل ──────────────────────────────────────────────────────────

    test("admin captures a source, evidence, event, brief and claim", () => {
      source = last(asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_sources(kind,name,url) VALUES ('official','CBI','https://cbi.ir') RETURNING id`));
      evidence = last(asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_evidence(source_id,excerpt,observed_at,content_hash)
         VALUES ('${source}','observed excerpt',now(),'abcdef0123456789') RETURNING id`));
      analysis = last(asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_analyses(domain,title,body_md,brief_date)
         VALUES ('macro_ir','بریفِ روز','متن',current_date) RETURNING id`));
      claim = last(asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_claims(analysis_id,kind,statement,confidence,scenario_label)
         VALUES ('${analysis}','SCENARIO','سناریوی مبنا',60,'base') RETURNING id`));
      assert.ok(source && evidence && analysis && claim);
    });

    /**
     * دفتر را تریگر می‌نویسد، نه اپلیکیشن. اگر روت فراموش کند لاگ بزند — یا
     * تصمیم بگیرد نزند — تاریخچه دقیقاً همان‌جا سوراخ می‌شود که بیشترین اهمیت
     * را دارد. این تست همان انتخاب را قفل می‌کند.
     */
    test("creating the analysis wrote a `captured` event without the app asking", () => {
      const rows = asRole(db, "authenticated", ADMIN,
        `SELECT event FROM public.intel_workflow_events WHERE analysis_id='${analysis}' ORDER BY occurred_at`);
      assert.match(rows, /captured/);
    });

    test("a draft cannot be submitted for review while a claim has no evidence", () => {
      asRole(db, "authenticated", ADMIN,
        `UPDATE public.intel_analyses SET status='pending_approval' WHERE id='${analysis}'`);
      const err = asRoleError(db, "authenticated", ADMIN,
        `UPDATE public.intel_analyses SET status='approved_internal', approved_by='${ADMIN}', approved_at=now()
         WHERE id='${analysis}'`);
      assert.match(err, /requires evidence/i);
    });

    test("with evidence attached, internal approval succeeds", () => {
      asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_claim_evidence(claim_id,evidence_id) VALUES ('${claim}','${evidence}')`);
      asRole(db, "authenticated", ADMIN,
        `UPDATE public.intel_analyses SET status='approved_internal', approved_by='${ADMIN}', approved_at=now()
         WHERE id='${analysis}'`);
      assert.equal(
        last(asRole(db, "authenticated", ADMIN, `SELECT status FROM public.intel_analyses WHERE id='${analysis}'`)),
        "approved_internal"
      );
    });

    // ── قاعدهٔ سخت ──────────────────────────────────────────────────────────

    test("an internally approved analysis is still invisible to anon", () => {
      const seen = asRole(db, "anon", null,
        `SELECT count(*) FROM public.intel_analyses WHERE id='${analysis}'`);
      assert.equal(last(seen), "0", "تأییدِ داخلی نباید چیزی را عمومی کند");
    });

    test("an internally approved analysis is still invisible to an ordinary user", () => {
      assert.equal(
        last(asRole(db, "authenticated", USER, `SELECT count(*) FROM public.intel_analyses WHERE id='${analysis}'`)),
        "0"
      );
    });

    test("approved_internal cannot carry a publication timestamp", () => {
      const err = asRoleError(db, "authenticated", ADMIN,
        `UPDATE public.intel_analyses SET published_at=now() WHERE id='${analysis}'`);
      assert.match(err, /publication_consistent|only a draft|violates check/i);
    });

    test("the whole workflow leaves the public policy untouched", () => {
      const qual = psql(db, `SELECT pg_get_expr(polqual,polrelid) FROM pg_policy
        WHERE polrelid='public.intel_analyses'::regclass AND polname='intel_public_read_published'`);
      assert.match(qual, /status = 'published'/);
      assert.doesNotMatch(qual, /approved_internal|pending_approval|draft/);
    });

    // ── گذارهای غیرمجاز ─────────────────────────────────────────────────────

    test("draft cannot jump straight to published", () => {
      const d = last(asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_analyses(domain,title,body_md) VALUES ('fx_gold','jump','x') RETURNING id`));
      const err = asRoleError(db, "authenticated", ADMIN,
        `UPDATE public.intel_analyses SET status='published', approved_by='${ADMIN}', approved_at=now(), published_at=now()
         WHERE id='${d}'`);
      assert.match(err, /illegal analysis transition/i);
    });

    test("pending_approval can no longer publish directly — the phase20 path is closed", () => {
      const d = last(asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_analyses(domain,title,body_md) VALUES ('fx_gold','direct','x') RETURNING id`));
      asRole(db, "authenticated", ADMIN, `UPDATE public.intel_analyses SET status='pending_approval' WHERE id='${d}'`);
      const err = asRoleError(db, "authenticated", ADMIN,
        `UPDATE public.intel_analyses SET status='published', approved_by='${ADMIN}', approved_at=now(), published_at=now()
         WHERE id='${d}'`);
      assert.match(err, /illegal analysis transition/i);
    });

    test("the publish RPC also refuses anything but approved_internal", () => {
      const d = last(asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_analyses(domain,title,body_md) VALUES ('fx_gold','rpc','x') RETURNING id`));
      asRole(db, "authenticated", ADMIN, `UPDATE public.intel_analyses SET status='pending_approval' WHERE id='${d}'`);
      assert.match(
        asRoleError(db, "authenticated", ADMIN, `SELECT public.publish_intel_analysis('${d}')`),
        /must be approved_internal/i
      );
    });

    test("only a pending analysis can be reviewed", () => {
      const d = last(asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_analyses(domain,title,body_md) VALUES ('fx_gold','review','x') RETURNING id`));
      assert.match(
        asRoleError(db, "authenticated", ADMIN, `UPDATE public.intel_analyses SET status='rejected' WHERE id='${d}'`),
        /illegal analysis transition/i
      );
    });

    test("content cannot be rewritten underneath a reviewer", () => {
      const d = last(asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_analyses(domain,title,body_md) VALUES ('fx_gold','locked','x') RETURNING id`));
      asRole(db, "authenticated", ADMIN, `UPDATE public.intel_analyses SET status='pending_approval' WHERE id='${d}'`);
      assert.match(
        asRoleError(db, "authenticated", ADMIN, `UPDATE public.intel_analyses SET body_md='rewritten' WHERE id='${d}'`),
        /only a draft analysis may be edited/i
      );
    });

    /**
     * بازگرداندن به پیش‌نویس باید امضای تأیید را پاک کند. وگرنه متنِ بازنویسی‌شده
     * تأییدی را با خود حمل می‌کند که به متنِ قبلی داده شده بود — یک تأییدِ جعلی
     * که هیچ‌کس نمی‌بیند.
     */
    test("returning to draft clears the approval it no longer has", () => {
      const d = last(asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_analyses(domain,title,body_md) VALUES ('fx_gold','retract','x') RETURNING id`));
      const c = last(asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_claims(analysis_id,kind,statement,confidence)
         VALUES ('${d}','FACT','fact',80) RETURNING id`));
      asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_claim_evidence(claim_id,evidence_id) VALUES ('${c}','${evidence}')`);
      asRole(db, "authenticated", ADMIN, `UPDATE public.intel_analyses SET status='pending_approval' WHERE id='${d}'`);
      asRole(db, "authenticated", ADMIN,
        `UPDATE public.intel_analyses SET status='approved_internal', approved_by='${ADMIN}', approved_at=now() WHERE id='${d}'`);
      asRole(db, "authenticated", ADMIN, `UPDATE public.intel_analyses SET status='draft' WHERE id='${d}'`);
      assert.equal(
        last(asRole(db, "authenticated", ADMIN,
          `SELECT coalesce(approved_by::text,'null') FROM public.intel_analyses WHERE id='${d}'`)),
        "null"
      );
    });

    test("the ledger recorded every step in order", () => {
      const rows = asRole(db, "authenticated", ADMIN,
        `SELECT string_agg(event,',' ORDER BY occurred_at, event) FROM public.intel_workflow_events
         WHERE analysis_id='${analysis}'`);
      assert.match(last(rows), /captured/);
      assert.match(last(rows), /submitted/);
      assert.match(last(rows), /approved_internal/);
    });

    // ── دفترِ گردش: append-only برای همه ────────────────────────────────────

    test("nobody can update or delete a workflow event — not even service_role", () => {
      for (const role of ["authenticated", "service_role"] as const) {
        const sub = role === "authenticated" ? ADMIN : null;
        assert.match(
          asRoleError(db, role, sub, `UPDATE public.intel_workflow_events SET note='rewritten'`),
          /permission denied|append-only|row-level security/i, `${role} می‌تواند دفتر را تغییر دهد`
        );
        assert.match(
          asRoleError(db, role, sub, `DELETE FROM public.intel_workflow_events`),
          /permission denied|append-only|row-level security/i, `${role} می‌تواند دفتر را حذف کند`
        );
      }
    });

    test("service_role cannot TRUNCATE either new table", () => {
      for (const t of NEW_TABLES) {
        assert.match(asRoleError(db, "service_role", null, `TRUNCATE public.${t}`),
          /permission denied/i, `service_role می‌تواند ${t} را TRUNCATE کند`);
      }
    });

    test("anon has no privilege at all on the new tables", () => {
      for (const t of NEW_TABLES) {
        assert.match(asRoleError(db, "anon", null, `SELECT count(*) FROM public.${t}`),
          /permission denied/i, `anon می‌تواند ${t} را بخواند`);
      }
    });

    test("an ordinary user sees no internal workflow history", () => {
      assert.equal(
        last(asRole(db, "authenticated", USER, `SELECT count(*) FROM public.intel_workflow_events`)),
        "0"
      );
    });

    // ── دفترِ تمرین ─────────────────────────────────────────────────────────

    test("a day claiming no brief cannot also claim a production time", () => {
      assert.match(
        asRoleError(db, "authenticated", ADMIN,
          `INSERT INTO public.intel_rehearsal_days(rehearsal_date,day_index,brief_produced,minutes_to_approval)
           VALUES ('2026-08-10',1,false,25)`),
        /brief_consistent|violates check/i
      );
    });

    test("a real rehearsal day records and can be corrected while open", () => {
      const dayId = last(asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_rehearsal_days(rehearsal_date,day_index,brief_produced,brief_analysis_id,
           minutes_to_approval,stale_sources,human_corrections)
         VALUES ('2026-08-11',1,true,'${analysis}',45,ARRAY['fx_rates'],2) RETURNING id`));
      asRole(db, "authenticated", ADMIN,
        `UPDATE public.intel_rehearsal_days SET human_corrections=3 WHERE id='${dayId}'`);
      assert.equal(
        last(asRole(db, "authenticated", ADMIN,
          `SELECT human_corrections FROM public.intel_rehearsal_days WHERE id='${dayId}'`)),
        "3"
      );
    });

    test("a sealed day is frozen and its date never moves", () => {
      const dayId = last(asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_rehearsal_days(rehearsal_date,day_index,brief_produced)
         VALUES ('2026-08-12',2,false) RETURNING id`));
      assert.match(
        asRoleError(db, "authenticated", ADMIN,
          `UPDATE public.intel_rehearsal_days SET rehearsal_date='2026-08-13' WHERE id='${dayId}'`),
        /immutable/i
      );
      asRole(db, "authenticated", ADMIN, `SELECT public.seal_rehearsal_day('${dayId}')`);
      assert.match(
        asRoleError(db, "authenticated", ADMIN,
          `UPDATE public.intel_rehearsal_days SET missed_events=1 WHERE id='${dayId}'`),
        /is sealed/i
      );
    });

    test("a rehearsal day can never be deleted, by anyone", () => {
      for (const role of ["authenticated", "service_role"] as const) {
        assert.match(
          asRoleError(db, role, role === "authenticated" ? ADMIN : null,
            `DELETE FROM public.intel_rehearsal_days`),
          /permission denied|cannot be deleted|row-level security/i
        );
      }
    });

    test("the same rehearsal date cannot be recorded twice", () => {
      assert.match(
        asRoleError(db, "authenticated", ADMIN,
          `INSERT INTO public.intel_rehearsal_days(rehearsal_date,day_index,brief_produced)
           VALUES ('2026-08-11',9,false)`),
        /duplicate key|unique/i
      );
    });

    test("an ordinary user can neither read nor write the rehearsal ledger", () => {
      assert.equal(
        last(asRole(db, "authenticated", USER, `SELECT count(*) FROM public.intel_rehearsal_days`)), "0");
      assert.match(
        asRoleError(db, "authenticated", USER,
          `INSERT INTO public.intel_rehearsal_days(rehearsal_date,day_index,brief_produced)
           VALUES ('2026-09-01',1,false)`),
        /row-level security|permission denied/i
      );
    });

    // ── یک بریف در روز ──────────────────────────────────────────────────────

    test("two live briefs cannot share a date, but a rejected one frees it", () => {
      const err = asRoleError(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_analyses(domain,title,body_md,brief_date)
         VALUES ('macro_ir','بریفِ دوم','متن',current_date)`);
      assert.match(err, /duplicate key|unique/i);

      const d = last(asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_analyses(domain,title,body_md,brief_date)
         VALUES ('macro_ir','بریفِ روزِ دیگر','متن','2026-09-09') RETURNING id`));
      asRole(db, "authenticated", ADMIN, `UPDATE public.intel_analyses SET status='pending_approval' WHERE id='${d}'`);
      asRole(db, "authenticated", ADMIN, `UPDATE public.intel_analyses SET status='rejected' WHERE id='${d}'`);
      const second = asRoleError(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_analyses(domain,title,body_md,brief_date)
         VALUES ('macro_ir','جایگزین','متن','2026-09-09')`);
      assert.equal(second, "", "پس از رد شدن، همان روز باید دوباره قابلِ استفاده باشد");
    });

    // ── ثبتِ اتمیکِ بسته ────────────────────────────────────────────────────

    const pkg = (over: Record<string, string> = {}) => {
      const claims = over.claims ?? `'[{"kind":"FACT","statement":"گزاره","confidence":70}]'::jsonb`;
      return `SELECT public.capture_intel_package(
        '{"kind":"news","name":"خبرگزاری","url":"https://example.com"}'::jsonb,
        '{"excerpt":"${over.excerpt ?? "شاهد"}","observed_at":"2026-08-02T10:00:00Z","content_hash":"${over.hash ?? "aaaaaaaaaaaaaaaa"}"}'::jsonb,
        '{"domain":"macro_ir","title":"رخداد","occurred_at":"2026-08-02T09:00:00Z","scope":"${over.scope ?? "iran"}"${over.symbol ? `,"symbol":"${over.symbol}"` : ""}}'::jsonb,
        '{"domain":"macro_ir","title":"${over.title ?? "تحلیل"}","body_md":"متن"}'::jsonb,
        ${claims})`;
    };

    test("a whole package is captured in one call, already linked to evidence", () => {
      const id = last(asRole(db, "authenticated", ADMIN, pkg({ hash: "1111111111111111" })));
      assert.match(id, /^[0-9a-f-]{36}$/);
      // مهم‌ترین بخش: بسته از همان ابتدا قابلِ تأیید است، چون پیوندِ شاهد
      // موکول نشده.
      assert.equal(
        last(asRole(db, "authenticated", ADMIN,
          `SELECT count(*) FROM public.intel_claims c
            JOIN public.intel_claim_evidence ce ON ce.claim_id=c.id WHERE c.analysis_id='${id}'`)),
        "1"
      );
    });

    /**
     * قلبِ «ثبتِ اتمیک». گزارهٔ دوم عمداً معیوب است (`confidence` بیرونِ بازه).
     * اگر مسیرِ API پنج `INSERT` جدا می‌فرستاد، منبع و شاهد و تحلیل می‌ماندند و
     * فقط گزاره‌ها گم می‌شدند — یک بستهٔ نصفه که بعداً شبیهِ دادهٔ واقعی است.
     */
    test("a package with one bad claim leaves nothing behind at all", () => {
      const before = last(asRole(db, "authenticated", ADMIN,
        `SELECT count(*)::text FROM public.intel_sources`));
      const err = asRoleError(db, "authenticated", ADMIN, pkg({
        hash: "2222222222222222",
        claims: `'[{"kind":"FACT","statement":"ok","confidence":70},
                   {"kind":"FACT","statement":"bad","confidence":500}]'::jsonb`,
      }));
      assert.match(err, /confidence|violates check/i);
      assert.equal(
        last(asRole(db, "authenticated", ADMIN, `SELECT count(*)::text FROM public.intel_sources`)),
        before, "منبعِ بی‌صاحب از یک بستهٔ شکست‌خورده باقی مانده است"
      );
      assert.equal(
        last(asRole(db, "authenticated", ADMIN,
          `SELECT count(*)::text FROM public.intel_evidence WHERE content_hash='2222222222222222'`)),
        "0", "شاهدِ بی‌صاحب باقی مانده است"
      );
    });

    test("a package with no claim is refused", () => {
      assert.match(
        asRoleError(db, "authenticated", ADMIN, pkg({ hash: "3333333333333333", claims: "'[]'::jsonb" })),
        /at least one claim/i
      );
    });

    test("the database still refuses a symbol outside company scope", () => {
      assert.match(
        asRoleError(db, "authenticated", ADMIN,
          pkg({ hash: "4444444444444444", scope: "iran", symbol: "فولاد" })),
        /symbol_scope|violates check/i
      );
    });

    test("an ordinary user cannot capture a package", () => {
      assert.match(asRoleError(db, "authenticated", USER, pkg({ hash: "5555555555555555" })),
        /admin required/i);
    });

    test("anon cannot even execute the capture function", () => {
      assert.match(asRoleError(db, "anon", null, pkg({ hash: "6666666666666666" })),
        /permission denied/i);
    });

    // ── کنترل‌های شکست‌پذیری ────────────────────────────────────────────────
    //
    // بدون این‌ها معلوم نیست تست‌های بالا واقعاً چیزی را می‌سنجند یا فقط اتفاقی
    // سبزند. هرکدام کنترل را برمی‌دارد و ثابت می‌کند همان دستور آن‌وقت **موفق**
    // می‌شود.

    test("failability — disabling the transition guard makes the illegal jump succeed", () => {
      const d = last(asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_analyses(domain,title,body_md) VALUES ('fx_gold','failability','x') RETURNING id`));
      const out = psql(db, `BEGIN;
        ALTER TABLE public.intel_analyses DISABLE TRIGGER trg_intel_analyses_guard;
        UPDATE public.intel_analyses SET status='published', approved_by='${ADMIN}', approved_at=now(), published_at=now()
          WHERE id='${d}';
        SELECT status FROM public.intel_analyses WHERE id='${d}';
        ROLLBACK;`);
      assert.match(out, /published/, "اگر گارد غیرفعال باشد باید همان دستور موفق شود — پس گارد پوچ نیست");
    });

    test("failability — disabling the ledger trigger stops the history being written", () => {
      const before = psql(db, `SELECT count(*) FROM public.intel_workflow_events`);
      const out = psql(db, `BEGIN;
        ALTER TABLE public.intel_analyses DISABLE TRIGGER trg_intel_analyses_workflow_log;
        INSERT INTO public.intel_analyses(domain,title,body_md,created_by)
          VALUES ('fx_gold','silent','x','${ADMIN}');
        SELECT count(*) FROM public.intel_workflow_events;
        ROLLBACK;`);
      assert.equal(out.trim(), before.trim(), "بدون تریگر هیچ رکوردی نوشته نمی‌شود — پس تریگر است که می‌نویسد");
    });

    test("failability — granting UPDATE back makes the ledger mutable again", () => {
      const out = expectError(db, `BEGIN;
        GRANT UPDATE ON public.intel_workflow_events TO service_role;
        ALTER TABLE public.intel_workflow_events DISABLE TRIGGER trg_intel_workflow_events_immutable;
        SET LOCAL ROLE service_role; UPDATE public.intel_workflow_events SET note='x'; ROLLBACK;`);
      assert.equal(out, "", "برگرداندنِ گرنت و تریگر باید همان دستور را موفق کند");
    });

    test("failability — dropping the seal check lets a sealed day be edited", () => {
      const dayId = last(asRole(db, "authenticated", ADMIN,
        `INSERT INTO public.intel_rehearsal_days(rehearsal_date,day_index,brief_produced)
         VALUES ('2026-08-20',3,false) RETURNING id`));
      asRole(db, "authenticated", ADMIN, `SELECT public.seal_rehearsal_day('${dayId}')`);
      const out = psql(db, `BEGIN;
        ALTER TABLE public.intel_rehearsal_days DISABLE TRIGGER trg_intel_rehearsal_days_guard;
        UPDATE public.intel_rehearsal_days SET missed_events=7 WHERE id='${dayId}';
        SELECT missed_events FROM public.intel_rehearsal_days WHERE id='${dayId}';
        ROLLBACK;`);
      assert.match(out, /7/);
    });
  });
}
