import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessage } from "@/lib/telegram";
import { toPersianDigits } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/telegram/webhook — وبهوکِ بات (نه polling). با هدرِ
// X-Telegram-Bot-Api-Secret-Token اعتبارسنجی می‌شود. همیشه سریع ۲۰۰ برمی‌گرداند.
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || got !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const msg = update.message;
  const text = msg?.text?.trim();
  const tgUserId = msg?.from?.id;
  const chatId = msg?.chat?.id;

  if (!msg || !text || !tgUserId || !chatId) {
    return NextResponse.json({ ok: true });
  }

  try {
    await handle(text, tgUserId, chatId);
  } catch (e) {
    console.error("telegram webhook error:", e instanceof Error ? e.message : "unknown");
  }

  return NextResponse.json({ ok: true });
}

async function handle(text: string, tgUserId: number, chatId: number) {
  const admin = createAdminClient();

  if (text === "/start") {
    await sendMessage(
      chatId,
      "به بات مشاورهٔ سرمایه‌گذاری آرش صفری خوش آمدید. 👋\n\nبرای اتصال حساب، کد ۶رقمی‌ای را که در داشبورد وب می‌بینید همین‌جا ارسال کنید.\n\nدستورها:\n/portfolio — آخرین نسخهٔ پرتفوی شما\n/help — راهنما"
    );
    return;
  }

  if (text === "/help") {
    await sendMessage(
      chatId,
      "راهنما:\n\n۱) در داشبورد وب، کارت «اتصال تلگرام» → دکمهٔ دریافت کد.\n۲) کد ۶رقمی را همین‌جا برای بات بفرستید (اعتبار ۱۰ دقیقه).\n۳) پس از پرداخت موفق، لینک دعوت کانال به‌صورت خصوصی برایتان ارسال می‌شود.\n\nدستورها:\n/portfolio — آخرین نسخهٔ پرتفوی شما\n/help — همین راهنما"
    );
    return;
  }

  if (text === "/portfolio") {
    await handlePortfolio(admin, tgUserId, chatId);
    return;
  }

  // کد ۶رقمی؟
  if (/^\d{6}$/.test(text)) {
    const { data: userId } = await admin.rpc("redeem_link_code", {
      p_code: text,
      p_tg_user_id: tgUserId,
    });
    if (userId) {
      await sendMessage(
        chatId,
        "✅ حساب تلگرام شما با موفقیت متصل شد.\n\nاز این پس با /portfolio می‌توانید آخرین نسخهٔ پرتفوی خود را ببینید. پس از پرداخت موفق نیز لینک دعوت کانال همین‌جا برایتان ارسال می‌شود."
      );
    } else {
      await sendMessage(
        chatId,
        "❌ این کد نامعتبر یا منقضی شده است. لطفاً از داشبورد وب کد تازه‌ای بگیرید (اعتبار هر کد ۱۰ دقیقه است)."
      );
    }
    return;
  }

  await sendMessage(
    chatId,
    "دستور شناخته‌نشده. برای دیدن راهنما /help را بفرستید یا برای اتصال حساب، کد ۶رقمیِ داشبورد را ارسال کنید."
  );
}

async function handlePortfolio(
  admin: ReturnType<typeof createAdminClient>,
  tgUserId: number,
  chatId: number
) {
  const { data: link } = await admin
    .from("telegram_links")
    .select("user_id")
    .eq("telegram_user_id", tgUserId)
    .maybeSingle();

  if (!link) {
    await sendMessage(
      chatId,
      "حساب تلگرام شما هنوز متصل نشده است. لطفاً از داشبورد وب کد ۶رقمی بگیرید و همین‌جا ارسال کنید."
    );
    return;
  }

  const { data: version } = await admin
    .from("portfolio_versions")
    .select("version, allocations, notes, created_at")
    .eq("user_id", link.user_id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!version) {
    await sendMessage(
      chatId,
      "هنوز پرتفویی برای شما ثبت نشده است. برای دریافت پرتفوی اختصاصی، ابتدا در داشبورد وب آزمون ارزیابی ریسک را تکمیل کنید تا مشاور سبد شما را طراحی کند."
    );
    return;
  }

  await sendMessage(chatId, formatPortfolio(version));
}

interface AllocationRow {
  asset: string;
  pct: number;
  note?: string;
}
interface VersionRow {
  version: number;
  allocations: AllocationRow[];
  notes: string | null;
  created_at: string;
}

function formatPortfolio(v: VersionRow): string {
  const lines: string[] = [];
  lines.push(`<b>پرتفوی شما — نسخهٔ ${toPersianDigits(v.version)}</b>`);
  lines.push("");
  const allocs = Array.isArray(v.allocations) ? v.allocations : [];
  for (const a of allocs) {
    lines.push(`• ${a.asset}: ${toPersianDigits(a.pct)}٪`);
    if (a.note) lines.push(`   ↳ ${a.note}`);
  }
  if (v.notes) {
    lines.push("");
    lines.push(`یادداشت مشاور: ${v.notes}`);
  }
  lines.push("");
  lines.push("این پرتفوی جنبهٔ مشاوره‌ای دارد و تضمین بازدهی نیست.");
  return lines.join("\n");
}

// ── Minimal Telegram update typings ──────────────────────────────────────
interface TelegramUpdate {
  message?: {
    text?: string;
    from?: { id?: number };
    chat?: { id?: number };
  };
}
