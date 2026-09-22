// پایانِ روزِ `symbol_history` — «کِی» و «کدام روز» — B-055
//
// ── چه چیزی خراب بود ─────────────────────────────────────────────────────────
// `pushDailyHistory` تاریخِ ردیف را از **ساعتِ دیواری** می‌گرفت (`t.date`) و ساعت را
// با `hour12: false` می‌خواند. در ICUای که این گزینه را به چرخهٔ h24 تعبیر می‌کند،
// نیمه‌شب «24» خوانده می‌شود و از دروازهٔ «پس از ساعت ۱۴» رد می‌شود. اندازه‌گیریِ
// Production (۱۴۰۵/۰۶/۳۱):
//
//   • هر ۵۰٬۲۱۱ ردیفِ `relay_eod` ساعتِ ۰۰ تهران نوشته شده‌اند، هیچ‌کدام ساعتِ ۱۴.
//   • `fx_rates`: نخستین نوشتن ۱۴۰۵/۰۴/۲۶ ساعتِ **۱۴:۰۴**، از فردا همه ساعتِ **۰۰**.
//   • `index_history` و `market_breadth` با همان رله و همان دروازه ساعتِ **۱۴**
//     نوشته می‌شوند — چون کلیدشان تاریخِ **خودِ منبع** است، نیمه‌شب همان روزِ
//     دیروز را می‌بینند و رد می‌کنند.
//
// نتیجه: پایانیِ هر جلسه با برچسبِ **جلسهٔ بعد** ذخیره شد، و نوشتنِ نیمه‌شب با
// برچسبِ «امروز» نوشتنِ درستِ ساعتِ ۱۴ را هم با «امروز نوشته شده» مسدود کرد —
// چرخه‌ای که خودش را نگه می‌داشت. شاهدِ داده‌ای، مستقل از کد: سهمِ نمادهای مثبت در
// `market_breadth` (جلسهٔ واقعی) با `relay_eod`ِ **یک برچسب بعد** میانگین ۵ واحد
// فاصله دارد و با همان برچسب ۲۱ واحد؛ دوشنبه ۴۷٪ و سه‌شنبه ۷۹٪ دقیقاً زیرِ
// برچسب‌های سه‌شنبه و چهارشنبه پیدا می‌شوند.
//
// ── قرارداد ──────────────────────────────────────────────────────────────────
// ۱. `trade_date` تاریخِ **جلسه‌ای است که منبع می‌گوید** (`indices.date`)، نه لحظهٔ
//    نوشتن — همان الگوی `index_history` و `breadth.mjs`. پس نوشتنِ دیرهنگام یا
//    اجرا در روزِ تعطیل برچسبِ غلط نمی‌سازد: همان جلسهٔ قبلی را می‌بیند و تکراری است.
// ۲. بدونِ تاریخِ منبع **هیچ** ردیفی ساخته نمی‌شود (قاعدهٔ D2 — تاریخِ حدسی ممنوع).
// ۳. ساعت با `hourCycle: "h23"` خوانده می‌شود و هرگز «24» نیست.
//
// ⚠️ فرض: بخشِ `stocks` و `indices` در یک چرخهٔ `buildPayload` گرفته می‌شوند و پس
// از بسته‌شدنِ بازار هر دو به همان جلسه اشاره می‌کنند. `breadth.mjs` از پیش همین
// فرض را دارد (نبض را از `stocks` می‌سازد و با `indices.date` برچسب می‌زند).

import { jalaliTextToIso, jalaliYmdToGregorian } from "./codal.mjs";
import { isSubTicker, isRightsIssue } from "./symbols-util.mjs";

/**
 * تاریخ، ساعت و روزِ هفتهٔ تهران.
 *
 * `hourCycle: "h23"` به‌جای `hour12: false`: دومی در بعضی نسخه‌های ICU به h24
 * تعبیر می‌شود و نیمه‌شب را «24» برمی‌گرداند. `% 24` لایهٔ دوم است تا حتی در آن
 * حالت هم «24» به ۰ برگردد، و `NaN` همان `NaN` بماند تا دروازه بسته شود.
 */
export function tehranNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
    weekday: get("weekday"),
  };
}

/** ساعتِ تهران (۰ تا ۲۳) برای دروازه‌های پایانِ روز. */
export function tehranHour(now = new Date()) {
  return tehranNow(now).hour;
}

/**
 * «آیا بازار بسته شده؟» — به شکلِ `>=` تا `NaN` دروازه را **ببندد**. شکلِ قبلی
 * (`if (hour < afterHour) return`) با `NaN` باز می‌ماند چون `NaN < 14` نادرست است.
 */
export function isAfterClose(hour, afterHour) {
  return hour >= afterHour;
}

/** تاریخِ جلالیِ منبع («۱۴۰۵/۰۶/۲۵» یا «1405-06-25») → میلادیِ ISO، یا null. */
export function sessionTradeDate(sourceDate) {
  const j = jalaliTextToIso(sourceDate);
  if (!j) return null;
  const [y, m, d] = j.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31 || (m > 6 && d > 30)) return null;
  return jalaliYmdToGregorian(y, m, d);
}

/**
 * برنامهٔ نوشتنِ پایانِ روز — خالص، بدونِ شبکه. خروجی یا `{ skip }` است یا
 * `{ tradeDate, rows }`. شبکه و دفعِ تکرار در `server.mjs` می‌مانند.
 */
export function planEodHistory(payload, now = new Date(), afterHour = 14) {
  const t = tehranNow(now);
  if (!isAfterClose(t.hour, afterHour)) return { skip: "before-close" };
  if (t.weekday === "Thu" || t.weekday === "Fri") return { skip: "weekend" };

  const tradeDate = sessionTradeDate(payload?.indices?.date);
  if (!tradeDate) return { skip: "no-source-session-date" };

  const all = [...(payload?.stocks || []), ...(payload?.funds || [])];
  const rows = [];
  for (const r of all) {
    if (!r?.id || !(Number(r.value) > 0)) continue; // فقط نمادهای معامله‌شدهٔ همان جلسه
    // C1 — زیرنماد و حق تقدم هرگز وارد symbol_history نمی‌شوند.
    if (isSubTicker(r.id) || isRightsIssue(r.id)) continue;
    const raw = {
      eod: true,
      buy_i_vol: Number(r.buyI) || null,
      sell_i_vol: Number(r.sellI) || null,
      buy_n_vol: Number(r.buyN) || null,
      sell_n_vol: Number(r.sellN) || null,
      change_percent: typeof r.changePercent === "number" ? r.changePercent : null,
    };
    if (Number(r.nav) > 0) raw.nav_toman = Number(r.nav);
    if (typeof r.bubblePercent === "number") raw.bubble_percent = r.bubblePercent;
    rows.push({
      symbol: r.id,
      trade_date: tradeDate,
      close: r.closingPrice > 0 ? r.closingPrice * 10 : null, // تومان → ریال
      last_price: r.price > 0 ? r.price * 10 : null,
      volume: Number(r.volume) || null,
      value_traded: Number(r.value) || null,
      raw,
      source: "relay_eod",
    });
  }
  if (rows.length === 0) return { skip: `no traded rows ${tradeDate}` };
  return { tradeDate, rows };
}

/**
 * کمترین تعدادِ ردیف تا یک جلسه «کامل» حساب شود. تاریخچهٔ Production: ۸۳۲ تا
 * ۱٬۰۸۲ ردیف در هر جلسه. زیرِ این کف، نوشتن انجام می‌شود (idempotent است) ولی
 * جلسه تمام‌شده علامت نمی‌خورد تا چرخهٔ بعد ردیف‌های غایب را اضافه کند.
 */
export const MIN_EOD_ROWS = 500;

/**
 * آیا ردیفِ موجود **پس از** بسته‌شدنِ همان جلسه نوشته شده؟ یعنی محتوایش می‌تواند
 * پایانیِ همان جلسه باشد. ردیفی که روزِ جلسه پیش از ساعتِ بسته‌شدن نوشته شده
 * (رفتارِ کدِ قبلی: ۰۰:۰۰ تا ۰۰:۱۳) از نظرِ فیزیکی نمی‌تواند پایانیِ آن روز باشد.
 */
export function writtenAfterClose(capturedAt, tradeDate, afterHour = 14) {
  const t = tehranNow(new Date(capturedAt));
  if (t.date > tradeDate) return true; // نوشتنِ دیرهنگام؛ تاریخِ منبع همچنان همان جلسه بود
  return t.date === tradeDate && isAfterClose(t.hour, afterHour);
}

/** سهمِ نمادهای یکسان که بالاتر از آن دادهٔ نماد «کهنه» حساب می‌شود. */
export const STALE_IDENTICAL_SHARE = 0.95;
/** کمترین همپوشانی تا مقایسه معنا داشته باشد. */
const STALE_MIN_OVERLAP = 100;

/**
 * آیا ردیف‌ها همان آخرین جلسهٔ ثبت‌شده‌اند؟ (`close` و `value_traded` هر دو یکسان)
 */
export async function sameAsPreviousSession({ request, tradeDate, rows }) {
  const lastRes = await request(
    "GET",
    `symbol_history?select=trade_date&source=eq.relay_eod&trade_date=lt.${tradeDate}&order=trade_date.desc&limit=1`,
  );
  if (!lastRes.ok) throw new Error(`read previous session HTTP ${lastRes.status}`);
  const last = await lastRes.json();
  if (!Array.isArray(last) || last.length === 0) return { stale: false };
  const previousSession = last[0].trade_date;
  const prevRes = await request(
    "GET",
    `symbol_history?select=symbol,close,value_traded&source=eq.relay_eod&trade_date=eq.${previousSession}&limit=5000`,
  );
  if (!prevRes.ok) throw new Error(`read previous rows HTTP ${prevRes.status}`);
  const prev = new Map();
  for (const p of await prevRes.json()) prev.set(p.symbol, p);
  let overlap = 0;
  let identical = 0;
  for (const r of rows) {
    const p = prev.get(r.symbol);
    if (!p) continue;
    overlap += 1;
    if (Number(p.close) === Number(r.close) && Number(p.value_traded) === Number(r.value_traded)) identical += 1;
  }
  if (overlap < STALE_MIN_OVERLAP) return { stale: false, previousSession, identicalShare: null };
  const identicalShare = identical / overlap;
  return { stale: identicalShare >= STALE_IDENTICAL_SHARE, previousSession, identicalShare };
}

/**
 * نوشتنِ پایانِ روز — idempotent، با ترمیمِ خودکار و بدونِ دورریختنِ داده.
 *
 * `request(method, path, body?, prefer?)` → `{ ok, status, json() }`؛ در رله
 * همان fetch به PostgREST است و در آزمون یک PostgRESTِ جعلی.
 *
 * ── سه نقصی که این تابع می‌بندد (B-055، هر سه در کدِ قبلی) ──────────────
 * ۱. **خرابیِ دسته‌ای قفل می‌کرد.** بررسیِ «یک ردیف هست؟» پس از شکستِ دستهٔ دوم
 *    جلسه را نوشته‌شده می‌گرفت و بقیهٔ نمادها برای همیشه گم می‌شدند. حالا همهٔ
 *    ردیف‌های موجود خوانده و فقط غایب‌ها درج می‌شوند، با `ignore-duplicates`.
 * ۲. **برچسبِ اشغال‌شده بی‌صدا دور ریخته می‌شد.** اگر برچسبِ جلسه را پیش‌تر
 *    ردیفی از **پیش از بسته‌شدن** گرفته باشد (کدِ قبلی، روزِ گذار)، کلیدِ یکتای
 *    `(symbol, trade_date)` جا نمی‌دهد. پایانیِ درست دور ریخته نمی‌شود: در
 *    `ir_market_snapshots` زیرِ کلیدِ `eod_displaced:<تاریخ>` می‌ماند. بدونِ
 *    migration، بدونِ بازنویسیِ تاریخچه، و با حذفِ همان کلید برگشت‌پذیر.
 * ۳. **ردیفِ منبعِ دیگر** (`brsapi_candle`) برای همان نماد و روز، پیش‌تر کلِ
 *    دستهٔ ۵۰۰تایی را با 409 می‌شکست. حالا جدا شمرده و دست‌نخورده رها می‌شود.
 */
export async function writeEodHistory({ plan, request, now = new Date(), afterHour = 14 }) {
  const { tradeDate, rows } = plan;

  const exRes = await request(
    "GET",
    `symbol_history?select=symbol,source,captured_at&trade_date=eq.${tradeDate}&limit=5000`,
  );
  if (!exRes.ok) throw new Error(`read existing HTTP ${exRes.status}`);
  const existing = new Map();
  for (const e of await exRes.json()) existing.set(e.symbol, e);

  const toInsert = [];
  const displaced = [];
  let alreadyDone = 0;
  let occupiedByOtherSource = 0;
  for (const r of rows) {
    const e = existing.get(r.symbol);
    if (!e) toInsert.push(r);
    else if (e.source !== "relay_eod") occupiedByOtherSource += 1;
    else if (writtenAfterClose(e.captured_at, tradeDate, afterHour)) alreadyDone += 1;
    else displaced.push(r);
  }

  // ── سازگاریِ «تاریخِ شاخص ↔ دادهٔ نمادها» ───────────────────────────────
  // منبع برای هر ردیف تاریخ نمی‌دهد؛ برچسب از `indices.date` است. اگر شاخص جلو
  // رفته ولی ردیف‌های نماد همان جلسهٔ قبل باشند (فیدِ کهنه)، برچسبِ تازه روی
  // دادهٔ کهنه می‌نشست — دقیقاً الگوی سه جفتِ تعطیلی در Production: ۱۰۰٪ نمادها
  // با `close` و `value_traded`ِ یکسان زیرِ دو برچسب. دو جلسهٔ واقعی چنین امضایی
  // ندارند، پس این آستانه محافظه‌کارانه است.
  if (toInsert.length + displaced.length > 0) {
    const stale = await sameAsPreviousSession({ request, tradeDate, rows });
    if (stale.stale) {
      return {
        tradeDate, planned: rows.length, inserted: 0, alreadyDone, displaced: 0,
        occupiedByOtherSource, complete: false,
        stale: { previousSession: stale.previousSession, identicalShare: stale.identicalShare },
      };
    }
  }

  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500);
    const res = await request(
      "POST",
      "symbol_history?on_conflict=symbol,trade_date",
      batch,
      "resolution=ignore-duplicates,return=minimal",
    );
    if (!res.ok) throw new Error(`insert HTTP ${res.status} @batch ${i}`);
    inserted += batch.length;
  }

  if (displaced.length > 0) {
    const res = await request(
      "POST",
      "ir_market_snapshots?on_conflict=key",
      [{
        key: `eod_displaced:${tradeDate}`,
        payload: {
          session: tradeDate,
          reason: "label occupied by a row written before this session closed",
          recorded_at: now.toISOString(),
          count: displaced.length,
          rows: displaced,
        },
      }],
      "resolution=merge-duplicates,return=minimal",
    );
    if (!res.ok) throw new Error(`stash displaced HTTP ${res.status}`);
  }

  const covered = inserted + alreadyDone + displaced.length + occupiedByOtherSource;
  return {
    tradeDate,
    planned: rows.length,
    inserted,
    alreadyDone,
    displaced: displaced.length,
    occupiedByOtherSource,
    complete: covered === rows.length && rows.length >= MIN_EOD_ROWS,
  };
}
