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
