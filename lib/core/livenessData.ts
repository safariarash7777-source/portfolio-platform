/**
 * لایهٔ دادهٔ «زندگیِ نماد» — ورودی‌های `symbolLiveness` را از جایی که واقعاً
 * هست می‌آورد، و وقتی نیست **حدس نمی‌زند**.
 *
 * ── دو منبع، دو نقش ─────────────────────────────────────────────────────────
 *   • `symbol_last_trade_dates()` (RPCِ `phase29`) → آخرین ردیفِ هر نماد.
 *   • اسنپ‌شاتِ زندهٔ تابلو (`IrMarket`)           → چه کسی همین حالا هست.
 * بدونِ دومی، «عقب‌ماندگیِ لوله» از «نمادِ متوقف» قابلِ تفکیک نیست — پس اگر
 * تابلو نباشد رأی به `undetermined` می‌رود، نه به یک حدسِ خوش‌بینانه.
 *
 * ── چرا «تابع نیست» یک حالتِ صریح است ───────────────────────────────────────
 * `phase29` هنوز روی Production اجرا نشده (`MIGRATION-LEDGER`). تا آن روز این
 * تابع `null` برمی‌گرداند و صفحه باید بگوید «نمی‌دانیم»، نه اینکه همه را
 * «زنده» نشان دهد. سکوت بدترین حالتِ ممکن است: دقیقاً همان نقصی که این
 * ماژول برای بستنش نوشته شد.
 */
import {
  buildLivenessReport,
  type LivenessReport,
  type SymbolRow,
} from "./symbolLiveness";

/** چرا گزارش ساخته نشد — برای نمایشِ صادقانه، نه فقط لاگ. */
export type LivenessUnavailable =
  | "no_supabase_env"
  | "rpc_missing"      // `phase29` هنوز اجرا نشده
  | "rpc_error"
  | "no_board";        // اسنپ‌شاتِ تابلو در دسترس نیست

export interface LivenessOutcome {
  report: LivenessReport | null;
  unavailable: LivenessUnavailable | null;
}

/** حداقلِ چیزی که از تابلو لازم داریم — تا این ماژول به `lib/market-ir` گره نخورد. */
export interface BoardSnapshot {
  /** شناسهٔ همهٔ ابزارهای روی تابلو (سهام + صندوق). */
  ids: string[];
  /** چند تا از آنها حجمِ امروزِ بزرگ‌تر از صفر داشتند. */
  withVolume: number;
  /** مهرِ زمانیِ گرفتنِ تابلو (ms). */
  fetchedAt: number;
}

interface RpcRow { symbol: string; last_trade_date: string | null }

const REVALIDATE_MS = 10 * 60 * 1000;
let cacheAt = 0;
let cacheVal: LivenessOutcome | null = null;

function env(): { url: string; anon: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url: url.replace(/\/+$/, ""), anon };
}

/** خروجیِ خامِ RPC. `null` یعنی نشد — با «خالی بود» یکی نیست. */
export async function fetchLastTradeDates(
  fetchImpl: typeof fetch = fetch,
): Promise<{ rows: RpcRow[] | null; why: LivenessUnavailable | null }> {
  const e = env();
  if (!e) return { rows: null, why: "no_supabase_env" };
  try {
    const res = await fetchImpl(`${e.url}/rest/v1/rpc/symbol_last_trade_dates`, {
      method: "POST",
      headers: {
        apikey: e.anon,
        Authorization: `Bearer ${e.anon}`,
        "content-type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(15_000),
    });
    // ۴۰۴ یعنی تابع وجود ندارد — یعنی `phase29` اجرا نشده. این با «خطا» یکی
    // نیست و پیغامِ متفاوتی لازم دارد.
    if (res.status === 404) return { rows: null, why: "rpc_missing" };
    if (!res.ok) return { rows: null, why: "rpc_error" };
    const json = await res.json();
    if (!Array.isArray(json)) return { rows: null, why: "rpc_error" };
    return { rows: json as RpcRow[], why: null };
  } catch {
    return { rows: null, why: "rpc_error" };
  }
}

/** ترکیبِ RPC و تابلو → گزارش. تابعِ خالص تا تست به شبکه نیاز نداشته باشد. */
export function composeLiveness(
  rpcRows: RpcRow[],
  board: BoardSnapshot,
  now: number,
): LivenessReport {
  const onBoard = new Set(board.ids);
  const rows: SymbolRow[] = rpcRows.map((r) => ({
    symbol: r.symbol,
    lastTradeDate: r.last_trade_date,
    onBoard: onBoard.has(r.symbol),
  }));
  // نمادی که روی تابلو هست ولی هیچ ردیفِ تاریخی ندارد هم باید دیده شود،
  // وگرنه «تازه‌پذیرفته‌شده» بی‌صدا از گزارش می‌افتد.
  const known = new Set(rpcRows.map((r) => r.symbol));
  for (const id of board.ids) {
    if (!known.has(id)) rows.push({ symbol: id, lastTradeDate: null, onBoard: true });
  }
  return buildLivenessReport(rows, {
    boardFetchedAt: board.fetchedAt,
    now,
    boardSymbols: board.ids.length,
    boardWithVolume: board.withVolume,
  });
}

export async function getLivenessReport(
  board: BoardSnapshot | null,
  now: number = Date.now(),
): Promise<LivenessOutcome> {
  if (cacheVal && now - cacheAt < REVALIDATE_MS) return cacheVal;
  if (!board) return { report: null, unavailable: "no_board" };

  const { rows, why } = await fetchLastTradeDates();
  const out: LivenessOutcome = rows
    ? { report: composeLiveness(rows, board, now), unavailable: null }
    : { report: null, unavailable: why ?? "rpc_error" };

  // فقط نتیجهٔ موفق کش می‌شود؛ وگرنه یک قطعیِ لحظه‌ای ده دقیقه «نمی‌دانم» را
  // ماندگار می‌کرد.
  if (out.report) { cacheVal = out; cacheAt = now; }
  return out;
}

/** فقط برای تست. */
export function resetLivenessCache(): void {
  cacheVal = null;
  cacheAt = 0;
}
