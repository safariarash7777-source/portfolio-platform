import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { HoldingPosition, HoldingVersion } from "./contracts";
import { priceableSymbols, type SymbolHistoryRow } from "./prices";

/**
 * خواندنِ داراییِ **خودِ کاربرِ نشست** و هدفِ او.
 *
 * ⚠️ تکیه به RLS اینجا کافی **نیست** و این یک درسِ بازبینیِ مستقل است.
 * سیاستِ `mhv_self_read` عمداً `is_admin()` را هم مجاز می‌کند تا مدیر بتواند
 * پشتیبانی کند. نتیجه‌اش این بود که در نشستِ مدیر، همین صفحه نسخه‌های
 * **همهٔ اعضا** را با هم قاطی می‌کرد و `history[0]` بزرگ‌ترین شمارهٔ نسخه
 * بینِ همه بود، نه داراییِ خودِ مدیر. هدف هم می‌توانست مالِ عضوِ دیگری شود.
 *
 * پس هویتِ نشست گرفته می‌شود و هر دو پرس‌وجو صریح به همان `user_id` محدود
 * می‌شوند. RLS لایهٔ دوم می‌ماند، نه تنها لایه. دسترسیِ مدیریتی به سبدِ
 * اعضا اگر لازم شد، مسیرِ صریحِ جداگانه می‌خواهد، نه همین صفحه.
 *
 * وقتی migration اجرا نشده باشد، این توابع `ready: false` می‌دهند و صفحه
 * می‌گوید قابلیت روی این محیط فعال نیست — به‌جای افتادن.
 */

export interface PortfolioSnapshot {
  holdings: HoldingVersion | null;
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

export async function loadPortfolioSnapshot(versionId?: string): Promise<PortfolioSnapshot> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { holdings: null, storedTarget: null, ready: true, history: [] };
  }

  const listRes = await supabase
    .from("member_holding_versions")
    .select("id, version, note, created_at")
    .eq("user_id", user.id)
    .order("version", { ascending: false });

  if (listRes.error) {
    return { holdings: null, storedTarget: null, ready: false, history: [] };
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

  let holdings: HoldingVersion | null = null;
  if (chosen) {
    const posRes = await supabase
      .from("member_holding_positions")
      .select("position_key, symbol, manual_label, asset_class, qty, unit, cost_basis, as_of")
      .eq("version_id", chosen.id);
    if (!posRes.error) {
      holdings = {
        id: chosen.id,
        version: chosen.version,
        positions: (posRes.data ?? []).map((p) => ({
          positionKey: p.position_key as string,
          symbol: (p.symbol as string | null) ?? null,
          manualLabel: (p.manual_label as string | null) ?? null,
          assetClass: p.asset_class as string,
          qty: Number(p.qty),
          unit: p.unit as string,
          costBasis: p.cost_basis === null ? null : Number(p.cost_basis),
          asOf: p.as_of as string,
        })),
      };
    }
  }

  const tgtRes = await supabase
    .from("portfolio_versions")
    .select("id, version, allocations, reference_version_id")
    .eq("user_id", user.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const storedTarget =
    !tgtRes.error && tgtRes.data
      ? {
          id: tgtRes.data.id as string,
          version: tgtRes.data.version as number,
          referenceVersionId: (tgtRes.data.reference_version_id as string | null) ?? null,
          allocations: tgtRes.data.allocations as unknown,
        }
      : null;

  return { holdings, storedTarget, ready: true, history };
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
): Promise<SymbolHistoryRow[]> {
  const symbols = priceableSymbols(positions);
  if (symbols.length === 0) return [];

  const supabase = await createClient();
  // سقفِ محافظه‌کارانه: جدول append-only است و یک روز ممکن است چند بار درج
  // شده باشد؛ انتخابِ بیشینه در `buildPriceMap` این را پوشش می‌دهد.
  const res = await supabase
    .from("symbol_history")
    .select("symbol, trade_date, close, last_price, source")
    .in("symbol", symbols)
    .order("trade_date", { ascending: false })
    .limit(Math.min(symbols.length * 10, 500));

  if (res.error) {
    // خطای خواندنِ قیمت «قیمتِ صفر» نیست. فهرستِ خالی یعنی پوششِ ناقص و
    // موتور هیچ عددِ قطعی نمی‌سازد.
    console.error("symbol_history read failed:", res.error.message);
    return [];
  }

  return (res.data ?? []) as SymbolHistoryRow[];
}
