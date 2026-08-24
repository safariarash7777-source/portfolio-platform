/**
 * میزِ آرش — رجیستریِ منابع (`P2-G3-MEGA-004`).
 *
 * هر منبع اینجا **یک جدولِ واقعی** است با:
 *   • `timeColumn` — ستونی که واقعاً در DDL وجود دارد. تستِ
 *     `sources.test.ts` هر کدام را با `sql/*.sql` تطبیق می‌دهد، پس یک
 *     ستونِ اشتباه در CI می‌افتد نه در Production.
 *   • `rule` — آستانهٔ تازگی، یا `null` وقتی آستانه‌ای **قابلِ اثبات نیست**.
 *   • `basis` — از کجا می‌دانیم این آستانه درست است. بدونِ این، هر عددی
 *     می‌تواند وانمود کند اندازه‌گیری است.
 *
 * ── چرا `basis` اجباری است ──────────────────────────────────────────────
 * نسخهٔ اولِ میز نوشته بود «اسنپ‌شاتِ بازار هر ۳۰ دقیقه می‌آید» و از آن
 * آستانهٔ ۱۲۰ دقیقه ساخته بود. در این مخزن **هیچ زمان‌بندی‌ای** چنین چیزی را
 * تضمین نمی‌کند: `vercel.json` فقط دو cronِ روزانه دارد (`alerts` ۰۶:۰۰ و
 * `telegram-sync` ۰۳:۰۰). عددِ ۳۰ دقیقه رفتارِ **رلهٔ بیرونی** است که در
 * کامنتِ جدولِ `ir_market_history` ثبت شده — نه قراردادی که این مخزن اجرا
 * کند. پس یا آستانه به شاهدِ واقعی وصل است، یا صراحتاً «کف» نامیده می‌شود.
 */

import type { FreshnessRule } from "@/lib/desk/contracts";

export interface DeskSourceSpec {
  /** یکتا. پیش‌فرض نامِ جدول است؛ فقط وقتی لازم است که یک جدول دو منبع بسازد. */
  key?: string;
  table: string;
  label: string;
  /** ستونِ زمانی — باید در DDL وجود داشته باشد. `null` یعنی تازگی نمی‌سنجیم. */
  timeColumn: string | null;
  rule: FreshnessRule | null;
  /** شاهدِ آستانه. برای منابعِ بدونِ آستانه، دلیلِ نداشتنش. */
  basis: string;
  /** فقط زیرمجموعه‌ای از ردیف‌ها — مثلِ `status = 'succeeded'`. */
  filter?: { column: string; value: string };
  /** نامِ فارسیِ همان زیرمجموعه، برای متنِ حالت. با `filter` می‌آید. */
  scope?: string;
}

/** ۲۶ ساعت = یک نوبتِ روزانه + ۲ ساعت تحمل. همان عددی که نمای سلامت دارد. */
const DAILY: FreshnessRule = { freshWithinMinutes: 26 * 60 };

/**
 * آستانهٔ **موقت و محافظه‌کارانه** برای منابعی که زمان‌بندی‌شان در این مخزن
 * نیست. ۷ روز **دورهٔ واقعیِ این منابع نیست** و چنین ادعایی نمی‌کند؛ فقط
 * منبعِ کاملاً مرده را می‌گیرد. **پس از مشخص‌شدنِ قراردادِ رله باید بازبینی
 * شود.**
 */
const PROVISIONAL_WEEKLY: FreshnessRule = { freshWithinMinutes: 7 * 24 * 60 };

export const DESK_SOURCES = {
  today: [
    {
      table: "ir_market_snapshots",
      label: "اسنپ‌شاتِ بازار",
      timeColumn: "updated_at",
      rule: { freshWithinMinutes: 60 },
      basis:
        "همان آستانه‌ای که `/api/admin/health` از `G2-003` برای همین جدول دارد — یک منبع، یک آستانه. رله بیرون از این مخزن می‌نویسد؛ دوره‌اش اینجا تضمین‌شده نیست.",
    },
    {
      table: "fx_rates",
      label: "نرخِ ارز",
      timeColumn: "created_at",
      rule: DAILY,
      basis: "جدول روزانه است (`rate_date` یکتا در DDL) — یک ردیف در روز.",
    },
    {
      table: "market_breadth",
      label: "نبضِ بازار",
      timeColumn: "created_at",
      rule: DAILY,
      basis:
        "کامنتِ جدول: «append-only؛ روزی یک ردیف». `jdate` تاریخِ جلالیِ متنی است و ستونِ زمانی نیست، پس `created_at` مبناست.",
    },
  ],
  intelligence: [
    {
      table: "intel_events",
      label: "رخدادِ ثبت‌شده",
      timeColumn: "occurred_at",
      rule: null,
      basis:
        "هنوز هیچ تولیدکننده‌ای برای این جدول وجود ندارد (`phase20` روی Production اجرا نشده و فرایندِ ثبت دستی است). آستانه بدونِ تولیدکننده حدس است، پس تعریف نشده.",
    },
    {
      table: "intel_evidence",
      label: "شاهد",
      timeColumn: "observed_at",
      rule: null,
      basis: "مثلِ `intel_events` — بدونِ تولیدکننده، آستانه قابلِ اثبات نیست.",
    },
    {
      table: "content_hub",
      label: "هابِ محتوا",
      timeColumn: "created_at",
      rule: DAILY,
      basis: "`vercel.json` → `/api/cron/telegram-sync` با زمان‌بندیِ `0 3 * * *` (روزانه).",
    },
    {
      table: "codal_feed",
      label: "فیدِ کدال",
      timeColumn: "created_at",
      rule: PROVISIONAL_WEEKLY,
      basis:
        "منبعِ صفحهٔ عمومی `/codal`. هیچ زمان‌بندی‌ای در `vercel.json` برایش نیست — رله می‌نویسد. **آستانهٔ ۷ روز موقت و محافظه‌کارانه است و دورهٔ واقعی نیست؛ پس از مشخص‌شدنِ قراردادِ رله باید بازبینی شود.**",
    },
    {
      table: "codal_reports",
      label: "گزارشِ کدال (ماژول I1)",
      timeColumn: "captured_at",
      rule: PROVISIONAL_WEEKLY,
      basis:
        "ورودیِ ماژولِ تحلیلیِ I1، جدا از فیدِ عمومی. باز هم بدونِ زمان‌بندی در این مخزن. **آستانهٔ ۷ روز موقت و محافظه‌کارانه است و دورهٔ واقعی نیست؛ پس از مشخص‌شدنِ قراردادِ رله باید بازبینی شود.**",
    },
  ],
  decisions: [
    {
      table: "weekly_outlooks",
      label: "چشم‌اندازِ هفتگی",
      timeColumn: "published_at",
      rule: { freshWithinMinutes: 10 * 24 * 60 },
      basis:
        "`week_start` در DDL یکتا و هفتگی است؛ ۱۰ روز یعنی یک هفته به‌علاوهٔ تحمل. جدول ستونِ `created_at` ندارد — `published_at` تنها زمانِ موجود است.",
    },
    {
      table: "signal_drafts",
      label: "پیش‌نویسِ در انتظارِ بررسی",
      timeColumn: "created_at",
      rule: null,
      basis:
        "صف است، نه فید. «پیش‌نویسِ قدیمی» خودش معنا دارد و کهنگی‌اش خطا نیست — شمارش مهم است نه تازگی.",
    },
    {
      table: "intel_analyses",
      label: "تحلیلِ ثبت‌شده",
      timeColumn: "created_at",
      rule: null,
      basis: "بدونِ تولیدکننده (`phase20` اجرا نشده) آستانه قابلِ اثبات نیست.",
    },
    // ── دو صفِ واقعی ──────────────────────────────────────────────────
    // شمارشِ کلِ جدول جوابِ «چه چیزی منتظرِ من است» نیست: یک جدول با ۴۰۰
    // پیش‌نویسِ بسته‌شده و صفر موردِ باز، «۴۰۰ در صف» نیست. صفِ واقعی فقط
    // با خواندنِ `status` معنا پیدا می‌کند.
    {
      key: "signal_drafts:pending",
      table: "signal_drafts",
      label: "پیش‌نویسِ منتظرِ بررسی",
      timeColumn: "created_at",
      rule: null,
      filter: { column: "status", value: "pending" },
      scope: "موردِ بازنشده",
      basis:
        "ستونِ `status` در DDL سه مقدار دارد (`pending`/`approved`/`rejected`) و `pending` دقیقاً یعنی هنوز تصمیمی گرفته نشده. عمقِ صف مهم است نه تازگی‌اش، پس آستانه ندارد.",
    },
    {
      key: "intel_analyses:pending_approval",
      table: "intel_analyses",
      label: "تحلیلِ منتظرِ تأیید",
      timeColumn: "created_at",
      rule: null,
      filter: { column: "status", value: "pending_approval" },
      scope: "تحلیلِ منتظرِ تأیید",
      basis:
        "همان چرخهٔ دومرحله‌ای که `phase20` تعریف می‌کند: `draft` → `pending_approval` → `published`. فقط حالتِ میانی منتظرِ انسان است.",
    },
  ],
  reference: [
    {
      table: "intel_reference_portfolios",
      label: "سبدِ مرجع",
      timeColumn: "created_at",
      rule: null,
      basis: "سبدِ مرجع «کهنه» نمی‌شود؛ یا نسخهٔ نهایی دارد یا ندارد.",
    },
    {
      table: "intel_reference_versions",
      label: "نسخه",
      timeColumn: "created_at",
      rule: null,
      basis: "نسخه‌ها تاریخی‌اند؛ تازگی معیارِ درستی نیست.",
    },
    {
      table: "intel_reference_positions",
      label: "موقعیت",
      timeColumn: "created_at",
      rule: null,
      basis: "وزنِ اولیهٔ سبد یک تصمیمِ باز است و مهندسی آن را حدس نمی‌زند.",
    },
  ],
  clients: [
    {
      table: "webinar_registrations",
      label: "ثبت‌نامِ وبینار",
      // `registered_at` است نه `created_at` — تستِ DDLِ مخزن این را گرفت.
      timeColumn: "registered_at",
      rule: null,
      basis: "ثبت‌نام رویدادمحور است؛ آستانهٔ تازگی برایش معنا ندارد.",
    },
    {
      key: "webinar_registrations:no_invite",
      table: "webinar_registrations",
      label: "ثبت‌نامِ بدونِ دعوتِ ارسال‌شده",
      timeColumn: "registered_at",
      rule: null,
      filter: { column: "invite_sent", value: "false" },
      scope: "ثبت‌نامِ بدونِ دعوت",
      basis:
        "`invite_sent boolean NOT NULL DEFAULT false` در DDL یک وضعیتِ عملیاتیِ **واقعی** است، پس ساختگی نیست. ولی دقیقاً همان را می‌گوید و نه بیشتر: «دعوت ارسال نشده». اینکه دعوت **موعدش رسیده** یا نه به `payment_status` و به گذشتن یا نگذشتنِ خودِ وبینار هم بستگی دارد، و این ردیف دربارهٔ هیچ‌کدام قضاوت نمی‌کند. صفِ دقیق‌ترْ پرس‌وجوی چندشرطی می‌خواهد که فیلترِ تک‌شرطیِ فعلی پشتیبانی نمی‌کند — بستهٔ کارِ آینده، نه ادعای امروز.",
    },
    {
      table: "entitlements",
      label: "دسترسیِ محصول",
      timeColumn: "created_at",
      rule: null,
      basis:
        "فقط **خواندن** برای دیدنِ وضعیتِ دسترسی. مسیرِ نوشتنِ پرداخت→دسترسی مالکِ جداگانه‌ای دارد (PR #113) و این میز به آن دست نمی‌زند.",
    },
    {
      table: "leads",
      label: "لید",
      timeColumn: "created_at",
      rule: null,
      basis:
        "طبقِ `MIGRATION-LEDGER` این جدول روی Production **اجرا نشده** (`B-001`). انتظار می‌رود «در دسترس نیست» باشد — و همین درست است: میز باید بلاکرِ شناخته‌شده را نشان دهد، نه پنهانش کند.",
    },
  ],
  /**
   * ── چرا `cron_runs` دو ردیف است ────────────────────────────────────────
   * «زمان‌بند شلیک کرد» و «کار انجام شد» دو واقعیتِ متفاوت‌اند، و تفاوتشان
   * دقیقاً همان چیزی است که این جدول برای دیدنش ساخته شد. با یک ردیف،
   * jobی که **هر شب شروع و هر شب شکست** می‌خورد روی میز «به‌روز» بود: ردیفِ
   * تازه وجود داشت و کسی `status` را نمی‌خواند.
   *
   * حالا دو ردیف کنارِ هم، و همین جفت‌بودن است که خرابی را می‌گوید:
   *   هر دو به‌روز      → زمان‌بند کار می‌کند و کارها موفق‌اند.
   *   اولی به‌روز، دومی کهنه → **زمان‌بند سالم است، کار خراب است.**
   *   هر دو کهنه        → زمان‌بند اصلاً شلیک نکرده.
   *
   * هیچ‌کدام «سلامتِ» تازه‌ای محاسبه نمی‌کند؛ فقط دو عددِ واقعی را جدا
   * نگه می‌دارد تا خودشان حرف بزنند.
   */
  operations: [
    {
      table: "cron_runs",
      label: "اجرای cron — همهٔ نوبت‌ها",
      timeColumn: "started_at",
      rule: DAILY,
      basis:
        "پرتکرارترین cronِ ثبت‌شده در `vercel.json` روزانه است (`0 3 * * *`)؛ بیش از ۲۶ ساعت یعنی یک نوبت از دست رفته. این ردیف فقط می‌گوید زمان‌بند شلیک کرده — نه اینکه کار موفق بوده.",
    },
    {
      key: "cron_runs:succeeded",
      table: "cron_runs",
      label: "آخرین اجرای موفق",
      // `finished_at` و نه `started_at`: اجرای موفق طبقِ قیدِ
      // `cron_runs_finished_consistent` حتماً زمانِ پایان دارد، و «کِی تمام شد»
      // پاسخِ دقیق‌ترِ «آخرین بار کِی واقعاً کار کرد» است.
      timeColumn: "finished_at",
      rule: DAILY,
      filter: { column: "status", value: "succeeded" },
      scope: "اجرای موفق",
      basis:
        "همان آستانهٔ روزانه، ولی فقط روی `status = 'succeeded'`. طبقِ `MIGRATION-LEDGER` کلِ دلیلِ وجودِ `phase21` همین بود که «آخرین اجرای موفق» از دیتابیس قابلِ دانستن شود؛ نخواندنِ `status` یعنی همان جدول را داشتن و فایده‌اش را نگرفتن.",
    },
  ],
} as const satisfies Record<string, readonly DeskSourceSpec[]>;

export type DeskSourceGroup = keyof typeof DESK_SOURCES;

export const ALL_DESK_SOURCES: readonly DeskSourceSpec[] =
  Object.values(DESK_SOURCES).flat();
