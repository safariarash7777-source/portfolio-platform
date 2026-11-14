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
// سهمیه و زمان چرخه هدر نرود. با آمدن پارسر بانک/بیمه، پاک‌کردن دفتر کافی است.
// ─────────────────────────────────────────────────────────────────────────────
import {
  classifyAnnouncement, fetchAnnouncementsPage, downloadAndParse,
  insertParsedReport, existingUrlsFor, faToEn, codalEnv,
} from "./codal.mjs";
import { backgroundWorkWindow } from "./background-work-window.mjs";
import { companyUniverse } from "./codal-coverage.mjs";
import { isBrsLocalDeferral } from "./brsapi-transport.mjs";
import { admissionCounts, admissionEvent, readAdmissionDiagnostics, recordAdmissionRejection } from "./codal-admission-diagnostics.mjs";
import { supportsDecisionUrl } from "./codal-statement-source.mjs";
import { readStoredAnnouncements, validStoredCursor } from "./codal-stored-feed.mjs";

const { BRSAPI_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = codalEnv;

// تنظیمات (env-پذیر، پیش‌فرض محافظه‌کار)
const FEED_MAX_PAGES = Number(process.env.CODAL_FEED_PAGES || 6);      // سقف صفحات فید در هر چرخه
const FEED_MAX_DL = Number(process.env.CODAL_FEED_DL || 10);           // سقف دانلود اکسل فید در هر چرخه
const BACKFILL_PER_CYCLE = Number(process.env.CODAL_BACKFILL_SYMBOLS || 2); // نماد بک‌فیل در هر چرخه
const BACKFILL_MAX_DL = Number(process.env.CODAL_BACKFILL_DL || 6);    // سقف دانلود هر نماد بک‌فیل
const MAX_FAILS = 3;                                                    // بعد از این تعداد شکست، اطلاعیه بلاک می‌شود
const LEDGER_CAP = 600;                                                 // سقف دفتر خطا (قدیمی‌ها حذف می‌شوند)

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
  ok: false,
  lastRun: 0,
  lastError: null,
  feed: { pages: 0, seen: 0, matched: 0, downloaded: 0, inserted: 0, parseFailed: 0, watermark: null, complete: false, incompleteReason: null },
  // codal_feed has no publish_time/raw column; only date_publish can be stored here.
  feedTable: { attempted: 0, inserted: 0, duplicates: 0, lastError: null, publishTimeStored: false },
  backfill: { cursor: 0, queueSize: 0, symbols: [], inserted: 0, downloaded: 0, parseFailed: 0, skippedCovered: 0, coverageBasis: "snapshot-universe-not-freshness" },
  storedRecovery: { scanned: 0, downloaded: 0, inserted: 0, parseFailed: 0, blocked: 0, skippedKnown: 0, metadataSkipped: 0, reachedEnd: false },
  ledgerSize: 0,
  failureDiagnostics: readFailureDiagnostics(),
  admissionDiagnostics: readAdmissionDiagnostics(),
};

/* ── وضعیت پایدار در Supabase ──────────────────────────────────────────────── */
const STATE_KEY = "codal_engine_state";
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
  if (payload.watermark != null && (!Number.isFinite(payload.watermark.key) ||
      !Array.isArray(payload.watermark.links) || !payload.watermark.links.every(l => typeof l === "string"))) {
    throw new Error("state watermark invalid schema");
  }
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
  state = payload;
  state.watermark ??= null;
  state.backfillCursor ??= 0;
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

const interimEligible = (url, kind, announcement) => kind === 'ن-۱۰' && supportsDecisionUrl(url) && /تلفیقی/.test(String(announcement?.title || ''));
const auditedEligible = (url, kind, announcement) => interimEligible(url,kind,announcement) && /حسابرسی\s+شده/.test(String(announcement?.title || ''));
function recordFail(url, kind, announcement) {
  state.fails[url] = (state.fails[url] || 0) + 1;
  if (kind === 'ن-۱۰' && supportsDecisionUrl(url)) state.decisionStatementV1Attempts[url] = 1;
  if (interimEligible(url,kind,announcement)) state.interimStatementV1Attempts[url] = 1;
  if (auditedEligible(url,kind,announcement)) state.auditedStatementV1Attempts[url] = 1;
  return state.fails[url];
}
// One bounded attempt for previously blocked official N10 reports now supported
// by the new adapter. Preserve old failure counts and all existing cycle limits.
const isBlocked = (url, kind, announcement) => (state.fails[url] || 0) >= MAX_FAILS &&
  !(kind === 'ن-۱۰' && supportsDecisionUrl(url) && !state.decisionStatementV1Attempts[url]) &&
  !(interimEligible(url,kind,announcement) && !state.interimStatementV1Attempts[url]) &&
  !(auditedEligible(url,kind,announcement) && !state.auditedStatementV1Attempts[url]);

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

/** یک صفحه با یک تلاش مجدد — BrsApi گاه اتصال را گذرا قطع می‌کند. */
async function fetchPageWithRetry(params) {
  try { return await fetchAnnouncementsPage(params); }
  catch (e) {
    if (e?.noRetry === true || e?.name === "AnnouncementSchemaError" || isBrsLocalDeferral(e)) throw e;
    await new Promise((r) => setTimeout(r, 4000));
    return await fetchAnnouncementsPage(params);
  }
}

async function pollGlobalFeed() {
  const st = engineStatus.feed;
  st.pages = 0; st.seen = 0; st.matched = 0; st.downloaded = 0; st.inserted = 0; st.parseFailed = 0;
  st.complete = false; st.incompleteReason = "page_limit";
  st.watermark = state.watermark?.key ?? null;

  const wm = state.watermark; // { key: number, links: string[] } — links برای هم‌زمان‌های هم‌کلید
  const newestSeen = { key: 0, links: [] };
  const candidates = [];
  const feedItems = []; // M4: متادیتای همهٔ اطلاعیه‌های تازه، نه فقط ن-۱۰/ن-۳۰
  let previousKey = Infinity;

  outer:
  for (let page = 1; page <= FEED_MAX_PAGES; page++) {
    const items = await fetchPageWithRetry({ page, purpose: "current" }); // بدون l18 → کل بازار
    st.pages = page;
    if (!items.length) { st.complete = true; st.incompleteReason = null; break; }
    for (const a of items) {
      st.seen++;
      const k = sentKey(a);
      if (!k || typeof a.link !== "string" || !a.link.trim() || k > previousKey) {
        st.incompleteReason = "invalid_order_or_identity";
        // Keep the verified prefix, but never acknowledge a gap in the feed.
        // The next scheduled cycle resumes from the unchanged watermark.
        break outer;
      }
      previousKey = k;
      // Only an older timestamp proves the same-time group is exhausted.
      if (wm && k < wm.key) { st.complete = true; st.incompleteReason = null; break outer; }
      if (wm && k === wm.key && wm.links.includes(a.link)) continue;
      if (k > newestSeen.key) { newestSeen.key = k; newestSeen.links = [a.link]; }
      else if (k === newestSeen.key) newestSeen.links.push(a.link);
      if (a.link) feedItems.push(a); // M4
      const kind = classifyAnnouncement(a);
      if (!kind || !a.link || !a.link_excel) continue;
      st.matched++;
      candidates.push({ a, kind });
    }
  }

  // M4: فید عمومی کدال — متادیتا قبل از دانلودها درج می‌شود تا فید عقب نماند
  try { await pushFeedRows(feedItems); }
  catch (e) { st.complete = false; st.incompleteReason = "feed_write_failure"; throw e; }

  // دانلود و درج (جدیدترین‌ها اول)
  let dl = 0;
  for (const { a, kind } of candidates) {
    // dedup با ردیف‌های موجودِ همان نماد
    const known = await existingUrlsFor(a.l18);
    if (known.has(a.link)) { delete state.fails[a.link]; continue; }
    if (isBlocked(a.link, kind, a)) { st.complete = false; st.incompleteReason = "blocked_report"; continue; }
    if (dl >= FEED_MAX_DL) { st.complete = false; st.incompleteReason = "download_limit"; break; }
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
        delete state.fails[a.link];
      } else {
        recordFailureDiagnostic("admission", "rejected");
        recordAdmissionRejection(state.admissionDiagnostics, kind, rejection);
        st.parseFailed++;
        recordFail(a.link, kind, a);
        st.complete = false; st.incompleteReason = "report_failure";
      }
    } catch (e) {
      if (isBrsLocalDeferral(e)) {
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
  if (st.complete && newestSeen.key > 0 && (!wm || newestSeen.key >= wm.key)) {
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

async function backfillSome() {
  const st = engineStatus.backfill;
  st.inserted = 0; st.downloaded = 0; st.parseFailed = 0; st.skippedCovered = 0; st.symbols = [];

  const queue = await allCompanySymbols();
  st.queueSize = queue.length;
  if (!queue.length) return;

  // Stored row count cannot prove current coverage. Reconcile each issuer in a
  // stable rotation; known report identities prevent repeat downloads.
  let remainingDownloads = Math.max(0, BACKFILL_PER_CYCLE * BACKFILL_MAX_DL - engineStatus.storedRecovery.downloaded);
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
      const [fs, monthly] = await Promise.all([
        fetchAnnouncementsPage({ l18: sym, category: 1 }),
        fetchAnnouncementsPage({ l18: sym, category: 3 }),
      ]);
      const known = await existingUrlsFor(sym);
      let dl = 0;
      for (const a of [...fs, ...monthly]) {
        const kind = classifyAnnouncement(a);
        if (!kind || !a.link || !a.link_excel) continue;
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
            delete state.fails[a.link];
          } else {
            recordFailureDiagnostic("admission", "rejected");
            recordAdmissionRejection(state.admissionDiagnostics, kind, rejection);
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
      if (isBrsLocalDeferral(e)) {
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
async function recoverStoredReports() {
  const st=engineStatus.storedRecovery;
  Object.assign(st,{scanned:0,downloaded:0,inserted:0,parseFailed:0,blocked:0,skippedKnown:0,metadataSkipped:0,reachedEnd:false});
  const knownBySymbol=new Map();
  // Share the existing backfill download allocation. Only two stored pages are
  // read per cycle; an empty page, not a short server-capped page, ends the scan.
  for(let page=0;page<2;page++){
    const rows=await readStoredAnnouncements(state.storedFeedCursor,{baseUrl:SUPABASE_URL,headers:SB_HDRS()});
    if(!rows.length){state.storedFeedCursor=null;st.reachedEnd=true;break;}
    for(const row of rows){
      const a=row.announcement,kind=a && classifyAnnouncement(a);
      if(a && kind && st.downloaded>=BACKFILL_MAX_DL)return;
      st.scanned++;
      if(!a || !kind){st.metadataSkipped++;state.storedFeedCursor=row.id;continue;}
      if(!knownBySymbol.has(a.l18))knownBySymbol.set(a.l18,await existingUrlsFor(a.l18));
      const known=knownBySymbol.get(a.l18);
      if(known.has(a.link)){st.skippedKnown++;state.storedFeedCursor=row.id;continue;}
      if(isBlocked(a.link,kind,a)){st.blocked++;state.storedFeedCursor=row.id;continue;}
      let stage='download',rejection=null;st.downloaded++;
      try {
        const data=await downloadAndParse(a,kind,()=>{stage='admission';},event=>{rejection??=admissionEvent(event,kind);});
        if(data){
          stage='persistence';st.inserted+=await insertParsedReport(a,kind,data);
          known.add(a.link);delete state.fails[a.link];
        } else {
          st.parseFailed++;recordFailureDiagnostic('admission','rejected');
          recordAdmissionRejection(state.admissionDiagnostics,kind,rejection);recordFail(a.link,kind,a);
        }
      } catch(error) {
        if(isBrsLocalDeferral(error))throw error;
        st.parseFailed++;recordFailureDiagnostic(stage,'exception');recordFail(a.link,kind,a);
      }
      state.storedFeedCursor=row.id;
    }
  }
}

export async function runEngineCycle() {
  engineStatus.ok = false;
  engineStatus.lastError = null;
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
  const storedCursorBefore = state.storedFeedCursor;
  Object.assign(engineStatus.backfill, { inserted: 0, downloaded: 0, parseFailed: 0, symbols: [], skippedCovered: 0 });
  let feedDeferred = false;
  try {
    await pollGlobalFeed();
  } catch (e) {
    engineStatus.feed.complete = false;
    feedDeferred = isBrsLocalDeferral(e);
    if (feedDeferred) engineStatus.feed.incompleteReason = 'local_deferred';
    else engineStatus.feed.incompleteReason ??= "feed_failure";
    engineStatus.lastError = `feed: ${e?.message ?? e}`;
    console.error("codal-engine feed error:", e?.message ?? e);
  }
  try {
    await recoverStoredReports();
    if (!feedDeferred) await backfillSome();
  } catch (e) {
    engineStatus.lastError = [engineStatus.lastError, `backfill: ${e?.message ?? e}`].filter(Boolean).join("; ");
    console.error("codal-engine backfill error:", e?.message ?? e);
  }
  engineStatus.ledgerSize = Object.keys(state.fails).length;
  if (!engineStatus.lastError && !engineStatus.feed.complete) {
    engineStatus.lastError = `feed incomplete: ${engineStatus.feed.incompleteReason}`;
  }
  if (!engineStatus.lastError && (engineStatus.feed.parseFailed || engineStatus.backfill.parseFailed || engineStatus.storedRecovery.parseFailed)) {
    engineStatus.lastError = "report parsing/insertion failed";
  }
  try { await saveState(); }
  catch (e) {
    state.watermark = watermarkBefore;
    state.storedFeedCursor = storedCursorBefore;
    engineStatus.feed.watermark = state.watermark?.key ?? null;
    engineStatus.lastError = [engineStatus.lastError, `state save: ${e?.message ?? e}`].filter(Boolean).join("; ");
  }
  engineStatus.ok = !engineStatus.lastError;
}
