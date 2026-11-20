"use client";

import { useMemo, useState } from "react";
import { emptyFilter, fields, fieldsList, readThreshold, screen, validFilters, type Field, type Filter, type Row } from "./rules";

const key = "market-screener-preview-20261120-v1";
const nf = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 });
const fmt = (n: number | null) => n === null ? "—" : nf.format(n);
const control = "w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2.5 text-sm";
const btn = "rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold disabled:opacity-40";
const PAGE = 24;

export default function Screener({ rows, received, backup }: { rows: Row[]; received: string | null; backup: boolean }) {
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("");
  const [filters, setFilters] = useState<Filter[]>([emptyFilter()]);
  const [active, setActive] = useState<Filter[]>([]);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<Field | "symbol">("symbol");
  const [status, setStatus] = useState("");
  const industries = useMemo(() => [...new Set(rows.flatMap((row) => row.industry ? [row.industry] : []))].sort((a,b) => a.localeCompare(b,"fa")), [rows]);
  const result = useMemo(() => screen(rows, query, industry, active), [rows, query, industry, active]);
  const ordered = useMemo(() => [...result.matched].sort((a,b) => {
    if (sort !== "symbol") {
      if (a[sort] === null && b[sort] !== null) return 1;
      if (b[sort] === null && a[sort] !== null) return -1;
      if (a[sort] !== null && b[sort] !== null && a[sort] !== b[sort]) return b[sort]! - a[sort]!;
    }
    return a.id.localeCompare(b.id, "fa");
  }), [result.matched, sort]);
  const update = (i: number, patch: Partial<Filter>) => setFilters((all) => all.map((f,j) => i === j ? {...f,...patch} : f));
  const apply = () => {
    if (!validFilters(filters)) { setStatus("آستانه باید عدد معتبر باشد."); return; }
    setActive(filters); setPage(0); setStatus("فیلتر اعمال شد.");
  };
  const save = () => {
    if (!validFilters(filters) || !filters.some((f) => readThreshold(f.value) !== null)) { setStatus("یک شرط عددی معتبر وارد کن."); return; }
    try { localStorage.setItem(key, JSON.stringify(filters)); setStatus("فیلتر در همین مرورگر ذخیره شد."); }
    catch { setStatus("مرورگر اجازهٔ ذخیره نداد."); }
  };
  const restore = () => {
    try {
      const raw = localStorage.getItem(key);
      const loaded: unknown = raw ? JSON.parse(raw) : null;
      if (!validFilters(loaded)) { setStatus("فیلتر ذخیره‌شده‌ای پیدا نشد."); return; }
      setFilters(loaded); setActive(loaded); setPage(0); setStatus("فیلتر ذخیره‌شده اعمال شد.");
    } catch { setStatus("خواندن فیلتر ذخیره‌شده ممکن نبود."); }
  };
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-5 px-4 py-8 sm:px-8">
      <header className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-8">
        <p className="text-sm font-semibold text-[var(--text-2)]">پیش‌نمایش پژوهش بازار</p>
        <h1 className="mt-1 text-3xl font-black sm:text-4xl">دیده‌بان سهام</h1>
        <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">همهٔ نمادهای موجود در تابلوی دریافتی را با آستانه‌های خودت غربال کن. تعداد نمادهای تابلو معادل پوشش رسمی کل بورس نیست.</p>
        <p className="mt-2 text-sm text-[var(--text-2)]">{backup ? "زمان ثبت نسخهٔ ذخیره‌شده" : "زمان دریافت تابلو"}: {received ?? "نامشخص"} <span className="whitespace-nowrap">(زمان معامله نیست)</span></p>
      </header>
      <aside className="rounded-2xl border border-[var(--line)] p-4 text-sm leading-6 text-[var(--text-2)]">
        این نسخه از دادهٔ تابلو استفاده می‌کند. فیلتر فروش ماهانه، حاشیهٔ سود فصلی و حجم در سطح قیمت هنوز به این صفحه وصل نیست.
      </aside>
      {backup ? <p role="status" className="rounded-2xl border border-[var(--line)] p-4 text-sm">نسخهٔ ذخیره‌شدهٔ تابلوی عمومی است؛ داده‌ها زنده نیستند. <a className="underline" href="https://portfolio-platform-fawn.vercel.app/market/stocks">تابلوی سایت اصلی</a></p> : null}
      <section className="space-y-3 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6" aria-label="فیلترها">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">جست‌وجوی نماد یا شرکت<input type="search" className={control} value={query} onChange={(e)=>{setQuery(e.target.value);setPage(0);}} /></label>
          <label className="text-sm">صنعت<select className={control} value={industry} onChange={(e)=>{setIndustry(e.target.value);setPage(0);}}><option value="">همهٔ صنایع</option>{industries.map((i)=><option key={i}>{i}</option>)}</select></label>
        </div>
        <form className="space-y-3" onSubmit={(e)=>{e.preventDefault();apply();}}>
          <p className="text-sm font-semibold">شرط‌های ترکیبی <span className="font-normal"> (همه باید برقرار باشند)</span></p>
          {filters.map((f,i)=><div key={i} className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <select aria-label={`شاخص شرط ${nf.format(i+1)}`} className={control} value={f.field} onChange={(e)=>update(i,{field:e.target.value as Field})}>{fieldsList.map((k)=><option value={k} key={k}>{fields[k].label}</option>)}</select>
            <select aria-label={`مقایسهٔ شرط ${nf.format(i+1)}`} className={control} value={f.operator} onChange={(e)=>update(i,{operator:e.target.value as Filter["operator"]})}><option value="gte">حداقل</option><option value="lte">حداکثر</option></select>
            <input aria-label={`آستانهٔ شرط ${nf.format(i+1)}`} className={control} inputMode="decimal" maxLength={32} value={f.value} placeholder={fields[f.field].example} onChange={(e)=>update(i,{value:e.target.value})} />
            <button type="button" className={btn} aria-label={`حذف شرط ${nf.format(i+1)}`} onClick={()=>setFilters((all)=>all.filter((_,j)=>i!==j))}>حذف</button>
          </div>)}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="rounded-lg bg-[var(--navy-deep)] px-4 py-2 text-sm font-bold text-[var(--text-on-navy)]">اعمال فیلتر</button>
            <button type="button" className={btn} disabled={filters.length>=4} onClick={()=>setFilters((all)=>[...all,emptyFilter()])}>شرط اضافه کن</button>
            <button type="button" className={btn} onClick={save}>ذخیرهٔ فیلتر</button>
            <button type="button" className={btn} onClick={restore}>بازکردن فیلتر ذخیره‌شده</button>
            <button type="button" className={btn} onClick={()=>{setFilters([emptyFilter()]);setActive([]);setQuery("");setIndustry("");setPage(0);setStatus("فیلترها پاک شدند.");}}>پاک‌کردن</button>
          </div>
          <p role="status" className="text-sm text-[var(--text-2)]">{status}</p>
        </form>
      </section>
      <section className="space-y-3" aria-label="نتایج">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-live="polite">
          {[[result.eligible,"نماد در محدوده"],[ordered.length,"مطابق شرط"],[result.excluded,"خارج از شرط"],[result.missing,"دادهٔ ناکافی"]].map(([count,label])=><div key={label} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3"><strong className="block text-xl">{nf.format(count as number)}</strong><span className="text-sm text-[var(--text-2)]">{label}</span></div>)}
        </div>
        <label className="block w-full max-w-xs text-sm">مرتب‌سازی<select className={control} value={sort} onChange={(e)=>{setSort(e.target.value as typeof sort);setPage(0);}}><option value="symbol">نام نماد</option>{fieldsList.map((f)=><option key={f} value={f}>{fields[f].label} (نزولی)</option>)}</select></label>
        {ordered.length ? <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
          <table className="w-full text-sm">
            <thead><tr>{["نماد","صنعت","قیمت (تومان)","تغییر (%)","حجم","P/E"].map((h)=><th key={h} scope="col" className="whitespace-nowrap p-3 text-right">{h}</th>)}</tr></thead>
            <tbody>{ordered.slice(page*PAGE,(page+1)*PAGE).map((row)=><tr key={row.id} className="border-t border-[var(--line)]">
              <th scope="row" className="whitespace-nowrap p-3 text-right"><a className="font-bold underline underline-offset-4" href={`https://portfolio-platform-fawn.vercel.app/symbol/${encodeURIComponent(row.id)}`}>{row.id}</a><span className="block text-xs font-normal text-[var(--text-2)]">{row.name}</span></th>
              <td className="whitespace-nowrap p-3">{row.industry ?? "—"}</td>{[row.price,row.change,row.volume,row.pe].map((v,i)=><td key={i} className="whitespace-nowrap p-3">{fmt(v)}</td>)}
            </tr>)}</tbody>
          </table>
        </div> : <p className="rounded-xl border border-[var(--line)] p-4">ردیفی با این تنظیمات پیدا نشد.</p>}
        {ordered.length > PAGE && <nav aria-label="صفحه‌بندی" className="flex items-center gap-2"><button className={btn} disabled={page===0} onClick={()=>setPage(page-1)}>قبلی</button><span className="text-sm">{nf.format(page+1)} از {nf.format(Math.ceil(ordered.length/PAGE))}</span><button className={btn} disabled={(page+1)*PAGE>=ordered.length} onClick={()=>setPage(page+1)}>بعدی</button></nav>}
      </section>
    </main>
  );
}
