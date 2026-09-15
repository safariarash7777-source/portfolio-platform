/**
 * پوستهٔ مشترکِ صفحاتِ بازار.
 *
 * ── «پوسته» یعنی چه، و یعنی چه نیست ──────────────────────────────────────
 * این یک **کامپوننتِ نظمِ مشترک** است: سربرگ، تازگیِ داده، جست‌وجو و ناوبریِ
 * بخش‌ها. عمداً یک `layout.tsx` موازی **نیست**، چون layout جداگانه یعنی یک
 * درختِ دومِ احراز هویت و گیتِ دسترسی — و آن دقیقاً همان چیزی است که نباید
 * لمس شود. هر صفحه `Navbar` و `Footer` خودش را نگه می‌دارد و فقط این پوسته
 * را داخلِ `main` می‌گذارد.
 *
 * ── یک H1 در هر صفحه ─────────────────────────────────────────────────────
 * عنوانِ صفحه اینجا و فقط اینجا `h1` است. هر کامپوننتِ دیگری که تا دیروز
 * `h1` داشت (مثلِ `TodayDashboard`) به `h2` تنزل کرده — وگرنه صفحه دو H1
 * داشت و ساختارِ سرفصل برای صفحه‌خوان شکسته بود.
 */
import Link from "next/link";
import { MARKET_SECTIONS, type MarketSectionKey, type MarketSearchEntry } from "@/lib/market-nav";
import { computeFreshness } from "@/lib/market-freshness";
import { formatJalali, formatTehranClock } from "@/lib/format";
import MarketSearch from "./MarketSearch";

export interface MarketShellProps {
  /** بخشِ فعال — حالتِ فعالِ ناوبری از همین می‌آید، نه از خواندنِ URL در کلاینت. */
  active: MarketSectionKey;
  title: string;
  /** یک جمله: این صفحه چه چیزی نشان می‌دهد */
  lead?: string;
  /** مهرِ زمانیِ اسنپ‌شاتِ فیدِ ایران */
  fetchedAt: number | null;
  /** وضعیتِ تابلو از شاخص (مثلِ «بازار باز است») — رشتهٔ منبع، بدونِ تفسیر */
  boardState?: string | null;
  searchIndex: readonly MarketSearchEntry[];
  /** مسیرِ فعلی — به نتایجِ جست‌وجو داده می‌شود تا «برگشت» مبدأ را بداند */
  path: string;
  children: React.ReactNode;
}

function FreshnessBadge({ fetchedAt }: { fetchedAt: number | null }) {
  const f = computeFreshness({
    irFetchedAt: fetchedAt,
    usesIr: true,
    usesGlobal: false,
    now: Date.now(),
  });
  const tone =
    f.state === "fresh"
      ? { dot: "var(--success)", text: "var(--text-2)" }
      : f.state === "stale"
        ? { dot: "var(--warning)", text: "var(--warning)" }
        : { dot: "var(--text-3)", text: "var(--text-3)" };

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: tone.text }}
    >
      {/* رنگ تنها حاملِ معنا نیست: متنِ کنارش همیشه وضعیت را می‌گوید. */}
      <span aria-hidden className="inline-block rounded-full" style={{ width: 6, height: 6, background: tone.dot }} />
      {f.label}
    </span>
  );
}

export default function MarketShell({
  active,
  title,
  lead,
  fetchedAt,
  boardState,
  searchIndex,
  path,
  children,
}: MarketShellProps) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-5 sm:px-5 md:pt-6">
      {/* ── ردیفِ اول: سربرگِ بازار، زمان و جست‌وجو ───────────────────────── */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="eyebrow">میز بازار</p>
            <h1
              className="mt-0.5 font-display font-bold"
              style={{ color: "var(--heading)", fontSize: "clamp(1.5rem, 3.2vw, 2rem)", lineHeight: 1.25 }}
            >
              {title}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {fetchedAt ? (
              <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                {formatJalali(fetchedAt)} · ساعت {formatTehranClock(fetchedAt)} تهران
              </span>
            ) : null}
            {boardState ? (
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text-2)" }}
              >
                {boardState}
              </span>
            ) : null}
            <FreshnessBadge fetchedAt={fetchedAt} />
          </div>
        </div>

        {lead ? (
          <p className="max-w-3xl text-[13px] leading-7" style={{ color: "var(--text-2)" }}>
            {lead}
          </p>
        ) : null}

        <div className="max-w-xl">
          <MarketSearch index={searchIndex} from={path} />
        </div>
      </header>

      {/* ── ناوبریِ بخش‌ها ──────────────────────────────────────────────────
          لینکِ بین‌صفحه‌ای است، نه تبِ محلی: هر مورد یک URL واقعی دارد، پس
          refresh و back/forward حالتِ فعال را حفظ می‌کنند (چون از `active`
          سمتِ سرور می‌آید، نه از state). «طلا و ارز» لنگر است و با ظاهرِ
          متفاوت نشان داده می‌شود تا با تبِ صفحه‌ای اشتباه نشود. */}
      <nav aria-label="بخش‌های بازار" className="mt-4">
        <ul
          className="flex gap-1 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "thin", borderBottom: "1px solid var(--line)" }}
        >
          {MARKET_SECTIONS.map((s) => {
            const isActive = s.key === active;
            return (
              <li key={s.key} className="flex-shrink-0">
                <Link
                  href={s.href}
                  aria-current={isActive ? "page" : undefined}
                  title={s.hint}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)]"
                  style={{
                    minHeight: 44,
                    color: isActive ? "var(--navy-ink)" : "var(--text-2)",
                    // حالتِ فعال دو نشانه دارد (رنگ + نوارِ زیرین)، نه فقط رنگ.
                    boxShadow: isActive ? "inset 0 -2px 0 0 var(--navy-ink)" : "none",
                  }}
                >
                  {s.label}
                  {s.anchor ? (
                    <span
                      aria-hidden
                      className="rounded px-1 text-[9px] font-bold"
                      style={{ background: "var(--surface-2)", color: "var(--text-3)" }}
                    >
                      بخش
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-5">{children}</div>
    </div>
  );
}
