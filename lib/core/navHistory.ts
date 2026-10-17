import { readUniqueHistoryRows } from "./history";

// تاریخچهٔ NAV صندوق از symbol_history (ستون raw.nav_toman ردیف‌های relay_eod) — M6.
//
// رلهٔ EOD روزی یک‌بار NAV ابطال (تومان) را در raw ثبت می‌کند. این خواننده
// فقط ردیف‌های دارای nav_toman را می‌خواند؛ روز بدون NAV در سری نمی‌آید (هیچ
// درون‌یابی). قیمت پایانی ریال است → تومان (÷۱۰) تا با NAV هم‌واحد شود.

const REVALIDATE_MS = 60 * 1000;
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

  if (!Number.isSafeInteger(days) || days <= 0) return [];
  const qs = new URLSearchParams({
    select: "id,trade_date,close,raw", symbol: `eq.${symbol}`,
    "raw->>nav_toman": "not.is.null",
  });
  const rows = await readUniqueHistoryRows<Row>(e, qs, days, row => {
    const nav = Number(row.raw?.nav_toman);
    return Number.isFinite(nav) && nav > 0;
  });
  if (rows === null) return [];

  const out: NavDay[] = rows
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
