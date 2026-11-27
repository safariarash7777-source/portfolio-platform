// موتور کشف اطلاعیهٔ کدال — نسخهٔ ۳ («فید سراسری + بک‌فیل اولویت‌دار»)
//
// چرا v3: نسخهٔ قبلی نمادبه‌نماد (env-list ثابت، ۲۷ نماد) بود؛ برای رسیدن به
// «همهٔ نمادها» مقیاس نمی‌گیرد (سهمیهٔ BrsApi و زمان چرخه). راه‌حل دومسیره:
//
//   مسیر ۱ — فید سراسری (firehose): Announcement.php بدون l18 جدیدترین
//   اطلاعیه‌های کل بازار را می‌دهد (۲۰تایی در صفحه). با نگه‌داشتن واترمارک
//   (date_send+link آخرین اطلاعیهٔ دیده‌شده) در هر چرخه فقط چند صفحه
//   می‌خوانیم و «هر گزارش جدیدِ هر نمادی» را بلافاصله می‌گیریم.
//   هزینه: ~۶ درخواست در چرخه ≈ ۵۰ در روز.
//
//   مسیر ۲ — تطبیق چرخشی همه شرکت‌های اسنپ‌شات؛ تعداد ردیف قدیمی معیار
//   تازگی نیست. ترتیب مستقل از ارزش معاملات و سقف هر چرخه ثابت می‌ماند.
//
// وضعیت موتور (واترمارک، مکان‌نمای بک‌فیل، دفتر خطاها) در Supabase ذخیره
// می‌شود (ir_market_snapshots key='codal_engine_state') تا با ری‌استارت یا
// دیپلوی از بین نرود.
//
// دفتر خطا (failure ledger): اطلاعیه‌ای که ۳ بار پارس/دانلودش شکست بخورد
// (مثل صورت‌های مالی بانک‌ها که ساختار متفاوت دارند) کنار گذاشته می‌شود تا
// سهمیه و زمان چرخه هدر نرود. اصلاح خواننده با کلید نسخه یک تلاش محدود دارد.
// ─────────────────────────────────────────────────────────────────────────────
import {
  classifyAnnouncement, fetchAnnouncementsPage, fetchOfficialMonthlyPage, downloadAndParse,
  insertParsedReport, existingUrlsFor, faToEn, codalEnv, monthlySectorProfile, monthlyWorkbookType,
  jalaliYmdToGregorian, metaFromAnnouncement, isIndustrialMonthlyWorkbook, readIndustrialMonthlyDecision, readSupplementalMonthlyDecision,
  PARSER_VERSION, MONTHLY_PERIOD_REPAIR_VERSION,
} from "./codal.mjs";
import { backgroundWorkWindow } from "./background-work-window.mjs";
import { companyUniverse } from "./codal-coverage.mjs";
import { isBrsBudgetDeferral, isBrsLocalDeferral as isBrsDeferred } from "./brsapi-policy.mjs";
import { codalAccess, isCodalSourceDeferred } from './codal-source-access.mjs';
const isBrsLocalDeferral = error => isBrsDeferred(error) || isBrsBudgetDeferral(error) || isCodalSourceDeferred(error);
// Fixed fields for the authenticated debug read and the sanitized ops receipt.
function noteDeferral(error, phase) {
  const reason = isBrsDeferred(error) ? "local_transport" :
    isBrsBudgetDeferral(error) ? "internal_budget" :
    isCodalSourceDeferred(error) ? "official_source_hold" : null;
  if (reason && !engineStatus.lastDeferral) engineStatus.lastDeferral = { phase, reason };
}

function recordRejectedFiling(a, kind, event) {
  recordAdmissionRejection(state.admissionDiagnostics, kind, event);
  // Public Codal identifier only, in authenticated /debug. The Actions
  // receipt intentionally does not copy this list or any announcement text.
  const recent = engineStatus.lastRejectedFilings;
  if (!event || recent.length >= 8 || !supportsDecisionUrl(a.link)) return;
  try {
    const pair = new URL(a.link).search.slice(1).split("&").find(x => x.startsWith("LetterSerial="));
    const serial = decodeURIComponent(pair.slice("LetterSerial=".length));
    if (!/^[A-Za-z0-9_+/-]{8,80}={0,2}$/.test(serial)) return;
    if (!recent.some(x => x.serial === serial && x.kind === kind && x.reason === event.reason)) {
      recent.push({ serial, kind, reason: event.reason });
    }
  } catch { /* Diagnostic only: never change report acceptance or retry. */ }
}

import { admissionCounts, admissionEvent, readAdmissionDiagnostics, recordAdmissionRejection } from "./codal-admission-diagnostics.mjs";
import { monthlyDecisionTypeWithoutWorkbook, supportsDecisionUrl } from "./codal-statement-source.mjs";
import { canonicalMarketSymbol, readStoredAnnouncements, recentMonthlyBounds, validStoredCursor,
  verifiedMonthlyDiscovery } from "./codal-stored-feed.mjs";

const { BRSAPI_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = codalEnv;

// تنظیمات (env-پذیر، پیش‌فرض محافظه‌کار)
const FEED_MAX_PAGES = Number(process.env.CODAL_FEED_PAGES || 6);      // سقف صفحات فید در هر چرخه
const FEED_MAX_DL = Number(process.env.CODAL_FEED_DL || 10);           // سقف دانلود اکسل فید در هر چرخه
const BACKFILL_PER_CYCLE = Number(process.env.CODAL_BACKFILL_SYMBOLS || 2); // نماد بک‌فیل در هر چرخه
const BACKFILL_MAX_DL = Number(process.env.CODAL_BACKFILL_DL || 6);    // سقف دانلود هر نماد بک‌فیل
const MAX_FAILS = 3;                                                    // بعد از این تعداد شکست، اطلاعیه بلاک می‌شود
const LEDGER_CAP = 600;                                                 // سقف دفتر خطا (قدیمی‌ها حذف می‌شوند)
const INTERIM_RECENT_MS = 35 * 24 * 60 * 60 * 1000;
const INTERIM_MAX_DL = Math.max(0, Math.min(2, FEED_MAX_DL - 1));
const recoveryCounts = () => ({ scanned: 0, downloaded: 0, inserted: 0, parseFailed: 0, blocked: 0, skippedKnown: 0, metadataSkipped: 0, reachedEnd: false });

// Fixed-cardinality, content-free counters. They describe observed failures,
// not a classification of historical ledger entries or an extraction fix.
const failureCounts = () => ({
  download: { exception: 0 },
  admission: { rejected: 0, exception: 0 },
  persistence: { exception: 0 },
});
function readFailureCounts(value) {
  const clean = failureCounts();
  for (const [stage, reasons] of Object.entries(clean)) {
    for (const reason of Object.keys(reasons)) {
      const count = value?.[stage]?.[reason];
      if (Number.isSafeInteger(count) && count >= 0) clean[stage][reason] = count;
    }
  }
  return clean;
}
function readFailureDiagnostics(value) {
  return { version: 1,
    totals: readFailureCounts(value?.version === 1 ? value.totals : null),
    lastCycle: readFailureCounts(value?.version === 1 ? value.lastCycle : null),
  };
}
function recordFailureDiagnostic(stage, reason) {
  for (const counts of [state.failureDiagnostics.totals, state.failureDiagnostics.lastCycle]) {
    counts[stage][reason] = Math.min(Number.MAX_SAFE_INTEGER, counts[stage][reason] + 1);
  }
}

const SB_HDRS = () => ({
  "Content-Type": "application/json",
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
});

// وضعیت تشخیصی برای /debug
export const engineStatus = {
  mode: "v3",
  reportScope: null,
  ok: false,
  lastRun: 0,
  lastError: null,
  feed: { pages: 0, seen: 0, matched: 0, downloaded: 0, interimDownloads: 0, inserted: 0, parseFailed: 0, watermark: null, complete: false, incompleteReason: null },
  // codal_feed has no publish_time/raw column; only date_publish can be stored here.
  feedTable: { attempted: 0, inserted: 0, duplicates: 0, lastError: null, publishTimeStored: false },
  backfill: { cursor: 0, queueSize: 0, symbols: [], inserted: 0, downloaded: 0, parseFailed: 0, skippedCovered: 0, coverageBasis: "snapshot-universe-not-freshness" },
  storedRecovery: recoveryCounts(),
  recentMonthlyRecovery: { ...recoveryCounts(), active: false, readFailed: false },
  officialMonthlyDiscovery: { pages:0, matched:0, inserted:0, nextPage:null, failed:false },
  officialMonthlyRepair: { attempted:0, inserted:0, failed:false },
  interimRecovery: recoveryCounts(),
  ledgerSize: 0,
  failureDiagnostics: readFailureDiagnostics(),
  admissionDiagnostics: readAdmissionDiagnostics(),
  lastDeferral: null,
  lastRejectedFilings: [],
};

/* ── وضعیت پایدار در Supabase ──────────────────────────────────────────────── */
const STATE_KEY = "codal_engine_state";
const ISSUER_RATE_LIMIT_HOLD_MS = 60 * 60 * 1000;
let state = null; // { watermark: {key, links}, backfillCursor, fails: {url: n} }

async function loadState() {
  if (state) return state;
  const qs = new URLSearchParams({ select: "payload", key: `eq.${STATE_KEY}`, limit: "1" });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ir_market_snapshots?${qs}`, {
    headers: SB_HDRS(), signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`state load HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length > 1 || (rows.length &&
      (!rows[0]?.payload || typeof rows[0].payload !== "object" || Array.isArray(rows[0].payload)))) {
    throw new Error("state load invalid schema");
  }
  const payload = rows[0]?.payload ?? {};
  payload.storedFeedCursor ??= null;
  if(!validStoredCursor(payload.storedFeedCursor))throw new Error('stored feed cursor invalid');
  for (const mark of [payload.watermark, payload.metadataWatermark]) {
    if (mark != null && (!Number.isSafeInteger(mark.key) || mark.key <= 0 ||
        !Array.isArray(mark.links) || !mark.links.every(l => typeof l === "string"))) {
      throw new Error("state watermark invalid schema");
    }
  }
  if (!validStoredCursor(payload.monthlyRecoveryCursor ?? null)) throw new Error('monthly recovery cursor invalid');
  if (!validStoredCursor(payload.recentMonthlyRecoveryCursor ?? null)) throw new Error('recent monthly recovery cursor invalid');
  const officialPage=payload.officialMonthlyNextPage??2;
  if(!Number.isSafeInteger(officialPage)||officialPage<2||officialPage>10000)throw new Error('official monthly page invalid');
  if (!validStoredCursor(payload.interimRecoveryCursor ?? null)) throw new Error('interim recovery cursor invalid');
  if ((payload.backfillCursor != null && (!Number.isInteger(payload.backfillCursor) || payload.backfillCursor < 0)) ||
      (payload.fails != null && (typeof payload.fails !== "object" || Array.isArray(payload.fails) ||
       Object.values(payload.fails).some(n => !Number.isInteger(n) || n < 0)))) {
    throw new Error("state cursor/ledger invalid schema");
  }
  payload.decisionStatementV1Attempts ??= {};
  payload.interimStatementV1Attempts ??= {};
  payload.auditedStatementV1Attempts ??= {};
  if (typeof payload.auditedStatementV1Attempts !== 'object' || Array.isArray(payload.auditedStatementV1Attempts) ||
      Object.entries(payload.auditedStatementV1Attempts).some(([url,n]) => url.length>4096 || n!==1)) {
    throw new Error('audited statement retry ledger invalid schema');
  }
  if (typeof payload.interimStatementV1Attempts !== 'object' || Array.isArray(payload.interimStatementV1Attempts) ||
      Object.entries(payload.interimStatementV1Attempts).some(([url,n]) => url.length>4096 || n!==1)) {
    throw new Error('interim statement retry ledger invalid schema');
  }
  if (typeof payload.decisionStatementV1Attempts !== 'object' || Array.isArray(payload.decisionStatementV1Attempts) ||
      Object.entries(payload.decisionStatementV1Attempts).some(([url,n]) => url.length>4096 || n!==1)) {
    throw new Error('statement retry ledger invalid schema');
  }
  codalAccess.restore(payload.sourceHoldUntil);
  state = payload;
  state.watermark ??= null;
  state.backfillCursor ??= 0;
  if (!Number.isSafeInteger(state.issuerBackfillHoldUntil) || state.issuerBackfillHoldUntil < 0) {
    state.issuerBackfillHoldUntil = 0;
  }
  state.fails ??= {};
  // Older payloads have no diagnostics; unknown/malformed fields never reach
  // debug output or the next persisted diagnostic object.
  state.failureDiagnostics = readFailureDiagnostics(payload.failureDiagnostics);
  engineStatus.failureDiagnostics = state.failureDiagnostics;
  state.admissionDiagnostics = readAdmissionDiagnostics(payload.admissionDiagnostics);
  engineStatus.admissionDiagnostics = state.admissionDiagnostics;
  return state;
}

async function saveState() {
  if (!state) return;
  state.sourceHoldUntil = codalAccess.snapshot();
  // دفتر خطا را جمع‌وجور نگه می‌داریم
  const entries = Object.entries(state.fails);
  if (entries.length > LEDGER_CAP) {
    state.fails = Object.fromEntries(entries.slice(entries.length - LEDGER_CAP));
  }
  const statementAttempts = Object.entries(state.decisionStatementV1Attempts);
  const interimAttempts = Object.entries(state.interimStatementV1Attempts);
  const auditedAttempts = Object.entries(state.auditedStatementV1Attempts);
  if (auditedAttempts.length > LEDGER_CAP) state.auditedStatementV1Attempts = Object.fromEntries(auditedAttempts.slice(-LEDGER_CAP));
  if (interimAttempts.length > LEDGER_CAP) state.interimStatementV1Attempts = Object.fromEntries(interimAttempts.slice(-LEDGER_CAP));
  if (statementAttempts.length > LEDGER_CAP) state.decisionStatementV1Attempts = Object.fromEntries(statementAttempts.slice(-LEDGER_CAP));
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ir_market_snapshots?on_conflict=key`, {
      method: "POST",
      headers: { ...SB_HDRS(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ key: STATE_KEY, payload: state, updated_at: new Date().toISOString() }]),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`state save HTTP ${res.status}`);
  } catch (e) {
    console.error("codal-engine state save:", e?.message ?? e);
    throw e;
  }
}

/* ── ابزار واترمارک ────────────────────────────────────────────────────────── */
// کلید ترتیب اطلاعیه: تاریخ/ساعت ارسال (جلالی متنی) به‌صورت عدد قابل مقایسه.
export function sentKey(a) {
  const d = faToEn(String(a.date_send || ""));
  const t = faToEn(String(a.time_send || ""));
  const dm = d.trim().match(/^(1[34]\d{2})\/(\d{1,2})\/(\d{1,2})$/);
  const tm = t.trim().match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!dm || +dm[2] < 1 || +dm[2] > 12 || +dm[3] < 1 || +dm[3] > 31 ||
      (t && !tm) || (tm && (+tm[1] > 23 || +tm[2] > 59 || +(tm[3] || 0) > 59))) return 0;
  const pad = (x) => String(x).padStart(2, "0");
  return Number(
    `${dm[1]}${pad(dm[2])}${pad(dm[3])}${tm ? pad(tm[1]) + pad(tm[2]) + pad(tm[3] || 0) : "000000"}`
  );
}

function recentInterim(a, { startDay, endDay, symbols }) {
  if (!a || !symbols.has(canonicalMarketSymbol(a.l18)) || classifyAnnouncement(a) !== "ن-۱۰") return false;
  const { period_end, period_months } = metaFromAnnouncement(a, "ن-۱۰");
  if (!period_end || ![3, 6, 9].includes(period_months)) return false;
  const key = String(sentKey(a));
  if (key.length !== 14) return false;
  const sentDate = jalaliYmdToGregorian(key.slice(0, 4), key.slice(4, 6), key.slice(6, 8));
  return sentDate >= startDay && sentDate <= endDay;
}

const interimEligible = (url, kind, announcement) => kind === 'ن-۱۰' && supportsDecisionUrl(url) && /تلفیقی/.test(String(announcement?.title || ''));
const auditedEligible = (url, kind, announcement) => interimEligible(url,kind,announcement) && /حسابرسی\s+شده/.test(String(announcement?.title || ''));
const failureKey = (url, kind, announcement) => kind === "ن-۳۰" && monthlySectorProfile(announcement)
  ? `monthly-sector-v1:${url}` : url;
const monthlyRetryPrefixes = new Map([
  ['6','monthly-premium-decision-v1'], ['5','monthly-service-decision-v1'], ['0','monthly-industrial-v1'], ['1','monthly-real-estate-v1'],
  ['8','monthly-decision-symbol-v1'], ['9','monthly-decision-symbol-v1'],
]);
function monthlyRetryKey(url, kind, announcement) {
  if (kind !== "ن-۳۰") return null;
  const prefix=monthlyRetryPrefixes.get(monthlyWorkbookType(announcement));
  return prefix ? `${prefix}:${url}` : null;
}
// Failed industrial workbooks can have a complete, independently dated official
// decision table. Use one existing replay slot for that different document.
function supplementalReplayKey(link) {
  const type=new URL(link).searchParams.get('rt');
  const previous=monthlyRetryPrefixes.get(type);
  const adapter={'0':'monthly-industrial-decision-v1','1':'monthly-estate-decision-v2','9':'monthly-financing-compacted-v2'}[type];
  return adapter && state.fails[previous+':'+link] ? adapter+':'+link : null;
}
function pendingMonthlyReplayLinks() {
  const links=new Set();
  for(const [key,count] of Object.entries(state.fails).reverse()){
    const link=key.replace(/^monthly-sector-v1:/,'');
    if(!count||link.length>240||!supportsDecisionUrl(link))continue;
    const query=new URL(link).searchParams;
    const prefix=monthlyRetryPrefixes.get(query.get('rt'));
    const keyForReplay=supplementalReplayKey(link) || prefix+':'+link;
    if(query.get('let')!=='58'||!prefix||state.fails[keyForReplay])continue;
    links.add(link);
    if(links.size===20)break;
  }
  return [...links];
}
function recordFail(url, kind, announcement, replay=false) {
  const key = failureKey(url, kind, announcement);
  state.fails[key] = (state.fails[key] || 0) + 1;
  const monthlyRetry=monthlyRetryKey(url,kind,announcement);
  if(monthlyRetry&&(replay||(!["5","6"].includes(monthlyWorkbookType(announcement)) && state.fails[key]>=MAX_FAILS)))state.fails[monthlyRetry]=1;
  if (kind === 'ن-۱۰' && supportsDecisionUrl(url)) state.decisionStatementV1Attempts[url] = 1;
  if (interimEligible(url,kind,announcement)) state.interimStatementV1Attempts[url] = 1;
  if (auditedEligible(url,kind,announcement)) state.auditedStatementV1Attempts[url] = 1;
  return state.fails[key];
}
function clearFailure(a, kind) {
  delete state.fails[a.link];
  delete state.fails[failureKey(a.link, kind, a)];
  const monthlyRetry=monthlyRetryKey(a.link,kind,a);
  if(monthlyRetry)delete state.fails[monthlyRetry];
}
// One bounded attempt for previously blocked official N10 reports now supported
// by the new adapter. Preserve old failure counts and all existing cycle limits.
function isBlocked(url,kind,announcement) {
  if((state.fails[failureKey(url,kind,announcement)]||0)<MAX_FAILS)return false;
  const monthlyRetry=monthlyRetryKey(url,kind,announcement);
  if(monthlyRetry && !["5","6"].includes(monthlyWorkbookType(announcement)) && !state.fails[monthlyRetry])return false;
  return !(kind==='ن-۱۰'&&supportsDecisionUrl(url)&&!state.decisionStatementV1Attempts[url]) &&
    !(interimEligible(url,kind,announcement)&&!state.interimStatementV1Attempts[url]) &&
    !(auditedEligible(url,kind,announcement)&&!state.auditedStatementV1Attempts[url]);
}

/* ── مسیر ۱: فید سراسری ────────────────────────────────────────────────────── */
/** دستهٔ اطلاعیه برای فیلتر صفحهٔ /codal (M4) — فقط از کد/عنوان رسمی خود اطلاعیه. */
export function feedCategory(a) {
  const code = String(a?.code || "");
  const title = String(a?.title || "");
  if (code.includes("ن-۳۰") || title.includes("گزارش فعالیت ماهانه")) return "ماهانه";
  if (
    code.includes("ن-۱۰") || title.includes("صورت‌های مالی") ||
    title.includes("صورتهای مالی") || title.includes("صورت های مالی")
  ) return "صورت مالی";
  if (code.includes("ن-۲۰") || title.includes("شفاف سازی") || title.includes("شفاف‌سازی")) return "شفاف‌سازی";
  if (code.includes("ن-۴") || title.includes("مجمع")) return "مجمع";
  return "سایر";
}

/**
 * M4: درج متادیتای اطلاعیه‌های تازهٔ چرخه در codal_feed (append-only، dedup با link unique).
 * تکراری‌ها با Prefer: resolution=ignore-duplicates بی‌صدا رد می‌شوند.
 * Failed/unknown writes must propagate so the watermark cannot acknowledge them.
 */
async function pushFeedRows(items) {
  const st = engineStatus.feedTable;
  if (!items.length) return;
  const rows = items
    .map((a) => ({
      symbol: String(a.l18 || "").trim() || "نامشخص",
      company_name: a.l30 || null,
      title: String(a.title || "").trim() || "(بدون عنوان)",
      report_code: a.code || null,
      category: feedCategory(a),
      sent_date: a.date_send || null,
      sent_time: a.time_send || null,
      publish_date: a.date_publish || null,
      link: a.link,
      link_pdf: a.link_pdf || null,
      link_excel: a.link_excel || null,
    }))
    .filter((r) => r.link);
  if (!rows.length) return;
  st.attempted += rows.length;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/codal_feed?on_conflict=link&select=link`, {
      method: "POST",
      headers: { ...SB_HDRS(), Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`codal_feed HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
    const inserted = await res.json();
    const links = new Set(rows.map(r => r.link));
    if (!Array.isArray(inserted) || inserted.length > rows.length ||
        inserted.some(r => !r || !links.has(r.link)) || new Set(inserted.map(r => r.link)).size !== inserted.length) {
      throw new Error("codal_feed insert invalid schema");
    }
    st.inserted += inserted.length;
    st.duplicates += rows.length - inserted.length;
    st.lastError = null;
  } catch (e) {
    st.lastError = String(e?.message ?? e);
    console.error("codal_feed push:", st.lastError);
    throw e;
  }
}

function providerRefusalReason(error) {
  if (error?.status === 429) return "provider_rate_limited";
  if (error?.status === 403) return "provider_forbidden";
  return null;
}

function holdIssuerBackfill() {
  state.issuerBackfillHoldUntil = Math.max(state.issuerBackfillHoldUntil, Date.now() + ISSUER_RATE_LIMIT_HOLD_MS);
  engineStatus.backfill.holdUntil = state.issuerBackfillHoldUntil;
}

/** یک صفحه با یک تلاش مجدد — BrsApi گاه اتصال را گذرا قطع می‌کند. */
async function fetchPageWithRetry(params) {
  try { return await fetchAnnouncementsPage(params); }
  catch (e) {
    if (providerRefusalReason(e) || e?.noRetry === true || e?.name === "AnnouncementSchemaError" || isBrsLocalDeferral(e)) throw e;
    await new Promise((r) => setTimeout(r, 4000));
    return await fetchAnnouncementsPage(params);
  }
}

async function pollGlobalFeed({ metadataOnly = false, monthlyOnly = false, interimWindow = null, monthlyAttempts = null, recoveryReserve = 0 } = {}) {
  const st = engineStatus.feed;
  st.pages = 0; st.seen = 0; st.matched = 0; st.downloaded = 0; st.interimDownloads = 0; st.inserted = 0; st.parseFailed = 0;
  st.complete = false; st.incompleteReason = "page_limit";
  st.watermark = state.watermark?.key ?? null;

  const wm = metadataOnly ? state.metadataWatermark ?? state.watermark : state.watermark;
  const newestSeen = { key: 0, links: [] };
  const candidates = [];
  const feedItems = []; // M4: متادیتای همهٔ اطلاعیه‌های تازه، نه فقط ن-۱۰/ن-۳۰
  let previousKey = Infinity;
  let pageFailure = null;
  let unverifiedOrder = false;
  const seenLinks = new Set();

  outer:
  for (let page = 1; page <= FEED_MAX_PAGES; page++) {
    let items;
    try { items = await fetchPageWithRetry({ page, purpose: "current" }); }
    catch (error) {
      const deferred = isBrsLocalDeferral(error);
      if (deferred) noteDeferral(error, "announcement_search");
      st.incompleteReason = deferred ? "local_deferred" : (providerRefusalReason(error) ?? "feed_failure");
      pageFailure = error;
      break;
    }
    st.pages = page;
    if (!items.length) {
      if (!unverifiedOrder) { st.complete = true; st.incompleteReason = null; }
      break;
    }
    let passedWatermark = false;
    for (const a of items) {
      st.seen++;
      const k = sentKey(a);
      const validIdentity = k > 0 && typeof a.link === "string" && !!a.link.trim();
      if (!validIdentity || k > previousKey) {
        unverifiedOrder = true;
        st.incompleteReason = "invalid_order_or_identity";
        if (!monthlyOnly) break outer;
        if (!validIdentity) continue;
      }
      previousKey = k;
      // Only an older timestamp proves the same-time group is exhausted.
      if (wm && k < wm.key) {
        if (!monthlyOnly) { st.complete = true; st.incompleteReason = null; break outer; }
        passedWatermark = true;
        continue;
      }
      if (wm && k === wm.key && wm.links.includes(a.link)) continue;
      if (seenLinks.has(a.link)) continue;
      seenLinks.add(a.link);
      if (k > newestSeen.key) { newestSeen.key = k; newestSeen.links = [a.link]; }
      else if (k === newestSeen.key) newestSeen.links.push(a.link);
      if (a.link) feedItems.push(a); // M4
      const kind = classifyAnnouncement(a);
      if (monthlyOnly && kind !== "ن-۳۰" &&
          !(interimWindow && recentInterim(a, interimWindow))) continue;
      if (!kind || !a.link || (!a.link_excel &&
            !(kind === "ن-۳۰" && monthlyDecisionTypeWithoutWorkbook(a.link, a.link_excel) !== null))) continue;
      st.matched++;
      candidates.push({ a, kind, k });
    }
    // A monthly page can contain a newer valid row after one older than the
    // checkpoint. Inspect the page before deciding that discovery caught up.
    if (passedWatermark && !unverifiedOrder) { st.complete = true; st.incompleteReason = null; break; }
  }

  // M4: فید عمومی کدال — متادیتا قبل از دانلودها درج می‌شود تا فید عقب نماند
  try { await pushFeedRows(feedItems); }
  catch (e) { st.complete = false; st.incompleteReason = "feed_write_failure"; throw e; }

  const discoveryComplete = st.complete;
  const metadataMark = state.metadataWatermark ?? state.watermark;
  if (st.complete && newestSeen.key > 0 && (!metadataMark || newestSeen.key >= metadataMark.key)) {
    state.metadataWatermark = { key: newestSeen.key, links: [...new Set([
      ...newestSeen.links, ...(newestSeen.key === metadataMark?.key ? metadataMark.links : []),
    ])] };
  }
  // Keep discovered metadata on a later-page failure, without advancing the watermark.
  if (pageFailure) throw pageFailure;
  if (metadataOnly) {
    st.complete = false;
    st.incompleteReason ??= "local_deferred";
    return;
  }

  // دانلود و درج (جدیدترین‌ها اول)
  if (monthlyOnly) candidates.sort((a, b) => b.k - a.k);
  let dl = 0;
  for (const { a, kind } of candidates) {
    // dedup با ردیف‌های موجودِ همان نماد
    const known = await existingUrlsFor(a.l18);
    if (known.has(a.link)) { clearFailure(a, kind); continue; }
    if (isBlocked(a.link, kind, a)) { st.complete = false; st.incompleteReason = "blocked_report"; continue; }
    if (dl >= FEED_MAX_DL - recoveryReserve) { st.complete = false; st.incompleteReason = "download_limit"; break; }
    if (interimWindow && (kind === "ن-۱۰" ? st.interimDownloads >= INTERIM_MAX_DL : dl - st.interimDownloads >= FEED_MAX_DL - INTERIM_MAX_DL)) {
      st.complete = false; st.incompleteReason = "download_limit";
      continue;
    }
    if (kind === "ن-۱۰") st.interimDownloads++;
    else monthlyAttempts?.add(a.link);
    dl++;
    st.downloaded = dl;
    let stage = "download";
    let rejection = null;
    try {
      const data = await downloadAndParse(a, kind, () => { stage = "admission"; },
        event => { rejection ??= admissionEvent(event, kind); });
      if (data) {
        stage = "persistence";
        st.inserted += await insertParsedReport(a, kind, data);
        clearFailure(a, kind);
      } else {
        recordFailureDiagnostic("admission", "rejected");
        recordRejectedFiling(a, kind, rejection);
        st.parseFailed++;
        recordFail(a.link, kind, a);
        st.complete = false; st.incompleteReason = "report_failure";
      }
    } catch (e) {
      if (isBrsLocalDeferral(e)) {
        noteDeferral(e, "feed_report");
        st.complete = false; st.incompleteReason = 'local_deferred';
        throw e;
      }
      recordFailureDiagnostic(stage, "exception");
      st.parseFailed++;
      recordFail(a.link, kind, a);
      st.complete = false; st.incompleteReason = "report_failure";
      console.error(`codal-engine report failure: ${stage}/exception`);
    }
  }

  // واترمارک فقط وقتی جلو می‌رود که چرخه سالم تمام شده باشد
  if ((st.complete || monthlyOnly && discoveryComplete) && newestSeen.key > 0 && (!wm || newestSeen.key >= wm.key)) {
    if (wm && newestSeen.key === wm.key) newestSeen.links.push(...wm.links);
    newestSeen.links = [...new Set(newestSeen.links)];
    state.watermark = newestSeen;
  }
  st.watermark = state.watermark?.key ?? null;
}

/* ── مسیر ۲: بک‌فیل اولویت‌دار ──────────────────────────────────────────────── */
async function allCompanySymbols() {
  // All ordinary issuers present in the stock snapshot, including zero turnover.
  const qs = new URLSearchParams({ select: "payload", key: "eq.latest", limit: "1" });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ir_market_snapshots?${qs}`, {
    headers: SB_HDRS(), signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`market snapshot HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length > 1 || (rows.length && !Array.isArray(rows[0]?.payload?.stocks))) {
    throw new Error("market snapshot invalid schema");
  }
  const stocks = rows[0]?.payload?.stocks ?? [];
  return companyUniverse(stocks);
}

async function reconcileOfficialMonthly(bounds,loadCompanies) {
  const status=engineStatus.officialMonthlyDiscovery;
  let conflict = null;
  const symbols=new Map();
  for(const name of await loadCompanies()){
    const key=canonicalMarketSymbol(name);
    if(!symbols.has(key))symbols.set(key,name);
    else if(symbols.get(key)!==name)symbols.set(key,null);
  }
  if(!symbols.size)return;
  // Check for new publications first, then sweep seven older pages at most.
  // The official search client still paces each request and owns cooldowns.
  let page=1;
  for(let i=0;i<8;i++){
    codalAccess.check();
    const official=await fetchOfficialMonthlyPage(page,bounds.since);
    status.pages++;
    const matched=new Map();
    for(const candidate of official){
      const entry=verifiedMonthlyDiscovery(candidate,bounds,symbols);
      if(entry)matched.set(entry.link,entry);
    }
    status.matched+=matched.size;
    const insertedBefore=engineStatus.feedTable.inserted;
    await pushFeedRows([...matched.values()]);
    status.inserted+=engineStatus.feedTable.inserted-insertedBefore;
    if (!conflict && !engineStatus.officialMonthlyRepair.failed) {
      try {
        conflict = await findOfficialMonthlyConflict([...matched.values()]);
      } catch {
        engineStatus.officialMonthlyRepair.failed = true;
      }
    }
    if(page>1){
      state.officialMonthlyNextPage=official.length&&page<10000?page+1:2;
      status.nextPage=state.officialMonthlyNextPage;
    }
    if(!official.length)break;
    page=state.officialMonthlyNextPage??2;
  }
  return conflict;
}

function monthlyRepairKey(a) {
  return `${a.link}#pv${MONTHLY_PERIOD_REPAIR_VERSION}`;
}

async function findOfficialMonthlyConflict(announcements) {
  const candidates = announcements.filter(a => isIndustrialMonthlyWorkbook(a) &&
    metaFromAnnouncement(a, "ن-۳۰").period_end && (state.fails[monthlyRepairKey(a)] ?? 0) < MAX_FAILS);
  if (!candidates.length) return null;
  const urls = candidates.flatMap(a => [`${a.link}#pv${PARSER_VERSION}`, monthlyRepairKey(a)]);
  const qs = new URLSearchParams({
    select: "source_url,symbol,period:data->>period_end",
    source_url: `in.(${urls.map(url => JSON.stringify(url)).join(",")})`,
    report_kind: "eq.ن-۳۰", data: "not.is.null", limit: String(urls.length),
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/codal_reports?${qs}`, {
    headers: SB_HDRS(), signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("official monthly period read failed");
  const rows = await response.json();
  const known = new Set(urls);
  if (!Array.isArray(rows) || rows.length > urls.length ||
      rows.some(row => !known.has(row?.source_url) || typeof row.symbol !== "string")) {
    throw new Error("official monthly period response invalid");
  }
  const stored = new Map(rows.map(row => [row.source_url, row]));
  return candidates.find(a => {
    const previous = stored.get(`${a.link}#pv${PARSER_VERSION}`);
    return previous?.symbol === a.l18 && /^14\d{2}-\d{2}-\d{2}$/.test(previous.period) &&
      previous.period !== metaFromAnnouncement(a, "ن-۳۰").period_end && !stored.has(monthlyRepairKey(a));
  }) ?? null;
}

async function repairOfficialMonthlyConflict(a) {
  const status = engineStatus.officialMonthlyRepair;
  const key = monthlyRepairKey(a);
  status.attempted++;
  try {
    const data = await readIndustrialMonthlyDecision(a);
    if (!data) throw new Error("official monthly repair rejected");
    status.inserted += await insertParsedReport(a, "ن-۳۰", data);
    delete state.fails[key];
  } catch (error) {
    if (isBrsLocalDeferral(error)) throw error;
    status.failed = true;
    state.fails[key] = (state.fails[key] ?? 0) + 1;
  }
}

async function backfillSome({ monthlyOnly = false, loadCompanies = allCompanySymbols } = {}) {
  const st = engineStatus.backfill;
  st.inserted = 0; st.downloaded = 0; st.parseFailed = 0; st.skippedCovered = 0; st.symbols = [];

  const queue = await loadCompanies();
  st.queueSize = queue.length;
  if (!queue.length) return;

  // Stored row count cannot prove current coverage. Reconcile each issuer in a
  // stable rotation; known report identities prevent repeat downloads.
  let remainingDownloads = Math.max(0, BACKFILL_PER_CYCLE * BACKFILL_MAX_DL
    - engineStatus.storedRecovery.downloaded - engineStatus.recentMonthlyRecovery.downloaded);
  const window = process.env.RELAY_BACKGROUND_WINDOW_ENABLED === "0" ? { issuerMultiplier: 1, offPeak: false } : backgroundWorkWindow();
  const symbolLimit = BACKFILL_PER_CYCLE * window.issuerMultiplier;
  st.workWindow = window.offPeak ? "overnight" : "regular";
  st.symbolLimit = symbolLimit;
  let processedSymbols = 0;
  let guard = 0;
  while (processedSymbols < symbolLimit && guard < queue.length && remainingDownloads > 0) {
    guard++;
    const cursorBefore = state.backfillCursor;
    const sym = queue[state.backfillCursor % queue.length];
    state.backfillCursor++;
    st.cursor = state.backfillCursor;

    processedSymbols++;
    st.symbols.push(sym);
    try {
      const fs = monthlyOnly ? [] : await fetchAnnouncementsPage({ l18: sym, category: 1 });
      const monthly = await fetchAnnouncementsPage({ l18: sym, category: 3 });
      const known = await existingUrlsFor(sym);
      let dl = 0;
      for (const a of [...fs, ...monthly]) {
        const kind = classifyAnnouncement(a);
        if (!kind || monthlyOnly && kind !== "ن-۳۰" || !a.link || (!a.link_excel &&
            !(kind === "ن-۳۰" && monthlyDecisionTypeWithoutWorkbook(a.link, a.link_excel) !== null))) continue;
        if (known.has(a.link) || isBlocked(a.link, kind, a)) continue;
        if (dl >= BACKFILL_MAX_DL || remainingDownloads <= 0) break;
        dl++; remainingDownloads--; st.downloaded++;
        let stage = "download";
        let rejection = null;
        try {
          const data = await downloadAndParse(a, kind, () => { stage = "admission"; },
            event => { rejection ??= admissionEvent(event, kind); });
          if (data) {
            stage = "persistence";
            st.inserted += await insertParsedReport(a, kind, data);
            clearFailure(a, kind);
          } else {
            recordFailureDiagnostic("admission", "rejected");
            recordRejectedFiling(a, kind, rejection);
            st.parseFailed++;
            recordFail(a.link, kind, a);
          }
        } catch (e) {
          if (isBrsLocalDeferral(e)) throw e;
          recordFailureDiagnostic(stage, "exception");
          st.parseFailed++;
          recordFail(a.link, kind, a);
        }
      }
      console.log(`codal-engine backfill ${sym}: inserted=${st.inserted} parseFailed=${st.parseFailed}`);
    } catch (e) {
      if (e?.status === 429 || isBrsLocalDeferral(e)) {
        if (e?.status === 429) holdIssuerBackfill();
        else noteDeferral(e, "issuer_backfill");
        state.backfillCursor = cursorBefore;
        st.cursor = cursorBefore;
        throw e;
      }
      engineStatus.lastError = [engineStatus.lastError, `backfill ${sym}: ${e?.message ?? e}`].filter(Boolean).join("; ");
      console.error("codal-engine backfill:", sym, e?.message ?? e);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/* ── اجرای یک چرخهٔ کامل موتور ─────────────────────────────────────────────── */
async function recoverStoredReports({monthlyOnly,interimWindow=null,monthlyBounds=null,limit,attempted=new Set(),knownBySymbol=new Map(),freshHead=false,replayLinks=null}) {
  const st=interimWindow ? engineStatus.interimRecovery : monthlyBounds ? engineStatus.recentMonthlyRecovery : engineStatus.storedRecovery;
  const cursorKey=interimWindow ? "interimRecoveryCursor" : monthlyBounds ? "recentMonthlyRecoveryCursor"
    : monthlyOnly ? "monthlyRecoveryCursor" : "storedFeedCursor";
  if (limit <= 0 || replayLinks?.length===0) return;
  const replay=replayLinks!==null;
  const probe=freshHead||replay;
  let cursor=probe?null:state[cursorKey]??null;
  const advance=next=>{cursor=next;if(!probe)state[cursorKey]=next;};
  // Share the existing backfill download allocation. Only two stored pages are
  // read per cycle; an empty page, not a short server-capped page, ends the scan.
  for(let page=0;page<(probe?1:2);page++){
    const rows=await readStoredAnnouncements(cursor,{baseUrl:SUPABASE_URL,headers:SB_HDRS(),
      monthlyOnly,interimSince:interimWindow?.startIso ?? null,monthlyBounds,pageSize:probe?20:100,links:replayLinks});
    if(!rows.length){advance(null);if(!probe)st.reachedEnd=true;break;}
    for(const row of rows){
      const a=row.announcement,classified=a && classifyAnnouncement(a);
      const kind=interimWindow
        ? (recentInterim(a, interimWindow) ? classified : null)
        : monthlyOnly && classified !== "ن-۳۰" ? null : classified;
      if(a && kind && st.downloaded>=limit)return;
      st.scanned++;
      if(!a || !kind){st.metadataSkipped++;advance(row.id);continue;}
      if(attempted.has(a.link)){advance(row.id);continue;}
      const decisionKey = replay && kind === "ن-۳۰" && monthlyWorkbookType(a) ? supplementalReplayKey(a.link) : null;
      if(replay){
        const retryKey=decisionKey || monthlyRetryKey(a.link,kind,a);
        if(!retryKey||state.fails[retryKey]||!(state.fails[failureKey(a.link,kind,a)]||state.fails[a.link]))continue;
      }
      if(!knownBySymbol.has(a.l18))knownBySymbol.set(a.l18,await existingUrlsFor(a.l18));
      const known=knownBySymbol.get(a.l18);
      if(known.has(a.link)){
        st.skippedKnown++;
        if(replay)clearFailure(a,kind);
        advance(row.id);continue;
      }
      if(!decisionKey && !(replay && ["5","6"].includes(monthlyWorkbookType(a))) && isBlocked(a.link,kind,a)){st.blocked++;advance(row.id);continue;}
      let stage='download',rejection=null;st.downloaded++;attempted.add(a.link);
      try {
        const type=monthlyWorkbookType(a);
        const useSupplementalDecision = replay && (['5','6'].includes(type) || (type==='1' && decisionKey));
        const data = decisionKey && type==='0' ? await readIndustrialMonthlyDecision(a)
          : useSupplementalDecision ? await readSupplementalMonthlyDecision(a)
          : await downloadAndParse(a,kind,()=>{stage='admission';},event=>{rejection??=admissionEvent(event,kind);});
        if(decisionKey && !data)state.fails[decisionKey]=1;
        if(data){
          stage='persistence';st.inserted+=await insertParsedReport(a,kind,data);
          known.add(a.link);clearFailure(a, kind);
        } else {
          st.parseFailed++;recordFailureDiagnostic('admission','rejected');
          recordRejectedFiling(a,kind,rejection);recordFail(a.link,kind,a,replay);
        }
      } catch(error) {
        if(isBrsLocalDeferral(error)){ noteDeferral(error, 'stored_report'); throw error; }
        if(decisionKey && stage!=='persistence' && !isCodalSourceDeferred(error))state.fails[decisionKey]=1;
        st.parseFailed++;recordFailureDiagnostic(stage,'exception');recordFail(a.link,kind,a,replay);
      }
      advance(row.id);
    }
  }
}

export async function runEngineCycle({ allowBackground = true, monthlyOnly = false, recentInterimReports = process.env.CODAL_RECENT_INTERIM_ENABLED === "1",
  prioritizeRecentMonthly = false, officialMonthlyReconciliation = false } = {}) {
  const includeInterim = monthlyOnly && recentInterimReports && INTERIM_MAX_DL > 0;
  engineStatus.reportScope = includeInterim ? "monthly_and_recent_interim" : monthlyOnly ? "monthly_only" : "all_reports";
  engineStatus.ok = false;
  engineStatus.lastError = null;
  engineStatus.lastDeferral = null;
  engineStatus.lastRejectedFilings = [];
  engineStatus.lastRun = Date.now();
  Object.assign(engineStatus.feedTable, { attempted: 0, inserted: 0, duplicates: 0, lastError: null });
  if (!BRSAPI_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    engineStatus.lastError = "env ناقص (BRSAPI_KEY/SUPABASE)";
    return;
  }
  try { await loadState(); }
  catch (e) { engineStatus.lastError = `state load: ${e?.message ?? e}`; return; }
  state.failureDiagnostics.lastCycle = failureCounts();
  state.admissionDiagnostics.lastCycle = admissionCounts();
  const watermarkBefore = state.watermark;
  const metadataBefore = state.metadataWatermark ?? null;
  const storedCursorBefore = state.storedFeedCursor;
  const monthlyCursorBefore = state.monthlyRecoveryCursor ?? null;
  const recentMonthlyCursorBefore = state.recentMonthlyRecoveryCursor ?? null;
  const officialMonthlyPageBefore = state.officialMonthlyNextPage;
  const interimCursorBefore = state.interimRecoveryCursor ?? null;
  Object.assign(engineStatus.backfill, { inserted: 0, downloaded: 0, parseFailed: 0, symbols: [], skippedCovered: 0,
    cursor: state.backfillCursor, holdUntil: state.issuerBackfillHoldUntil > Date.now() ? state.issuerBackfillHoldUntil : null });
  Object.assign(engineStatus.storedRecovery, recoveryCounts());
  const monthlyBounds=monthlyOnly&&prioritizeRecentMonthly ? recentMonthlyBounds(engineStatus.lastRun) : null;
  Object.assign(engineStatus.recentMonthlyRecovery,recoveryCounts(),{active:monthlyBounds!==null,readFailed:false});
  Object.assign(engineStatus.officialMonthlyDiscovery,{pages:0,matched:0,inserted:0,nextPage:officialMonthlyPageBefore??2,failed:false});
  Object.assign(engineStatus.officialMonthlyRepair,{attempted:0,inserted:0,failed:false});
  Object.assign(engineStatus.interimRecovery, recoveryCounts());
  let feedDeferred = false;
  const monthlyAttempts=monthlyBounds ? new Set() : null;
  let companies;
  const loadCompanies=()=>companies??=allCompanySymbols();
  let interimWindow = null;
  if (includeInterim) {
    try {
      const symbols = new Set((await loadCompanies()).map(canonicalMarketSymbol));
      if (!symbols.size) throw new Error("empty market stock roster");
      const tehranOffset = (3 * 60 + 30) * 60 * 1000;
      interimWindow = {
        symbols,
        startIso: new Date(engineStatus.lastRun - INTERIM_RECENT_MS).toISOString(),
        startDay: new Date(engineStatus.lastRun + tehranOffset - INTERIM_RECENT_MS).toISOString().slice(0, 10),
        endDay: new Date(engineStatus.lastRun + tehranOffset).toISOString().slice(0, 10),
      };
    } catch {
      engineStatus.lastError = "stock roster unavailable for recent interim recovery";
    }
  }
  const sourceHeld = codalAccess.snapshot() > Date.now();
  try {
    if (sourceHeld && process.env.CODAL_ANNOUNCEMENT_SOURCE === 'official') codalAccess.check();
    // Reserve within the existing total, so continuous new notices cannot starve
    // the saved recent sweep, period repair and historical recovery. Keep at
    // least one feed slot even with a smaller configured total.
    const recoveryReserve = monthlyBounds ? Math.min(3 + (interimWindow ? INTERIM_MAX_DL : 0), Math.max(0, FEED_MAX_DL - 1)) : 0;
    await pollGlobalFeed({ metadataOnly: sourceHeld, monthlyOnly, interimWindow, monthlyAttempts, recoveryReserve });
    if (sourceHeld) codalAccess.check();
  } catch (e) {
    engineStatus.feed.complete = false;
    if (e?.status === 429) holdIssuerBackfill();
    feedDeferred = isBrsLocalDeferral(e);
    if (feedDeferred) engineStatus.feed.incompleteReason = 'local_deferred';
    else engineStatus.feed.incompleteReason ??= "feed_failure";
    engineStatus.lastError = [engineStatus.lastError, `feed: ${e?.message ?? e}`].filter(Boolean).join("; ");
    console.error("codal-engine feed error:", e?.message ?? e);
  }
  let periodConflict = null;
  if(monthlyBounds&&officialMonthlyReconciliation&&codalAccess.snapshot()<=Date.now()){
    try{periodConflict = await reconcileOfficialMonthly(monthlyBounds,loadCompanies);}
    catch{
      engineStatus.officialMonthlyDiscovery.failed=true;
      engineStatus.lastError=[engineStatus.lastError,"official monthly discovery failed"].filter(Boolean).join("; ");
    }
  }
  try {
    if ((allowBackground || monthlyOnly) && codalAccess.snapshot() <= Date.now()) {
      const remaining = FEED_MAX_DL - engineStatus.feed.downloaded;
      const interimRemaining = interimWindow ? Math.min(remaining, INTERIM_MAX_DL - engineStatus.feed.interimDownloads) : 0;
      // A monthly-focused cycle can use the unused interim file slots.
      const recoveryLimit=monthlyBounds&&!interimWindow ? BACKFILL_MAX_DL+INTERIM_MAX_DL : BACKFILL_MAX_DL;
      let limit = monthlyOnly ? Math.min(recoveryLimit, remaining - interimRemaining) : BACKFILL_MAX_DL;
      if (periodConflict && limit > 2) {
        await repairOfficialMonthlyConflict(periodConflict);
        limit--;
      }
      const attempted=monthlyAttempts ?? new Set();
      const knownBySymbol=new Map();
      if(monthlyBounds&&limit>0){
        const recoverRecent=async (limit,{freshHead=false,replayLinks=null}={})=>{
          try{
            await recoverStoredReports({monthlyOnly,monthlyBounds,limit,attempted,knownBySymbol,freshHead,replayLinks});
          }catch(error){
            if(isBrsLocalDeferral(error))throw error;
            engineStatus.recentMonthlyRecovery.readFailed=true;
          }
        };
        // Keep one historical slot when there are at least two downloads available.
        // If recent candidates run out, the historical sweep uses the unused slots.
        const recentLimit=Math.max(1,limit-1);
        // The saved cursor may already be deep in the queue. Give the head a
        // slot for pending new entries even if this cycle found no new notice.
        if(state.recentMonthlyRecoveryCursor!=null&&recentLimit>1){
          const headLimit=engineStatus.officialMonthlyDiscovery.inserted>0 ? Math.ceil(recentLimit/2) : 1;
          await recoverRecent(headLimit,{freshHead:true});
        }
        const downloaded=engineStatus.recentMonthlyRecovery.downloaded;
        // Replay one report under a corrected reader while preserving the saved sweep.
        if(downloaded+1<recentLimit){
          await recoverRecent(downloaded+1,{replayLinks:pendingMonthlyReplayLinks()});
        }
        await recoverRecent(recentLimit);
        if(engineStatus.recentMonthlyRecovery.readFailed){
          engineStatus.lastError=[engineStatus.lastError,"recent monthly recovery read failed"].filter(Boolean).join("; ");
        }
      }
      await recoverStoredReports({monthlyOnly,limit:limit-engineStatus.recentMonthlyRecovery.downloaded,attempted,knownBySymbol});
      if (interimRemaining > 0) await recoverStoredReports({monthlyOnly:false,interimWindow,limit:interimRemaining});
      if (allowBackground && !feedDeferred && state.issuerBackfillHoldUntil <= Date.now()) {
        await backfillSome({monthlyOnly,loadCompanies});
      }
    }
  } catch (e) {
    engineStatus.lastError = [engineStatus.lastError, `backfill: ${e?.message ?? e}`].filter(Boolean).join("; ");
    console.error("codal-engine backfill error:", e?.message ?? e);
  }
  engineStatus.ledgerSize = Object.keys(state.fails).length;
  if (!engineStatus.lastError && !engineStatus.feed.complete) {
    engineStatus.lastError = `feed incomplete: ${engineStatus.feed.incompleteReason}`;
  }
  if (!engineStatus.lastError && (engineStatus.feed.parseFailed || engineStatus.backfill.parseFailed || engineStatus.storedRecovery.parseFailed ||
      engineStatus.recentMonthlyRecovery.parseFailed || engineStatus.interimRecovery.parseFailed)) {
    engineStatus.lastError = "report parsing/insertion failed";
  }
  try { await saveState(); }
  catch (e) {
    state.watermark = watermarkBefore;
    state.metadataWatermark = metadataBefore;
    state.storedFeedCursor = storedCursorBefore;
    state.monthlyRecoveryCursor = monthlyCursorBefore;
    state.recentMonthlyRecoveryCursor = recentMonthlyCursorBefore;
    state.officialMonthlyNextPage = officialMonthlyPageBefore;
    state.interimRecoveryCursor = interimCursorBefore;
    engineStatus.feed.watermark = state.watermark?.key ?? null;
    engineStatus.lastError = [engineStatus.lastError, `state save: ${e?.message ?? e}`].filter(Boolean).join("; ");
  }
  engineStatus.ok = !engineStatus.lastError;
}
