// ذخیره/بازیابی seed های داشبورد ارز در Supabase — «به‌روزرسانی بدون دیپلوی».
//
// طراحی: از جدول موجود ir_market_snapshots (key text PK, payload jsonb, updated_at)
// استفاده می‌شود — بدون DDL جدید. RLS از قبل درست است: خواندن عمومی، نوشتن فقط
// service_role (این ماژول server-only است و فقط از API ادمین صدا زده می‌شود).
//
// کلیدها:
//   fx_seed_macro_annual | fx_seed_cpi_monthly | fx_seed_ytm_monthly | fx_seed_base_rates
//     → نسخهٔ فعال (payload = { rows, meta })
//   fx_seed_history
//     → نسخه‌بندی: آرایهٔ حداکثر ۲۰ نسخهٔ اخیر از همهٔ انواع، برای ارزیابی
//       گذشته‌نگر (هر نسخه: kind + uploaded_at + rows) — «دیتای دیروز چه بود؟»
//
// قانون صادق‌بودن: اگر override موجود نباشد یا شبکه خطا بدهد، dataLoader به
// seed های JSON داخل ریپو برمی‌گردد (fallback همیشه موجود).

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SeedKind = "macro_annual" | "cpi_monthly" | "ytm_monthly" | "base_rates";

export const SEED_KINDS: SeedKind[] = ["macro_annual", "cpi_monthly", "ytm_monthly", "base_rates"];

export interface SeedMeta {
  /** نام فایل اکسل منبع (یا «ویرایش دستی») */
  sourceFile: string;
  /** تعداد ردیف/کلید */
  rows: number;
  /** بازهٔ پوشش («1338..1406» یا «1399/01..1405/03») */
  range: string;
  /** زمان آپلود ISO */
  uploadedAt: string;
  /** ایمیل ادمین آپلودکننده */
  uploadedBy: string;
}

export interface SeedPayload {
  rows: unknown;
  meta: SeedMeta;
}

export interface SeedStatus {
  kind: SeedKind;
  /** «supabase» = override فعال؛ «repo» = seed داخل ریپو */
  source: "supabase" | "repo";
  meta: SeedMeta | null;
}

const KEY_PREFIX = "fx_seed_";
const HISTORY_KEY = "fx_seed_history";
const MAX_HISTORY = 20;

function keyOf(kind: SeedKind): string {
  return `${KEY_PREFIX}${kind}`;
}

/** خواندن override فعال (کلاینت سرورِ عادی — خواندن عمومی مجاز است). */
export async function readSeedOverride(kind: SeedKind): Promise<SeedPayload | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("ir_market_snapshots")
      .select("payload")
      .eq("key", keyOf(kind))
      .maybeSingle();
    const p = data?.payload as SeedPayload | undefined;
    return p && p.rows != null && p.meta ? p : null;
  } catch {
    return null;
  }
}

/** خواندن همهٔ override ها یک‌جا (برای dataLoader — یک رفت‌وبرگشت). */
export async function readAllSeedOverrides(): Promise<Partial<Record<SeedKind, SeedPayload>>> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("ir_market_snapshots")
      .select("key,payload")
      .in("key", SEED_KINDS.map(keyOf));
    const out: Partial<Record<SeedKind, SeedPayload>> = {};
    for (const row of data ?? []) {
      const kind = String(row.key).slice(KEY_PREFIX.length) as SeedKind;
      const p = row.payload as SeedPayload;
      if (SEED_KINDS.includes(kind) && p?.rows != null && p?.meta) out[kind] = p;
    }
    return out;
  } catch {
    return {};
  }
}

/** ذخیرهٔ override جدید + افزودن به تاریخچهٔ نسخه‌ها (service_role). */
export async function writeSeedOverride(kind: SeedKind, payload: SeedPayload): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("ir_market_snapshots")
    .upsert({ key: keyOf(kind), payload, updated_at: new Date().toISOString() });
  if (error) throw new Error(`ذخیرهٔ ${kind} ناموفق: ${error.message}`);

  // نسخه‌بندی: نسخهٔ جدید به ابتدای تاریخچه؛ حداکثر MAX_HISTORY نسخه.
  try {
    const { data } = await admin
      .from("ir_market_snapshots")
      .select("payload")
      .eq("key", HISTORY_KEY)
      .maybeSingle();
    const hist: Array<{ kind: SeedKind; payload: SeedPayload }> = Array.isArray(
      (data?.payload as { versions?: unknown })?.versions
    )
      ? ((data!.payload as { versions: Array<{ kind: SeedKind; payload: SeedPayload }> }).versions)
      : [];
    hist.unshift({ kind, payload });
    await admin.from("ir_market_snapshots").upsert({
      key: HISTORY_KEY,
      payload: { versions: hist.slice(0, MAX_HISTORY) },
      updated_at: new Date().toISOString(),
    });
  } catch {
    // تاریخچه بهترین‌تلاش است؛ شکستش نباید آپلود را خراب کند.
  }
}

/** حذف override (بازگشت به seed ریپو). */
export async function deleteSeedOverride(kind: SeedKind): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("ir_market_snapshots").delete().eq("key", keyOf(kind));
  if (error) throw new Error(`حذف ${kind} ناموفق: ${error.message}`);
}

/** فهرست نسخه‌های تاریخچه (متادیتا فقط — برای UI). */
export async function listSeedHistory(): Promise<Array<{ kind: SeedKind; meta: SeedMeta }>> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("ir_market_snapshots")
      .select("payload")
      .eq("key", HISTORY_KEY)
      .maybeSingle();
    const versions = (data?.payload as { versions?: Array<{ kind: SeedKind; payload: SeedPayload }> })?.versions;
    return (versions ?? []).map((v) => ({ kind: v.kind, meta: v.payload.meta }));
  } catch {
    return [];
  }
}
