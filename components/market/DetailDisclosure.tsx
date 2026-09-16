/**
 * بخشِ بازشوندهٔ «جزئیات».
 *
 * ── چرا وجود دارد ────────────────────────────────────────────────────────
 * نمای کلانِ `/market` پیش از این همهٔ جزئیات را پشتِ سرِ هم می‌چید و صفحه به
 * حدود ۶۷۵۰ پیکسل می‌رسید؛ میزِ بازار در ۱۷۰۰ پیکسل و صندوق‌ها در ۴۶۰۰ پیکسلِ
 * پایین بودند. راهِ حل **حذفِ قابلیت نیست** — جزئیات همان‌جا می‌مانَد، ولی
 * بسته. کاربر می‌بیند چه چیزی هست و با یک کلیک بازش می‌کند.
 *
 * ── چرا `<details>` بومی ─────────────────────────────────────────────────
 * باز/بسته‌شدن بدونِ جاوااسکریپت کار می‌کند، با کیبورد قابلِ استفاده است،
 * صفحه‌خوان وضعیتِ expanded را خودش اعلام می‌کند، و Ctrl+F مرورگر محتوای
 * بسته را پیدا می‌کند. یک آکاردئونِ دست‌ساز هیچ‌کدامِ این‌ها را مجانی ندارد.
 */
import { ChevronDown } from "lucide-react";

export default function DetailDisclosure({
  title,
  hint,
  id,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** یک جمله: داخلش چیست — تا کاربر بداند ارزشِ بازکردن دارد یا نه */
  hint: string;
  id?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group scroll-mt-24 overflow-hidden rounded-xl border"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
    >
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--navy-ink)]"
        style={{ minHeight: 56 }}
      >
        <span className="min-w-0">
          <span className="block font-display text-[15px] font-bold" style={{ color: "var(--heading)" }}>
            {title}
          </span>
          <span className="mt-0.5 block text-[11.5px] leading-5" style={{ color: "var(--text-3)" }}>
            {hint}
          </span>
        </span>
        <ChevronDown
          size={18}
          aria-hidden
          className="flex-shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          style={{ color: "var(--text-3)" }}
        />
      </summary>
      <div className="border-t px-4 py-4" style={{ borderColor: "var(--line)" }}>
        {children}
      </div>
    </details>
  );
}
