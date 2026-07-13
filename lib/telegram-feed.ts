// خواندنِ فیدِ عمومیِ تلگرام (t.me/s/<username>) و استخراجِ پست‌ها.
// این صفحه برای هر کانالِ *عمومی* بدونِ نیاز به بات یا لاگین در دسترس است و
// تاریخچه را هم می‌دهد؛ پس هم پست‌های قدیمی و هم جدید را می‌گیریم.
// خروجی خام است؛ درج/dedup در route انجام می‌شود.

export interface FeedPost {
  messageId: number;
  url: string;
  /** متنِ سادهٔ پست (تگ‌های HTML حذف‌شده). ممکن است برای پستِ فقط‌رسانه خالی باشد. */
  text: string;
  /** زمانِ واقعیِ انتشار (ISO) از تگِ <time datetime>، اگر موجود بود. */
  publishedAt: string | null;
  kind: "post" | "video";
}

/** رمزگشاییِ چند entityِ پرکاربردِ HTML + تبدیلِ <br>/</p> به خطِ جدید و حذفِ تگ‌ها. */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * پارسِ HTMLِ صفحهٔ t.me/s/<username>. فقط پست‌های همان username پذیرفته می‌شوند
 * (فورواردها/کانال‌های دیگر در صفحه ممکن است data-post متفاوت داشته باشند).
 * ترتیبِ خروجی = ترتیبِ صفحه (قدیمی→جدید).
 */
export function parseChannelFeed(html: string, username: string): FeedPost[] {
  const uname = username.replace(/^@/, "").toLowerCase();
  const posts: FeedPost[] = [];

  // هر حبابِ پیام با data-post="username/<id>" لنگر می‌خورد.
  const anchor = /data-post="([^"/]+)\/(\d+)"/g;
  const marks: { id: number; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = anchor.exec(html)) !== null) {
    if (m[1].toLowerCase() !== uname) continue;
    marks.push({ id: Number(m[2]), index: m.index });
  }

  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index;
    const end = i + 1 < marks.length ? marks[i + 1].index : html.length;
    const chunk = html.slice(start, end);
    const id = marks[i].id;

    const dt = chunk.match(/<time[^>]+datetime="([^"]+)"/);
    const tx = chunk.match(
      /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/
    );
    const text = tx ? htmlToText(tx[1]) : "";
    const isVideo =
      /tgme_widget_message_video(?![\w-])|message_video_player|message_roundvideo/.test(
        chunk
      );

    posts.push({
      messageId: id,
      url: `https://t.me/${uname}/${id}`,
      text,
      publishedAt: dt ? dt[1] : null,
      kind: isVideo ? "video" : "post",
    });
  }

  return posts;
}
