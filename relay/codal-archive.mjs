// بک‌فیل آرشیو کدال (T4) — تعمیق پوششِ گزارش‌های گذشته با سرویس کدال BrsApi.
//
// چرا ماژول جدا: مسیر بک‌فیل موجودِ موتور v3 (codal-engine.mjs) فقط صفحهٔ ۱
// آرشیو هر نماد را می‌بیند (گزارش‌های اخیر). این ماژول با صفحه‌گردی
// (pagination) به عقب برمی‌گردد تا مرز زمانی مشخص:
//   • ن-۳۰ (category=3): از ۱۴۰۲/۰۱/۰۱ به بعد
//   • ن-۱۰ (category=1): از ۱۴۰۱/۰۱/۰۱ به بعد
//
// قواعد سخت:
//   • سقف روزانهٔ صریح درخواست BrsApi: ARCHIVE_DAILY_CAP (پیش‌فرض ۲۰۰) —
//     شمارنده در state با تاریخ (میلادی UTC) ریست می‌شود.
//   • cursor پایدار per-symbol در Supabase (الگوی candle-backfill) —
//     ری‌استارت/دیپلوی چیزی را از دست نمی‌دهد.
//   • درج فقط از مسیر موتور موجود (downloadAndParse → insertParsedReport)
//     با همان dedup روی source_url — append-only، هیچ UPDATE.
//   • دفتر خطای مشترک با موتور (پارس ناموفق ۳بار → بلاک) رعایت می‌شود.
// ─────────────────────────────────────────────────────────────────────────────
import {
  classifyAnnouncement, fetchAnnouncementsPage, downloadAndParse,
  insertParsedReport, existingUrlsFor, faToEn, codalEnv,
} from "./codal.mjs";
import { companyUniverse, readStoredReportInventory, summarizeReportInventory } from "./codal-coverage.mjs";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = codalEnv;

// تنظیمات (env-پذیر) — بودجهٔ صریح طبق مشخصات T4
export const ARCHIVE_DAILY_CAP = Number(process.env.CODAL_ARCHIVE_DAILY_CAP || 200); // سقف درخواست BrsApi در روز
const SYMBOLS_PER_CYCLE = Number(process.env.CODAL_ARCHIVE_SYMBOLS || 3);   // چند نماد در هر چرخه
const PAGES_PER_SYMBOL = Number(process.env.CODAL_ARCHIVE_PAGES || 3);      // سقف صفحهٔ آرشیو هر نماد در چرخه
const DL_PER_CYCLE = Number(process.env.CODAL_ARCHIVE_DL || 14);            // سقف دانلود اکسل در چرخه
// مرز زمانی آرشیو (جلالی، مقایسهٔ عددی YYYYMMDD)
const BOUNDARY_N30 = 14020101; // ن-۳۰ از ۱۴۰۲
const BOUNDARY_N10 = 14010101; // ن-۱۰ از ۱۴۰۱

const SB_HDRS = () => ({
  "Content-Type": "application/json",
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
});

// وضعیت تشخیصی برای /debug — پوشش لحظه‌ای + مصرف بودجه
export const archiveStatus = {
  ok: false,
  lastRun: 0,
  lastError: null,
  dailyCap: ARCHIVE_DAILY_CAP,
  usedToday: 0,
  budgetDate: null,
  cursor: 0,
  queueSize: 0,
  doneSymbols: 0,
  lastCycle: { symbols: [], pages: 0, downloaded: 0, inserted: 0, parseFailed: 0, persistenceUnconfirmed: 0 },
  coverage: { n30Symbols: null, n10Symbols: null, lastChecked: null, error: null },
};

/* ── وضعیت پایدار (Supabase) ───────────────────────────────────────────────── */
const STATE_KEY = "codal_archive_state";
let state = null;
// state = { cursor, budget: {date, used}, perSymbol: { sym: {p1, p3, done1, done3} } }

async function loadState() {
  if (state) return state;
    const qs = new URLSearchParams({ select: "payload", key: `eq.${STATE_KEY}`, limit: "1" });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ir_market_snapshots?${qs}`, {
      headers: SB_HDRS(), signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`archive state read HTTP ${res.status}`);
    const rows = await res.json();
    // Only a successful, explicitly empty query proves a first run. A failed
    // read or damaged payload must never reset the cursor or consumption.
    if (!Array.isArray(rows) || rows.length > 1) throw new Error('archive state invalid rows');
    const candidate = rows.length === 0
      ? { cursor: 0, budget: { date: null, used: 0 }, perSymbol: {} }
      : rows[0]?.payload;
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const counter = value => Number.isSafeInteger(value) && value >= 0;
    if (!object(candidate) || !counter(candidate.cursor) || !object(candidate.budget)
      || !counter(candidate.budget.used) || !object(candidate.perSymbol)
      || !(candidate.budget.date === null && candidate.budget.used === 0
        || typeof candidate.budget.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(candidate.budget.date))
      || Object.values(candidate.perSymbol).some(p => !object(p) || !counter(p.p1) || p.p1 < 1
        || !counter(p.p3) || p.p3 < 1 || typeof p.done1 !== 'boolean' || typeof p.done3 !== 'boolean')) {
      throw new Error('archive state invalid payload');
    }
    state = candidate;
  return state;
}

async function saveState() {
  if (!state) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ir_market_snapshots?on_conflict=key`, {
      method: "POST",
      headers: { ...SB_HDRS(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ key: STATE_KEY, payload: state, updated_at: new Date().toISOString() }]),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`archive state save HTTP ${res.status}`);
  } catch (e) {
    console.error("codal-archive state save:", e?.message ?? e);
  }
}

/* ── بودجهٔ روزانه ─────────────────────────────────────────────────────────── */
function todayUtc() { return new Date().toISOString().slice(0, 10); }

function budgetLeft() {
  const d = todayUtc();
  if (state.budget.date !== d) state.budget = { date: d, used: 0 };
  return ARCHIVE_DAILY_CAP - state.budget.used;
}
function spend(n = 1) { state.budget.used += n; }

/* ── ابزار تاریخ جلالی اطلاعیه ─────────────────────────────────────────────── */
/** «۱۴۰۲/۰۵/۱۲» → 14020512 (عدد قابل مقایسه)؛ نامعتبر → null. */
export function jdateKey(s) {
  const t = faToEn(String(s ?? ""));
  const m = t.match(/(1[34]\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return null;
  return Number(`${m[1]}${m[2].padStart(2, "0")}${m[3].padStart(2, "0")}`);
}

/* ── صف نمادها (همان اولویت موتور: پرمعامله‌ترین‌ها) ───────────────────────── */
async function priorityQueue() {
  const qs = new URLSearchParams({select:'payload',key:'eq.latest',limit:'1'});
  const res=await fetch(`${SUPABASE_URL}/rest/v1/ir_market_snapshots?${qs}`,{headers:SB_HDRS(),signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw Error(`archive universe HTTP ${res.status}`);
  const rows=await res.json();
  if(!Array.isArray(rows) || rows.length!==1 || !Array.isArray(rows[0]?.payload?.stocks))throw Error('archive universe invalid schema');
  const extra=String(process.env.CODAL_ARCHIVE_EXTRA || '').split(',').map(id=>({id:id.trim()}));
  return companyUniverse([...(rows[0]?.payload?.stocks ?? []),...extra]);
}

/* ── پوشش لحظه‌ای برای /debug (پذیرش T4: قابل مشاهده در debug) ─────────────── */
export async function refreshCoverage() {
  try {
    const universe=await priorityQueue();
    const inventory=await readStoredReportInventory({baseUrl:SUPABASE_URL,headers:SB_HDRS()});
    archiveStatus.coverage={...summarizeReportInventory(universe,inventory),lastChecked:new Date().toISOString(),error:null};
  } catch {
    // Preserve the last complete inventory and its clock; failure is not zero.
    archiveStatus.coverage={...archiveStatus.coverage,error:'inventory_read_failed'};
  }
}

/* ── یک چرخهٔ آرشیو ────────────────────────────────────────────────────────── */
/** بلاک‌بودن لینک را موتور اصلی نگه می‌دارد؛ این‌جا دفتر سادهٔ خودمان را داریم
 * تا وابستگی حلقوی نسازیم (لینک ۳بار ناموفق → رد). */
function recordFail(url) {
  state.fails ??= {};
  state.fails[url] = (state.fails[url] || 0) + 1;
  const entries = Object.entries(state.fails);
  if (entries.length > 400) state.fails = Object.fromEntries(entries.slice(-400));
}
const isBlocked = (url) => (state?.fails?.[url] || 0) >= 3;

export async function runArchiveCycle() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    archiveStatus.lastError = "env ناقص (SUPABASE)";
    return;
  }
  const st = archiveStatus.lastCycle;
  st.symbols = []; st.pages = 0; st.downloaded = 0; st.inserted = 0; st.parseFailed = 0;
  st.persistenceUnconfirmed = 0;
  archiveStatus.lastError = null;

  try {
    await loadState();
  } catch {
    archiveStatus.ok = false;
    archiveStatus.lastError = 'archive_state_read_failed';
    archiveStatus.lastRun = Date.now();
    // Do not write a substitute state or call the provider. A later scheduled
    // cycle can retry the read and resume the authoritative stored state.
    return;
  }

  try {
    if (budgetLeft() <= 2) {
      archiveStatus.lastError = `بودجهٔ روزانه (${ARCHIVE_DAILY_CAP}) مصرف شده — تا فردا صبر می‌کنیم`;
    } else {
      const queue = await priorityQueue();
      archiveStatus.queueSize = queue.length;

      let processed = 0, guard = 0;
      while (processed < SYMBOLS_PER_CYCLE && guard < queue.length && budgetLeft() > 2 && st.downloaded < DL_PER_CYCLE) {
        guard++;
        const sym = queue[state.cursor % queue.length];
        state.cursor++;
        const ps = (state.perSymbol[sym] ??= { p1: 1, p3: 1, done1: false, done3: false });
        if (ps.done1 && ps.done3) continue;

        processed++;
        st.symbols.push(sym);
        const known = await existingUrlsFor(sym);

        // هر category جدا صفحه‌گردی می‌شود؛ در هر چرخه حداکثر PAGES_PER_SYMBOL صفحه per نماد.
        for (const { cat, pageKey, doneKey, boundary } of [
          { cat: 3, pageKey: "p3", doneKey: "done3", boundary: BOUNDARY_N30 },
          { cat: 1, pageKey: "p1", doneKey: "done1", boundary: BOUNDARY_N10 },
        ]) {
          if (ps[doneKey]) continue;
          let pagesThis = 0;
          while (pagesThis < PAGES_PER_SYMBOL && budgetLeft() > 2 && st.downloaded < DL_PER_CYCLE) {
            pagesThis++;
            let items;
            try {
              spend();
              items = await fetchAnnouncementsPage({ l18: sym, category: cat, page: ps[pageKey] });
              st.pages++;
            } catch (e) {
              archiveStatus.lastError = `${sym} cat${cat} p${ps[pageKey]}: ${e?.message ?? e}`;
              break; // این نماد را در چرخهٔ بعد ادامه می‌دهیم
            }
            if (!Array.isArray(items) || items.length === 0) {
              ps[doneKey] = true; // آرشیو تمام شد
              break;
            }
            let sawOlderThanBoundary = false;
            let pageComplete = true;
            for (const a of items) {
              const k = jdateKey(a?.date_send);
              if (k !== null && k < boundary) { sawOlderThanBoundary = true; continue; }
              const kind = classifyAnnouncement(a);
              if (!kind || !a.link || !a.link_excel) continue;
              if (known.has(a.link) || isBlocked(a.link)) continue;
              if (st.downloaded >= DL_PER_CYCLE || budgetLeft() <= 2) { pageComplete = false; break; }
              st.downloaded++;
              spend(); // دانلود اکسل هم از سهمیهٔ سرویس کدال حساب می‌شود (محافظه‌کارانه)
              try {
                const data = await downloadAndParse(a, kind);
                if (data) {
                  st.inserted += await insertParsedReport(a, kind, data);
                  known.add(a.link);
                  delete state.fails?.[a.link];
                } else {
                  st.parseFailed++;
                  pageComplete = false;
                  recordFail(a.link);
                }
              } catch (e) {
                st.parseFailed++;
                pageComplete = false;
                recordFail(a.link);
                if (e?.name === "ReportPersistenceError") {
                  st.persistenceUnconfirmed++;
                  archiveStatus.lastError = e.message;
                }
              }
              await new Promise((r) => setTimeout(r, 800));
            }
            // Retain an incomplete page. Known source identities avoid duplicate
            // downloads next cycle; unsupported rows still use the bounded ledger.
            if (!pageComplete) break;
            if (sawOlderThanBoundary) { ps[doneKey] = true; break; } // به مرز رسیدیم
            ps[pageKey]++;
          }
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      archiveStatus.doneSymbols = Object.values(state.perSymbol).filter((p) => p.done1 && p.done3).length;
    }
  } catch (e) {
    archiveStatus.lastError = e?.message ?? String(e);
    console.error("codal-archive:", e?.message ?? e);
  }

  archiveStatus.cursor = state.cursor;
  archiveStatus.usedToday = state.budget.used;
  archiveStatus.budgetDate = state.budget.date;
  archiveStatus.ok = !archiveStatus.lastError && st.parseFailed === 0 && st.persistenceUnconfirmed === 0;
  archiveStatus.lastRun = Date.now();
  await refreshCoverage();
  await saveState();
  console.log(
    `codal-archive: symbols=[${st.symbols.join(",")}] pages=${st.pages} dl=${st.downloaded} inserted=${st.inserted} failed=${st.parseFailed} budget=${state.budget.used}/${ARCHIVE_DAILY_CAP} coverage n30=${archiveStatus.coverage.n30Symbols} n10=${archiveStatus.coverage.n10Symbols}`
  );
}
