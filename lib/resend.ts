import "server-only";
import { markdownToPlain, renderMarkdown } from "@/lib/markdown";

// Resend — ارسال ایمیل. فقط سرور. اگر RESEND_API_KEY تنظیم نشده باشد، به‌جای
// crash، ارسال skip و لاگ می‌شود (طبق قانونِ سشن).

export type EmailOutcome = "sent" | "failed" | "skipped";

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

/** قالبِ سادهٔ RTLِ برند — بدون فونت خارجی (fallback سیستمی). */
function emailHtml(title: string, bodyMd: string): string {
  const body = renderMarkdown(bodyMd);
  return `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#F8FAFC;font-family:Tahoma,Arial,sans-serif;color:#0F172A;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#172554;border-radius:14px 14px 0 0;padding:20px 24px;">
      <div style="color:#D4A22B;font-weight:bold;font-size:14px;letter-spacing:1px;">آرش صفری · مشاور سرمایه‌گذاری</div>
    </div>
    <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 14px 14px;padding:24px;">
      <h1 style="font-size:20px;color:#172554;margin:0 0 16px;">${title}</h1>
      <div style="font-size:15px;line-height:1.9;color:#334155;">${body}</div>
    </div>
    <p style="text-align:center;color:#64748B;font-size:12px;margin-top:16px;">
      این پیام از سامانهٔ مشاورهٔ سرمایه‌گذاری آرش صفری ارسال شده است.
    </p>
  </div>
</body></html>`;
}

export async function sendAnnouncementEmail(
  to: string,
  title: string,
  bodyMd: string
): Promise<EmailOutcome> {
  if (!resendConfigured()) {
    console.warn("Resend not configured — email skipped for", to);
    return "skipped";
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to,
        subject: title,
        html: emailHtml(title, bodyMd),
        text: `${title}\n\n${markdownToPlain(bodyMd)}`,
      }),
    });
    if (!res.ok) {
      console.error("Resend send failed:", res.status);
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error("Resend error:", e instanceof Error ? e.message : "unknown");
    return "failed";
  }
}
