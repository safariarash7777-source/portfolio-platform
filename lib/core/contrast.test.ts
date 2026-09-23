import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  contrastRatio,
  compositeHex,
  themeTokens,
  parseHex,
  deltaE76,
  AA_TEXT,
  AA_LARGE,
  MIN_CATEGORICAL_DELTA_E,
} from "./contrast";
import { heatTile, MAX_TINT, FLAT_THRESHOLD } from "./heatTint";
import { SERIES_COLOR_COUNT } from "../useChartTheme";

const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const THEMES = ["light", "dark"] as const;

const T = Object.fromEntries(THEMES.map((t) => [t, themeTokens(CSS, t)])) as Record<
  (typeof THEMES)[number],
  Map<string, string>
>;

const tok = (theme: (typeof THEMES)[number], name: string): string => {
  const v = T[theme].get(name);
  assert.ok(v, `توکنِ ${name} در تمِ ${theme} حل نشد`);
  return v!;
};

/** سه سطحی که تقریباً هر چیزی رویشان می‌نشیند. */
const SURFACES = ["--bg", "--surface", "--surface-2"] as const;

/* ── خودِ ابزار ──────────────────────────────────────────────────────────── */

test("محاسبهٔ کنتراست با مقادیرِ شناخته‌شده می‌خواند", () => {
  assert.equal(contrastRatio("#000000", "#FFFFFF").toFixed(2), "21.00");
  assert.equal(contrastRatio("#FFFFFF", "#FFFFFF").toFixed(2), "1.00");
  // متقارن است — ترتیب مهم نیست.
  assert.equal(contrastRatio("#1E3A8A", "#FFFFFF"), contrastRatio("#FFFFFF", "#1E3A8A"));
});

test("ترکیبِ شفاف، رنگِ مات را درست می‌سازد", () => {
  assert.equal(compositeHex("#000000", "#FFFFFF", 1), "#000000");
  assert.equal(compositeHex("#000000", "#FFFFFF", 0), "#ffffff");
  assert.equal(compositeHex("#000000", "#FFFFFF", 0.5), "#808080");
});

test("رنگِ نامعتبر خطا می‌دهد، نه رنگِ حدسی", () => {
  assert.throws(() => parseHex("سبز"));
  assert.throws(() => parseHex("#12345"));
  assert.deepEqual(parseHex("#fff"), { r: 255, g: 255, b: 255 });
});

test("ارجاعِ var() در تمِ تیره با مقدارِ همان تم حل می‌شود", () => {
  // `--gold-ink: var(--gold-light)` در `.dark`؛ `--gold-light` فقط در `:root`.
  // اگر این ارجاع با مقدارِ تمِ روشن حل شود، تست سبزِ دروغین می‌دهد.
  assert.notEqual(tok("dark", "--gold-ink"), tok("light", "--gold-ink"));
  assert.equal(tok("dark", "--gold-ink").toLowerCase(), tok("light", "--gold-light").toLowerCase());
});

/* ── متن روی سطح ────────────────────────────────────────────────────────── */

const TEXT_TOKENS = [
  "--text",
  "--text-2",
  "--text-3",
  "--heading",
  "--gold-ink",
  "--warning-ink",
  "--danger-ink",
  "--navy-ink",
  "--success",
  "--danger",
] as const;

/**
 * توکن‌هایی که **متن** نیستند: نوار، آیکون و کاشی. حدشان ۳:۱ است، نه ۴٫۵:۱.
 *
 * `--warning` عمداً اینجاست و نه در فهرستِ متن: روی `--surface-2` ۴٫۴۰:۱
 * می‌دهد و خودِ `globals.css` برای همین `--warning-ink` را ساخته و نوشته که
 * نسخهٔ متنی آن است. پایین‌آوردنِ حد برای متن تقلب بود؛ این تفکیک همان چیزی
 * است که کد از قبل ادعا می‌کند و حالا آزموده می‌شود.
 */
const GRAPHIC_TOKENS = ["--warning", "--focus", "--gold-ink"] as const;

for (const theme of THEMES) {
  test(`متن روی هر سه سطح در تمِ ${theme} حدِ AA را می‌گذراند`, () => {
    for (const t of TEXT_TOKENS) {
      for (const s of SURFACES) {
        const r = contrastRatio(tok(theme, t), tok(theme, s));
        assert.ok(r >= AA_TEXT, `${t} روی ${s} در ${theme}: ${r.toFixed(2)} < ${AA_TEXT}`);
      }
    }
  });
}

for (const theme of THEMES) {
  test(`عناصرِ گرافیکی در تمِ ${theme} حدِ ۳:۱ را می‌گذرانند`, () => {
    for (const t of GRAPHIC_TOKENS) {
      for (const s of SURFACES) {
        const r = contrastRatio(tok(theme, t), tok(theme, s));
        assert.ok(r >= AA_LARGE, `${t} روی ${s} در ${theme}: ${r.toFixed(2)} < ${AA_LARGE}`);
      }
    }
  });
}

test("استثنای مستند: طلاییِ برند روی کرمِ برند به ۳:۱ نمی‌رسد", () => {
  // این یک یافته است، نه یک تنظیم. `--gold` رنگِ **برند** است و تیره‌کردنش
  // یعنی عوض‌کردنِ هویت؛ پس رنگ سرِ جایش می‌ماند و محدودیتش اینجا قفل
  // می‌شود: روی سفید و پس‌زمینهٔ صفحه مجاز است، روی کرم نه. هر علامتِ
  // طلاییِ کوچک روی `--surface-2` باید `--gold-ink` باشد.
  const onCream = contrastRatio(tok("light", "--gold"), tok("light", "--surface-2"));
  assert.ok(onCream < AA_LARGE, `اگر این عدد بالا رفت (${onCream.toFixed(2)}) استثنا را بردارید`);
  assert.ok(onCream > 2.5, `و اگر پایین‌تر رفت، طلایی روی کرم دیگر اصلاً دیده نمی‌شود: ${onCream.toFixed(2)}`);
  // جانشینِ مجاز باید واقعاً کار کند.
  assert.ok(contrastRatio(tok("light", "--gold-ink"), tok("light", "--surface-2")) >= AA_TEXT);
  // روی دو سطحِ دیگر، خودِ طلایی مجاز است.
  for (const s of ["--surface", "--bg"] as const) {
    assert.ok(contrastRatio(tok("light", "--gold"), tok("light", s)) >= AA_LARGE, s);
  }
});

test("`--warning-ink` همان کاری را می‌کند که ادعا می‌کند", () => {
  // ادعای `globals.css`: نسخهٔ متنیِ هشدار روی سطحِ کم‌رنگ خوانا است، در حالی
  // که خودِ `--warning` آنجا زیرِ AA می‌افتد. هر دو نیمهٔ این ادعا آزموده شود.
  for (const theme of THEMES) {
    const ink = contrastRatio(tok(theme, "--warning-ink"), tok(theme, "--surface-2"));
    assert.ok(ink >= AA_TEXT, `--warning-ink در ${theme}: ${ink.toFixed(2)}`);
  }
  const plain = contrastRatio(tok("light", "--warning"), tok("light", "--surface-2"));
  assert.ok(plain < AA_TEXT, "اگر `--warning` خودش خوانا شد، `--warning-ink` دیگر لازم نیست");
});

/* ── جفت‌های «متن روی رنگِ برند» ─────────────────────────────────────────── */

for (const theme of THEMES) {
  test(`متن روی سطحِ رنگی در تمِ ${theme} خوانا است`, () => {
    const pairs: Array<[string, string]> = [
      ["--text-on-navy", "--navy"],
      ["--text-on-gold", "--gold"],
      ["--text-on-danger", "--danger"],
    ];
    for (const [fg, bg] of pairs) {
      const r = contrastRatio(tok(theme, fg), tok(theme, bg));
      assert.ok(r >= AA_TEXT, `${fg} روی ${bg} در ${theme}: ${r.toFixed(2)}`);
    }
  });
}

test("متنِ انتخاب‌شده کم‌خوان‌تر از متنِ عادی نمی‌شود", () => {
  // `::selection` قبلاً سفید روی `--gold` بود: ۳٫۲۵:۱.
  for (const theme of THEMES) {
    const r = contrastRatio(tok(theme, "--text-on-gold"), tok(theme, "--gold"));
    assert.ok(r >= AA_TEXT, `انتخاب در ${theme}: ${r.toFixed(2)}`);
  }
});

/* ── فوکوس ──────────────────────────────────────────────────────────────── */

for (const theme of THEMES) {
  test(`حلقهٔ فوکوس در تمِ ${theme} روی هر سه سطح دیده می‌شود`, () => {
    // WCAG 2.2 (Focus Appearance) نشانگرِ فوکوس را عنصرِ گرافیکی می‌شمارد: ۳:۱.
    for (const s of SURFACES) {
      const r = contrastRatio(tok(theme, "--focus"), tok(theme, s));
      assert.ok(r >= AA_LARGE, `--focus روی ${s} در ${theme}: ${r.toFixed(2)}`);
    }
  });
}

test("`--focus` در تمِ تیره با تمِ روشن یکی نیست", () => {
  // باگِ واقعی: `--ring` در `.dark` بازتعریف نمی‌شد و هالهٔ سرمه‌ای روی
  // زمینهٔ سرمه‌ایِ تیره نامرئی بود.
  assert.notEqual(tok("light", "--focus"), tok("dark", "--focus"));
});

/* ── پالتِ داده ─────────────────────────────────────────────────────────── */

for (const theme of THEMES) {
  test(`پالتِ داده در تمِ ${theme} روی هر سه سطح خوانا است`, () => {
    for (let i = 1; i <= SERIES_COLOR_COUNT; i++) {
      for (const s of SURFACES) {
        const r = contrastRatio(tok(theme, `--data-${i}`), tok(theme, s));
        assert.ok(r >= AA_TEXT, `--data-${i} روی ${s} در ${theme}: ${r.toFixed(2)}`);
      }
    }
  });

  test(`رنگ‌های پالتِ داده در تمِ ${theme} از هم قابلِ تفکیک‌اند`, () => {
    // دو سریِ هم‌رنگ یعنی نموداری که راهنمایش دروغ می‌گوید. سنجه فاصلهٔ
    // **ادراکی** است نه نسبتِ کنتراست: طلاییِ تیره و فیروزه‌ای نسبتِ ۱٫۰۶
    // دارند (هم‌روشنایی) ولی هیچ چشمی آن دو را یکی نمی‌بیند.
    for (let i = 1; i <= SERIES_COLOR_COUNT; i++) {
      for (let j = i + 1; j <= SERIES_COLOR_COUNT; j++) {
        const a = tok(theme, `--data-${i}`);
        const b = tok(theme, `--data-${j}`);
        assert.notEqual(a.toLowerCase(), b.toLowerCase(), `data-${i} و data-${j} یکی‌اند`);
        const d = deltaE76(a, b);
        assert.ok(
          d >= MIN_CATEGORICAL_DELTA_E,
          `data-${i} و data-${j} در ${theme}: ΔE ${d.toFixed(1)} < ${MIN_CATEGORICAL_DELTA_E}`,
        );
      }
    }
  });
}

test("خطِ راهنما کم‌رنگ‌تر از متنِ محور است — با داده رقابت نمی‌کند", () => {
  for (const theme of THEMES) {
    const grid = contrastRatio(tok(theme, "--grid"), tok(theme, "--surface"));
    const axis = contrastRatio(tok(theme, "--axis"), tok(theme, "--surface"));
    assert.ok(grid < 2, `--grid در ${theme} خیلی پررنگ است: ${grid.toFixed(2)}`);
    assert.ok(axis >= AA_TEXT, `--axis در ${theme} خیلی کم‌رنگ است: ${axis.toFixed(2)}`);
  }
});

/* ── کاشیِ حرارتی ───────────────────────────────────────────────────────── */

const HEAT_SAMPLES = [8, 5, 3, 1, 0.6, 0.2, 0, -0.2, -0.6, -1, -3, -5, -8];

for (const theme of THEMES) {
  test(`برچسبِ کاشیِ حرارتی در تمِ ${theme} روی هر پله خوانا است`, () => {
    // باگِ واقعی: متنِ سفید روی سبزِ روشن ۱٫۴:۱ و روی قرمزِ روشن ۱٫۸:۱ بود.
    const surface = tok(theme, "--surface");
    const label = tok(theme, "--text");
    for (const v of [...HEAT_SAMPLES, null]) {
      const h = heatTile(v);
      const base = tok(theme, h.color.replace(/^var\(|\)$/g, ""));
      const tile = compositeHex(base, surface, h.opacity);
      const r = contrastRatio(label, tile);
      assert.ok(r >= AA_TEXT, `کاشیِ ${v} در ${theme}: ${r.toFixed(2)}`);
    }
  });
}

test("شدتِ کاشی هرگز از سقف رد نمی‌شود", () => {
  for (const v of HEAT_SAMPLES) {
    assert.ok(heatTile(v).opacity <= MAX_TINT, `شدتِ ${v} از سقف رد شد`);
  }
  assert.ok(heatTile(null).opacity <= MAX_TINT);
});

test("«بدون داده» و «بی‌تغییر» یک ظاهر ندارند", () => {
  // نسخهٔ قبل هر دو را `#9ca3af` می‌کرد: دو معنای متفاوت، یک رنگ.
  const none = heatTile(null);
  const flat = heatTile(0);
  assert.equal(none.direction, "unknown");
  assert.equal(flat.direction, "flat");
  assert.ok(none.color !== flat.color || none.opacity !== flat.opacity);
});

test("جهتِ کاشی با علامتِ عدد می‌خواند و آستانه رعایت می‌شود", () => {
  assert.equal(heatTile(5).direction, "up");
  assert.equal(heatTile(-5).direction, "down");
  assert.equal(heatTile(FLAT_THRESHOLD - 0.01).direction, "flat");
  assert.equal(heatTile(-(FLAT_THRESHOLD - 0.01)).direction, "flat");
  assert.equal(heatTile(FLAT_THRESHOLD + 0.01).direction, "up");
  // شدت با بزرگیِ تغییر زیاد می‌شود، نه با علامت.
  assert.ok(heatTile(5).opacity > heatTile(1).opacity);
  assert.equal(heatTile(5).opacity, heatTile(-5).opacity);
});

/* ── قاعدهٔ توکن ────────────────────────────────────────────────────────── */

test("هیچ رنگِ خامی در کامپوننت‌های نمودار نمانده", () => {
  // این سه، بیشترین hexِ خام را داشتند. fallbackِ `getPropertyValue` استثنای
  // مستندِ C4 است و در فایل‌های نمودارِ canvas می‌ماند؛ این تست فایل‌هایی را
  // می‌پاید که هیچ استثنایی ندارند.
  const files = ["components/market/MarketTreemap.tsx"];
  for (const f of files) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    const hits = src.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    assert.deepEqual(hits, [], `${f} هنوز رنگِ خام دارد: ${hits.join("، ")}`);
  }
});
