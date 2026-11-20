import Link from "next/link";
import { ArrowLeft, ArrowUpLeft, Bookmark, CalendarDays, PieChart, ClipboardList, Compass, Folder, Layers3, MessagesSquare, Wallet } from "lucide-react";
import ReadError from "@/components/dashboard/ReadError";
import { formatJalali, formatPercent, formatToman, toPersianDigits } from "@/lib/format";
import type { HistoryPoint } from "@/lib/portfolio/dossier-history";
import type { RecordedPayment } from "@/lib/portfolio/paymentSchedule";

interface DossierPicture {
  assets: number | null;
  debts: number | null;
  net: number | null;
  estimated: boolean;
  pricesFailed: boolean;
  stale: boolean;
  positions: { id: string; name: string; amount: number | null; source: string | null; asOf: string | null; weight: number | null; estimated: boolean }[];
  due: RecordedPayment | null;
  incompleteSchedule: boolean;
  history: { state: "empty" | "ready" | "unavailable"; points: HistoryPoint[] };
}

/** Display-only projection from the canonical portfolio readers. */
export interface MemberFinanceSummary {
  assetsState: "ready" | "empty" | "error";
  version: number | null;
  recordedAt: string | null;
  assetCount: number | null;
  debtsState: "ready" | "empty" | "error";
  debtCount: number | null;
  scopeState: "confirmed" | "unconfirmed" | "empty" | "error";
  targetState: "ready" | "empty" | "error";
  picture?: DossierPicture;
}
const asset = "/dashboard/holdings#asset-editor", debt = "/dashboard/holdings#debt-editor", scope = "/dashboard/holdings#investment-scope";
const money = (n: number | null | undefined) => n == null ? "نامشخص" : formatToman(n);
const date = (d: string | null | undefined) => d && Number.isFinite(Date.parse(d)) ? formatJalali(d) : "نامشخص";
const links = [
  { href: "/dashboard/cashflow", label: "بازکردن دفتر جریان نقد", note: "درآمد و هزینهٔ واقعی", Icon: Wallet },
  { href: "/dashboard/cashflow#period-budget", label: "بررسی بودجه و هزینه‌ها", note: "برنامه در برابر واقعیت", Icon: ClipboardList },
  { href: "/dashboard/goals", label: "ثبت و پیگیری هدف مالی", note: "مبلغ، موعد و پیشرفت", Icon: Bookmark },
  { href: "/dashboard/consultation", label: "بازکردن پروندهٔ مشاوره", note: "رضایت، نسخه و پیگیری", Icon: MessagesSquare },
] as const;

export default function PersonalFinance({ summary }: { summary?: MemberFinanceSummary }) {
  const failed = !summary || summary.assetsState === "error", empty = summary?.assetsState === "empty";
  const p = failed || empty ? undefined : summary?.picture;
  const known = p?.positions.filter(row => row.amount !== null) ?? [];
  const next = failed ? ["بازخوانی پرونده", "دریافت دارایی‌ها تأیید نشده است.", "/dashboard", "بازخوانی اطلاعات"]
    : empty || summary?.assetCount === 0 ? ["اولین دارایی را ثبت کنید", "عنوان، مقدار یا ارزش و سهم مالکیت کافی است.", asset, "ثبت دارایی"]
    : p?.pricesFailed ? ["منبع قیمت را بررسی کنید", "دریافت قیمت از منبع فعلاً ممکن نیست؛ ثبت‌های شما محفوظ‌اند.", asset, "مشاهدهٔ دارایی‌ها"]
    : p?.positions.some(row => row.amount === null) ? ["ارزش دارایی ناقص را تکمیل کنید", "ارزش، تاریخ و منبع را در دفتر دارایی بررسی کنید.", asset, "تکمیل ارزش‌گذاری"]
    : summary?.debtsState === "error" ? ["دفتر تعهدها را بررسی کنید", "مانده و موعد هنوز تأیید نشده است.", debt, "بازکردن دفتر بدهی"]
    : p?.due ? ["قسط ثبت‌شده را مرور کنید", "مبلغ و موعد را با دفتر بدهی مقایسه کنید.", debt, "مشاهدهٔ تعهد"]
    : summary?.scopeState === "unconfirmed" ? ["محدودهٔ سبدتان را مشخص کنید", "انتخاب کنید کدام دارایی‌ها جزو سبد سرمایه‌گذاری‌اند.", scope, "تعیین محدودهٔ سبد"]
    : ["ثبت‌های این نسخه را مرور کنید", "دارایی و بدهی را با اطلاعات خودتان تطبیق دهید.", asset, "مشاهدهٔ دفتر دارایی"];
  const net = p?.net != null;
  const value = net ? p.net : p?.assets;
  const badge = failed ? "خواندن ناموفق" : empty ? "بدون ثبت" : p?.pricesFailed ? "خطای منبع قیمت" : p?.stale ? "قیمت قدیمی" : !p || known.length !== p.positions.length || summary?.debtsState === "error" ? "پوشش ناقص" : p.estimated ? "شامل برآورد" : "نسخهٔ ثبت‌شده";
  return <section aria-label="وضعیت مالی شخصی" className="dos">
    <header className="dos-heading"><div>
      <div className="dos-kicker"><span />آرش صفری · فضای مالی شخصی</div>
      <h1>پروندهٔ مالی من</h1><p>دارایی، تعهد و اقدام بعدی</p>
    </div>{summary?.version != null && !failed && <div className="dos-version"><Folder size={14} aria-hidden /> نسخهٔ {toPersianDigits(summary.version)}<i />ثبت در {date(summary.recordedAt)}</div>}</header>
    <div className="dos-top">
      <div className="dos-main">
        <div className="dos-headline"><span><Wallet size={17} aria-hidden />تصویر مالی</span><span className="dos-badge"><i />{badge}</span></div>
        <h2>{net ? "خالص دارایی‌های ثبت‌شده" : "ارزش بخش قیمت‌دار"}</h2>
        <div className="dos-amount"><bdi data-unknown={value == null}>{value == null ? empty ? "هنوز ثبت نشده" : "قابل محاسبه نیست" : formatToman(value).split(" ")[0]}</bdi>{value != null && <small>تومان</small>}</div>
        <p>{net ? "ارزش اقلام همین نسخه پس از کسر ماندهٔ بدهی‌های ثبت‌شده." : "فقط ارزش اقلام دارای منبع؛ این عدد کل ثروت شما نیست."}{p?.estimated && " این نسخه شامل ارزش تخمینی است."}</p>
        <div className="dos-foot"><div><span>داراییِ قیمت‌دار</span><strong>{money(p?.assets)}</strong></div><div><span>ماندهٔ بدهی ثبت‌شده</span><strong>{money(p?.debts)}</strong></div></div>
      </div>
      <aside className="dos-action"><div className="dos-label"><span className="dos-sign"><Compass size={17} aria-hidden /></span> اقدام بعدی</div>
        <h2>{next[0]}</h2><p>{next[1]}</p><Link prefetch={false} href={next[2]} className="dos-cta">{next[3]}<ArrowLeft size={16} aria-hidden /></Link>
      </aside>
    </div>
    <nav className="dos-jump" aria-label="بخش‌های پرونده"><a href="#dos-monitor">پایش دارایی</a><a href="#dos-register">ثبت و اصلاح</a><a href="#dos-ledgers">دفترهای من</a></nav>
    <div className="dos-monitor" id="dos-monitor" tabIndex={-1}>
      <div className="dos-panel"><header><h2><CalendarDays size={19} aria-hidden /> ارزش دارایی در زمان</h2><span>نسخه‌های ثبت‌شده</span></header>
        <RecordedTrend history={!failed ? p?.history : undefined} />

      </div>
      <div className="dos-panel"><header><h2><PieChart size={19} aria-hidden /> ترکیب دارایی</h2><span>{failed ? "نامشخص" : `${toPersianDigits(known.length)} از ${toPersianDigits(summary?.assetCount ?? 0)} قلم`}</span></header>
        {known.length > 0 ? <><p className="dos-muted">ارزش به نسبت سهم مالکیت شما؛ درصد فقط با پوشش کامل نمایش داده می‌شود.</p><ul className="dos-bars">{known.slice(0,4).map(row => <li key={row.id}><div><b>{row.name}</b><span>{money(row.amount)}{row.weight != null && ` · ${formatPercent(row.weight)}`}</span></div>{row.weight != null && <div className="dos-rail" aria-hidden><i style={{width: `${row.weight}%`}} /></div>}</li>)}</ul></> : <p className="dos-empty">{failed ? "اقلام این نسخه خوانده نشدند." : "هنوز ارزش قابل‌اتکایی برای نمایش ترکیب نداریم."}</p>}
        {!!p?.positions.length && <details className="dos-detail"><summary>مبلغ و منبع هر دارایی</summary><ul>{p.positions.map(r => <li key={r.id}><b>{r.name}</b>{money(r.amount)}<small>{r.source ?? "بدون منبع معتبر"} · {date(r.asOf)}{r.estimated && " · تخمینی"}</small></li>)}</ul></details>}
      </div>
    </div>
    <div className="dos-obligations"><div className="dos-panel"><header><h2><CalendarDays size={19} aria-hidden /> تعهد ثبت‌شده</h2><span>برنامهٔ قسط</span></header>
      {p?.due ? <div className="dos-due"><small>{date(p.due.dueOn)}</small><b>{p.due.title}</b><strong>{money(p.due.amountToman)}</strong></div> : <b>موعدی تأیید نشده است.</b>}
      <div>{!summary || summary.debtsState === "error" ? <ReadError label="بدهی‌های این نسخه" code="MEMBER_DEBTS" /> : <p className="dos-muted">{summary.debtsState === "empty" ? "پس از اولین ثبت دارایی، بدهی‌های همان نسخه را ثبت کنید." : summary.debtCount === 0 ? "بدهی‌ای در این نسخه ثبت نشده است؛ این به معنی نداشتن بدهی نیست." : "پرداخت تأیید نشده؛ قسط دوباره از مانده کسر نمی‌شود."}{p?.incompleteSchedule && " مبلغ یا موعد بعضی اقساط ناقص است."}</p>}</div>
      <Link className="dos-link" href={debt}>مشاهده و ثبت بدهی<ArrowLeft size={15} aria-hidden /></Link>
    </div></div>
    <div className="dos-grid dos-lower" id="dos-register" tabIndex={-1}>
      <div className="dos-panel"><header><h2><Layers3 size={19} aria-hidden /> دارایی، بدهی و سبد من</h2></header>
        {failed ? <ReadError label="ثبت‌های دارایی" code="MEMBER_ASSETS" /> : <p className="dos-muted">{empty ? "هنوز نسخه‌ای از دارایی‌ها ثبت نکرده‌اید." : `${toPersianDigits(summary.assetCount!)} قلم در آخرین نسخه ثبت شده است.`}</p>}
        <p className="dos-muted">قیمت را نمی‌دانید؟ مقدار و واحد را وارد کنید و قیمت را نامعلوم بگذارید، نه صفر.</p>
        <Link className="dos-link" href={asset}>مشاهده و ثبت دارایی<ArrowLeft size={15} aria-hidden /></Link>
      </div>
      <div className="dos-panel"><header><h2><Folder size={19} aria-hidden /> محدودهٔ سبد</h2></header>
        {!summary || summary.scopeState === "error" ? <ReadError label="محدودهٔ سبد این نسخه" code="MEMBER_SCOPE" /> : <p className="dos-muted">{summary.scopeState === "empty" ? "برای تعیین اقلام سبد، ابتدا دارایی‌ها را ثبت کنید." : summary.scopeState === "confirmed" ? "محدودهٔ سرمایه‌گذاری این نسخه تأیید شده است." : "محدودهٔ سرمایه‌گذاری این نسخه هنوز تأیید نشده است."}</p>}
        {!summary || summary.targetState === "error" ? <ReadError label="هدف ثبت‌شدهٔ سبد" code="MEMBER_TARGET" /> : <p className="dos-muted">{summary.targetState === "ready" ? "هدف ثبت‌شدهٔ حساب موجود است؛ مقایسه به اطلاعات معتبر نیاز دارد." : "هنوز هدفی در ثبت‌های نسخه‌دار حساب موجود نیست."}</p>}
        <Link className="dos-link" href={scope}>بررسی محدودهٔ سبد<ArrowLeft size={15} aria-hidden /></Link>
      </div>
    </div>
    <div id="dos-ledgers" tabIndex={-1} className="dos-ledgers"><h2>دفترهای پرونده</h2><nav aria-label="دفترهای مالی">{links.map(({href,label,note,Icon}) => <div className="dos-ledger-cell" key={href}><Icon size={18} aria-hidden /><div><Link href={href}>{label}</Link><small>{note}</small></div></div>)}</nav>
      <p className="dos-muted">نبود ثبت، درآمد یا هزینهٔ صفر را تأیید نمی‌کند. دارایی و قسط خودکار به این دفتر منتقل نمی‌شوند.</p>
    </div>
  </section>;
}


// Each date is positioned on an elapsed-time axis; an unknown version breaks the
// line, and equal-timestamp records remain in the accessible detail table.
function RecordedTrend({ history }: { history?: DossierPicture["history"] }) {
  const points = history?.points ?? [];
  const timed = points.filter(pt => Number.isFinite(Date.parse(pt.date))).sort((a,b) => Date.parse(a.date) - Date.parse(b.date));
  const values = timed.filter((pt): pt is HistoryPoint & {amount:number} => pt.amount !== null);
  const from = Date.parse(timed[0]?.date ?? ""), to = Date.parse(timed.at(-1)?.date ?? "");
  const show = values.length > 1 && to > from && new Set(values.map(p => Date.parse(p.date))).size > 1;
  const max = Math.max(...values.map(v => v.amount), 1);
  // The readable table is the accessible equivalent of the drawing.
  const x = (pt: HistoryPoint) => 8 + (Date.parse(pt.date) - from) / (to - from) * 284;
  const y = (v: number) => 82 - v / max * 67;
  const segments: string[][] = [];
  if (show) for (const pt of timed) {
    if (pt.amount === null) { segments.push([]); continue; }
    if (!segments.length) segments.push([]);
    segments[segments.length-1].push(`${x(pt)},${y(pt.amount)}`);
  }
  return <>
    {show ? <><p className="dos-muted">ارزش اظهارشده هنگام ثبت هر نسخه؛ تغییر ارزش، سود نیست. واریز و برداشت هم اثر دارند.</p>
      <svg className="dos-plot" viewBox="0 0 300 94" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <line x1="8" x2="292" y1="82" y2="82" stroke="var(--rule)" />
        {segments.filter(seg => seg.length > 1).map((seg,i) => <polyline key={i} points={seg.join(" ")} fill="none" stroke="var(--chart-stroke)" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
        {values.map(pt => <circle key={pt.id} cx={x(pt)} cy={y(pt.amount)} r="2.6" fill="var(--chart-stroke)" />)}
      </svg><p className="dos-axis" dir="ltr"><span>{date(timed[0].date)}</span><span>{date(timed.at(-1)!.date)}</span></p>
    </> : <p className="dos-empty">{history?.state === "unavailable" ? "خواندن نسخه‌های قبلی کامل نشد؛ نسخهٔ فعلی جداگانه نمایش داده می‌شود." : "برای رسم روند، دست‌کم دو نسخه با ارزش کامل و تاریخ متفاوت لازم است."} تغییر ارزش، سود سرمایه‌گذاری نیست.</p>}
    {points.length > 0 && <details className="dos-detail"><summary>جدول تاریخ، مبلغ و منبع</summary>
      <ul>{points.map(pt => <li key={pt.id}><Link href={`/dashboard/holdings?v=${encodeURIComponent(pt.id)}`} className="dos-link">نسخهٔ {toPersianDigits(pt.version)} · {date(pt.date)}<ArrowUpLeft size={13} aria-hidden /></Link><b>{money(pt.amount)}</b><small>{pt.amount === null ? "فاقد ارزش‌گذاری کامل در زمان ثبت" : pt.estimated ? "ارزش اظهارشدهٔ نسخه · شامل برآورد" : "ارزش اظهارشدهٔ نسخه در زمان ثبت"}</small></li>)}</ul></details>}
  </>;
}
