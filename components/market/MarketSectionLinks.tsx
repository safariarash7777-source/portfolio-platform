/**
 * دسترسیِ مستقیم به تابلوها — ردیفِ چهارمِ نمای کلان.
 *
 * ── چرا لازم است ─────────────────────────────────────────────────────────
 * ناوبریِ بالای صفحه راهِ اصلی است، ولی کاربری که تا اینجا اسکرول کرده دوباره
 * بالا نمی‌رود. این ردیف همان مقصدها را در جایی می‌گذارد که نگاهِ کاربر هست،
 * و برخلافِ نوارِ بالا، برای هرکدام می‌گوید **چند ردیف** داخلش هست — یعنی
 * کلیک‌کردن یا نکردن یک تصمیمِ آگاهانه می‌شود.
 *
 * هیچ URL تازه‌ای ساخته نمی‌شود؛ همان routeهای موجود.
 */
import Link from "next/link";
import { ArrowLeft, BarChart3, PieChart, Grid3x3 } from "lucide-react";
import { toPersianDigits } from "@/lib/format";

interface Target {
  href: string;
  label: string;
  hint: string;
  /** تعدادِ ردیف در آخرین اسنپ‌شات — `null` یعنی نمی‌دانیم (نه صفر) */
  count: number | null;
  countUnit: string;
  Icon: typeof BarChart3;
}

export default function MarketSectionLinks({
  stockCount,
  fundCount,
  industryCount,
}: {
  stockCount: number | null;
  fundCount: number | null;
  industryCount: number | null;
}) {
  const targets: Target[] = [
    {
      href: "/market/stocks",
      label: "تابلوی سهام",
      hint: "جدول، نقشه و صنایع با فیلتر و مرتب‌سازی",
      count: stockCount,
      countUnit: "نماد",
      Icon: BarChart3,
    },
    {
      href: "/market/funds",
      label: "دیده‌بان صندوق‌ها",
      hint: "NAV، حباب و بازدهٔ صندوق‌ها",
      count: fundCount,
      countUnit: "صندوق",
      Icon: PieChart,
    },
    {
      href: "/market/map",
      label: "نقشه و صنایع",
      hint: "نقشهٔ نمادها و میزِ صنایع",
      count: industryCount,
      countUnit: "صنعت",
      Icon: Grid3x3,
    },
  ];

  return (
    <section aria-label="دسترسی به تابلوها">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {targets.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy)]"
            style={{ background: "var(--surface)", borderColor: "var(--line)", minHeight: 72 }}
          >
            <span
              aria-hidden
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
              style={{ background: "var(--surface-2)", color: "var(--navy)" }}
            >
              <t.Icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="font-display text-[14px] font-bold" style={{ color: "var(--heading)" }}>
                  {t.label}
                </span>
                <span className="text-[11px]" style={{ color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                  {t.count == null ? "—" : `${toPersianDigits(t.count)} ${t.countUnit}`}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-[11.5px]" style={{ color: "var(--text-3)" }}>
                {t.hint}
              </span>
            </span>
            <ArrowLeft
              size={16}
              aria-hidden
              className="flex-shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transition-none"
              style={{ color: "var(--text-3)" }}
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
