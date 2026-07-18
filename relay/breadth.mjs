// ── تجمیع روزانهٔ پایان‌بازار → market_breadth (فاز ۱۷ — داشبورد «امروز بازار») ──
// روزی یک ردیف EOD از اسنپ‌شات موجود (سهام؛ صندوق‌ها جدا هستند) — صفر درخواست جدید
// به BrsApi. کلید dedup: jdate unique (تاریخ جلالی خود اسنپ‌شات) — روز تعطیل درج
// نمی‌شود چون indices.date همان آخرین روز معاملاتی می‌ماند و unique رد می‌کند (409 بی‌خطر).
// append-only: فقط INSERT — هیچ UPDATE/DELETE.

export let breadthStatus = { lastJdate: null, error: null };

/** آیا نماد در صف خرید است؟ (بهترین تقاضا روی سقف دامنه و عرضهٔ صفر)
 * فقط وقتی هر سه فیلد لازم موجود باشد قضاوت می‌کند — غایب → false (هیچ حدسی).
 */
export function isBuyQueue(r) {
  return (
    Number(r?.bandHigh) > 0 &&
    Number(r?.bestBidPrice) > 0 &&
    r?.bestAskVolume != null &&
    Number(r.bestBidPrice) >= Number(r.bandHigh) &&
    Number(r.bestAskVolume) === 0
  );
}

/** آیا نماد در صف فروش است؟ (بهترین عرضه روی کف دامنه و تقاضای صفر) */
export function isSellQueue(r) {
  return (
    Number(r?.bandLow) > 0 &&
    Number(r?.bestAskPrice) > 0 &&
    r?.bestBidVolume != null &&
    Number(r.bestAskPrice) <= Number(r.bandLow) &&
    Number(r.bestBidVolume) === 0
  );
}

/**
 * محاسبهٔ ردیف market_breadth از سهام اسنپ‌شات (تومان) — خروجی مقادیر پولی ریال
 * (×۱۰ — هم‌واحد با symbol_history/index_history).
 * فقط نمادهای معامله‌شده (value>0) در «نبض» شمرده می‌شوند؛ صف‌ها روی همهٔ سهام دارای فیلد.
 */
export function computeBreadth(stocks) {
  const traded = (stocks || []).filter((r) => Number(r?.value) > 0);
  let pos = 0, neg = 0, flat = 0;
  let buyI = 0, sellI = 0, buyCnt = 0, sellCnt = 0, tradeValue = 0;
  for (const r of traded) {
    const cp = Number(r.closingChangePercent ?? r.changePercent);
    if (isFinite(cp)) {
      if (cp > 0.5) pos++;
      else if (cp < -0.5) neg++;
      else flat++;
    }
    tradeValue += Number(r.value) || 0; // value اسنپ‌شات: ریال (tval خام)
    const close = Number(r.closingPrice) || 0; // تومان
    buyI += (Number(r.buyI) || 0) * close * 10; // ریال
    sellI += (Number(r.sellI) || 0) * close * 10;
    buyCnt += Number(r.buyCountI) || 0;
    sellCnt += Number(r.sellCountI) || 0;
  }
  let bq = 0, sq = 0, bqVal = 0, sqVal = 0;
  for (const r of stocks || []) {
    if (isBuyQueue(r)) {
      bq++;
      bqVal += (Number(r.bestBidVolume) || 0) * (Number(r.bestBidPrice) || 0) * 10; // ریال
    } else if (isSellQueue(r)) {
      sq++;
      sqVal += (Number(r.bestAskVolume) || 0) * (Number(r.bestAskPrice) || 0) * 10;
    }
  }
  // توجه: ارزش صف خرید از حجم «تقاضای سطر اول» است؛ چون در صف خرید عرضه صفر است،
  // این همان تعریف اعلام‌شده است (حجم سطر اول × قیمت سطر اول).
  return {
    pos_count: pos,
    neg_count: neg,
    flat_count: flat,
    total_traded: traded.length,
    buy_queue_count: bq,
    sell_queue_count: sq,
    buy_queue_value: bqVal > 0 ? Math.round(bqVal) : null,
    sell_queue_value: sqVal > 0 ? Math.round(sqVal) : null,
    net_real_flow: Math.round(buyI - sellI),
    per_capita_buy: buyCnt > 0 ? Math.round(buyI / buyCnt) : null,
    per_capita_sell: sellCnt > 0 ? Math.round(sellI / sellCnt) : null,
    trade_value: tradeValue > 0 ? Math.round(tradeValue) : null,
  };
}

/**
 * درج روزانه (از refresh رله بعد از ساعت بازار صدا زده می‌شود — الگوی pushDailyIndex).
 * @param {object} cfg { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EOD_AFTER_HOUR }
 * @param {object|string} body payload اسنپ‌شات
 */
export async function pushDailyBreadth(cfg, body) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EOD_AFTER_HOUR = 14 } = cfg || {};
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  const hourTehran = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", hour: "2-digit", hour12: false }).format(new Date()),
  );
  if (hourTehran < EOD_AFTER_HOUR) return; // فقط پس از ساعت بازار — رقم پایان روز
  const p = typeof body === "string" ? JSON.parse(body) : body;
  const jdate = p?.indices?.date ? String(p.indices.date).trim() : null;
  if (!jdate) return; // بدون تاریخ منبع → هیچ درجی
  if (breadthStatus.lastJdate === jdate) return; // همین روز قبلاً درج شد
  const stocks = Array.isArray(p?.stocks) ? p.stocks : [];
  if (stocks.length === 0) return; // بدون دادهٔ سهام → هیچ درجی
  const row = { jdate, ...computeBreadth(stocks), source: "relay_eod" };
  if (!(row.total_traded > 0)) return; // روزی که هیچ نمادی معامله نشده → درج نمی‌شود
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/market_breadth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify([row]),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok || res.status === 409) {
      // 409 = این روز قبلاً درج شده (بعد از ری‌دیپلوی/روز تعطیل) — هدف محقق است.
      breadthStatus = { lastJdate: jdate, error: null };
      if (res.ok) console.log(`market breadth push ok: ${jdate} traded=${row.total_traded} net=${row.net_real_flow}`);
    } else if (res.status === 404) {
      breadthStatus = { ...breadthStatus, error: "market_breadth table missing (run phase17)" };
    } else {
      breadthStatus = { ...breadthStatus, error: `HTTP ${res.status}` };
      console.error(`market breadth push: HTTP ${res.status}`);
    }
  } catch (e) {
    breadthStatus = { ...breadthStatus, error: String(e?.message || e) };
    console.error("market breadth push error:", breadthStatus.error);
  }
}
