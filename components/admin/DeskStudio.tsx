"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpLeft, Bookmark, Check, ChevronLeft, CircleHelp, Clock3, Layers3, LayoutGrid, LineChart, ListFilter, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { toPersianDigits, formatJalali } from "@/lib/format";
import type { IntelligenceDeskViewModel } from "@/lib/intelligence/board";
import styles from "./DeskStudio.module.css";

type State = "ready" | "loading" | "error" | "stale" | "empty";
type Report = { id: string; title: string; category: string; pending: boolean; description: string; date: string | null };
const samples: Report[] = [
  { id: "sample-macro", title: "نرخ بهره؛ کدام سناریو پررنگ‌تر است؟", category: "اقتصاد کلان", pending: true, description: "نمونهٔ نمایشی: پیش از ثبت قضاوت، مسیر نرخ بهره، شواهد مخالف و افق زمانی بررسی می‌شوند. این متن تحلیل واقعی بازار نیست.", date: "2026-10-17" },
  { id: "sample-gold", title: "طلا در ترازوی ریسک و تنوع", category: "طبقات دارایی", pending: false, description: "نمونهٔ نمایشی: اثر تغییر مفروضات ارز و اونس بر سناریوهای سبد بررسی می‌شود؛ هیچ وزن یا بازده واقعی در این صفحه نمایش داده نشده است.", date: "2026-10-16" },
  { id: "sample-codal", title: "کیفیت سود؛ فراتر از عدد نهایی", category: "گزارش شرکتی", pending: true, description: "نمونهٔ نمایشی: مقایسهٔ کیفیت جریان نقد و سود عملیاتی به دوره و واحد یکسان نیاز دارد. برای تحلیل واقعی، گزارش منبع باید بررسی شود.", date: "2026-10-15" },
];
const sampleSeries = [100, 102, 101, 104, 103, 106, 105, 104, 108, 107, 110, 108, 111, 113, 112, 115, 114, 112, 116, 118, 117, 120, 118, 121, 122, 120, 123, 122, 125, 124];
const ranges = [7, 14, 30] as const;
const preferenceKey = "arash.desk-studio.preferences.v1";

export default function DeskStudio({ view, demo = false }: { view?: IntelligenceDeskViewModel; demo?: boolean }) {
  const [range, setRange] = useState<number>(14);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<State>("ready");
  const [selected, setSelected] = useState<Report | null>(null);
  const [message, setMessage] = useState("");
  const detail = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const state: State = demo ? mode : view?.unavailableReason ? "error" : "ready";
  const reports: Report[] = demo ? samples : view && !view.unavailableReason ? view.inbox.map(({ brief, blockedReason }) => ({ id: brief.id, title: brief.title, category: brief.domain, pending: true, description: blockedReason ?? brief.reviewNote ?? "برای بررسی شواهد و ثبت تصمیم، گردش بررسی موجود را باز کنید.", date: brief.briefDate })) : [];
  const shown = state === "empty" ? [] : reports.filter(r => (filter !== "pending" || r.pending) && r.title.includes(query.trim()));
  const points = sampleSeries.slice(-range);
  const path = points.map((v, i) => `${i === 0 ? "M" : "L"}${40 + i * 660 / (points.length - 1)},${240 - (v - 98) * 7}`).join(" ");
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(preferenceKey) ?? "null");
      if (saved?.version === 1 && ranges.includes(saved.range)) setRange(saved.range);
      if (saved?.version === 1 && ["all", "pending"].includes(saved.filter)) setFilter(saved.filter);
    } catch { /* A blocked preference store must not prevent reading. */ }
  }, []);
  useEffect(() => { if (selected) detail.current?.focus(); }, [selected]);
  const save = () => {
    try { localStorage.setItem(preferenceKey, JSON.stringify({ version: 1, range, filter })); setMessage("تنظیمات نمایش در همین مرورگر ذخیره شد."); }
    catch { setMessage("ذخیره ممکن نشد؛ دسترسی مرورگر به حافظه را بررسی کنید."); }
  };
  const close = () => { setSelected(null); opener.current?.focus(); };
  const healthy = state === "ready" || state === "stale";
  const count = healthy ? toPersianDigits(reports.filter(r => r.pending).length) : "—";
  return <main className={styles.studio} dir="rtl">
    {demo && <div className={styles.preview}><span><strong>نمونهٔ نمایشی</strong> · بررسی طراحی؛ همهٔ اعداد، نمودار و گزارش‌ها ساختگی‌اند.</span><label>حالت صفحه <select aria-label="حالت نمایشی صفحه" value={mode} onChange={e => { setMode(e.target.value as State); setSelected(null); }}><option value="ready">آماده</option><option value="loading">بارگذاری</option><option value="error">خطا</option><option value="stale">دادهٔ قدیمی</option><option value="empty">بدون داده</option></select></label></div>}
    <header className={styles.header}><div className={styles.brand}><span className={styles.monogram}>آ</span><div><strong>آرش صفری</strong><span>میز تحلیل و راهبری سرمایه‌گذاری</span></div></div><div className={styles.headerTools}><span className={styles.status}><span />{demo ? "محیط بررسی طراحی" : "نمای داخلی"}</span><button onClick={save} className={styles.save}><Bookmark size={16} />ذخیرهٔ تنظیمات</button></div></header>
    <div className={styles.intro}><div><p className={styles.eyebrow}>دید روشن‌تر، تصمیم سنجیده‌تر</p><h1>تصویر بزرگ،<br className={styles.mobileBreak} /> جزئیات در دسترس.</h1><p>بازار، پژوهش و سبد را در یک قاب مرور کنید.</p></div><div className={styles.date}><Clock3 size={17} /><span>{demo ? formatJalali("2026-10-17") : view?.todayJalali ?? "زمان نامشخص"}<small>{demo ? "تاریخ ثابت نمونه" : "تاریخ گزارش میز"}</small></span></div></div>
    <nav className={styles.toolbar} aria-label="بخش‌های میز تحلیل"><a href="#desk-overview"><LayoutGrid size={17} />نمای کلی</a><a href="#desk-chart"><LineChart size={17} />نمای بازار</a><a href="#desk-reports"><Layers3 size={17} />پژوهش‌ها</a><a href="#desk-portfolio"><ShieldCheck size={17} />سبد مرجع</a><span className={styles.toolbarNote}>از داده تا قضاوت</span></nav>
    <p role="status" aria-live="polite" className={styles.feedback}>{message}</p>
    {state === "stale" && <div className={styles.notice}><Clock3 size={17} />دادهٔ نمونه قدیمی است؛ تاریخ نمایش، نشانهٔ تازگی بازار نیست.</div>}
    {state === "error" && <div role="alert" className={styles.notice}>داده‌ها خوانده نشدند. خروجی ناقص نمایش داده نمی‌شود. <button onClick={() => demo ? setMode("ready") : window.location.reload()}><RefreshCw size={15} />تلاش دوباره</button></div>}
    <section id="desk-overview" className={styles.metrics} aria-label="خلاصهٔ میز" aria-busy={state === "loading"}>
      {[{ title: "در صف بررسی", value: count, unit: "گزارش", note: "نیازمند قضاوت انسانی", icon: Layers3, section: "desk-reports" }, { title: "گزاره‌های امروز", value: healthy ? demo ? toPersianDigits(8) : view?.today.claimCount == null ? "—" : toPersianDigits(view.today.claimCount) : "—", unit: "گزاره", note: demo ? "نمونهٔ نمایشی" : view?.today.statusLabel ?? "ثبت نشده", icon: LineChart, section: "desk-reports" }, { title: "سبد مرجع", value: demo && healthy ? "در حال بررسی" : view?.portfolio.hasOfficialWeights && healthy ? "ثبت شده" : "نامشخص", unit: "", note: "وزن‌ها و مفروضات در کنار هم", icon: ShieldCheck, section: "desk-portfolio" }].map(item => <a key={item.title} className={styles.metric} href={`#${item.section}`}><div><span>{item.title}</span><item.icon size={19} /></div><strong>{state === "loading" ? "در حال دریافت…" : item.value}<small>{item.unit}</small></strong><p>{item.note}<ArrowUpLeft size={16} /></p></a>)}
    </section>
    <div className={styles.mainGrid}>
      <section id="desk-chart" className={`${styles.card} ${styles.chartCard}`}><div className={styles.cardHeading}><div><p className={styles.eyebrow}>نبض بازار</p><h2>روند در یک نگاه</h2></div><span className={styles.chip}>{demo ? "شاخص فرضی · پایه ۱۰۰" : "تاریخچه متصل نشده"}</span></div><div className={styles.chartTools}><div><strong>{demo && healthy ? toPersianDigits(points.at(-1)!) : "—"}</strong><span>{demo ? "واحد شاخص فرضی" : "دادهٔ معتبر در دسترس نیست"}</span></div><div className={styles.pills} aria-label="بازهٔ نمودار">{ranges.map(n => <button key={n} aria-pressed={range === n} onClick={() => { setRange(n); setMessage(""); }}>{toPersianDigits(n)} روز</button>)}</div></div>
        {demo && healthy ? <figure className={styles.chart}><svg viewBox="0 0 740 280" role="img" aria-label={`روند ساختگی در ${toPersianDigits(range)} روز؛ واحد شاخص فرضی`}><defs><linearGradient id="desk-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--navy)" stopOpacity=".16" /><stop offset="1" stopColor="var(--navy)" stopOpacity="0" /></linearGradient></defs>{[100, 110, 120, 130].map(v => <g key={v}><line x1="40" x2="700" y1={240 - (v - 98) * 7} y2={240 - (v - 98) * 7} stroke="var(--line)" strokeDasharray="4 6" /><text x="735" y={244 - (v - 98) * 7} textAnchor="end" fill="var(--text-3)" fontSize="12">{toPersianDigits(v)}</text></g>)}<path d={`${path} L700,255 L40,255 Z`} fill="url(#desk-fill)" /><path d={path} fill="none" stroke="var(--navy-ink)" strokeWidth="3" strokeLinejoin="round" /><circle cx="700" cy={240 - (points.at(-1)! - 98) * 7} r="5" fill="var(--gold)" /></svg><figcaption><span>{toPersianDigits(range)} روز پیش</span><span>منبع: دادهٔ ساختگی طراحی · بدون اتصال بازار</span><span>پایان نمونه</span></figcaption></figure> : <div className={styles.empty}><LineChart size={36} /><strong>{state === "loading" ? "در حال دریافت داده…" : state === "error" ? "خواندن داده ناموفق بود" : "سری زمانی برای نمایش موجود نیست"}</strong><p>دادهٔ ناموجود با نمودار فرضی جایگزین نمی‌شود.</p></div>}
        <div className={styles.chartFooter}><CircleHelp size={16} />این نما برای مرور روند است؛ قضاوت به منبع، تاریخ و مفروضات نیاز دارد.</div>
      </section>
      <section id="desk-portfolio" className={`${styles.card} ${styles.portfolio}`}><span className={styles.orbit}><ShieldCheck size={28} /></span><p className={styles.eyebrow}>پیش از هر تصمیم</p><h2>ریسک را<br />در قاب سبد ببین.</h2><p>{demo ? "نمونهٔ نمایشی: یک تغییر در بازار، برای همهٔ دارایی‌ها معنای یکسانی ندارد." : view?.portfolio.note ?? "اطلاعات سبد مرجع در دسترس نیست."}</p><div className={styles.portfolioRows}><span>وضعیت وزن‌ها<strong>{demo ? "نمونه؛ بدون وزن واقعی" : healthy && view?.portfolio.hasOfficialWeights ? "ثبت شده" : "نامشخص"}</strong></span><span>مرز تصمیم<strong>بررسی انسانی</strong></span><span>افق تحلیل<strong>وابسته به سناریو</strong></span></div>{!demo ? <Link href="/admin/intelligence">بازکردن بررسی سبد <ChevronLeft size={17} /></Link> : <button onClick={() => { setMessage("در این نمونه وزن واقعی سبد وجود ندارد؛ کارت فقط جهت طراحی را نشان می‌دهد."); }}>دربارهٔ این نما <ChevronLeft size={17} /></button>}</section>
    </div>
    <section id="desk-reports" className={`${styles.card} ${styles.reports}`}><div className={styles.cardHeading}><div><p className={styles.eyebrow}>از مشاهده تا بررسی</p><h2>گزارش‌ها و موضوعات قابل پیگیری</h2></div><div className={styles.reportControls}><label className={styles.search}><Search size={16} /><input aria-label="جست‌وجوی گزارش" placeholder="جست‌وجوی عنوان…" value={query} onChange={e => setQuery(e.target.value)} /></label><button className={styles.filter} aria-pressed={filter === "pending"} onClick={() => { setFilter(filter === "all" ? "pending" : "all"); setMessage(""); }}><ListFilter size={16} />{filter === "all" ? "همهٔ گزارش‌ها" : "منتظر بررسی"}</button></div></div>
      {healthy || state === "empty" ? <div className={styles.tableWrap}><table><thead><tr><th scope="col">موضوع</th><th scope="col">حوزه</th><th scope="col">تاریخ گزارش</th><th scope="col">وضعیت</th><th scope="col"><span className="sr-only">جزئیات</span></th></tr></thead><tbody>{shown.map(r => <tr key={r.id}><td><button aria-expanded={selected?.id === r.id} aria-controls="desk-details" onClick={e => { opener.current = e.currentTarget; setSelected(r); }}>{r.title}</button></td><td>{r.category}</td><td>{r.date ? formatJalali(r.date) : "نامشخص"}</td><td><span className={styles.chip}>{r.pending ? "منتظر بررسی" : "ثبت شده"}</span></td><td><ChevronLeft size={16} /></td></tr>)}</tbody></table>{shown.length === 0 && <p className={styles.noResults}>گزارشی برای این انتخاب وجود ندارد.</p>}</div> : <div className={styles.noResults}>{state === "loading" ? "در حال دریافت گزارش‌ها…" : "گزارش‌ها به علت خطای خواندن نمایش داده نمی‌شوند."}</div>}
      {selected && <section tabIndex={-1} ref={detail} id="desk-details" aria-label="جزئیات گزارش" className={styles.details} onKeyDown={e => { if (e.key === "Escape") close(); }}><div><span className={styles.eyebrow}>{selected.category}</span><h3>{selected.title}</h3></div><button aria-label="بستن جزئیات" onClick={close}><X size={19} /></button><p>{selected.description}</p>{!demo && <Link href="/admin/intelligence">ادامه در گردش بررسی <ArrowUpLeft size={16} /></Link>}{demo && <span className={styles.chip}><Check size={14} />نمونهٔ نمایشی؛ ذخیرهٔ گزارش انجام نمی‌شود</span>}</section>}
    </section><footer className={styles.footer}><span>آرش صفری · فهم مستند، قضاوت مسئولانه</span><span>{demo ? "پیش‌نمایش زبان بصری / نسخهٔ اول" : "نمای آزمایشی میز تحلیل"}</span></footer>
  </main>;
}
