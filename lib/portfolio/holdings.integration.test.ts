/**
 * ثبتِ نسخه‌دارِ داراییِ عضو — روی Postgresِ واقعی.
 *
 * چرا یکپارچه: چیزی که آزموده می‌شود RLS، ACL، قفلِ هم‌زمانی و ایده‌مپوتنسیِ
 * دیتابیس است. هیچ‌کدام با mock اثبات نمی‌شوند؛ در `#139` دقیقاً یک سیاستِ
 * بی‌اثر از همین راه پیدا شد.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const ENV = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? "127.0.0.1",
  PGPORT: process.env.PGPORT ?? "5433",
  PGUSER: process.env.PGUSER ?? "postgres",
  PGPASSWORD: process.env.PGPASSWORD ?? "postgres",
};
const ROOT = process.cwd();
const FILES = [
  join(ROOT, "sql", "test", "supabase_bootstrap.sql"),
  join(ROOT, "sql", "test", "portfolio_precondition.sql"),
  join(ROOT, "sql", "phase20_intelligence_model.sql"),
  join(ROOT, "sql", "phase32_member_holdings.sql"),
];
const DB = "member_holdings_test";
const ADMIN = "11111111-1111-1111-1111-111111111111";
const A = "22222222-2222-2222-2222-222222222222";
const B = "33333333-3333-3333-3333-333333333333";

function psql(db: string, sql: string): string {
  return execFileSync("psql", ["-d", db, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function psqlFile(db: string, file: string): void {
  const r = spawnSync("psql", ["-d", db, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", file], {
    env: ENV, encoding: "utf8",
  });
  if ((r.status ?? -1) !== 0) throw new Error(`psql ${file} → ${r.status}: ${r.stdout}${r.stderr}`);
}
function expectError(db: string, sql: string): string {
  try { psql(db, sql); } catch (error) {
    return String((error as { stderr?: Buffer | string }).stderr ?? "");
  }
  return "";
}
function wrap(role: string, sub: string | null, sql: string): string {
  const claims = sub ? `{"sub":"${sub}","role":"${role}"}` : `{"role":"${role}"}`;
  return `BEGIN; SELECT set_config('request.jwt.claims','${claims}',true); SET LOCAL ROLE ${role}; ${sql}; COMMIT;`;
}
const asRole = (role: string, sub: string | null, sql: string) => psql(DB, wrap(role, sub, sql));
const asRoleError = (role: string, sub: string | null, sql: string) => expectError(DB, wrap(role, sub, sql));
const last = (s: string) => s.split("\n").filter(Boolean).pop()?.trim() ?? "";

const POS = (key: string, qty: number) =>
  `{"position_key":"${key}","symbol":"${key}","asset_class":"gold","qty":${qty},"unit":"گرم","as_of":"2026-09-15"}`;
const record = (positions: string, token: string | null = null, note = "") =>
  `SELECT version, reused FROM public.record_member_holdings('[${positions}]'::jsonb, ${note ? `'${note}'` : "NULL"}, ${token ? `'${token}'` : "NULL"})`;

describe("ثبت نسخه‌دار دارایی عضو (#140)", () => {
  before(() => {
    psql("postgres", `DROP DATABASE IF EXISTS ${DB}`);
    psql("postgres", `CREATE DATABASE ${DB}`);
    for (const f of FILES) psqlFile(DB, f);
    psql(DB, `INSERT INTO auth.users(id) VALUES ('${ADMIN}'),('${A}'),('${B}')`);
    psql(DB, `INSERT INTO public.profiles(id, role) VALUES ('${ADMIN}','admin'),('${A}','user'),('${B}','user')`);
  });

  after(() => {
    try { psql("postgres", `DROP DATABASE IF EXISTS ${DB}`); } catch { /* بهترین تلاش */ }
  });

  test("ثبت اول نسخهٔ ۱ می‌سازد", () => {
    assert.equal(last(asRole("authenticated", A, record(POS("سکه", 10), "tok-a1"))), "1|f");
  });

  test("ثبت دوباره با همان توکن نسخهٔ تکراری نمی‌سازد", () => {
    assert.equal(last(asRole("authenticated", A, record(POS("سکه", 10), "tok-a1"))), "1|t");
    assert.equal(
      last(asRole("authenticated", A, `SELECT count(*) FROM public.member_holding_versions`)), "1");
  });

  test("ثبت با توکن تازه نسخهٔ بعدی می‌سازد و نسخهٔ قبلی می‌ماند", () => {
    assert.equal(last(asRole("authenticated", A, record(POS("سکه", 12), "tok-a2"))), "2|f");
    assert.equal(
      last(asRole("authenticated", A, `SELECT count(*) FROM public.member_holding_versions`)), "2");
  });

  test("یک قلم دوبار در یک نسخه ممکن نیست", () => {
    const err = asRoleError("authenticated", A,
      record(`${POS("طلا", 1)},${POS("طلا", 2)}`, "tok-dup"));
    assert.notEqual(err, "", "کلید تکراری باید رد شود");
    assert.equal(last(asRole("authenticated", A, `SELECT count(*) FROM public.member_holding_versions`)), "2",
      "نسخهٔ ناقص نباید جا مانده باشد");
  });

  test("عضو B هیچ نسخه یا قلمی از A نمی‌بیند", () => {
    assert.equal(last(asRole("authenticated", B, `SELECT count(*) FROM public.member_holding_versions`)), "0");
    assert.equal(last(asRole("authenticated", B, `SELECT count(*) FROM public.member_holding_positions`)), "0");
    const leaked = last(asRole("authenticated", B,
      `SELECT coalesce(string_agg(position_key, ','), '(none)') FROM public.member_holding_positions`));
    assert.equal(leaked, "(none)");
  });

  test("مالک موقعیت‌های خودش را می‌بیند — محمول SECURITY DEFINER نباید علیه او کار کند", () => {
    const n = Number(last(asRole("authenticated", A, `SELECT count(*) FROM public.member_holding_positions`)));
    assert.ok(n >= 2, `مالک باید موقعیت‌هایش را ببیند، دید: ${n}`);
  });

  test("عضو نمی‌تواند مستقیم بنویسد و برای دیگری نسخه جعل کند", () => {
    const err = asRoleError("authenticated", B,
      `INSERT INTO public.member_holding_versions(user_id, version) VALUES ('${A}', 99)`);
    assert.notEqual(err, "", "INSERT مستقیم باید رد شود");
    assert.equal(last(asRole("authenticated", A,
      `SELECT count(*) FROM public.member_holding_versions WHERE version = 99`)), "0");
  });

  test("ACL واقعاً پس گرفته شده، نه فقط با RLS پوشانده", () => {
    assert.equal(last(psql(DB,
      `SELECT has_table_privilege('authenticated','public.member_holding_versions','INSERT')`)), "f");
    assert.equal(last(psql(DB,
      `SELECT has_table_privilege('anon','public.member_holding_positions','SELECT')`)), "f");
    // شاهد: ACL فراخ روی جدول قدیمی هنوز هست، پس آزمون بالا به‌خاطر نبودِ
    // default privilege سبز نشده است.
    assert.equal(last(psql(DB,
      `SELECT has_table_privilege('authenticated','public.holdings','INSERT')`)), "t");
  });

  // ⚠️ اینجا برخلافِ `announcements` انتظارِ «صفر ردیف» نداریم، بلکه انتظارِ
  // **ردِ صریح** داریم. اعلامیه جدولی است که anon حقِ SELECT دارد و RLS
  // فیلترش می‌کند؛ داراییِ عضو اصلاً نباید برای anon قابلِ خواندن باشد، پس
  // حق در سطحِ جدول پس گرفته شده و خطا همان رفتارِ درست است.
  test("anon نه می‌بیند نه ثبت می‌کند — ردِ صریح، نه فیلترِ خاموش", () => {
    assert.match(
      asRoleError("anon", null, `SELECT count(*) FROM public.member_holding_versions`),
      /permission denied/
    );
    assert.notEqual(asRoleError("anon", null, record(POS("سکه", 1), "tok-anon")), "");
  });

  test("نسخه ثبت‌شده افزایشی است — ویرایش و حذف رد می‌شود", () => {
    assert.match(expectError(DB, `UPDATE public.member_holding_versions SET note = 'x'`), /افزایشی/);
    assert.match(expectError(DB, `DELETE FROM public.member_holding_positions`), /افزایشی/);
  });

  test("دو درخواست هم‌زمان دو نسخهٔ متوالی می‌سازند، نه خطای یکتایی", () => {
    // هر دو تراکنش قفلِ کاربر را می‌خواهند؛ قفل سریالشان می‌کند.
    const before = Number(last(asRole("authenticated", A,
      `SELECT count(*) FROM public.member_holding_versions`)));
    const runs = ["c1", "c2", "c3", "c4"].map((tok) =>
      spawnSync("psql", ["-d", DB, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
        "-c", wrap("authenticated", A, record(POS("هم‌زمان", 1), tok))],
        { env: ENV, encoding: "utf8" })
    );
    const failed = runs.filter((r) => (r.status ?? -1) !== 0);
    assert.equal(failed.length, 0, `هیچ درخواستی نباید شکست بخورد: ${failed[0]?.stderr ?? ""}`);
    const after = Number(last(asRole("authenticated", A,
      `SELECT count(*) FROM public.member_holding_versions`)));
    assert.equal(after - before, 4, "چهار نسخهٔ مجزا باید ساخته شده باشد");
    assert.equal(last(asRole("authenticated", A,
      `SELECT count(DISTINCT version) FROM public.member_holding_versions`)), String(after),
      "شماره‌های نسخه باید یکتا بمانند");
  });

  // ⚠️ یافتهٔ بازبینیِ مستقل: سناریوی «پاسخ گم شد».
  // ذخیره واقعاً انجام شده، پاسخ در شبکه گم شده، کاربر مقدار را **اصلاح**
  // می‌کند و دوباره می‌زند. بدونِ مقایسهٔ محتوا، نسخهٔ قدیمی به‌عنوان موفقیت
  // برمی‌گشت و اصلاحِ تازه بی‌صدا دور ریخته می‌شد.
  test("همان توکن با محتوای متفاوت ⇒ خطای روشن، نه موفقیتِ دروغین", () => {
    assert.equal(last(asRole("authenticated", B, record(POS("نقره", 5), "tok-b1"))), "1|f");
    const err = asRoleError("authenticated", B, record(POS("نقره", 9), "tok-b1"));
    assert.match(err, /محتوای متفاوت/);
    assert.equal(last(asRole("authenticated", B,
      `SELECT qty FROM public.member_holding_positions p
        JOIN public.member_holding_versions v ON v.id = p.version_id
       WHERE v.user_id='${B}' AND p.position_key='نقره'`)), "5",
      "مقدار قبلی نباید عوض شده باشد");
  });

  test("همان توکن با همان محتوا ⇒ همان نتیجه، بدون نسخهٔ تازه", () => {
    const before = last(asRole("authenticated", B,
      `SELECT count(*) FROM public.member_holding_versions`));
    assert.equal(last(asRole("authenticated", B, record(POS("نقره", 5), "tok-b1"))), "1|t");
    assert.equal(last(asRole("authenticated", B,
      `SELECT count(*) FROM public.member_holding_versions`)), before);
  });

  test("ترتیب اقلام اثر انگشت را عوض نمی‌کند", () => {
    const two = `${POS("الف", 1)},${POS("ب", 2)}`;
    const swapped = `${POS("ب", 2)},${POS("الف", 1)}`;
    assert.match(last(asRole("authenticated", B, record(two, "tok-b2"))), /\|f$/);
    assert.match(last(asRole("authenticated", B, record(swapped, "tok-b2"))), /\|t$/,
      "همان اقلام با ترتیب دیگر باید همان ثبت شمرده شود");
  });

  test("سبد مرجع: وزن‌هایی که ۱۰۰ نمی‌شوند نهایی نمی‌شوند", () => {
    psql(DB, `INSERT INTO public.intel_reference_portfolios(id, name, created_by)
              VALUES ('44444444-4444-4444-4444-444444444444','مرجع آزمایشی','${ADMIN}')`);
    psql(DB, `INSERT INTO public.intel_reference_versions(id, portfolio_id, version_no, effective_at, reason_text, created_by)
              VALUES ('55555555-5555-5555-5555-555555555555','44444444-4444-4444-4444-444444444444',1, now(), 'آزمون','${ADMIN}')`);
    psql(DB, `INSERT INTO public.intel_reference_positions(version_id, asset_class, weight_pct) VALUES
              ('55555555-5555-5555-5555-555555555555','gold',70),
              ('55555555-5555-5555-5555-555555555555','fixed_income',10),
              ('55555555-5555-5555-5555-555555555555','equity_ir',30)`);
    const err = asRoleError("authenticated", ADMIN,
      `SELECT public.finalize_reference_version('55555555-5555-5555-5555-555555555555')`);
    assert.match(err, /100/, "۱۱۰ درصد باید رد شود");
    assert.equal(last(psql(DB,
      `SELECT status FROM public.intel_reference_versions WHERE id='55555555-5555-5555-5555-555555555555'`)),
      "draft", "نسخه نباید نهایی شده باشد");
  });

  test("عضو نمی‌تواند سبد مرجع را نهایی کند", () => {
    const err = asRoleError("authenticated", A,
      `SELECT public.finalize_reference_version('55555555-5555-5555-5555-555555555555')`);
    assert.match(err, /admin/i);
  });

  test("هدف عضو به نسخهٔ مرجع وصل می‌شود و انتشار مرجع تازه عوضش نمی‌کند", () => {
    psql(DB, `INSERT INTO public.portfolio_versions(user_id, version, allocations, reference_version_id)
              VALUES ('${A}', 1, '[{"assetClass":"gold","weightPct":100}]'::jsonb,
                      '55555555-5555-5555-5555-555555555555')`);
    // انتشار نسخهٔ مرجعِ بعدی
    psql(DB, `INSERT INTO public.intel_reference_versions(id, portfolio_id, version_no, effective_at, reason_text, created_by)
              VALUES ('66666666-6666-6666-6666-666666666666','44444444-4444-4444-4444-444444444444',2, now(), 'نسخهٔ بعدی','${ADMIN}')`);
    assert.equal(last(asRole("authenticated", A,
      `SELECT reference_version_id FROM public.portfolio_versions WHERE user_id='${A}' AND version=1`)),
      "55555555-5555-5555-5555-555555555555", "هدف قبلی عضو نباید بی‌اطلاع عوض شده باشد");
    assert.ok(Number(last(asRole("authenticated", A,
      `SELECT count(*) FROM public.member_holding_versions`))) > 0, "دارایی واقعی هم دست‌نخورده است");
  });

  // ⚠️ یافتهٔ بازبینیِ مستقل: سیاستِ `mhv_self_read` عمداً `is_admin()` را هم
  // مجاز می‌کند، پس RLS به‌تنهایی صفحهٔ «داراییِ من» را ایزوله نمی‌کند — در
  // نشستِ مدیر نسخه‌های همهٔ اعضا قاطی می‌شد. این آزمون همان واقعیتِ
  // دیتابیس را تثبیت می‌کند تا روشن باشد چرا فیلترِ `user_id` در کد لازم است.
  test("مدیر بدون فیلترِ user_id نسخه‌های همهٔ اعضا را می‌بیند", () => {
    const adminSees = Number(last(asRole("authenticated", ADMIN,
      `SELECT count(*) FROM public.member_holding_versions`)));
    const aSees = Number(last(asRole("authenticated", A,
      `SELECT count(*) FROM public.member_holding_versions`)));
    const bSees = Number(last(asRole("authenticated", B,
      `SELECT count(*) FROM public.member_holding_versions`)));
    assert.ok(aSees > 0 && bSees > 0, "هر دو عضو باید نسخه داشته باشند");
    assert.equal(adminSees, aSees + bSees,
      "RLS جلوی مدیر را نمی‌گیرد؛ پس فیلترِ user_id باید در کد باشد");
    // و با فیلترِ صریح — همان کاری که `service.ts` می‌کند — ایزوله می‌شود.
    assert.equal(last(asRole("authenticated", ADMIN,
      `SELECT count(*) FROM public.member_holding_versions WHERE user_id='${ADMIN}'`)), "0");
  });

  // ── مسیرِ واقعیِ کاربر، سرتاسر ───────────────────────────────────────────
  // ثبت ← ذخیره ← بازکردنِ دوباره ← اصلاح ← ذخیرهٔ نسخهٔ تازه ← دیدنِ نسخهٔ
  // تازه ← برگشت به نسخهٔ قبلی و اثباتِ دست‌نخوردگی‌اش. همان کاری که صفحه
  // می‌کند، ولی روی دیتابیسِ واقعی.
  test("مسیر کامل: ثبت، بازکردن، اصلاح، نسخهٔ تازه، برگشت به قبلی", () => {
    const C = "77777777-7777-7777-7777-777777777777";
    psql(DB, `INSERT INTO auth.users(id) VALUES ('${C}')`);
    psql(DB, `INSERT INTO public.profiles(id, role) VALUES ('${C}','user')`);

    // ۱) ثبتِ اولیه
    assert.equal(last(asRole("authenticated", C,
      record(`${POS("سکه", 10)},${POS("شمش", 2)}`, "j-1"))), "1|f");

    // ۲) بازکردنِ دوباره — ریزِ اقلام باید همان باشد که ذخیره شد
    const v1 = last(asRole("authenticated", C,
      `SELECT string_agg(p.position_key || ':' || p.qty, ',' ORDER BY p.position_key)
         FROM public.member_holding_positions p
         JOIN public.member_holding_versions v ON v.id = p.version_id
        WHERE v.user_id='${C}' AND v.version = 1`));
    assert.equal(v1, "سکه:10,شمش:2");

    // ۳) اصلاح و ذخیرهٔ نسخهٔ تازه
    assert.equal(last(asRole("authenticated", C,
      record(`${POS("سکه", 14)},${POS("شمش", 2)}`, "j-2"))), "2|f");

    // ۴) نسخهٔ تازه همان چیزی است که ذخیره شد
    const v2 = last(asRole("authenticated", C,
      `SELECT string_agg(p.position_key || ':' || p.qty, ',' ORDER BY p.position_key)
         FROM public.member_holding_positions p
         JOIN public.member_holding_versions v ON v.id = p.version_id
        WHERE v.user_id='${C}' AND v.version = 2`));
    assert.equal(v2, "سکه:14,شمش:2");

    // ۵) نسخهٔ قبلی دست‌نخورده مانده — «اصلاح» تاریخچه را بازنویسی نکرد
    const v1again = last(asRole("authenticated", C,
      `SELECT string_agg(p.position_key || ':' || p.qty, ',' ORDER BY p.position_key)
         FROM public.member_holding_positions p
         JOIN public.member_holding_versions v ON v.id = p.version_id
        WHERE v.user_id='${C}' AND v.version = 1`));
    assert.equal(v1again, "سکه:10,شمش:2", "بازکردنِ نسخهٔ ۱ باید همان دادهٔ اول را بدهد");

    // ۶) و «آخرین نسخه» همان است که صفحه پیش‌فرض باز می‌کند
    assert.equal(last(asRole("authenticated", C,
      `SELECT version FROM public.member_holding_versions
        WHERE user_id='${C}' ORDER BY version DESC LIMIT 1`)), "2");
  });

  test("اجرای دوبارهٔ هر دو migration بی‌خطر است", () => {
    psqlFile(DB, FILES[2]);
    psqlFile(DB, FILES[3]);
    assert.ok(Number(last(asRole("authenticated", A,
      `SELECT count(*) FROM public.member_holding_versions`))) > 0);
  });
});
