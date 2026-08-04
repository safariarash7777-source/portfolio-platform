// فید عمومی اطلاعیه‌های کدال (M4 — رصد بازار، الگوی کدال۷۲۴)
// منبع: جدول append-only codal_feed که موتور v3 در هر چرخه پر می‌کند.
// فیلتر دسته + جستجوی نماد از searchParams (server-side، بدون JS اضافی).
import Link from "next/link";
import { FileText, Search, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { toPersianDigits } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";


export const dynamic = "force-dynamic";
export const metadata = pageMetadata({
  title: "فید اطلاعیه‌های کدال",
  description:
    "آخرین اطلاعیه‌های منتشرشده در کدال — گزارش ماهانه، صورت مالی، شفاف‌سازی و مجمع، با لینک مستقیم به codal.ir.",
  path: "/codal",
});

const CATEGORIES = ["همه", "ماهانه", "صورت مالی", "شفاف‌سازی", "مجمع", "سایر"] as const;

interface FeedRow {
  id: number;
  symbol: string;
  company_name: string | null;
  title: string;
  report_code: string | null;
  category: string;
  sent_date: string | null;
  sent_time: string | null;
  link: string;
  link_pdf: string | null;
  link_excel: string | null;
}

export default async function CodalFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const cat = CATEGORIES.includes((sp.cat ?? "") as (typeof CATEGORIES)[number]) ? sp.cat! : "همه";
  const q = (sp.q ?? "").trim().slice(0, 30);

  const supabase = await createClient();
  let rows: FeedRow[] = [];
  let tableMissing = false;
  {
    let query = supabase
      .from("codal_feed")
      .select("id, symbol, company_name, title, report_code, category, sent_date, sent_time, link, link_pdf, link_excel")
      .order("id", { ascending: false })
      .limit(80);
    if (cat !== "همه") query = query.eq("category", cat);
    if (q) query = query.ilike("symbol", `%${q}%`);
    const { data, error } = await query;
    if (error) tableMissing = true;
    rows = (data ?? []) as FeedRow[];
  }

  const qs = (nextCat: string) => {
    const p = new URLSearchParams();
    if (nextCat !== "همه") p.set("cat", nextCat);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/codal?${s}` : "/codal";
  };

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}>
        <div className="mx-auto w-full max-w-5xl px-5 pt-10 pb-16">
          <header className="mb-6">
            <span className="eyebrow">کدال</span>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-2" style={{ color: "var(--navy-deep)" }}>
              فید اطلاعیه‌های کدال
            </h1>
            <p className="text-sm md:text-base mt-3 leading-8" style={{ color: "var(--text-2)" }}>
              آخرین اطلاعیه‌های منتشرشده در سامانهٔ کدال — به‌محض دیده‌شدن توسط موتور پایش، این‌جا
              فهرست می‌شود. متن کامل هر اطلاعیه در خود codal.ir است.
            </p>
          </header>

          {/* فیلتر دسته + جستجوی نماد */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {CATEGORIES.map((c) => (
              <Link
                key={c}
                href={qs(c)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: c === cat ? "var(--navy-deep)" : "var(--surface)",
                  color: c === cat ? "var(--text-on-navy)" : "var(--text-2)",
                  border: "1px solid var(--line)",
                }}
              >
                {c}
              </Link>
            ))}
            <form action="/codal" method="get" className="relative ms-auto">
              {cat !== "همه" ? <input type="hidden" name="cat" value={cat} /> : null}
              <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3" style={{ color: "var(--text-3)" }} />
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="جستجوی نماد…"
                className="rounded-lg ps-9 pe-3 py-2 text-xs w-44"
                style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text)" }}
              />
            </form>
          </div>

          {/* فهرست */}
          {tableMissing ? (
            <div className="card p-8 text-center">
              <FileText size={28} className="mx-auto mb-3" style={{ color: "var(--text-3)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
                فید کدال هنوز راه‌اندازی نشده است.
              </p>
              <p className="text-xs mt-2" style={{ color: "var(--text-3)" }}>
                زیرساخت این بخش آماده است و پس از فعال‌سازی پایگاه داده، اطلاعیه‌ها به‌صورت خودکار این‌جا ظاهر می‌شوند.
              </p>
            </div>
          ) : rows.length === 0 ? (
            <div className="card p-8 text-center">
              <FileText size={28} className="mx-auto mb-3" style={{ color: "var(--text-3)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
                {q || cat !== "همه" ? "اطلاعیه‌ای با این فیلتر یافت نشد." : "هنوز اطلاعیه‌ای ثبت نشده است."}
              </p>
              <p className="text-xs mt-2" style={{ color: "var(--text-3)" }}>
                موتور پایش کدال هر چند دقیقه یک‌بار فید سراسری را می‌خواند؛ اولین اطلاعیه‌های تازه به‌زودی این‌جا می‌نشینند.
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <ul>
                {rows.map((r) => (
                  <li key={r.id} className="px-5 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/symbol/${encodeURIComponent(r.symbol)}`}
                            className="font-bold text-sm hover:underline"
                            style={{ color: "var(--navy-deep)" }}
                          >
                            {r.symbol}
                          </Link>
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{ background: "var(--gold-tint)", color: "var(--navy-deep)" }}
                          >
                            {r.category}
                          </span>
                          {r.report_code ? (
                            <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                              {r.report_code}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[13px] mt-1.5 leading-7" style={{ color: "var(--text)" }}>
                          {r.title}
                        </p>
                        {r.company_name ? (
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                            {r.company_name}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        {r.sent_date ? (
                          <span className="text-[11px]" style={{ color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                            {toPersianDigits(r.sent_date)}
                            {r.sent_time ? ` · ${toPersianDigits(r.sent_time)}` : ""}
                          </span>
                        ) : null}
                        <div className="flex items-center gap-2">
                          <a
                            href={r.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
                            style={{ color: "var(--navy)" }}
                          >
                            <ExternalLink size={11} />
                            مشاهده در کدال
                          </a>
                          {r.link_pdf ? (
                            <a
                              href={r.link_pdf}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] hover:underline"
                              style={{ color: "var(--text-3)" }}
                            >
                              PDF
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] leading-6 mt-6" style={{ color: "var(--text-3)" }}>
            منبع: سامانهٔ اطلاع‌رسانی ناشران (codal.ir). این فهرست صرفاً اطلاع‌رسانی است و توصیهٔ
            خرید یا فروش نیست.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
