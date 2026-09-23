/**
 * نسبتِ کنتراستِ WCAG 2.1 — برای آزمونِ توکن‌های رنگ.
 *
 * ── چرا این فایل هست ─────────────────────────────────────────────────────
 * قاعدهٔ «هیچ رنگِ خارج از توکن ننویس» جلوی رنگِ سرگردان را می‌گیرد، ولی جلوی
 * **جفتِ ناخوانا** را نمی‌گیرد: توکن‌ها درست‌اند و ترکیبشان غلط. هر بار هم با
 * چشم و اسکرین‌شات چک شده و هر بار دوباره شکسته — چون هیچ‌چیز آن را نگه
 * نمی‌داشت. این ماژول همان بررسی را به یک تستِ اجراشدنی تبدیل می‌کند.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** `#RGB` یا `#RRGGBB` → RGB. ورودیِ نامعتبر خطا می‌دهد، نه رنگِ حدسی. */
export function parseHex(hex: string): Rgb {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`رنگِ نامعتبر: ${hex}`);
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

const channel = (c: number): number => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** روشناییِ نسبی (WCAG 2.1، §relative luminance). */
export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** نسبتِ کنتراست بینِ دو رنگِ **مات**. همیشه ≥ ۱. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(parseHex(a));
  const lb = luminance(parseHex(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * ترکیبِ یک رنگِ نیمه‌شفاف روی پس‌زمینه.
 *
 * بدونِ این، هر کاشیِ تینت‌دار «مات» فرض می‌شود و کنتراستِ گزارش‌شده غلط
 * درمی‌آید — همان اشتباهی که یک بار در ممیزیِ قبل رخ داد.
 */
export function compositeHex(fg: string, bg: string, alpha: number): string {
  const f = parseHex(fg);
  const b = parseHex(bg);
  const mix = (x: number, y: number) => Math.round(x * alpha + y * (1 - alpha));
  const to2 = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to2(mix(f.r, b.r))}${to2(mix(f.g, b.g))}${to2(mix(f.b, b.b))}`;
}

/** حدهای WCAG: متنِ معمولی AA، متنِ درشت/عنصرِ گرافیکی AA. */
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

/**
 * فاصلهٔ ادراکیِ دو رنگ (CIE76 ΔE، فضای Lab).
 *
 * ── چرا نسبتِ کنتراست اینجا ابزارِ غلطی است ───────────────────────────────
 * نسبتِ WCAG فقط **روشنایی** را می‌سنجد. دو رنگِ کاملاً متفاوت مثل طلاییِ
 * تیره و فیروزه‌ای می‌توانند روشناییِ تقریباً یکسان داشته باشند و نسبتِ
 * ۱٫۰۶ بدهند — عددی که می‌گوید «یکی‌اند»، در حالی که چشم به‌راحتی جدایشان
 * می‌کند. برای پالتِ **دسته‌ای** پرسشْ «کدام روشن‌تر است» نیست، «آیا دوتایند»
 * است؛ و آن را فاصله در فضای Lab جواب می‌دهد، نه روشنایی به‌تنهایی.
 *
 * CIE76 و نه CIEDE2000: برای یک آزمونِ «به‌قدرِ کافی دور» دقتش کافی است و
 * فرمولش کوتاه و قابلِ بازبینی. اگر روزی لازم شد، جایگزینی‌اش موضعی است.
 */
export function toLab({ r, g, b }: Rgb): [number, number, number] {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  // sRGB → XYZ (D65) → Lab
  const X = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047;
  const Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const Z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

export function deltaE76(a: string, b: string): number {
  const [l1, a1, b1] = toLab(parseHex(a));
  const [l2, a2, b2] = toLab(parseHex(b));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/**
 * کفِ فاصلهٔ دو رنگِ دسته‌ای در یک نمودار.
 *
 * ۲۰ سخت‌گیرانه نیست و «تُنِ نزدیک» را رد نمی‌کند؛ جلوی «دو رنگِ عملاً یکسان»
 * را می‌گیرد. نزدیک‌ترین جفتِ پالتِ فعلی (طلایی و آجری) ۲۵–۲۸ است، یعنی حد
 * روی خودِ پالت تنظیم نشده و فضای مانور دارد.
 */
export const MIN_CATEGORICAL_DELTA_E = 20;

/**
 * استخراجِ توکن‌های رنگ از `globals.css` برای یک تم.
 *
 * عمداً یک پارسرِ کوچک و نه کتابخانه: فقط `--name: value;` داخلِ بلوکِ `:root`
 * یا `.dark` را می‌خواند، ارجاعِ `var(--x)` را دنبال می‌کند و هر چیزِ دیگری
 * (rgba، gradient، shadow) را کنار می‌گذارد. هدف، آزمونِ جفت‌های رنگی است نه
 * تفسیرِ کاملِ CSS.
 */
export function readTokens(css: string, block: ":root" | ".dark"): Map<string, string> {
  const start = css.indexOf(block + " {");
  if (start < 0) throw new Error(`بلوکِ ${block} پیدا نشد`);
  const open = css.indexOf("{", start);
  const end = css.indexOf("\n}", open);
  if (end < 0) throw new Error(`پایانِ بلوکِ ${block} پیدا نشد`);
  const body = css.slice(open + 1, end);

  const raw = new Map<string, string>();
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    // آخرین تعریف برنده است — همان قاعدهٔ کاسکید. (یک بار دقیقاً همین‌جا یک
    // تعریفِ تکراریِ `--ring` مقدارِ تازه را بی‌صدا بازنوشت.)
    raw.set(m[1], m[2].trim());
  }
  return raw;
}

/**
 * توکن‌های **حل‌شدهٔ** یک تم: `:root` به‌علاوهٔ بازتعریف‌های `.dark`، و سپس
 * دنبال‌کردنِ `var(--x)` در همان تم.
 *
 * ترتیب مهم است: `--gold-ink` در `.dark` برابرِ `var(--gold-light)` است و
 * `--gold-light` فقط در `:root` تعریف شده. اگر هر بلوک جدا حل شود، این ارجاع
 * گم می‌شود یا — بدتر — با مقدارِ تمِ روشن حل می‌شود و تست سبزِ دروغین می‌دهد.
 */
export function themeTokens(css: string, theme: "light" | "dark"): Map<string, string> {
  const raw = readTokens(css, ":root");
  if (theme === "dark") {
    for (const [k, v] of readTokens(css, ".dark")) raw.set(k, v);
  }

  const resolve = (name: string, depth = 0): string | null => {
    if (depth > 8) return null;
    const v = raw.get(name);
    if (!v) return null;
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
    const ref = v.match(/^var\((--[a-z0-9-]+)\)$/i);
    if (ref) return resolve(ref[1], depth + 1);
    return null;
  };

  const out = new Map<string, string>();
  for (const name of raw.keys()) {
    const hex = resolve(name);
    if (hex) out.set(name, hex);
  }
  return out;
}
