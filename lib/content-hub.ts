// هابِ محتوا — انواع، متادیتای پلتفرم و تشخیصِ لینک.
// منبعِ واحدِ حقیقت برای هم باتِ تلگرام (سرور) و هم UI. رنگ‌ها اینجا نیستند؛
// رنگ = توکنِ CSS در globals.css (--brand-telegram/instagram/x).

export type Platform = "telegram" | "instagram" | "twitter";
export type ContentKind = "post" | "video" | "story" | "reel";

export const PLATFORMS: Platform[] = ["telegram", "instagram", "twitter"];
export const KINDS: ContentKind[] = ["post", "video", "story", "reel"];

export interface ContentItem {
  id: string;
  platform: Platform;
  kind: ContentKind;
  content_url: string;
  title: string | null;
  description: string | null;
  published_at: string | null;
}

/** متادیتای نمایشیِ هر پلتفرم — برچسبِ فارسی، توکنِ رنگ و لینکِ دنبال‌کردن. */
export const PLATFORM_META: Record<
  Platform,
  { label: string; colorVar: string; tintVar: string; followUrl: string | null }
> = {
  telegram: {
    label: "تلگرام",
    colorVar: "var(--brand-telegram)",
    tintVar: "var(--brand-telegram-tint)",
    followUrl: "https://t.me/arashsafariiiiiiii",
  },
  instagram: {
    label: "اینستاگرام",
    colorVar: "var(--brand-instagram-b)",
    tintVar: "var(--brand-instagram-tint)",
    followUrl: "https://www.instagram.com/arash_safariiiiiii/",
  },
  twitter: {
    label: "توییتر / X",
    colorVar: "var(--brand-x)",
    tintVar: "var(--brand-x-tint)",
    followUrl: null,
  },
};

export const KIND_LABEL: Record<ContentKind, string> = {
  post: "پست",
  video: "ویدیو",
  story: "استوری",
  reel: "ریلز",
};

export function isPlatform(v: unknown): v is Platform {
  return typeof v === "string" && (PLATFORMS as string[]).includes(v);
}

export function isKind(v: unknown): v is ContentKind {
  return typeof v === "string" && (KINDS as string[]).includes(v);
}

/** تشخیصِ پلتفرم از روی دامنهٔ لینک. ناشناخته → null. */
export function detectPlatform(url: string): Platform | null {
  const u = url.toLowerCase();
  if (/(?:^|\/\/|\.)t\.me\/|telegram\.(?:me|org|dog)\//.test(u)) return "telegram";
  if (/instagram\.com\//.test(u)) return "instagram";
  if (/(?:twitter\.com|x\.com)\//.test(u)) return "twitter";
  return null;
}

/** حدسِ نوعِ محتوا از روی مسیرِ لینک (اینستاگرام reel/stories، توییتر video). */
export function guessKind(url: string): ContentKind {
  const u = url.toLowerCase();
  if (/\/reel(s)?\//.test(u)) return "reel";
  if (/\/stories\//.test(u)) return "story";
  if (/\/(video|status\/\d+\/video)\//.test(u)) return "video";
  return "post";
}

/** اولین لینکِ http(s) داخلِ یک متن. */
export function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0] : null;
}
