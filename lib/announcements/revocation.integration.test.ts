/**
 * لغوِ انتشارِ اعلان — روی یک Postgresِ واقعی، نه با بدل.
 *
 * چرا یکپارچه و نه واحد: چیزی که اینجا آزموده می‌شود **سیاستِ RLS** است. یک
 * تستِ واحد با mock می‌تواند سبز باشد در حالی که سیاست هیچ کاری نمی‌کند — و
 * دقیقاً همین در نسخهٔ اولِ `phase31` افتاد: شرطِ لغو مستقیم به‌صورتِ
 * زیرپرس‌وجو نوشته شده بود، با مجوزِ خودِ عضو اجرا می‌شد، و چون جدولِ لغو برای
 * عضو نامرئی است `NOT EXISTS` همیشه درست می‌شد و عضو اعلانِ لغوشده را می‌دید.
 * آن باگ را فقط یک پرس‌وجوی واقعی نشان می‌دهد.
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
  join(ROOT, "sql", "test", "announcements_precondition.sql"),
  join(ROOT, "sql", "phase31_announcement_revocation.sql"),
];
const DB = "ann_revoke_test";
const ADMIN = "11111111-1111-1111-1111-111111111111";
const QA = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";

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
/** همان قراردادِ bootstrap: claims در GUC، و نقش با SET LOCAL ROLE. */
function wrap(role: string, sub: string | null, sql: string): string {
  const claims = sub ? `{"sub":"${sub}","role":"${role}"}` : `{"role":"${role}"}`;
  return `BEGIN; SELECT set_config('request.jwt.claims','${claims}',true); SET LOCAL ROLE ${role}; ${sql}; COMMIT;`;
}
const asRole = (role: string, sub: string | null, sql: string) => psql(DB, wrap(role, sub, sql));
const asRoleError = (role: string, sub: string | null, sql: string) => expectError(DB, wrap(role, sub, sql));
const last = (s: string) => s.split("\n").filter(Boolean).pop()?.trim() ?? "";

let annId = "";

describe("لغوِ انتشارِ اعلان (#139)", () => {
  before(() => {
    psql("postgres", `DROP DATABASE IF EXISTS ${DB}`);
    psql("postgres", `CREATE DATABASE ${DB}`);
    for (const f of FILES) psqlFile(DB, f);

    psql(DB, `INSERT INTO auth.users(id) VALUES ('${ADMIN}'),('${QA}'),('${OTHER}')`);
    psql(DB, `INSERT INTO public.profiles(id, role) VALUES
      ('${ADMIN}','admin'),('${QA}','user'),('${OTHER}','user')`);

    // انتشار فقط برای حسابِ QA — هیچ اعلانی برای «همه» ساخته نمی‌شود.
    annId = last(asRole("authenticated", ADMIN,
      `SELECT public.publish_announcement('اعلانِ آزمایشی QA','متنِ محرمانهٔ آزمایشی','user:${QA}')`));
    assert.match(annId, /^[0-9a-f-]{36}$/, `شناسهٔ اعلان ساخته نشد: ${annId}`);
  });

  after(() => {
    try { psql("postgres", `DROP DATABASE IF EXISTS ${DB}`); } catch { /* پاک‌سازیِ بهترین‌تلاش */ }
  });

  test("پیش از لغو: فقط حسابِ هدف می‌بیند", () => {
    assert.equal(last(asRole("authenticated", QA, "SELECT count(*) FROM public.announcements")), "1");
    assert.equal(last(asRole("authenticated", OTHER, "SELECT count(*) FROM public.announcements")), "0");
  });

  test("عضو نمی‌تواند لغو کند", () => {
    const err = asRoleError("authenticated", QA, `SELECT public.revoke_announcement('${annId}')`);
    assert.match(err, /دسترسی غیرمجاز/);
    assert.equal(last(asRole("authenticated", ADMIN,
      "SELECT count(*) FROM public.announcement_revocations")), "0", "هیچ ردیفی نباید ساخته شده باشد");
  });

  // نکتهٔ ظریف: انتظار «صفر ردیف» است، نه «خطا». anon در Production حقِ SELECT
  // روی `announcements` دارد و RLS تنها گیتِ اوست؛ اگر محمولِ سیاست برای anon
  // اجراشدنی نباشد، این پرس‌وجو با «permission denied for function» می‌ترکد و
  // صفحهٔ عمومی به‌جای خالی‌بودن، خطا می‌دهد. نسخهٔ اولِ phase31 همین اشکال را
  // داشت و همین آزمون گرفتش.
  test("anon خطا نمی‌گیرد، صفر ردیف می‌بیند و لغو هم نمی‌کند", () => {
    assert.equal(last(asRole("anon", null, "SELECT count(*) FROM public.announcements")), "0");
    assert.notEqual(asRoleError("anon", null, `SELECT public.revoke_announcement('${annId}')`), "");
  });

  // ⚠️ این دو آزمون به‌خاطرِ یک یافتهٔ واقعی اضافه شده‌اند: در این پروژه
  // `ALTER DEFAULT PRIVILEGES` به anon و authenticated روی **هر جدولِ تازهٔ**
  // schema `public` حقِ کامل می‌دهد. یعنی اگر phase31 حق را پس نگیرد، هر عضو
  // می‌تواند مستقیم یک ردیفِ لغو INSERT کند و اعلانِ دیگران را از دیدِ همه
  // بردارد — بدون اینکه هرگز RPC را صدا بزند.
  test("عضو نمی‌تواند مستقیم در جدولِ لغو بنویسد (دورزدنِ RPC)", () => {
    const err = asRoleError("authenticated", QA,
      `INSERT INTO public.announcement_revocations(announcement_id, revoked_by)
       VALUES ('${annId}','${QA}')`);
    assert.notEqual(err, "", "INSERTِ مستقیمِ عضو باید رد شود");
    assert.equal(last(asRole("authenticated", ADMIN,
      "SELECT count(*) FROM public.announcement_revocations")), "0");
  });

  test("ACLِ جدولِ لغو واقعاً پس گرفته شده، نه فقط با RLS پوشانده", () => {
    assert.equal(last(psql(DB,
      `SELECT has_table_privilege('authenticated','public.announcement_revocations','INSERT')`)), "f");
    assert.equal(last(psql(DB,
      `SELECT has_table_privilege('anon','public.announcement_revocations','SELECT')`)), "f");
    // و برای مقایسه: همان ACLِ فراخ روی جدولِ قدیمی هنوز هست، پس آزمون بالا
    // به‌خاطرِ نبودِ default privilege سبز نشده است.
    assert.equal(last(psql(DB,
      `SELECT has_table_privilege('authenticated','public.announcements','INSERT')`)), "t");
  });

  test("مدیر لغو می‌کند و دلیل ثبت می‌شود", () => {
    assert.equal(last(asRole("authenticated", ADMIN,
      `SELECT already_revoked FROM public.revoke_announcement('${annId}','متن اشتباه بود')`)), "f");
    assert.equal(last(asRole("authenticated", ADMIN,
      "SELECT count(*) FROM public.audit_log WHERE action='announcement.revoke'")), "1");
  });

  test("لغوِ دوباره بی‌خطر است و ردیفِ تکراری نمی‌سازد", () => {
    assert.equal(last(asRole("authenticated", ADMIN,
      `SELECT already_revoked FROM public.revoke_announcement('${annId}','دوباره')`)), "t");
    assert.equal(last(asRole("authenticated", ADMIN,
      "SELECT count(*) FROM public.announcement_revocations")), "1");
  });

  test("عضو دیگر اعلان را نمی‌بیند و هیچ متنی نشت نمی‌کند", () => {
    assert.equal(last(asRole("authenticated", QA, "SELECT count(*) FROM public.announcements")), "0");
    const leaked = last(asRole("authenticated", QA,
      "SELECT coalesce(string_agg(title||'|'||body_md,','),'(none)') FROM public.announcements"));
    assert.equal(leaked, "(none)");
    assert.doesNotMatch(leaked, /محرمانه/);
  });

  test("عضو سابقهٔ لغو را هم نمی‌بیند", () => {
    assert.equal(last(asRole("authenticated", QA,
      "SELECT count(*) FROM public.announcement_revocations")), "0");
  });

  test("مدیر هم اعلان و هم رویدادِ لغو را نگه می‌دارد", () => {
    assert.equal(last(asRole("authenticated", ADMIN, "SELECT count(*) FROM public.announcements")), "1");
    assert.equal(last(asRole("authenticated", ADMIN,
      `SELECT reason FROM public.announcement_revocations WHERE announcement_id='${annId}'`)),
      "متن اشتباه بود");
  });

  test("حفاظتِ append-only دست‌نخورده مانده", () => {
    assert.match(expectError(DB, "UPDATE public.announcements SET title='x'"), /افزایشی/);
    assert.match(expectError(DB, "DELETE FROM public.announcements"), /افزایشی/);
    assert.match(expectError(DB, "DELETE FROM public.announcement_revocations"), /افزایشی/);
  });

  test("محمولِ سیاست باید SECURITY DEFINER بماند — وگرنه سیاست بی‌اثر می‌شود", () => {
    assert.equal(last(psql(DB,
      `SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='is_announcement_revoked'`)), "t");
  });

  // بازبینیِ مستقل این را خواست: «بخوان، اگر نبود بنویس» دو درخواستِ هم‌زمان
  // را امن نمی‌کند. این آزمون چهار اتصالِ واقعاً موازی می‌سازد روی اعلامیه‌ای
  // که هنوز لغو نشده.
  test("چهار لغوِ هم‌زمان: صفر خطا، یک ردیف، یک رویدادِ ممیزی", () => {
    const second = last(asRole("authenticated", ADMIN,
      `SELECT public.publish_announcement('اعلانِ هم‌زمانی','متن','user:${QA}')`));
    assert.match(second, /^[0-9a-f-]{36}$/);

    const before = Number(last(asRole("authenticated", ADMIN,
      `SELECT count(*) FROM public.audit_log WHERE action='announcement.revoke'`)));

    const runs = [1, 2, 3, 4].map(() =>
      spawnSync("psql", ["-d", DB, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
        "-c", wrap("authenticated", ADMIN,
          `SELECT already_revoked FROM public.revoke_announcement('${second}','هم‌زمان')`)],
        { env: ENV, encoding: "utf8" })
    );

    const failed = runs.filter((r) => (r.status ?? -1) !== 0);
    assert.equal(failed.length, 0,
      `هیچ درخواستی نباید خطا بگیرد: ${failed[0]?.stderr ?? ""}`);

    assert.equal(last(asRole("authenticated", ADMIN,
      `SELECT count(*) FROM public.announcement_revocations WHERE announcement_id='${second}'`)),
      "1", "فقط یک ردیفِ لغو");

    const after = Number(last(asRole("authenticated", ADMIN,
      `SELECT count(*) FROM public.audit_log WHERE action='announcement.revoke'`)));
    assert.equal(after - before, 1, "یک لغو باید دقیقاً یک رویدادِ ممیزی بسازد");

    assert.equal(last(asRole("authenticated", QA,
      `SELECT count(*) FROM public.announcements WHERE id='${second}'`)), "0",
      "عضو نباید اعلامیهٔ لغوشده را ببیند");
  });

  test("اجرای دوبارهٔ migration بی‌خطر است", () => {
    // شمارش پیش از اجرا گرفته می‌شود، نه عددِ ثابت — وگرنه هر آزمونِ تازه‌ای
    // که ردیفِ لغو بسازد این را به‌دلیلِ بی‌ربط قرمز می‌کند.
    const before = last(asRole("authenticated", ADMIN,
      "SELECT count(*) FROM public.announcement_revocations"));
    psqlFile(DB, FILES[2]);
    assert.equal(last(asRole("authenticated", ADMIN,
      "SELECT count(*) FROM public.announcement_revocations")), before,
      "migration نباید ردیفی اضافه یا کم کند");
    assert.equal(last(asRole("authenticated", QA, "SELECT count(*) FROM public.announcements")), "0",
      "عضو همچنان نباید اعلامیهٔ لغوشده را ببیند");
  });
});
