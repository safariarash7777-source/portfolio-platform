import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessage } from "@/lib/telegram";
import { markdownToPlain } from "@/lib/markdown";
import { toPersianDigits } from "@/lib/format";
import { detectPlatform, guessKind, firstUrl, PLATFORM_META } from "@/lib/content-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MINI_APP_URL =
  process.env.NEXT_PUBLIC_MINIAPP_URL ||
  "https://arash-teleapp-7shs2egu.manus.space";

// نامِ کاربریِ کانالِ عمومی (بدونِ @) که پست‌هایش خودکار در هابِ محتوا منتشر
// می‌شود. از env؛ اگر تنظیم نشده باشد، کانالِ عمومیِ آرش. این *کانالِ عمومی* است،
// نه کانالِ خصوصیِ پولی (TELEGRAM_CHANNEL_ID) — تا محتوای خصوصی عمومی نشود.
const PUBLIC_CHANNEL_USERNAME = (
  process.env.TELEGRAM_PUBLIC_CHANNEL_USERNAME || "arashsafariiiiiiii"
)
  .replace(/^@/, "")
  .toLowerCase();

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

  // پستِ کانال (خودکار): هر پستِ کانالِ عمومی → درجِ خودکار در هابِ محتوا.
  if (update.channel_post) {
    try {
      await handleChannelPost(update.channel_post);
    } catch (e) {
      console.error("channel_post error:", e instanceof Error ? e.message : "unknown");
    }
    return NextResponse.json({ ok: true });
  }

  const msg = update.message;
  // متنِ پیام یا کپشنِ عکس/ویدیو (برای پیستِ لینک با رسانه).
  const text = (msg?.text ?? msg?.caption)?.trim();
  const tgUserId = msg?.from?.id;
  const chatId = msg?.chat?.id;
  const firstName = msg?.from?.first_name ?? "";

  if (!msg || !text || !tgUserId || !chatId) {
    return NextResponse.json({ ok: true });
  }

  try {
    await handle(text, tgUserId, chatId, firstName);
  } catch (e) {
    console.error("telegram webhook error:", e instanceof Error ? e.message : "unknown");
  }

  return NextResponse.json({ ok: true });
}

async function handle(text: string, tgUserId: number, chatId: number, firstName: string) {
  const admin = createAdminClient();

  if (text === "/start" || text.startsWith("/start ")) {
    // پیام خوش‌آمدگویی + دکمه مینی‌اپ + راهنمای اتصال حساب
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const welcomeMsg = `👋 سلام ${firstName} عزیز!\n\nبه بات <b>آرش صفری</b> — مشاور سرمایه‌گذاری خوش آمدید.\n\n📊 <b>امکانات مینی‌اپ:</b>\n• قیمت زنده طلا، سکه، ارز و بورس\n• ماشین‌حساب سرمایه‌گذاری\n• تحلیل‌های اقتصادی\n• درخواست مشاوره\n\n🔗 <b>اتصال حساب وب:</b>\nبرای اتصال حساب داشبورد، کد ۶رقمی‌ای را که در داشبورد وب می‌بینید همین‌جا ارسال کنید.\n\nدستورها:\n/portfolio — آخرین نسخهٔ پرتفوی شما\n/announcements — آخرین اعلامیه‌ها\n/help — راهنما`;

    if (token && MINI_APP_URL) {
      await sendMessageWithMiniApp(token, chatId, welcomeMsg, MINI_APP_URL);
    } else {
      await sendMessage(chatId, welcomeMsg);
    }
    return;
  }

  if (text === "/help") {
    await sendMessage(
      chatId,
      "راهنما:\n\n۱) در داشبورد وب، کارت «اتصال تلگرام» → دکمهٔ دریافت کد.\n۲) کد ۶رقمی را همین‌جا برای بات بفرستید (اعتبار ۱۰ دقیقه).\n۳) پس از پرداخت موفق، لینک دعوت کانال به‌صورت خصوصی برایتان ارسال می‌شود.\n\n📊 برای ابزارهای مالی، دکمهٔ «مینی‌اپ» را بزنید.\n\nدستورها:\n/portfolio — آخرین نسخهٔ پرتفوی شما\n/announcements — سه اعلامیهٔ آخر\n/help — همین راهنما"
    );
    return;
  }

  if (text === "/portfolio") {
    await handlePortfolio(admin, tgUserId, chatId);
    return;
  }

  if (text === "/announcements") {
    await handleAnnouncements(admin, tgUserId, chatId);
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

  // لینکِ شبکهٔ اجتماعی از سمتِ ادمین؟ → افزودنِ خودکار به هابِ محتوا.
  if (await tryIngestContent(admin, text, tgUserId, chatId)) return;

  // پیام ناشناخته → راهنمایی + دکمه مینی‌اپ
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token && MINI_APP_URL) {
    await sendMessageWithMiniApp(
      token,
      chatId,
      `سلام ${firstName}!\n\nبرای استفاده از ابزارهای مالی، مینی‌اپ را باز کنید 👇\n\nیا برای اتصال حساب، کد ۶رقمیِ داشبورد را ارسال کنید.\n/help — راهنما`,
      MINI_APP_URL
    );
  } else {
    await sendMessage(
      chatId,
      "دستور شناخته‌نشده. برای دیدن راهنما /help را بفرستید یا برای اتصال حساب، کد ۶رقمیِ داشبورد را ارسال کنید."
    );
  }
}

/** ارسال پیام با دکمه inline مینی‌اپ */
async function sendMessageWithMiniApp(
  token: string,
  chatId: number,
  text: string,
  miniAppUrl: string
) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: "📊 باز کردن مینی‌اپ", web_app: { url: miniAppUrl } }],
        ],
      },
    }),
  });
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

async function handleAnnouncements(
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

  const { data: assess } = await admin
    .from("risk_assessments")
    .select("risk_category")
    .eq("user_id", link.user_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const cat = assess?.risk_category ?? null;

  const { data: anns } = await admin
    .from("announcements")
    .select("title, body_md, target, published_at")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(50);

  const matched = (anns ?? [])
    .filter((a) => {
      if (a.target === "all") return true;
      if (a.target === `user:${link.user_id}`) return true;
      if (cat && a.target === `risk:${cat}`) return true;
      return false;
    })
    .slice(0, 3);

  if (matched.length === 0) {
    await sendMessage(chatId, "در حال حاضر اعلامیه‌ای برای شما وجود ندارد.");
    return;
  }

  const blocks = matched.map((a) => {
    const body = markdownToPlain(a.body_md);
    const trimmed = body.length > 500 ? body.slice(0, 500) + "…" : body;
    return `📢 <b>${escapeHtml(a.title)}</b>\n${escapeHtml(trimmed)}`;
  });
  await sendMessage(chatId, blocks.join("\n\n———\n\n"));
}

/**
 * افزودنِ خودکارِ محتوا از راهِ بات: اگر پیام حاویِ لینکِ تلگرام/اینستاگرام/
 * توییتر باشد و فرستنده «ادمین» باشد، آن را در هابِ محتوا درج می‌کند. اولین خطِ
 * متن (به‌جز لینک) = عنوان، بقیه = توضیح. با سرویس‌رول درج می‌شود (RLS دور زده
 * می‌شود؛ نگهبانِ ادمین اینجا سمتِ کد است). true = پیام رسیدگی شد.
 */
async function tryIngestContent(
  admin: ReturnType<typeof createAdminClient>,
  text: string,
  tgUserId: number,
  chatId: number
): Promise<boolean> {
  const url = firstUrl(text);
  if (!url) return false;
  const platform = detectPlatform(url);
  if (!platform) return false; // لینک هست ولی شبکهٔ شناخته‌شده نیست → رسیدگی نشد

  // نگهبانِ ادمین: تلگرامِ فرستنده باید به یک حسابِ admin وصل باشد.
  const { data: link } = await admin
    .from("telegram_links")
    .select("user_id")
    .eq("telegram_user_id", tgUserId)
    .maybeSingle();
  if (!link) {
    await sendMessage(
      chatId,
      "برای افزودن محتوا به سایت، ابتدا باید حسابِ تلگرامتان به حسابِ مدیر وصل باشد (کدِ ۶رقمیِ داشبورد)."
    );
    return true;
  }
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", link.user_id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    await sendMessage(chatId, "فقط مدیر می‌تواند محتوا به سایت اضافه کند.");
    return true;
  }

  // عنوان/توضیح از متنِ پیام منهای لینک.
  const rest = text.replace(url, "").trim();
  const lines = rest.split("\n").map((s) => s.trim()).filter(Boolean);
  const title = lines[0] ?? null;
  const description = lines.slice(1).join("\n") || null;

  const { data: inserted, error } = await admin
    .from("content_hub")
    .insert({
      platform,
      kind: guessKind(url),
      content_url: url,
      title,
      description,
      created_by: link.user_id,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("content_hub insert error:", error?.message);
    await sendMessage(chatId, "خطا در افزودنِ محتوا. کمی بعد دوباره امتحان کنید.");
    return true;
  }

  await admin.from("audit_log").insert({
    actor_id: link.user_id,
    action: "content.add",
    entity: "content_hub",
    after: { id: inserted.id, platform, url, source: "telegram" },
  });

  await sendMessage(
    chatId,
    `✅ به هابِ محتوا اضافه شد (${PLATFORM_META[platform].label}).\nدر صفحهٔ «آخرین تحلیل‌ها» نمایش داده می‌شود.`
  );
  return true;
}

/**
 * درجِ خودکارِ پستِ کانالِ عمومی در هابِ محتوا. فقط پست‌های همان کانالِ عمومیِ
 * تعیین‌شده (PUBLIC_CHANNEL_USERNAME) پذیرفته می‌شوند تا محتوای کانالِ خصوصیِ
 * پولی عمومی نشود. تکراری (بر اساسِ لینک) دوباره درج نمی‌شود.
 */
async function handleChannelPost(post: ChannelPost): Promise<void> {
  const username = post.chat?.username?.toLowerCase();
  if (!username || username !== PUBLIC_CHANNEL_USERNAME) return; // فقط کانالِ عمومیِ مشخص
  if (!post.message_id) return;

  const url = `https://t.me/${post.chat!.username}/${post.message_id}`;
  const admin = createAdminClient();

  // جلوگیری از تکرار (وبهوک ممکن است دوباره ارسال شود).
  const { data: existing } = await admin
    .from("content_hub")
    .select("id")
    .eq("content_url", url)
    .maybeSingle();
  if (existing) return;

  const body = (post.text ?? post.caption ?? "").trim();
  const lines = body.split("\n").map((s) => s.trim()).filter(Boolean);
  const title = lines[0] ?? null;
  const description = lines.slice(1).join("\n") || null;
  const kind = post.video ? "video" : "post";

  const { data: inserted, error } = await admin
    .from("content_hub")
    .insert({ platform: "telegram", kind, content_url: url, title, description })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("content_hub channel insert error:", error?.message);
    return;
  }

  await admin.from("audit_log").insert({
    actor_id: null,
    action: "content.add",
    entity: "content_hub",
    after: { id: inserted.id, platform: "telegram", url, source: "channel_post" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
interface ChannelPost {
  message_id?: number;
  text?: string;
  caption?: string;
  video?: unknown;
  chat?: { id?: number; username?: string; type?: string };
}

interface TelegramUpdate {
  message?: {
    text?: string;
    caption?: string;
    from?: { id?: number; first_name?: string };
    chat?: { id?: number };
  };
  channel_post?: ChannelPost;
}
