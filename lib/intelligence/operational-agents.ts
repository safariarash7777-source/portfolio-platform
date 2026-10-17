import { toMarket } from '../market-ir';
import { iranReadQuality, sourceTime, type IranFamily } from '../market-quality';

export type AgentStatus = 'ok' | 'stale' | 'failed' | 'unknown';
export interface AgentCheck { key: string; label: string; state: AgentStatus; detail: string; lastAt?: string | null }
export interface AgentRun {
  role: 'data_quality' | 'site_monitor' | 'coordinator';
  status: AgentStatus;
  report: { summary: string; checks: AgentCheck[]; actions: string[] };
}
const FAMILIES: Record<IranFamily, string> = { gold: 'طلا', currency: 'ارز', funds: 'صندوق‌ها', stocks: 'سهام', crypto: 'رمزارز', options: 'اختیار معامله', indices: 'شاخص‌ها' };
const HALF_HOUR = 30 * 60_000;
const CLOCK_SKEW_MS = 120_000; // Same tolerance as the canonical market reader.
function aggregate(checks: AgentCheck[]): AgentStatus {
  return checks.some(c => c.state === 'failed') ? 'failed' : checks.some(c => c.state === 'stale') ? 'stale' : checks.some(c => c.state === 'unknown') || !checks.length ? 'unknown' : 'ok';
}
function timestamp(value: unknown): number | null {
  const at = typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(at) && at > 0 && Number.isFinite(new Date(at).getTime()) ? at : null;
}
function clock(key: string, label: string, at: number | null, now: number, maxAge = HALF_HOUR): AgentCheck {
  const state: AgentStatus = at === null ? 'unknown' : at > now + CLOCK_SKEW_MS ? 'failed' : now - at >= maxAge ? 'stale' : 'ok';
  return { key, label, state, lastAt: at === null ? null : new Date(at).toISOString(), detail: state === 'unknown' ? 'زمان معتبر ثبت نشده است.' : state === 'failed' ? 'زمان ثبت‌شده در آینده است؛ اعتبار ساعت باید بررسی شود.' : state === 'stale' ? 'زمان ثبت‌شده از پنجره پایش قدیمی‌تر است.' : 'زمان ثبت‌شده در پنجره پایش قرار دارد.' };
}
function result(role: AgentRun['role'], checks: AgentCheck[], actions: string[], summary: string): AgentRun {
  return { role, status: aggregate(checks), report: { summary, checks: checks.slice(0, 100), actions: [...new Set(actions)].slice(0, 30) } };
}

/** No I/O, financial values, incoming prose, automatic remediation or market-session inference. */
export function buildDataQualityReport(input: { snapshot: unknown | null; snapshotUpdatedAt: string | null; codalStateAt: string | null }, now: number): AgentRun {
  if (timestamp(now) === null) return result('data_quality', [{ key: 'monitor_clock', label: 'ساعت پایش', state: 'failed', detail: 'ساعت اجرای پایش معتبر نیست.' }], ['ساعت اجرای پایش بررسی شود.'], 'پایش به دلیل ساعت نامعتبر قابل اتکا نیست.');
  const market = toMarket(input.snapshot), quality = iranReadQuality(input.snapshot === null ? null : market, now);
  const checks: AgentCheck[] = [clock('snapshot_storage', 'زمان ذخیره اسنپ‌شات', timestamp(input.snapshotUpdatedAt), now), clock('snapshot_receipt', 'زمان دریافت اسنپ‌شات', market.fetchedAt, now)];
  const actions: string[] = [];
  if (market.snapshotQuality?.attemptedAt !== undefined) checks.push(clock('snapshot_attempt', 'زمان تلاش دریافت', market.snapshotQuality.attemptedAt, now));
  checks.push({ key: 'snapshot_source', label: 'وضعیت گزارش‌شده دریافت', state: quality.snapshotState === 'error' ? 'failed' : quality.snapshotState === 'partial' ? 'stale' : quality.snapshotState === 'complete' ? 'ok' : 'unknown', detail: quality.snapshotState === 'error' ? 'رله خطای دریافت گزارش کرده است؛ علت از این پایش مشخص نیست.' : quality.snapshotState === 'partial' ? 'دریافت بخشی از خانواده‌ها کامل نبوده است؛ وضعیت هر بخش جدا بررسی شود.' : quality.snapshotState === 'complete' ? 'رله دریافت کامل گزارش کرده است؛ این وضعیت تازگی قیمت‌ها یا پوشش کامل بازار را ثابت نمی‌کند.' : 'وضعیت صریح دریافت موجود نیست.' });
  for (const [key, label] of Object.entries(FAMILIES) as [IranFamily, string][]) {
    const f = quality.families[key];
    const rawReceipt = market.snapshotQuality === undefined ? market.fetchedAt : market.snapshotQuality?.families[key]?.receivedAt ?? null;
    checks.push(clock(`${key}_receipt`, `دریافت ${label}`, rawReceipt, now));
    const rows = key === 'indices' ? market.indices ? [{ sourceDate: market.indices.date, sourceTime: market.indices.time }] : [] : market[key];
    const future = rows.some(row => { const at = sourceTime(row.sourceDate, row.sourceTime); return at !== null && at > now + CLOCK_SKEW_MS; });
    const state: AgentStatus = future ? 'failed' : f.retained || f.state === 'stale' ? 'stale' : f.state === 'ready' || f.state === 'empty' ? 'ok' : 'unknown';
    checks.push({ key: `${key}_source`, label: `زمان و کیفیت منبع ${label}`, state, lastAt: f.validAt === null ? null : new Date(f.validAt).toISOString(), detail: future ? 'زمان منبع در آینده است؛ تازگی تأیید نمی‌شود.' : f.retained ? 'نسخه قبلی حفظ شده است؛ دریافت تازه این بخش تأیید نمی‌شود.' : f.state === 'stale' ? 'زمان قیمت یا دریافت قدیمی است؛ این وضعیت به‌تنهایی شکست دریافت یا مشکل هنگام بسته بودن بازار را ثابت نمی‌کند.' : f.state === 'empty' ? 'پاسخ خالی صریح ثبت شده است؛ پوشش کامل بازار از آن نتیجه نمی‌شود.' : f.state === 'ready' ? 'زمان منبع و دریافت معتبر است؛ این بررسی فقط همین داده‌های موجود را پوشش می‌دهد.' : 'داده یا زمان معتبر منبع کافی نیست؛ از زمان دریافت برای ساختن زمان قیمت استفاده نشده است.' });
    if (f.rejectedRows) checks.push({ key: `${key}_rejected`, label: `اعتبار ساختار ${label}`, state: 'unknown', detail: `${f.rejectedRows} ردیف به دلیل ساختار نامعتبر پذیرفته نشده است.` });
  }
  checks.push(clock('commodity_receipt', 'دریافت کالاهای جهانی', market.commodityFetchedAt ?? null, now));
  checks.push({ key: 'commodity_source', label: 'وضعیت منبع کالاهای جهانی', state: market.commodityState === 'received' ? 'ok' : market.commodityState === 'stale' ? 'stale' : 'unknown', detail: market.commodityState === 'received' ? 'دریافت کالا ثبت شده است؛ زمان هر قیمت مستقل بررسی می‌شود.' : market.commodityState === 'stale' ? 'داده قبلی کالا حفظ شده است و تازه تلقی نمی‌شود.' : market.commodityState === 'disabled' ? 'دریافت کالا غیرفعال است؛ این وضعیت خرابی دریافت را اثبات نمی‌کند.' : 'دریافت معتبر کالا تأیید نشده است؛ علت مشخص نیست.' });
  const commodityClocks = (market.commodities ?? []).map(row => timestamp(row.timeUnix === null ? null : row.timeUnix * 1000));
  const commodityState: AgentStatus = commodityClocks.some(at => at !== null && at > now + CLOCK_SKEW_MS) ? 'failed' : !commodityClocks.length || commodityClocks.some(at => at === null) ? 'unknown' : commodityClocks.some(at => now - at! >= HALF_HOUR) ? 'stale' : 'ok';
  checks.push({ key: 'commodity_quotes', label: 'زمان قیمت کالاهای جهانی', state: commodityState, lastAt: commodityClocks.length && commodityClocks.every(at => at !== null) ? new Date(Math.min(...commodityClocks as number[])).toISOString() : null, detail: commodityState === 'failed' ? 'زمان قیمت کالا در آینده است.' : commodityState === 'unknown' ? 'زمان معتبر همه قیمت‌های کالا در دسترس نیست.' : commodityState === 'stale' ? 'قیمت کالا قدیمی است؛ دریافت تازه به معنی قیمت تازه نیست و تقویم معاملات باید جدا بررسی شود.' : 'زمان ثبت‌شده قیمت‌های موجود در پنجره پایش قرار دارد.' });
  // Match the research input gate and default collector cadence, not live-price cadence.
  const codal = clock('codal_heartbeat', 'ضربان پردازش کدال', timestamp(input.codalStateAt), now, 3 * 60 * 60_000);
  codal.detail += ' پنجره این کنترل سه ساعت است. این زمان فقط ضربان پردازش است و کامل بودن گزارش‌ها، صحت استخراج یا پوشش نمادها را اثبات نمی‌کند.';
  checks.push(codal);
  if (checks.some(c => c.state === 'failed')) actions.push('خطای صریح یا ساعت آینده بررسی شود؛ هیچ اصلاح خودکاری اجرا نشده است.');
  if (checks.some(c => c.state === 'stale')) actions.push('داده قدیمی حفظ شود؛ زمان منبع، دریافت و تقویم بازار جداگانه بررسی شوند.');
  if (checks.some(c => c.state === 'unknown')) actions.push('برای بخش‌های نامشخص، شاهد زمان و پوشش داده تکمیل شود.');
  return result('data_quality', checks, actions, 'پایش قطعی زمان دریافت، زمان منبع و کیفیت داده ذخیره‌شده؛ بدون تغییر داده یا اعلام پوشش کامل بازار.');
}

/** Summarizes bounded status only; untrusted child report prose never propagates. */
export function buildCoordinatorReport(data: AgentRun, technical: AgentRun): AgentRun {
  const checks = ([['data_quality', data, 'پایش کیفیت داده'], ['site_monitor', technical, 'پایش فنی سایت']] as const).map(([role, run, label]): AgentCheck => {
    const valid = run?.role === role && ['ok', 'stale', 'failed', 'unknown'].includes(run.status) && Array.isArray(run.report?.checks) && run.report.checks.length > 0 && run.report.checks.length <= 100;
    const childrenValid = valid && run.report.checks.every(c => c && ['ok', 'stale', 'failed', 'unknown'].includes(c.state));
    const computed = childrenValid ? aggregate(run.report.checks) : 'unknown';
    const state = childrenValid ? aggregate([{ key: '', label: '', detail: '', state: run.status }, { key: '', label: '', detail: '', state: computed }]) : 'unknown';
    return { key: role, label, state, detail: state === 'failed' ? 'شکست یا شاهد نامعتبر نیازمند بررسی است.' : state === 'stale' ? 'شاهد قدیمی یا داده حفظ‌شده وجود دارد؛ علت دریافت باید جدا بررسی شود.' : state === 'unknown' ? 'گزارش معتبر و کافی برای جمع‌بندی موجود نیست.' : 'کنترل‌های گزارش‌شده موفق‌اند؛ این وضعیت فراتر از دامنه همان کنترل‌ها را اثبات نمی‌کند.' };
  });
  const actions: string[] = [];
  if (checks.some(c => c.state === 'failed')) actions.push('ابتدا شکست‌های گزارش‌شده توسط مسئول فنی بررسی شوند.');
  if (checks.some(c => c.state === 'stale')) actions.push('شاهد قدیمی و داده حفظ‌شده با وضعیت منبع و تقویم بازار تطبیق داده شوند.');
  if (checks.some(c => c.state === 'unknown')) actions.push('شواهد ناقص تکمیل شوند؛ وضعیت نامشخص موفق تلقی نشود.');
  return result('coordinator', checks, actions, 'جمع‌بندی دو گزارش پایش برای بازبینی انسانی؛ هیچ تغییر، انتشار یا اقدام خودکاری انجام نشده است.');
}
