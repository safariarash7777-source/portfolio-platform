import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Reveal from "./Reveal";

/**
 * معرفیِ کوتاهِ آرش — P2-PUBLIC-EXPERIENCE-REBASELINE-001
 *
 * ⚠️ عمداً کوتاه است. هیچ سابقه، مدرک، سالِ تجربه یا عددی در مخزن **تأیید نشده**،
 * پس هیچ‌کدام نوشته نشد. این بند فقط از فاکت‌های موجود استفاده می‌کند.
 * جای بیوگرافیِ واقعی در `/about` علامت‌گذاری شده و منتظرِ خودِ آرش است.
 */
export default function AboutStrip() {
  return (
    <section
      className="border-y"
      style={{ background: "var(--surface-2)", borderColor: "var(--line)" }}
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-20">
        <Reveal>
          <div className="max-w-2xl">
            <p className="text-xs font-bold tracking-wide" style={{ color: "var(--gold-ink)" }}>
              دربارهٔ آرش صفری
            </p>
            <p
              className="font-display mt-4"
              style={{
                color: "var(--heading)",
                fontSize: "clamp(1.25rem, 2.6vw, 1.75rem)",
                fontWeight: 700,
                lineHeight: 1.65,
                letterSpacing: "-0.01em",
              }}
            >
              تحلیلگر و مشاور سرمایه‌گذاری، با تمرکز بر بازار سرمایهٔ ایران.
              تحلیل با نامِ مشخص منتشر می‌شود و نتیجه‌اش پیگیری‌پذیر است.
            </p>
            <Link href="/about" className="btn btn-outline mt-8">
              دربارهٔ آرش و روش کارش
              <ArrowLeft size={16} />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
