import "server-only";
import { createClient } from "@/lib/supabase/server";
import { safeRead, readState, type ReadState } from "@/lib/read-state";
import type { HoldingPosition, HoldingVersion } from "./contracts";
import { priceableSymbols, type SymbolHistoryRow } from "./prices";
import { positionFromStored, debtFromStored, type DebtPosition } from "./balanceSheet";

/**
 * خواندنِ داراییِ **خودِ کاربرِ نشست** و هدفِ او.
 *
 * ⚠️ تکیه به RLS اینجا کافی **نیست** و این یک درسِ بازبینیِ مستقل است.
 * سیاستِ قدیمی `mhv_self_read` مدیر را هم مجاز می‌کرد. نتیجه‌اش این بود که در نشستِ مدیر، همین صفحه نسخه‌های
 * **همهٔ اعضا** را با هم قاطی می‌کرد و `history[0]` بزرگ‌ترین شمارهٔ نسخه
 * بینِ همه بود، نه داراییِ خودِ مدیر. هدف هم می‌توانست مالِ عضوِ دیگری شود.
 *
 * پس هویتِ نشست گرفته می‌شود و هر دو پرس‌وجو صریح به همان `user_id` محدود
 * می‌شوند. RLS لایهٔ دوم می‌ماند، نه تنها لایه. دسترسیِ مدیریتی به سبدِ
 * اعضا اگر لازم شد، مسیرِ صریحِ جداگانه می‌خواهد، نه همین صفحه.
 *
 * سیاستِ فعلی فقط مالک را مجاز می‌کند. خطای خواندن یا نبود زیرساخت،
 * `ready: false` می‌دهد؛ خطا به‌عنوان دارایی خالی نمایش داده نمی‌شود.
 */

export interface PortfolioSnapshot {
  holdings: HoldingVersion | null;
  holdingsState?: "ready" | "empty" | "error" | "not_found";
  targetState?: "ready" | "empty" | "error";
  /**
   * هدفِ **خام**، همان‌طور که ذخیره شده.
   *
   * ⚠️ عمداً اینجا پارس نمی‌شود: ترجمه و اعتبارسنجی در `buildHoldingsView`
   * انجام می‌شود تا همان مسیری که صفحه می‌پیماید مستقیم آزمون‌پذیر باشد.
   */
  storedTarget: {
    id: string;
    version: number;
    referenceVersionId: string | null;
    allocations: unknown;
  } | null;
  /** آیا جدول‌های phase32 روی این محیط هستند. */
  ready: boolean;
  /** نسخه‌های قبلی، برای «بازکردن دوباره». */
  history: readonly { id: string; version: number; note: string | null; createdAt: string }[];
}

export async function loadPortfolioSnapshot(versionId?: string, connect = createClient): Promise<PortfolioSnapshot> {
  const failed: PortfolioSnapshot = { holdings: null, storedTarget: null, ready: false, holdingsState: "error", targetState: "error", history: [] };
  let supabase: Awaited<ReturnType<typeof createClient>>;
  let user: { id: string };
  try {
    supabase = await connect();
    const auth = await supabase.auth.getUser();
    if (auth.error || !auth.data.user) return failed;
    user = auth.data.user;
  } catch { return failed; }

  const listRes = await safeRead(supabase
    .from("member_holding_versions")
    .select("id, version, note, created_at")
    .eq("user_id", user.id)
    .order("version", { ascending: false }));

  if (listRes.error) {
    return { holdings: null, storedTarget: null, ready: false, holdingsState: "error", targetState: "error", history: [] };
  }

  const history = (listRes.data ?? []).map((v) => ({
    id: v.id as string,
    version: v.version as number,
    note: (v.note as string | null) ?? null,
    createdAt: v.created_at as string,
  }));

  const chosen = versionId
    ? history.find((v) => v.id === versionId) ?? null
    : history[0] ?? null;

  if (versionId && !chosen) return { holdings: null, storedTarget: null, ready: false, holdingsState: "not_found", history };
  let holdings: HoldingVersion | null = null;
  let holdingsState: "ready" | "empty" | "error" = chosen ? "ready" : "empty";
  if (chosen) {
    const posRes = await safeRead(supabase
      .from("member_holding_positions")
      .select("position_key, symbol, manual_label, asset_class, qty, unit, cost_basis, as_of, title, ownership_pct, valuation_mode, declared_value, valuation_source, valuation_as_of, valuation_status")
      .eq("version_id", chosen.id));
    if (posRes.error) holdingsState = "error";
    if (!posRes.error) {
      holdings = {
        id: chosen.id,
        version: chosen.version,
        positions: (posRes.data ?? []).map(positionFromStored),
      };
    }
  }

  const tgtRes = await safeRead(supabase
    .from("portfolio_versions")
    .select("id, version, allocations")
    .eq("user_id", user.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle());

  const storedTarget =
    !tgtRes.error && tgtRes.data
      ? {
          id: tgtRes.data.id as string,
          version: tgtRes.data.version as number,
          referenceVersionId: null, // Legacy main has no reference-version column; do not infer one.
          allocations: tgtRes.data.allocations as unknown,
        }
      : null;

  return { holdings, storedTarget, ready: holdingsState !== "error", holdingsState, targetState: tgtRes.error ? "error" : storedTarget ? "ready" : "empty", history };
}

export async function loadVersionDebts(versionId: string | null): Promise<{ ready: boolean; debts: DebtPosition[] }> {
  if (!versionId) return { ready: true, debts: [] };
  const db = await createClient();
  const result = await safeRead(db.from("member_debt_positions").select("*").eq("version_id", versionId).order("debt_key"));
  return { ready: !result.error, debts: (result.data ?? []).map(debtFromStored) };
}
/**
 * قیمت‌ها از `symbol_history` — با زمان، منبع و واحدِ روشن.
 *
 * ⚠️ عمداً از `holdings.current_price` خوانده **نمی‌شود**. آن ستون عددی است
 * بدونِ منبع و بدونِ زمانِ قیمت (تنها مهرش `updated_at`ِ ردیف است)، پس عددِ
 * قطعیِ ریبالانس رویش ساخته نمی‌شود.
 *
 * فقط نمادهای همین دارایی خوانده می‌شوند و پرس‌وجو با `.in()` کراندار است.
 * قلمِ دستی و زیرنمادِ رقم‌دار اصلاً درخواست نمی‌شوند، پس نتیجه‌شان «پوششِ
 * ناقص» می‌شود — که همان حقیقت است، نه یک خطا.
 */
export async function loadPriceRows(
  positions: readonly HoldingPosition[]
): Promise<ReadState<SymbolHistoryRow[]>> {
  const symbols = priceableSymbols(positions.filter(p => !p.valuationMode || p.valuationMode === "market"));
  if (symbols.length === 0) return { status: "empty", data: null };

  const supabase = await createClient();
  // سقفِ محافظه‌کارانه: جدول append-only است و یک روز ممکن است چند بار درج
  // شده باشد؛ انتخابِ بیشینه در `buildPriceMap` این را پوشش می‌دهد.
  const res = await safeRead(supabase
    .from("symbol_history")
    .select("symbol, trade_date, close, last_price, source")
    .in("symbol", symbols)
    .order("trade_date", { ascending: false })
    .limit(Math.min(symbols.length * 10, 500)));

  return readState(res, "PORTFOLIO_PRICES");
}
