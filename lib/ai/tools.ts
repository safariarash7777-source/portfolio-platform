// ─────────────────────────────────────────────────────────────────────────
// Tool Registry + Dispatcher مشاور هوش مصنوعی — الگوی MCP بومی (RLS-First)
//
// قاعدهٔ امنیتی حیاتی:
//   مدل هرگز user_id را تعیین نمی‌کند. ابزارهای داده‌محور (مثل
//   get_user_risk_profile) فقط به auth.uid()ِ سشن دسترسی دارند که از
//   ToolContext تزریق می‌شود، نه از ورودیِ مدل. RLS سطح‌دیتابیس backstop است.
// ─────────────────────────────────────────────────────────────────────────

import type Anthropic from "@anthropic-ai/sdk";
import type { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/** زمینهٔ اجراییِ سمت‌سرور که به همهٔ handlerها تزریق می‌شود. */
export interface ToolContext {
  supabase: ServerSupabase;
  /** شناسهٔ کاربرِ احرازشدهٔ سشن — تنها منبعِ معتبرِ هویت. */
  userId: string;
}

// ─── رجیستریِ ابزارها (فرمت استانداردِ JSON-schema) ─────────────────────────
export const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_market_price",
    description:
      "قیمت لحظه‌ای یک دارایی را برمی‌گرداند: دلار، طلا، تتر (USDT) یا رمزارزهای اصلی. مقدارها به تومان هستند مگر آن‌که واحد مشخص شده باشد. خروجی شامل قیمت، واحد و زمانِ به‌روزرسانی است.",
    input_schema: {
      type: "object",
      properties: {
        asset: {
          type: "string",
          enum: ["usd", "gold", "usdt", "bitcoin", "ethereum"],
          description:
            "نوع دارایی: usd=دلار، gold=طلا (هر گرم ۱۸ عیار)، usdt=تتر، bitcoin=بیت‌کوین، ethereum=اتریوم.",
        },
      },
      required: ["asset"],
    },
  },
  {
    name: "get_user_risk_profile",
    description:
      "آخرین ارزیابی ریسک و پرتفویِ همین کاربرِ جاری را می‌خواند تا پاسخ‌ها متناسب با وضعیت او باشد. این ابزار هیچ ورودی‌ای نمی‌گیرد و فقط به دادهٔ کاربرِ احرازشدهٔ سشن دسترسی دارد.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];

// ─── ابزار ۱: قیمت بازار (با کشِ سمت‌سرورِ ۵دقیقه‌ای) ────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;

interface MarketPrice {
  asset: string;
  label: string;
  price: number;
  unit: string;
  updated_at: string;
}

interface CacheEntry {
  data: MarketPrice;
  expires: number;
}

const priceCache = new Map<string, CacheEntry>();

// دادهٔ mock فعلی؛ بعداً با Brsapi/tgju/CoinGecko جایگزین می‌شود.
// (قیمت‌ها تقریبی و صرفاً برای راه‌اندازیِ مسیرِ ابزار هستند.)
const MOCK_PRICES: Record<string, Omit<MarketPrice, "updated_at">> = {
  usd: { asset: "usd", label: "دلار آمریکا", price: 91500, unit: "تومان" },
  gold: { asset: "gold", label: "طلای ۱۸ عیار (هر گرم)", price: 6450000, unit: "تومان" },
  usdt: { asset: "usdt", label: "تتر (USDT)", price: 92000, unit: "تومان" },
  bitcoin: { asset: "bitcoin", label: "بیت‌کوین", price: 104500, unit: "دلار" },
  ethereum: { asset: "ethereum", label: "اتریوم", price: 3850, unit: "دلار" },
};

async function getMarketPrice(asset: string): Promise<MarketPrice | null> {
  const cached = priceCache.get(asset);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const base = MOCK_PRICES[asset];
  if (!base) return null;

  const data: MarketPrice = { ...base, updated_at: new Date().toISOString() };
  priceCache.set(asset, { data, expires: Date.now() + CACHE_TTL_MS });
  return data;
}

// ─── ابزار ۲: پروفایل ریسک کاربر (scoped به auth.uid()ِ سشن) ────────────────
async function getUserRiskProfile(ctx: ToolContext) {
  // هر دو کوئری صریحاً به userId سشن محدودند؛ RLS لایهٔ دومِ دفاع است.
  const [assessmentRes, portfolioRes] = await Promise.all([
    ctx.supabase
      .from("risk_assessments")
      .select("total_score, risk_category, created_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    ctx.supabase
      .from("portfolios")
      .select("allocations, notes, created_at")
      .eq("user_id", ctx.userId)
      .maybeSingle(),
  ]);

  return {
    risk_assessment: assessmentRes.data ?? null,
    portfolio: portfolioRes.data ?? null,
    has_assessment: assessmentRes.data != null,
    has_portfolio: portfolioRes.data != null,
  };
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────
/**
 * یک فراخوانیِ ابزار را اجرا و نتیجه را به‌صورت رشتهٔ JSON برمی‌گرداند.
 * نکتهٔ امنیتی: ورودیِ مدل هرگز برای تعیین هویت استفاده نمی‌شود؛ هویت فقط از ctx.
 */
export async function dispatchTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<string> {
  try {
    switch (name) {
      case "get_market_price": {
        const asset =
          typeof input === "object" && input !== null
            ? String((input as { asset?: unknown }).asset ?? "")
            : "";
        const price = await getMarketPrice(asset);
        if (!price) {
          return JSON.stringify({
            error: "asset_not_supported",
            message: `دارایی «${asset}» پشتیبانی نمی‌شود.`,
          });
        }
        return JSON.stringify(price);
      }

      case "get_user_risk_profile": {
        // ورودیِ مدل عمداً نادیده گرفته می‌شود؛ فقط هویتِ سشن معتبر است.
        const data = await getUserRiskProfile(ctx);
        return JSON.stringify(data);
      }

      default:
        return JSON.stringify({ error: "unknown_tool", message: `ابزار «${name}» شناخته نشد.` });
    }
  } catch (err) {
    console.error(`Tool dispatch error (${name}):`, err);
    return JSON.stringify({
      error: "tool_execution_failed",
      message: "اجرای ابزار با خطا مواجه شد.",
    });
  }
}
