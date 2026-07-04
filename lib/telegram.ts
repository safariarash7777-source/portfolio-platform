// بات تلگرام — Bot API از طریق fetch. فقط سمت سرور. هیچ توکنی در لاگ/کد.
// همهٔ کلیدها از env. اگر توکن تنظیم نشده باشد، توابع بی‌سروصدا شکست می‌خورند
// تا جریانِ پرداخت پشتِ پیکربندیِ تلگرام گیر نکند.

const API = (token: string) => `https://api.telegram.org/bot${token}`;

function token(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN ?? null;
}

async function call<T = unknown>(
  method: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; result?: T }> {
  const t = token();
  if (!t) return { ok: false };
  try {
    const res = await fetch(`${API(t)}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    return { ok: Boolean(json?.ok), result: json?.result as T };
  } catch {
    return { ok: false };
  }
}

/** ارسال پیام متنی به یک چت (DM). */
export async function sendMessage(chatId: number | string, text: string): Promise<boolean> {
  const { ok } = await call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false,
  });
  return ok;
}

/** ساخت لینک دعوت تک‌نفره برای کانال خصوصی. */
export async function createSingleUseInvite(): Promise<string | null> {
  const channel = process.env.TELEGRAM_CHANNEL_ID;
  if (!channel) return null;
  const { ok, result } = await call<{ invite_link?: string }>("createChatInviteLink", {
    chat_id: channel,
    member_limit: 1,
    name: "دعوت پس از پرداخت",
  });
  return ok ? result?.invite_link ?? null : null;
}
