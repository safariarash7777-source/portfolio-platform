import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { HoldingVersion, PricePoint, TargetVersion } from "./contracts";
import { parseStoredAllocations, describeTargetProblems } from "./targetContract";

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
  target: TargetVersion | null;
  /** مشکل‌های سبدِ هدف — دستهٔ ناشناخته یا دادهٔ خراب. خالی = سالم. */
  targetProblems: readonly string[];
  /** آیا جدول‌های phase32 روی این محیط هستند. */
  ready: boolean;
  /** نسخه‌های قبلی، برای «بازکردن دوباره». */
  history: readonly { id: string; version: number; note: string | null; createdAt: string }[];
}

export async function loadPortfolioSnapshot(versionId?: string): Promise<PortfolioSnapshot> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { holdings: null, target: null, targetProblems: [], ready: true, history: [] };
  }

  const listRes = await supabase
    .from("member_holding_versions")
    .select("id, version, note, created_at")
    .eq("user_id", user.id)
    .order("version", { ascending: false });

  if (listRes.error) {
    return { holdings: null, target: null, targetProblems: [], ready: false, history: [] };
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

  let target: TargetVersion | null = null;
  let targetProblems: string[] = [];
  if (!tgtRes.error && tgtRes.data) {
    // ⚠️ شکلِ ذخیره‌شده `{asset, pct, note}` است، نه `{assetClass, weightPct}`.
    // نسخهٔ قبل مستقیم دنبالِ کلیدهای تازه می‌گشت و چون هیچ‌کدام نبودند،
    // `weights` همیشه خالی می‌شد — یعنی سبدِ هدفِ واقعیِ کاربر بی‌صدا ناپدید
    // می‌شد. آداپتور صریح این را ترجمه می‌کند و دستهٔ ناشناخته را حدس نمی‌زند.
    const parsed = parseStoredAllocations(tgtRes.data.allocations);
    targetProblems = describeTargetProblems(parsed);
    target = {
      id: tgtRes.data.id as string,
      version: tgtRes.data.version as number,
      referenceVersionId: (tgtRes.data.reference_version_id as string | null) ?? null,
      weights: parsed.weights,
    };
  }

  return { holdings, target, targetProblems, ready: true, history };
}

/**
 * قیمت‌ها — فعلاً هیچ منبعِ خودکاری وصل نیست.
 *
 * ⚠️ عمداً نقشهٔ خالی برمی‌گردد به‌جای اینکه از `holdings.current_price`
 * بخواند. آن ستون عددی است بدونِ منبع و بدونِ زمانِ قیمت (تنها مهرش
 * `updated_at`ِ ردیف است). استفاده از آن یعنی تولیدِ عددِ قطعیِ ریبالانس روی
 * قیمتی که نمی‌دانیم از کجا و کِی آمده — دقیقاً همان چیزی که `#140` منع
 * می‌کند. تا وصل‌شدنِ منبعِ دارای زمان، موتور «پوششِ ناقص» گزارش می‌دهد و
 * هیچ مقدارِ قطعی نمی‌سازد.
 */
export async function loadPrices(): Promise<Map<string, PricePoint>> {
  return new Map();
}
