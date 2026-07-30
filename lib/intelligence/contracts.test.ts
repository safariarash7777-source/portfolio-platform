import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  INTEL_DOMAINS,
  DOMAIN_LABEL,
  CLAIM_KINDS,
  SCENARIO_LABELS,
  ANALYSIS_STATUSES,
  MAGNITUDE_BANDS,
  isValidConfidence,
  isScenarioLabelConsistent,
  isPublishableClaim,
} from "@/lib/intelligence/contracts";

/**
 * گاردِ مدلِ دادهٔ هوشمندی — `G3-001` · ADR-005.
 *
 * این تست‌ها **به دیتابیس وصل نمی‌شوند** و نباید بشوند: migration وضعیتش
 * `NOT_APPLIED` است. آنچه اینجا سنجیده می‌شود، هم‌خوانیِ سه چیز است که در
 * پروژه‌های واقعی خیلی زود از هم واگرا می‌شوند:
 *
 *   ۱. تایپ‌های TypeScript
 *   ۲. `CHECK`های خودِ migration
 *   ۳. قواعدِ غیرقابل‌مذاکرهٔ ADR
 *
 * درسِ `LEAD_LIMITS` هنوز تازه است: آنجا سقفِ طول در دو جا نوشته شده بود و
 * هیچ تستی نمی‌توانست هر دو را هم‌زمان بخوانَد. اینجا از اول بسته می‌شود.
 */

const ROOT = process.cwd();
const MIGRATION = readFileSync(join(ROOT, "sql", "phase20_intelligence_model.sql"), "utf8");
const ADR = readFileSync(join(ROOT, "docs", "ADR", "005-intelligence-data-model.md"), "utf8");

/** خطوطِ اجرایی — کامنت‌ها کنار می‌روند تا متنِ توضیحی تست را سبز نکند. */
const STATEMENTS = MIGRATION.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");

// ── هم‌خوانیِ تایپ و اسکیما ─────────────────────────────────────────────────

test("هر ده دامنه هم در تایپ‌ها هست هم در CHECKِ migration", () => {
  assert.equal(INTEL_DOMAINS.length, 10, "مأموریت ده دامنه خواسته");
  for (const d of INTEL_DOMAINS) {
    assert.ok(DOMAIN_LABEL[d], `برچسبِ فارسیِ «${d}» جا افتاده`);
    assert.ok(STATEMENTS.includes(`'${d}'`), `دامنهٔ «${d}» در migration نیست`);
  }
});

test("سه‌گانهٔ FACT/INFERENCE/SCENARIO در هر دو طرف یکی است", () => {
  assert.deepEqual([...CLAIM_KINDS], ["FACT", "INFERENCE", "SCENARIO"]);
  for (const k of CLAIM_KINDS) {
    assert.ok(STATEMENTS.includes(`'${k}'`), `نوعِ ادعای «${k}» در migration نیست`);
  }
});

test("برچسب‌های سناریو و وضعیت‌های تحلیل با migration می‌خوانند", () => {
  for (const s of SCENARIO_LABELS) assert.ok(STATEMENTS.includes(`'${s}'`), `برچسبِ «${s}» در migration نیست`);
  for (const s of ANALYSIS_STATUSES) assert.ok(STATEMENTS.includes(`'${s}'`), `وضعیتِ «${s}» در migration نیست`);
  for (const b of MAGNITUDE_BANDS) assert.ok(STATEMENTS.includes(`'${b}'`), `باندِ «${b}» در migration نیست`);
});

// ── قواعدِ غیرقابل‌مذاکره، در سطحِ اسکیما ───────────────────────────────────

test("ادعای بی‌شاهد در سطحِ اسکیما ممنوع است، نه فقط در اپلیکیشن", () => {
  // لایهٔ اپلیکیشن همان جایی است که زیرِ فشار دور زده می‌شود.
  assert.match(STATEMENTS, /evidence_id\s+UUID\s+NOT NULL\s+REFERENCES/i);
});

test("confidence اجباری و کران‌دار است", () => {
  assert.match(STATEMENTS, /confidence\s+INTEGER\s+NOT NULL\s+CHECK\s*\(confidence BETWEEN 0 AND 100\)/i);
  assert.ok(isValidConfidence(0) && isValidConfidence(100));
  assert.ok(!isValidConfidence(-1) && !isValidConfidence(101) && !isValidConfidence(50.5));
});

test("برچسبِ سناریو دقیقاً برای سناریو — نه کمتر، نه بیشتر", () => {
  assert.match(STATEMENTS, /\(kind = 'SCENARIO'\) = \(scenario_label IS NOT NULL\)/);
  assert.ok(isScenarioLabelConsistent("SCENARIO", "پایه"));
  assert.ok(!isScenarioLabelConsistent("SCENARIO", null));
  assert.ok(isScenarioLabelConsistent("FACT", null));
  assert.ok(!isScenarioLabelConsistent("FACT", "پایه"));
});

test("انتشار بدونِ تأییدکنندهٔ انسانی ممکن نیست (DD-023)", () => {
  assert.match(STATEMENTS, /status <> 'published' OR \(approved_by IS NOT NULL AND approved_at IS NOT NULL\)/);
});

test("دلیلِ تغییرِ وزنِ سبدِ مرجع اجباری است", () => {
  assert.match(STATEMENTS, /reason_text\s+TEXT NOT NULL CHECK \(char_length\(reason_text\) >= 1\)/i);
});

test("تحلیلِ منتشرشده و ادعاها append-only‌اند", () => {
  assert.match(STATEMENTS, /trg_intel_analyses_append_only/);
  for (const t of ["intel_claims", "intel_effects", "intel_reference_positions", "intel_corrections"]) {
    assert.match(STATEMENTS, new RegExp(`trg_${t}_append_only`), `تریگرِ append-only برای ${t} نیست`);
  }
  assert.match(STATEMENTS, /تحلیلِ منتشرشده بازنویسی نمی‌شود/);
});

// ── درسِ `G2-006`، از ابتدا اعمال‌شده ───────────────────────────────────────

test("هیچ جدولی فقط anon را revoke نمی‌کند — authenticated هم صریح است", () => {
  // این دقیقاً همان نقصی بود که در `phase8b_leads` پیدا شد: RLS روی TRUNCATE
  // اعمال نمی‌شود، پس گرنتِ باز یعنی کاربرِ عادی می‌تواند جدول را خالی کند.
  assert.match(STATEMENTS, /REVOKE ALL ON public\.%I FROM PUBLIC/);
  assert.match(STATEMENTS, /REVOKE ALL ON public\.%I FROM anon/);
  assert.match(STATEMENTS, /REVOKE ALL ON public\.%I FROM authenticated/);
});

test("به authenticated هرگز DELETE یا TRUNCATE داده نمی‌شود", () => {
  const grants = STATEMENTS.match(/GRANT[^;]*TO authenticated/gi) ?? [];
  assert.ok(grants.length > 0, "هیچ گرنتی به authenticated پیدا نشد");
  for (const g of grants) {
    assert.doesNotMatch(g, /\bDELETE\b/i, `authenticated نباید DELETE بگیرد: ${g}`);
    assert.doesNotMatch(g, /\bTRUNCATE\b/i, `authenticated نباید TRUNCATE بگیرد: ${g}`);
    assert.doesNotMatch(g, /\bALL\b/i, `authenticated نباید ALL بگیرد: ${g}`);
  }
});

test("anon فقط روی تحلیلِ منتشرشده SELECT دارد", () => {
  const anonGrants = STATEMENTS.match(/GRANT[^;]*TO anon/gi) ?? [];
  assert.equal(anonGrants.length, 1, "فقط یک گرنت به anon باید باشد");
  assert.match(anonGrants[0], /GRANT SELECT ON public\.intel_analyses TO anon/i);
  assert.match(STATEMENTS, /CREATE POLICY "Published analyses are public"[\s\S]*?status = 'published'/);
});

test("migration غیرمخرب است — هیچ DROP TABLE یا DROP COLUMN در بدنه نیست", () => {
  assert.doesNotMatch(STATEMENTS, /DROP\s+TABLE/i);
  assert.doesNotMatch(STATEMENTS, /DROP\s+COLUMN/i);
  // بلوکِ rollback عمداً کامنت است، نه اجرایی.
  assert.match(MIGRATION, /-- {3}DROP TABLE IF EXISTS public\.intel_corrections;/);
});

test("تابعِ تریگر SECURITY INVOKER با search_path بسته است", () => {
  assert.match(STATEMENTS, /SECURITY INVOKER/);
  assert.match(STATEMENTS, /SET search_path = ''/);
  assert.doesNotMatch(STATEMENTS, /SECURITY DEFINER/);
});

// ── سازگاری با دارایی‌های موجود ────────────────────────────────────────────

test("کارنامهٔ موجود دست نمی‌خورد — هیچ ALTER روی signals", () => {
  assert.doesNotMatch(STATEMENTS, /ALTER TABLE public\.signals/i);
  assert.doesNotMatch(STATEMENTS, /ALTER TABLE public\.signal_outcomes/i);
  assert.doesNotMatch(STATEMENTS, /ALTER TABLE public\.portfolios/i);
  // فقط ارجاع، نه رقابت.
  assert.match(STATEMENTS, /published_signal_ids UUID\[\]/);
});

test("وضعیتِ migration در خودِ فایل و در ADR «NOT_APPLIED» است", () => {
  assert.match(MIGRATION, /وضعیت:\s*\*\*NOT_APPLIED\*\*/);
  assert.match(ADR, /\*\*`NOT_APPLIED`\*\*/);
  assert.match(ADR, /\*\*PROPOSED\*\*/);
});

test("ADR هر نُه بخشِ میزِ آرش را نگاشت کرده", () => {
  for (const section of [
    "امروز چه اتفاقی افتاده",
    "اخبار و رخدادهای مهم",
    "تغییرِ رژیم و سناریوها",
    "رادارِ بازارها",
    "شرکت‌ها و کدال",
    "اثر بر سبدِ مرجع",
    "تحلیل‌های در انتظارِ تأیید",
    "مشتریان و اقداماتِ ضروری",
    "سلامتِ سامانه",
  ]) {
    assert.ok(ADR.includes(section), `بخشِ «${section}» در نگاشتِ ADR نیست`);
  }
});

// ── منطقِ خالص ─────────────────────────────────────────────────────────────

test("isPublishableClaim هر سه شرط را با هم می‌خواهد", () => {
  const base = { evidenceId: "e1", confidence: 70, kind: "FACT" as const, scenarioLabel: null };
  assert.ok(isPublishableClaim(base));
  assert.ok(!isPublishableClaim({ ...base, evidenceId: "" }), "شاهدِ خالی نباید بگذرد");
  assert.ok(!isPublishableClaim({ ...base, confidence: 101 }), "اطمینانِ خارج از بازه نباید بگذرد");
  assert.ok(
    !isPublishableClaim({ ...base, kind: "SCENARIO", scenarioLabel: null }),
    "سناریوی بی‌برچسب نباید بگذرد"
  );
  assert.ok(isPublishableClaim({ ...base, kind: "SCENARIO", scenarioLabel: "بدبینانه" }));
});
