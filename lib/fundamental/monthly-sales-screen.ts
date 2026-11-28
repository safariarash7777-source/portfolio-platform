import { approvedCodalUrl } from "../desk/workspace-model";
import { jalaliYmdToGregorian, validJalali } from "../core/jalali";
import { isMillionRialUnit } from "./units";
import { isAmendmentTitle, publishKey } from "./supabase";

export interface SalesPoint {
  period: string;
  amount: number;
  unit: string;
  sourceUrl: string;
  publishedAt: string | null;
  capturedAt: string | null;
  amendment: boolean;
  reportId: number;
}
export interface ScreenIssuer { id: string; industry?: string | null; industryId?: number | null }
export interface SalesFiling {
  id: number; symbol: string; title: string; source_url: string; storedPeriod: string;
  reportPeriod: string; reportSymbol: string; unit: string | null; amount: number | null;
  measure: string | null; months: string | null; parser: string | null;
  publicationDate: string | null; publicationTime: string | null; captured_at: string | null;
}
export interface SalesNotice { symbol: string; title: string; link: string; report_code?: string | null }
export interface UnitReview { reportId: number; symbol: string; periodEnd: string; sourceUrl: string; amendment: boolean }
export interface ScreenRow {
  unitReview?: UnitReview[];
  symbol: string; industry: string | null; eligible: boolean; reason: string | null;
  current: SalesPoint | null; previous: SalesPoint | null; growth: number | null; passed: boolean | null;
}
export type ScreenUniverse = "board" | "reported-outside";
export interface MonthlySalesScreen {
  universeKind?: ScreenUniverse;
  readState?: "fresh" | "retained";
  period: string; previousPeriod: string; minGrowth: number; checkedAt: string;
  rows: ScreenRow[];
  coverage: { universe: number; eligible: number; calculable: number; passed: number;
    excluded: Record<string, number>; universeSource: string; outsideRoster?: number; rosterUpdatedAt: string | null };
}

export function monthOffset(period: string, delta: number): string {
  const [year, month] = period.split("-").map(Number);
  const index = year * 12 + month - 1 + delta;
  return Math.floor(index / 12) + "-" + String(index % 12 + 1).padStart(2, "0");
}
function latin(value: string): string {
  return value.replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632));
}
export function issuerKey(value: string): string {
  return value.trim().normalize("NFC").replace(/[يى]/g, "ی").replace(/ك/g, "ک");
}
function titleDate(title: string): string | null {
  const match = latin(title).match(/منتهی\s+به\s*(1[34]\d{2})[/-](\d{1,2})[/-](\d{1,2})/);
  return match ? [match[1], match[2].padStart(2, "0"), match[3].padStart(2, "0")].join("-") : null;
}
function documentRef(value: string) {
  const safe = approvedCodalUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  if (url.pathname.toLowerCase() !== "/reports/decision.aspx" || url.searchParams.get("let") !== "58") return null;
  const serial = url.searchParams.get("LetterSerial");
  if (!serial) return null;
  url.hash = "";
  return { serial, url: url.href, template: url.searchParams.get("rt") };
}
const nonSales = "الگوی گزارش ناشر مبلغ فروش محصول نیست";
const unknownEligibility = "شمول ناشر در گزارش فروش محصول مشخص نیست";
const periodError = "دوره یا هویت گزارش همخوان نیست";
const ambiguous = "نسخهٔ معتبر گزارش قابل تشخیص نیست";
const missing = "گزارش ماه موجود نیست";
// Exchange industry codes for extractive and manufacturing activities. Mixed or
// service industries need an actual product-sales filing to establish eligibility.
const productIndustries = new Set([10,13,14,17,19,20,21,22,23,25,26,27,28,29,31,32,34,38,42,43,44,49,53,54]);
const financialIndustries = new Set([56,57,58,66,67]);
function basis(row: SalesFiling): "sales" | "other" | "unknown" {
  if (row.measure === "sales") return "sales";
  if (row.measure) return "other";
  const template = documentRef(row.source_url)?.template;
  return template === "0" ? "sales" : "unknown";
}
function pub(row: SalesFiling) {
  return publishKey({ raw: { date_publish: row.publicationDate || undefined, time_publish: row.publicationTime || undefined } });
}

function selectPoint(period: string, filings: SalesFiling[], notices: SalesNotice[]): { point: SalesPoint | null; reason: string | null; unitReview?: UnitReview } {
  const fail = (reason: string) => ({ point: null, reason });
  const docs = new Map<string, SalesFiling>();
  for (const row of [...filings].sort((a,b) => Number(b.parser || 1) - Number(a.parser || 1))) {
    const ref = documentRef(row.source_url);
    if (!ref) return fail("سند گزارش قابل شناسایی نیست");
    const old = docs.get(ref.serial);
    const version = Number(row.parser || 1);
    if (!Number.isSafeInteger(version) || version < 1) return fail(ambiguous);
    if (old && Number(old.parser || 1) === version &&
      (old.amount !== row.amount || old.unit !== row.unit || old.reportPeriod !== row.reportPeriod || old.measure !== row.measure)) return fail(ambiguous);
    if (!old || version > Number(old.parser || 1) || (version === Number(old.parser || 1) && row.id > old.id)) docs.set(ref.serial, row);
  }
  const versions = [...docs.values()];
  const amendments = versions.filter(row => isAmendmentTitle(row.title));
  const candidates = amendments.length ? amendments : versions;
  const salesNotices = notices.filter(n => latin(n.report_code ?? "").trim() !== "ن-31");
  if (!versions.length && !salesNotices.length && notices.length) {
    return fail("فقط اطلاعیهٔ ن-۳۱ موجود است؛ فروش محصول برای این دوره احراز نشده است");
  }
  if (salesNotices.some(n => {
    const ref = documentRef(n.link);
    return (!ref || !docs.has(ref.serial)) && (!amendments.length || isAmendmentTitle(n.title));
  })) return fail("اطلاعیهٔ این دوره هنوز تطبیق و پردازش نشده است");
  if (!candidates.length) return fail(missing);
  let row = candidates[0];
  if (candidates.length > 1) {
    if (!amendments.length) return fail(ambiguous);
    const dated = candidates.map(filing => ({
      filing, day: validJalali(latin(filing.publicationDate ?? "").trim()),
    }));
    if (dated.some(entry => !entry.day)) return fail(ambiguous);
    dated.sort((a,b) => b.day!.localeCompare(a.day!));
    const latest = dated.filter(entry => entry.day === dated[0].day).map(entry => entry.filing);
    if (latest.length > 1) {
      if (latest.some(filing => !pub(filing))) return fail(ambiguous);
      latest.sort((a,b) => pub(b)!.localeCompare(pub(a)!));
      if (pub(latest[0]) === pub(latest[1])) return fail(ambiguous);
    }
    row = latest[0];
  }
  const nextMonthStart = jalaliYmdToGregorian(monthOffset(period, 1) + "-01");
  const endOfCalendarMonth = nextMonthStart ? new Date(Date.parse(nextMonthStart + "T00:00:00Z") - 86400000).toISOString().slice(0, 10) : null;
  const date = row.reportPeriod?.replaceAll("/", "-");
  if (!date || date.slice(0,7) !== period || titleDate(row.title) !== date || jalaliYmdToGregorian(date) !== row.storedPeriod ||
      issuerKey(row.reportSymbol || "") !== issuerKey(row.symbol) || Number(row.months) !== 1) return fail(periodError);
  if (row.storedPeriod !== endOfCalendarMonth) return fail("پایان دورهٔ سند (" + date + ") با پایان ماه انتخابی یکسان نیست");
  if (basis(row) !== "sales") return fail(nonSales);
  if (!isMillionRialUnit(row.unit)) {
    const rejected = fail("واحد مبلغ فروش قابل تطبیق نیست");
    const ref = documentRef(row.source_url);
    // Different explicit units require a separate analysis. Only legacy rows
    // with an absent declaration can enter source reconciliation.
    if (row.unit?.trim() || ref?.template !== "0" || Number(row.parser || 1) >= 3 ||
        !Number.isSafeInteger(row.amount) || row.amount! < 0) return rejected;
    return { ...rejected, unitReview: {
      reportId: row.id, symbol: issuerKey(row.symbol), periodEnd: date, sourceUrl: ref.url,
      amendment: isAmendmentTitle(row.title),
    } };
  }
  if (typeof row.amount !== "number" || !Number.isSafeInteger(row.amount) || row.amount < 0) return fail("مبلغ فروش همان ماه معتبر نیست");
  return { point: { period, amount: row.amount, unit: "میلیون ریال", sourceUrl: documentRef(row.source_url)!.url,
    publishedAt: pub(row) ?? row.publicationDate, capturedAt: row.captured_at, amendment: isAmendmentTitle(row.title), reportId: row.id }, reason: null };
}

function group<T extends {symbol:string}>(rows:T[], period:(row:T)=>string|null) {
  const groups = new Map<string,T[]>();
  for (const row of rows) {
    const key = issuerKey(row.symbol) + "|" + period(row);
    const list = groups.get(key);
    if (list) list.push(row); else groups.set(key,[row]);
  }
  return groups;
}
function periodOf(row: SalesFiling) {
  return titleDate(row.title)?.slice(0,7) ?? row.reportPeriod?.replaceAll("/", "-").slice(0,7);
}
export function salesHistory(period: string, symbol: string, filings: SalesFiling[], notices: SalesNotice[]) {
  const groups = group(filings,periodOf);
  const feed = group(notices,n=>titleDate(n.title)?.slice(0,7) ?? null);
  const points: SalesPoint[] = [];
  for (let i=-11;i<=0;i++) {
    const month = monthOffset(period,i);
    const key = issuerKey(symbol)+"|"+month;
    const {point} = selectPoint(month,groups.get(key) ?? [],feed.get(key) ?? []);
    if (point) points.push(point);
  }
  return {symbol,points};
}
export function monthlySalesScreen(period:string,minGrowth:number,roster:ScreenIssuer[],filings:SalesFiling[],notices:SalesNotice[],checkedAt:string,rosterUpdatedAt:string|null, universeKind:ScreenUniverse = "board"): MonthlySalesScreen {
  const previousPeriod = monthOffset(period,-12);
  const reports=group(filings,periodOf);
  const feed=group(notices,n=>titleDate(n.title)?.slice(0,7) ?? null);
  const board = new Set(roster.map(issuer => issuerKey(issuer.id)));
  if (board.has("") || board.size !== roster.length) throw new Error("Ambiguous stock roster");
  const reported = new Set([
    ...filings.filter(r => periodOf(r) === period).map(r => issuerKey(r.symbol)),
    ...notices.filter(r => titleDate(r.title)?.slice(0,7) === period).map(r => issuerKey(r.symbol)),
  ]);
  const outside = [...reported].filter(symbol => symbol && !board.has(symbol));
  const population: ScreenIssuer[] = universeKind === "board" ? roster : outside.map(id => ({id}));
  const universeSource = universeKind === "board"
    ? "نمادهای سهام در آخرین تابلوی ذخیره‌شده؛ شمول فروش با سند فروش محصول یا صنعت تولیدی و معدنی تعیین می‌شود."
    : "ناشران دارای گزارش یا اطلاعیهٔ ماهانهٔ ذخیره‌شده برای دورهٔ انتخابی که در آخرین تابلوی سهام دیده نشدند. وضعیت پذیرش این ناشران در بورس یا فرابورس نامشخص است.";
  const coverage: MonthlySalesScreen["coverage"] = {universe:population.length,eligible:0,calculable:0,passed:0,
    excluded:{},universeSource,rosterUpdatedAt,outsideRoster:outside.length};
  const rows:ScreenRow[]=[];
  for (const issuer of population) {
    const symbol=issuerKey(issuer.id);
    const records = (month:string)=>reports.get(symbol+"|"+month) ?? [];
    const noticesFor = (month:string)=>feed.get(symbol+"|"+month) ?? [];
    const currentRows=records(period), previousRows=records(previousPeriod);
    const basisRows = currentRows.length ? currentRows : previousRows;
    const declared = new Set(basisRows.map(basis).filter(x=>x!=="unknown"));
    const industry=issuer.industryId ?? -1;
    const saleNotice=[...noticesFor(period),...noticesFor(previousPeriod)].some(n=>documentRef(n.link)?.template==="0");
    const eligible = declared.size === 1 ? declared.has("sales") : declared.size === 0 && (saleNotice || productIndustries.has(industry));
    let reason: string|null=eligible ? null : (declared.has("other") || financialIndustries.has(industry) ? nonSales : unknownEligibility);
    const now=selectPoint(period,currentRows,noticesFor(period));
    const prior=selectPoint(previousPeriod,previousRows,noticesFor(previousPeriod));
    const current=now.point, previous=prior.point;
    let growth:number|null=null, passed:boolean|null=null;
    if (eligible) {
      coverage.eligible++;
      if (!current) reason="دورهٔ انتخابی: "+now.reason;
      else if (!previous) reason="ماه هم‌دورهٔ سال قبل: "+prior.reason;
      else if (!previous.amount) reason="فروش ماه هم‌دورهٔ سال قبل صفر است";
      else {
        growth=100*(current.amount-previous.amount)/previous.amount;
        passed=growth>=minGrowth;
        coverage.calculable++;
        if (passed) coverage.passed++;
      }
    }
    if (reason) coverage.excluded[reason]=(coverage.excluded[reason] ?? 0)+1;
    const unitReview = eligible ? [now.unitReview, prior.unitReview].filter((r): r is UnitReview => !!r) : [];
    rows.push({symbol,industry:issuer.industry ?? null,eligible,reason,current,previous,growth,passed,
      ...(unitReview.length ? {unitReview} : {})});
  }
  rows.sort((a,b)=> (b.growth ?? -Infinity)-(a.growth ?? -Infinity) || a.symbol.localeCompare(b.symbol,"fa"));
  return {period,previousPeriod,minGrowth,coverage,rows,checkedAt,universeKind};
}
