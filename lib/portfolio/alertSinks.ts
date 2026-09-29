/**
 * گیرنده‌های هشدار — و **پیش‌فرضِ امن**.
 *
 * ⚠️ پیش‌فرض `log` است، نه ایمیل و نه تلگرام. یعنی تا وقتی کسی صریح کانالِ
 * واقعی را روشن نکرده، هیچ پیامی به هیچ عضوِ واقعی نمی‌رود و فقط ثبت می‌شود.
 * عکسش — «پیش‌فرض واقعی، مگر اینکه خاموشش کنی» — یعنی یک اشتباهِ پیکربندی در
 * محیطِ آزمایشی به صندوقِ ورودیِ آدم‌های واقعی می‌رسد. آن خطا برگشت‌پذیر نیست.
 */
import "server-only";
import type { AlertMessage, AlertSinkPort } from "./alertDispatch";

/** یک پیامِ ثبت‌شده در گیرندهٔ آزمایشی. */
export interface LoggedAlert {
  at: string;
  userId: string;
  title: string;
  body: string;
}

/**
 * گیرندهٔ آزمایشیِ محلی: پیام را نگه می‌دارد و **جایی نمی‌فرستد**.
 *
 * حافظه‌اش عمداً داخلِ خودِ نمونه است تا دو آزمون به هم نشت نکنند. دفترِ
 * دیتابیس (`rebalance_alert_deliveries`) جای شاهدِ ماندگار است، نه این.
 */
export class LoggingSink implements AlertSinkPort {
  readonly channel = "log" as const;
  private readonly entries: LoggedAlert[] = [];

  async deliver(message: AlertMessage): Promise<{ ok: boolean }> {
    this.entries.push({
      at: new Date().toISOString(),
      userId: message.userId,
      title: message.title,
      body: message.body,
    });
    console.info(`[rebalance-alert:log] ${message.userId} — ${message.title}`);
    return { ok: true };
  }

  received(): readonly LoggedAlert[] {
    return this.entries;
  }
}

export class EmailSink implements AlertSinkPort {
  readonly channel = "email" as const;
  constructor(private readonly to: string | null) {}

  async deliver(message: AlertMessage): Promise<{ ok: boolean; error?: string }> {
    if (!this.to) return { ok: false, error: "نشانی ایمیل عضو موجود نیست." };
    const { sendAnnouncementEmail } = await import("@/lib/resend");
    const outcome = await sendAnnouncementEmail(this.to, message.title, message.body);
    // ⚠️ `skipped` (کلید تنظیم نشده) **موفقیت نیست**. اگر موفق حساب شود،
    // رویداد «فرستاده شد» ثبت می‌شود در حالی که هیچ‌کس چیزی نگرفته.
    if (outcome === "sent") return { ok: true };
    return { ok: false, error: `resend: ${outcome}` };
  }
}

export class TelegramSink implements AlertSinkPort {
  readonly channel = "telegram" as const;
  constructor(private readonly chatId: number | string | null) {}

  async deliver(message: AlertMessage): Promise<{ ok: boolean; error?: string }> {
    if (!this.chatId) return { ok: false, error: "کد اتصال تلگرام برای عضو ثبت نشده." };
    const { sendMessage } = await import("@/lib/telegram");
    const ok = await sendMessage(this.chatId, `${message.title}\n\n${message.body}`);
    return ok ? { ok: true } : { ok: false, error: "telegram sendMessage=false" };
  }
}

/**
 * کانال‌های فعال از محیط.
 *
 * `REBALANCE_ALERT_CHANNELS` فهرستِ جداشده با ویرگول است (`log,email,telegram`).
 * خالی یا تنظیم‌نشده ⇒ فقط `log`.
 */
export function enabledChannels(env: NodeJS.ProcessEnv = process.env): AlertChannelName[] {
  const raw = (env.REBALANCE_ALERT_CHANNELS ?? "").trim();
  if (raw === "") return ["log"];
  const asked = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const valid = asked.filter((c): c is AlertChannelName =>
    c === "log" || c === "email" || c === "telegram"
  );
  // نامِ ناشناخته بی‌صدا نادیده گرفته نمی‌شود: اگر هیچ نامِ معتبری نماند،
  // به `log` برمی‌گردیم تا یک تایپِ اشتباه به «ارسالِ واقعی» تبدیل نشود.
  return valid.length > 0 ? valid : ["log"];
}

export type AlertChannelName = "log" | "email" | "telegram";

export function buildSinks(
  recipient: { email: string | null; telegramChatId: number | string | null },
  env: NodeJS.ProcessEnv = process.env
): AlertSinkPort[] {
  return enabledChannels(env).map((c) =>
    c === "email" ? new EmailSink(recipient.email)
      : c === "telegram" ? new TelegramSink(recipient.telegramChatId)
      : new LoggingSink()
  );
}
