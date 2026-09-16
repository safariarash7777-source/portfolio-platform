import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/portfolio/holdings — ثبتِ نسخهٔ تازهٔ داراییِ واقعیِ عضو.
 *
 * ── چرا کلاینتِ نشست و نه service-role ─────────────────────────────────────
 * `record_member_holdings` هویت را از `auth.uid()` می‌گیرد و **هرگز**
 * `user_id` از بیرون نمی‌پذیرد. یعنی «ثبت برای کاربرِ دیگر» حتی قابلِ بیان
 * هم نیست. با service-role این خاصیت از بین می‌رفت چون `auth.uid()` تهی
 * می‌شد و RLS هم دور زده می‌شد.
 *
 * ── ایده‌مپوتنسی ───────────────────────────────────────────────────────────
 * `client_token` در دیتابیس یکتاست. رفرشِ صفحه، دوبار کلیک یا retryِ شبکه
 * نسخهٔ تکراری نمی‌سازد؛ همان نسخه با `reused: true` برمی‌گردد.
 */
interface IncomingPosition {
  position_key?: unknown;
  symbol?: unknown;
  manual_label?: unknown;
  asset_class?: unknown;
  qty?: unknown;
  unit?: unknown;
  cost_basis?: unknown;
  as_of?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** اعتبارسنجی در سرور هم انجام می‌شود، نه فقط در دیتابیس — خطای تمیزتر. */
function normalise(raw: IncomingPosition, index: number): Record<string, string | number> {
  const at = `قلم ${index + 1}`;
  const positionKey = str(raw.position_key);
  if (!positionKey) throw new Error(`${at}: شناسهٔ قلم الزامی است.`);

  const symbol = str(raw.symbol);
  const manualLabel = str(raw.manual_label);
  if (Boolean(symbol) === Boolean(manualLabel)) {
    throw new Error(`${at}: دقیقاً یکی از «نماد» یا «برچسب دستی» باید پر باشد.`);
  }

  const assetClass = str(raw.asset_class);
  if (!assetClass) throw new Error(`${at}: دستهٔ دارایی الزامی است.`);

  const qty = typeof raw.qty === "number" ? raw.qty : Number(str(raw.qty));
  if (!Number.isFinite(qty) || qty <= 0) throw new Error(`${at}: مقدار باید عددی بزرگ‌تر از صفر باشد.`);

  const unit = str(raw.unit);
  if (!unit) throw new Error(`${at}: واحد الزامی است.`);

  const asOf = str(raw.as_of);
  if (!ISO_DATE.test(asOf)) throw new Error(`${at}: تاریخ باید به شکل YYYY-MM-DD باشد.`);

  const out: Record<string, string | number> = {
    position_key: positionKey,
    asset_class: assetClass,
    qty,
    unit,
    as_of: asOf,
  };
  if (symbol) out.symbol = symbol;
  if (manualLabel) out.manual_label = manualLabel;

  const costBasis = str(raw.cost_basis);
  if (costBasis) {
    const n = Number(costBasis);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${at}: بهای تمام‌شده باید عددِ صحیحِ نامنفی باشد.`);
    out.cost_basis = String(n);
  }
  return out;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "برای ثبت دارایی وارد شوید." }, { status: 401 });

  let body: { positions?: unknown; note?: unknown; client_token?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر." }, { status: 400 });
  }

  if (!Array.isArray(body.positions) || body.positions.length === 0) {
    return NextResponse.json({ error: "حداقل یک قلم دارایی لازم است." }, { status: 400 });
  }

  let positions: Record<string, string | number>[];
  try {
    positions = (body.positions as IncomingPosition[]).map(normalise);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "قلم نامعتبر." },
      { status: 400 },
    );
  }

  const keys = new Set(positions.map((p) => p.position_key));
  if (keys.size !== positions.length) {
    return NextResponse.json({ error: "یک قلم دوبار وارد شده است." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("record_member_holdings", {
    p_positions: positions,
    p_note: str(body.note) || null,
    p_client_token: str(body.client_token) || null,
  });

  // خطای دیتابیس هرگز «موفق» گزارش نمی‌شود.
  if (error) {
    console.error("record_member_holdings error:", error.message);
    const forbidden = /دسترسی غیرمجاز/.test(error.message);
    return NextResponse.json(
      { error: forbidden ? "دسترسی غیرمجاز." : "ثبت دارایی انجام نشد." },
      { status: forbidden ? 403 : 500 },
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return NextResponse.json({ error: "ثبت دارایی انجام نشد." }, { status: 500 });

  return NextResponse.json({
    version_id: row.version_id,
    version: row.version,
    position_count: row.position_count,
    reused: row.reused === true,
  });
}
