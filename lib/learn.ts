// دروس ناحیهٔ یادگیری (WP-G) — SPEC-learning-hub §۲
// سرفصل‌های قبلی تا آماده‌شدن متن، پیش‌نویس باقی می‌مانند.
import { netWorthContent } from "@/lib/learn/net-worth";

export interface LessonContent {
  sections: { heading: string; paragraphs: string[] }[];
  selfCheck: { question: string; answer: string };
  tools: { label: string; href: string; description: string }[];
  sources: { label: string; href: string; scope: string }[];
}

export interface Lesson {
  slug: string;
  order: number;
  title: string;
  /** شرح یک‌خطی (غیرحساس — از خود SPEC). */
  summary: string;
  /** idهای واژه‌نامهٔ مرتبط با این درس. */
  glossaryIds: string[];
  /** درس کاملِ آمادهٔ نمایش؛ انتشار سایت پس از بازبینی بستهٔ تحویل انجام می‌شود. */
  published: boolean;
  content?: LessonContent;
}

export const LESSONS: Lesson[] = [
  {
    slug: "what-is-the-market",
    order: 1,
    title: "بورس چیست و چرا؟",
    summary: "مقدماتی — بازار سرمایه، ریسک و افق زمانی.",
    glossaryIds: ["price-band", "symbol-halt"],
    published: false,
  },
  {
    slug: "how-to-read-a-symbol",
    order: 2,
    title: "چطور یک نماد را بخوانم؟",
    summary: "تابلوخوانی ساده: پایانی/آخرین، حقیقی/حقوقی، صف.",
    glossaryIds: ["closing-price", "last-price", "retail-institutional", "order-queue", "base-volume"],
    published: false,
  },
  {
    slug: "fundamentals-simple",
    order: 3,
    title: "تحلیل بنیادی به زبان ساده",
    summary: "گزارش ماهانه، سود، و نرخ در برابر حجم.",
    glossaryIds: ["n10-n30", "codal", "eps-dps", "pe-ttm"],
    published: false,
  },
  {
    slug: "funds-the-simple-way",
    order: 4,
    title: "صندوق‌ها: راه ساده‌تر سرمایه‌گذاری",
    summary: "ETF، NAV، حباب و انواع صندوق.",
    glossaryIds: ["etf", "nav", "fund-premium"],
    published: false,
  },
  {
    slug: "risk-and-portfolio",
    order: 5,
    title: "ریسک و سبدچینی",
    summary: "تنوع و تناسب با پروفایل ریسک — بدون توصیهٔ نماد.",
    glossaryIds: ["etf", "price-band"],
    published: false,
  },
  {
    slug: "compass-guide",
    order: 6,
    title: "راهنمای قطب‌نمای بازار",
    summary: "چطور از خود محصول استفاده کنم: کارت نماد، کارنامه، رصد.",
    glossaryIds: ["per-capita-buy", "buyer-power", "fund-premium"],
    published: false,
  },
  {
    slug: "assets-debts-net-worth",
    order: 7,
    title: "دارایی، بدهی و خالص ثروت",
    summary: "یک تصویر از داشته‌ها و بدهی‌ها؛ با مثال تومان و تمرین در ابزار تصویر مالی.",
    glossaryIds: [],
    published: true,
    content: netWorthContent,
  },
];

export function getLesson(slug: string): Lesson | null {
  return LESSONS.find((l) => l.slug === slug) ?? null;
}

/**
 * درس‌هایی که واقعاً متن دارند و می‌شود عمومی نشانشان داد.
 *
 * `B-028` / `P2-G2-010`: سرفصل‌ها **حذف نمی‌شوند** — پیش‌نویس‌ها همین‌جا می‌مانند
 * تا وقتی آرش متن را تأیید کند. ولی تا آن لحظه یک سرفصلِ بی‌متن نباید مثلِ
 * محتوای قابل‌استفاده رفتار کند: کارتِ کلیک‌پذیری که به صفحهٔ خالی می‌رسد،
 * برچسبِ «به‌زودی» هم که داشته باشد، باز هم وعده‌ای می‌دهد که پشتش چیزی نیست.
 *
 * هر دو تابع از روی همین `published` کار می‌کنند، پس با انتشارِ اولین درس
 * رفتارِ صفحه **خودبه‌خود** برمی‌گردد و نیازی به تغییرِ کد نیست.
 */
export function publishedLessons(): Lesson[] {
  return LESSONS.filter((l) => l.published);
}

export function hasPublishedLessons(): boolean {
  return LESSONS.some((l) => l.published);
}
