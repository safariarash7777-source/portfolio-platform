import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { HoldingVersion, PricePoint, TargetVersion } from "./contracts";

/**
 * خواندنِ آخرین نسخهٔ دارایی و هدفِ عضو — با کلاینتِ نشست، پس RLS خودش
 * تفکیکِ کاربرها را انجام می‌دهد و این فایل لازم نیست `user_id` را دستی
 * فیلتر کند. با service-role این خاصیت از بین می‌رفت.
 *
 * وقتی migration اجرا نشده باشد، این توابع `null` می‌دهند و صفحه می‌گوید
 * قابلیت روی این محیط فعال نیست — به‌جای افتادن.
 */

export interface PortfolioSnapshot {
  holdings: HoldingVersion | null;
  target: TargetVersion | null;
  /** آیا جدول‌های phase32 روی این محیط هستند. */
  ready: boolean;
  /** نسخه‌های قبلی، برای «بازکردن دوباره». */
  history: readonly { id: string; version: number; note: string | null; createdAt: string }[];
}

export async function loadPortfolioSnapshot(versionId?: string): Promise<PortfolioSnapshot> {
  const supabase = await createClient();

  const listRes = await supabase
    .from("member_holding_versions")
    .select("id, version, note, created_at")
    .order("version", { ascending: false });

  if (listRes.error) {
    return { holdings: null, target: null, ready: false, history: [] };
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
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  let target: TargetVersion | null = null;
  if (!tgtRes.error && tgtRes.data) {
    const raw = tgtRes.data.allocations;
    const weights = Array.isArray(raw)
      ? raw
          .map((a: Record<string, unknown>) => ({
            assetClass: String(a.assetClass ?? a.asset_class ?? ""),
            weightPct: Number(a.weightPct ?? a.weight_pct ?? NaN),
          }))
          .filter((w) => w.assetClass !== "" && Number.isFinite(w.weightPct))
      : [];
    target = {
      id: tgtRes.data.id as string,
      version: tgtRes.data.version as number,
      referenceVersionId: (tgtRes.data.reference_version_id as string | null) ?? null,
      weights,
    };
  }

  return { holdings, target, ready: true, history };
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
