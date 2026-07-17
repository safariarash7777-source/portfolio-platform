// تاریخچهٔ NAV صندوق از symbol_history (ستون raw.nav_toman ردیف‌های relay_eod) — M6.
//
// رلهٔ EOD روزی یک‌بار NAV ابطال (تومان) را در raw ثبت می‌کند. این خواننده
// فقط ردیف‌های دارای nav_toman را می‌خواند؛ روز بدون NAV در سری نمی‌آید (هیچ
// درون‌یابی). قیمت پایانی ریال است → تومان (÷۱۰) تا با NAV هم‌واحد شود.

const REVALIDATE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: NavDay[] }>();

export interface NavDay {
  trade_date: string;
  /** NAV ابطال (تومان) */
  nav: number;
  /** قیمت پایانی همان روز (تومان) — null اگر ثبت نشده */
  close: number | null;
}

function env(): { url: string; anon: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url: url.replace(/\/+$/, ""), anon };
}

interface Row {
  id: number;
  trade_date: string;
  close: number | null;
  raw: { nav_toman?: number } | null;
}

/** سری روزانهٔ NAV و قیمت صندوق، صعودی. دادهٔ ناموجود = آرایهٔ خالی. */
export async function getNavHistory(symbol: string, days = 400): Promise<NavDay[]> {
  const key = `${symbol}|${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < REVALIDATE_MS) return hit.value;

  const e = env();
  if (!e) return [];

  const qs = new URLSearchParams({
    select: "id,trade_date,close,raw",
    symbol: `eq.${symbol}`,
    "raw->>nav_toman": "not.is.null",
    order: "trade_date.desc,id.desc",
    limit: String(Math.min(days * 2, 2000)),
  });

  let rows: Row[] = [];
  try {
    const res = await fetch(`${e.url}/rest/v1/symbol_history?${qs}`, {
      headers: { apikey: e.anon, Authorization: `Bearer ${e.anon}` },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    rows = (await res.json()) as Row[];
  } catch {
    return [];
  }

  // dedupe هر تاریخ: جدیدترین id برنده (order از قبل نزولی است)
  const byDate = new Map<string, Row>();
  for (const r of rows) {
    if (!byDate.has(r.trade_date)) byDate.set(r.trade_date, r);
  }

  const out: NavDay[] = [...byDate.values()]
    .map((r) => {
      const nav = Number(r.raw?.nav_toman);
      if (!isFinite(nav) || nav <= 0) return null;
      const closeRial = Number(r.close);
      return {
        trade_date: r.trade_date,
        nav,
        close: isFinite(closeRial) && closeRial > 0 ? Math.round(closeRial / 10) : null,
      };
    })
    .filter((x): x is NavDay => x != null)
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date))
    .slice(-days);

  cache.set(key, { at: Date.now(), value: out });
  return out;
}
