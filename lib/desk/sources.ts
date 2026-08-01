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
  table: string;
  label: string;
  /** ستونِ زمانی — باید در DDL وجود داشته باشد. `null` یعنی تازگی نمی‌سنجیم. */
  timeColumn: string | null;
  rule: FreshnessRule | null;
  /** شاهدِ آستانه. برای منابعِ بدونِ آستانه، دلیلِ نداشتنش. */
  basis: string;
}

/** ۲۶ ساعت = یک نوبتِ روزانه + ۲ ساعت تحمل. همان عددی که نمای سلامت دارد. */
const DAILY: FreshnessRule = { okWithinMinutes: 26 * 60, staleWithinMinutes: 72 * 60 };

/**
 * کفِ محافظه‌کارانه برای منابعی که **زمان‌بندی‌شان در این مخزن نیست**.
 * ادعای دوره نمی‌کند؛ فقط منبعِ کاملاً مرده را می‌گیرد.
 */
const FLOOR_WEEKLY: FreshnessRule = { okWithinMinutes: 7 * 24 * 60, staleWithinMinutes: 30 * 24 * 60 };

export const DESK_SOURCES = {
  today: [
    {
      table: "ir_market_snapshots",
      label: "اسنپ‌شاتِ بازار",
      timeColumn: "updated_at",
      rule: { okWithinMinutes: 60, staleWithinMinutes: 24 * 60 },
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
      rule: FLOOR_WEEKLY,
      basis:
        "منبعِ صفحهٔ عمومی `/codal`. هیچ زمان‌بندی‌ای در `vercel.json` برایش نیست — رله می‌نویسد. عدد **کف** است، نه ادعای دوره.",
    },
    {
      table: "codal_reports",
      label: "گزارشِ کدال (ماژول I1)",
      timeColumn: "captured_at",
      rule: FLOOR_WEEKLY,
      basis:
        "ورودیِ ماژولِ تحلیلیِ I1، جدا از فیدِ عمومی. باز هم بدونِ زمان‌بندی در این مخزن — عدد **کف** است.",
    },
  ],
  decisions: [
    {
      table: "weekly_outlooks",
      label: "چشم‌اندازِ هفتگی",
      timeColumn: "published_at",
      rule: { okWithinMinutes: 10 * 24 * 60, staleWithinMinutes: 30 * 24 * 60 },
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
  operations: [
    {
      table: "cron_runs",
      label: "دفترِ اجرای cron",
      timeColumn: "started_at",
      rule: DAILY,
      basis:
        "پرتکرارترین cronِ ثبت‌شده در `vercel.json` روزانه است (`0 3 * * *`)؛ بیش از ۲۶ ساعت یعنی یک نوبت از دست رفته.",
    },
  ],
} as const satisfies Record<string, readonly DeskSourceSpec[]>;

export type DeskSourceGroup = keyof typeof DESK_SOURCES;

export const ALL_DESK_SOURCES: readonly DeskSourceSpec[] =
  Object.values(DESK_SOURCES).flat();
