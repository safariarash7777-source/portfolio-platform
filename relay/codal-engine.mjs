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
//   مسیر ۲ — بک‌فیل اولویت‌دار: تاریخچهٔ گزارش‌های نمادهای مهم (به‌ترتیب ارزش
//   معاملات از اسنپ‌شات بازار) با l18 نمادبه‌نماد تکمیل می‌شود؛ هر چرخه فقط
//   چند نماد؛ نمادهای دارای پوشش کافی رد می‌شوند.
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

const { BRSAPI_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = codalEnv;

// تنظیمات (env-پذیر، پیش‌فرض محافظه‌کار)
const FEED_MAX_PAGES = Number(process.env.CODAL_FEED_PAGES || 6);      // سقف صفحات فید در هر چرخه
const FEED_MAX_DL = Number(process.env.CODAL_FEED_DL || 10);           // سقف دانلود اکسل فید در هر چرخه
const BACKFILL_PER_CYCLE = Number(process.env.CODAL_BACKFILL_SYMBOLS || 2); // نماد بک‌فیل در هر چرخه
const BACKFILL_MAX_DL = Number(process.env.CODAL_BACKFILL_DL || 6);    // سقف دانلود هر نماد بک‌فیل
const BACKFILL_TOP = Number(process.env.CODAL_BACKFILL_TOP || 200);    // چند نماد برتر بازار در صف بک‌فیل
const COVERED_MIN_ROWS = Number(process.env.CODAL_COVERED_MIN || 8);   // این‌قدر ردیف یعنی «پوشش کافی» در بک‌فیل
const MAX_FAILS = 3;                                                    // بعد از این تعداد شکست، اطلاعیه بلاک می‌شود
const LEDGER_CAP = 600;                                                 // سقف دفتر خطا (قدیمی‌ها حذف می‌شوند)

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
  feed: { pages: 0, seen: 0, matched: 0, downloaded: 0, inserted: 0, parseFailed: 0, watermark: null },
  feedTable: { attempted: 0, inserted: 0, lastError: null }, // جدول codal_feed (M4 رصد بازار)
  backfill: { cursor: 0, queueSize: 0, symbols: [], inserted: 0, parseFailed: 0, skippedCovered: 0 },
  ledgerSize: 0,
};

/* ── وضعیت پایدار در Supabase ──────────────────────────────────────────────── */
const STATE_KEY = "codal_engine_state";
let state = null; // { watermark: {sent, link}, backfillCursor, fails: {url: n}, blocked: {url: reason} }

async function loadState() {
  if (state) return state;
  try {
    const qs = new URLSearchParams({ select: "payload", key: `eq.${STATE_KEY}`, limit: "1" });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ir_market_snapshots?${qs}`, {
      headers: SB_HDRS(), signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const rows = await res.json();
      if (rows[0]?.payload && typeof rows[0].payload === "object") {
        state = rows[0].payload;
      }
    }
  } catch { /* از نو شروع می‌کنیم */ }
  if (!state || typeof state !== "object") state = {};
  state.watermark ??= null;
  state.backfillCursor ??= 0;
  state.fails ??= {};
  return state;
}

async function saveState() {
  if (!state) return;
  // دفتر خطا را جمع‌وجور نگه می‌داریم
  const entries = Object.entries(state.fails);
  if (entries.length > LEDGER_CAP) {
    state.fails = Object.fromEntries(entries.slice(entries.length - LEDGER_CAP));
  }
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
  }
}

/* ── ابزار واترمارک ────────────────────────────────────────────────────────── */
// کلید ترتیب اطلاعیه: تاریخ/ساعت ارسال (جلالی متنی) به‌صورت عدد قابل مقایسه.
function sentKey(a) {
  const d = faToEn(String(a.date_send || ""));
  const t = faToEn(String(a.time_send || ""));
  const dm = d.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  const tm = t.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (!dm) return 0;
  const pad = (x) => String(x).padStart(2, "0");
  return Number(
    `${dm[1]}${pad(dm[2])}${pad(dm[3])}${tm ? pad(tm[1]) + pad(tm[2]) + pad(tm[3] || 0) : "000000"}`
  );
}

function recordFail(url) {
  state.fails[url] = (state.fails[url] || 0) + 1;
  return state.fails[url];
}
const isBlocked = (url) => (state.fails[url] || 0) >= MAX_FAILS;

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
 * جدول نساخته (قبل از اجرای phase14) → فقط ثبت خطا در /debug، بدون شکستن چرخه.
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
      publish_date: a.date_title || null,
      link: a.link,
      link_pdf: a.link_pdf || null,
      link_excel: a.link_excel || null,
    }))
    .filter((r) => r.link);
  if (!rows.length) return;
  st.attempted += rows.length;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/codal_feed?on_conflict=link`, {
      method: "POST",
      headers: { ...SB_HDRS(), Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`codal_feed HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
    st.inserted += rows.length; // سقف تقریبی — تکراری‌ها بی‌صدا رد شده‌اند
    st.lastError = null;
  } catch (e) {
    st.lastError = String(e?.message ?? e);
    console.error("codal_feed push:", st.lastError);
  }
}

/** یک صفحه با یک تلاش مجدد — BrsApi گاه اتصال را گذرا قطع می‌کند. */
async function fetchPageWithRetry(params) {
  try { return await fetchAnnouncementsPage(params); }
  catch { await new Promise((r) => setTimeout(r, 4000)); return await fetchAnnouncementsPage(params); }
}

async function pollGlobalFeed() {
  const st = engineStatus.feed;
  st.pages = 0; st.seen = 0; st.matched = 0; st.downloaded = 0; st.inserted = 0; st.parseFailed = 0;

  const wm = state.watermark; // { key: number, links: string[] } — links برای هم‌زمان‌های هم‌کلید
  const newestSeen = { key: 0, links: [] };
  const candidates = [];
  const feedItems = []; // M4: متادیتای همهٔ اطلاعیه‌های تازه، نه فقط ن-۱۰/ن-۳۰

  outer:
  for (let page = 1; page <= FEED_MAX_PAGES; page++) {
    const items = await fetchPageWithRetry({ page }); // بدون l18 → کل بازار
    st.pages = page;
    if (!items.length) break;
    for (const a of items) {
      st.seen++;
      const k = sentKey(a);
      if (k > newestSeen.key) { newestSeen.key = k; newestSeen.links = [a.link]; }
      else if (k === newestSeen.key) newestSeen.links.push(a.link);
      // به واترمارک رسیدیم → تمام
      if (wm && (k < wm.key || (k === wm.key && wm.links?.includes(a.link)))) break outer;
      if (a.link) feedItems.push(a); // M4
      const kind = classifyAnnouncement(a);
      if (!kind || !a.link || !a.link_excel) continue;
      st.matched++;
      candidates.push({ a, kind });
    }
  }

  // M4: فید عمومی کدال — متادیتا قبل از دانلودها درج می‌شود تا فید عقب نماند
  await pushFeedRows(feedItems);

  // دانلود و درج (جدیدترین‌ها اول)
  let dl = 0;
  for (const { a, kind } of candidates) {
    if (dl >= FEED_MAX_DL) break;
    if (isBlocked(a.link)) continue;
    // dedup با ردیف‌های موجودِ همان نماد
    const known = await existingUrlsFor(a.l18).catch(() => new Set());
    if (known.has(a.link)) continue;
    dl++;
    st.downloaded = dl;
    try {
      const data = await downloadAndParse(a, kind);
      if (data) {
        await insertParsedReport(a, kind, data);
        st.inserted++;
        delete state.fails[a.link];
      } else {
        st.parseFailed++;
        recordFail(a.link);
      }
    } catch (e) {
      st.parseFailed++;
      recordFail(a.link);
      console.error(`codal-engine feed ${a.l18}: ${e?.message ?? e}`);
    }
  }

  // واترمارک فقط وقتی جلو می‌رود که چرخه سالم تمام شده باشد
  if (newestSeen.key > 0 && (!wm || newestSeen.key >= wm.key)) {
    state.watermark = newestSeen;
  }
  st.watermark = state.watermark?.key ?? null;
}

/* ── مسیر ۲: بک‌فیل اولویت‌دار ──────────────────────────────────────────────── */
async function topSymbolsByValue() {
  // پرمعامله‌ترین سهم‌ها از اسنپ‌شات بازار (صندوق‌ها گزارش کدال ن-۱۰ ندارند)
  try {
    const qs = new URLSearchParams({ select: "payload", key: "eq.latest", limit: "1" });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ir_market_snapshots?${qs}`, {
      headers: SB_HDRS(), signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const rows = await res.json();
    const stocks = rows[0]?.payload?.stocks || [];
    // نمادهای مشتق حذف: حق تقدم (پسوند ح) و عرضه/بلوکی (پسوند رقم، مثل ونوین4)
    // — گزارش کدال زیر نماد اصلی منتشر می‌شود نه مشتق.
    const isDerivative = (id) => /[0-9۰-۹]$/.test(id) || /ح$/.test(id);
    return stocks
      .map((s) => ({ ...s, id: String(s?.id || "").trim() }))
      .filter((s) => s.id && (s.value || 0) > 0 && !isDerivative(s.id))
      .sort((x, y) => (y.value || 0) - (x.value || 0))
      .slice(0, BACKFILL_TOP)
      .map((s) => s.id);
  } catch { return []; }
}

async function coveredCounts(symbols) {
  // تعداد ردیف‌های موجود هر نماد — برای رد کردن نمادهای دارای پوشش کافی
  const out = new Map();
  try {
    const list = symbols.map((s) => `"${s}"`).join(",");
    const qs = `select=symbol&symbol=in.(${encodeURIComponent(list)})&limit=10000`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/codal_reports?${qs}`, {
      headers: SB_HDRS(), signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return out;
    for (const r of await res.json()) out.set(r.symbol, (out.get(r.symbol) || 0) + 1);
  } catch { /* بدون شمارش، بک‌فیل ادامه می‌یابد */ }
  return out;
}

async function backfillSome() {
  const st = engineStatus.backfill;
  st.inserted = 0; st.parseFailed = 0; st.skippedCovered = 0; st.symbols = [];

  const queue = await topSymbolsByValue();
  st.queueSize = queue.length;
  if (!queue.length) return;

  const counts = await coveredCounts(queue);
  let processedSymbols = 0;
  let guard = 0;
  while (processedSymbols < BACKFILL_PER_CYCLE && guard < queue.length) {
    guard++;
    const sym = queue[state.backfillCursor % queue.length];
    state.backfillCursor++;
    st.cursor = state.backfillCursor;
    if ((counts.get(sym) || 0) >= COVERED_MIN_ROWS) { st.skippedCovered++; continue; }

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
        if (known.has(a.link) || isBlocked(a.link)) continue;
        if (dl >= BACKFILL_MAX_DL) break;
        dl++;
        try {
          const data = await downloadAndParse(a, kind);
          if (data) {
            await insertParsedReport(a, kind, data);
            st.inserted++;
            delete state.fails[a.link];
          } else {
            st.parseFailed++;
            recordFail(a.link);
          }
        } catch (e) {
          st.parseFailed++;
          recordFail(a.link);
        }
      }
      console.log(`codal-engine backfill ${sym}: inserted=${st.inserted} parseFailed=${st.parseFailed}`);
    } catch (e) {
      engineStatus.lastError = `backfill ${sym}: ${e?.message ?? e}`;
      console.error("codal-engine backfill:", sym, e?.message ?? e);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/* ── اجرای یک چرخهٔ کامل موتور ─────────────────────────────────────────────── */
export async function runEngineCycle() {
  if (!BRSAPI_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    engineStatus.lastError = "env ناقص (BRSAPI_KEY/SUPABASE)";
    return;
  }
  await loadState();
  try {
    await pollGlobalFeed();
  } catch (e) {
    engineStatus.lastError = `feed: ${e?.message ?? e}`;
    console.error("codal-engine feed error:", e?.message ?? e);
  }
  try {
    await backfillSome();
  } catch (e) {
    engineStatus.lastError = `backfill: ${e?.message ?? e}`;
    console.error("codal-engine backfill error:", e?.message ?? e);
  }
  engineStatus.ledgerSize = Object.keys(state.fails).length;
  engineStatus.ok = true;
  engineStatus.lastRun = Date.now();
  await saveState();
}
