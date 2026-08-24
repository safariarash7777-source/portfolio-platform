/**
 * صفِ اقدام — «چه چیزی منتظرِ تصمیمِ من است؟» (`P2-G3-MEGA-007`).
 *
 * ── مرزِ این ماژول ───────────────────────────────────────────────────────
 * این **CRMِ دوم نیست** و قرار نیست بشود. هیچ رکوردِ مشتری، هیچ نام، هیچ
 * تماس و هیچ ردیفِ شخصی اینجا نمی‌آید؛ فقط **عمقِ صف** و مقصدی که کارِ
 * واقعی آنجا انجام می‌شود. `/admin/users` و `/admin/webinars` سرِ جایشان
 * می‌مانند و این صف جایشان را نمی‌گیرد — فقط می‌گوید کدامشان امروز
 * منتظرِ آرش‌اند.
 *
 * ── چرا صفر خطرناک‌ترین عددِ این صفحه است ────────────────────────────────
 * یک صفِ خالی و یک صفِ خوانده‌نشده روی صفحه شبیهِ هم‌اند: هر دو «۰». ولی
 * اولی یعنی «کاری نمانده» و دومی یعنی «نمی‌دانم کاری مانده یا نه». اگر
 * اشتباه گرفته شوند، آرش با خیالِ راحت صفحه را می‌بندد در حالی که پنج تحلیل
 * منتظرِ تأیید است و فقط پرس‌وجو مردود شده بود.
 *
 * پس شمارشِ ناخوانا `null` می‌ماند، در جمع شرکت نمی‌کند، و سرخطِ صفحه
 * به‌جای عددِ قطعی «دستِ‌کم» می‌گوید.
 *
 * ── و چرا «خالی» هرگز «بررسی شد» نیست ────────────────────────────────────
 * نبودِ موردی در صف ثابت نمی‌کند چیزی بررسی شده؛ فقط ثابت می‌کند چیزی در صف
 * نیست. همان قاعده‌ای که `command-desk` برای «روزِ آرام» دارد.
 */

import { toPersianDigits } from "@/lib/format";
import { isDataFault, type DataState, type DeskSource } from "@/lib/desk/contracts";

export interface QueueSpec {
  /** کلیدِ منبعِ میز که عمقِ این صف را می‌دهد. */
  key: string;
  label: string;
  /**
   * مقصدِ **موجود** برای انجامِ کار. این صف خودش جای کار نیست.
   *
   * `null` یعنی در این مخزن هیچ صفحه‌ای برای این کار وجود ندارد. آن هم یک
   * واقعیت است و پنهان نمی‌شود: نسخهٔ اولِ همین فایل به
   * `/admin/manage?tab=drafts` لینک می‌داد، در حالی که `normalizeTab` فقط
   * `portfolio`/`waitlist`/`payments`/`users` را می‌شناسد و هر چیزِ دیگر
   * **بی‌صدا** به `users` می‌افتد. یک لینکِ موجه که کاربر را جای دیگری
   * می‌برد از نبودِ لینک بدتر است.
   */
  href: string | null;
  linkLabel: string | null;
  /** محدودیتِ صادقانهٔ این شمارش، وقتی وجود دارد. */
  caveat?: string;
  /** وقتی `href` تهی است — چرا. */
  noDestination?: string;
}

/**
 * صف‌ها به ترتیبِ **جنسِ تصمیم**: اول قضاوتِ تحلیلی، بعد کارِ عملیاتی.
 * هر سه از منبعی می‌آیند که `status` را واقعاً فیلتر می‌کند.
 */
export const APPROVAL_QUEUES: readonly QueueSpec[] = [
  {
    key: "intel_analyses:pending_approval",
    label: "تحلیلِ منتظرِ تأیید",
    href: "/admin/analyses",
    linkLabel: "کارنامه",
  },
  {
    key: "signal_drafts:pending",
    label: "پیش‌نویسِ منتظرِ بررسی",
    // در این مخزن هیچ صفحه‌ای `signal_drafts` را نمی‌خوانَد — با grep روی
    // `app/` و `components/` سنجیده شد، نه فرض. عمقِ صف واقعی است، جای
    // بررسی‌اش هنوز ساخته نشده.
    href: null,
    linkLabel: null,
    noDestination: "در این نسخه صفحه‌ای برای بررسیِ این صف وجود ندارد — بستهٔ کارِ آینده",
  },
  {
    key: "webinar_registrations:no_invite",
    label: "ثبت‌نامِ بدونِ دعوتِ ارسال‌شده",
    href: "/admin/webinars",
    linkLabel: "وبینارها",
    caveat: "فقط یعنی دعوت ارسال نشده — دربارهٔ پرداخت یا گذشتنِ وبینار قضاوتی نمی‌کند",
  },
];

export interface QueueLine {
  key: string;
  label: string;
  /** `null` یعنی **نتوانستیم بشماریم**. هرگز صفر نمی‌شود. */
  count: number | null;
  state: DataState;
  detail: string;
  href: string | null;
  linkLabel: string | null;
}

export interface ApprovalQueue {
  lines: readonly QueueLine[];
  /** مجموعِ مواردِ **شمرده‌شده**. صف‌های ناخوانا در آن نیستند. */
  waiting: number;
  /** چند صف اصلاً خوانده نشد. تا وقتی > ۰ است، `waiting` یک کفِ پایین است. */
  unreadable: number;
  headline: string;
  detail: string;
}

/** ناخوانا اول: «نمی‌دانم» فوری‌تر از «سه مورد» است. بعد عمیق‌ترین صف. */
function order(a: QueueLine, b: QueueLine): number {
  const rank = (l: QueueLine) => (l.count === null ? 0 : l.count > 0 ? 1 : 2);
  const d = rank(a) - rank(b);
  return d !== 0 ? d : (b.count ?? 0) - (a.count ?? 0);
}

export function buildApprovalQueue(
  sources: readonly DeskSource[],
  specs: readonly QueueSpec[] = APPROVAL_QUEUES
): ApprovalQueue {
  const lines = specs.map<QueueLine>((spec) => {
    const source = sources.find((s) => s.key === spec.key);
    const base = {
      key: spec.key,
      label: spec.label,
      href: spec.href,
      linkLabel: spec.href ? spec.linkLabel : null,
    };

    if (!source) {
      return {
        ...base,
        count: null,
        state: "unavailable",
        detail: "این صف در پاسخِ میز نیست — عمقش دانسته نیست",
      };
    }

    // خرابیِ منبع یعنی عدد **نداریم**، نه اینکه عدد صفر است. حتی اگر
    // `count` تصادفاً پر باشد (مثلِ حالتِ ستونِ زمانیِ خراب که شمارش را
    // نگه می‌دارد)، وقتی حالتِ منبع خراب است به آن عدد تکیه نمی‌کنیم.
    if (isDataFault(source.state) && source.state !== "empty") {
      return {
        ...base,
        count: null,
        state: source.state,
        detail: source.detail,
      };
    }

    const count = source.count ?? null;
    if (count === null) {
      return { ...base, count: null, state: "unavailable", detail: source.detail };
    }

    return {
      ...base,
      count,
      // صفِ پر منتظرِ انسان است؛ صفِ خالی خرابی نیست و «آماده» هم نیست —
      // فقط چیزی در آن نمانده.
      state: count > 0 ? "awaiting_review" : "ready",
      detail: [
        count > 0 ? `${toPersianDigits(count)} مورد در صف` : "چیزی در این صف نمانده",
        count > 0 ? spec.caveat : undefined,
        // نبودِ مقصد همیشه گفته می‌شود، حتی وقتی صف خالی است — وگرنه روزی
        // که پر شود، تازه معلوم می‌شود جایی برای رفتن نیست.
        spec.href ? undefined : spec.noDestination,
      ]
        .filter(Boolean)
        .join(" — "),
    };
  });

  const unreadable = lines.filter((l) => l.count === null).length;
  const waiting = lines.reduce((sum, l) => sum + (l.count ?? 0), 0);

  return {
    lines: [...lines].sort(order),
    waiting,
    unreadable,
    headline: headlineFor(waiting, unreadable),
    detail: detailFor(waiting, unreadable),
  };
}

function headlineFor(waiting: number, unreadable: number): string {
  if (unreadable > 0 && waiting === 0) {
    // مهم‌ترین جملهٔ این فایل: وقتی هیچ صفی خوانده نشده، «چیزی منتظر نیست»
    // یک دروغ است. سکوتِ پرس‌وجو با سکوتِ صف یکی نیست.
    return `${toPersianDigits(unreadable)} صف خوانده نشد — دانسته نیست چیزی منتظر هست یا نه`;
  }
  if (unreadable > 0) {
    return `دستِ‌کم ${toPersianDigits(waiting)} مورد منتظرِ شماست؛ ${toPersianDigits(unreadable)} صف خوانده نشد`;
  }
  if (waiting === 0) return "هیچ موردی در صف نیست";
  return `${toPersianDigits(waiting)} مورد منتظرِ شماست`;
}

function detailFor(waiting: number, unreadable: number): string {
  if (unreadable > 0) {
    return "تا وقتی صفی خوانده نشده، این عدد یک کفِ پایین است و نه شمارشِ کامل.";
  }
  if (waiting === 0) {
    // «خالی» ادعای «بررسی شد» نمی‌کند.
    return "صفِ خالی یعنی چیزی در انتظار ثبت نشده — نه اینکه همه‌چیز بررسی شده.";
  }
  return "کار در همان صفحه‌ای انجام می‌شود که این صف به آن راه می‌دهد؛ اینجا فقط شمارش است.";
}
