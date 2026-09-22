/**
 * کاشیِ حرارتی — یک نگاشتِ واحد از «درصدِ تغییر» به «رنگِ کاشی و رنگِ متن».
 *
 * ── مسئله ────────────────────────────────────────────────────────────────
 * سه نقشهٔ حرارتیِ سایت (نقشهٔ بازار، نقشهٔ فشردهٔ صندوق‌ها، کاشی‌های صنعت) هر
 * کدام رمپِ رنگیِ خودشان را داشتند. نقشهٔ بازار هفت hexِ ثابتِ سبز/قرمز
 * می‌نوشت که:
 *   · با تم نمی‌چرخید — در تمِ تیره یک بلوکِ روشن وسطِ صفحهٔ تیره می‌ماند؛
 *   · برچسبش همیشه سفید بود، و سفید روی سبزِ روشن (`#86efac`) ۱٫۴:۱ و روی
 *     قرمزِ روشن (`#fca5a5`) ۱٫۸:۱ می‌داد — یعنی نامِ نماد روی سه پله از هفت
 *     پله عملاً خوانده نمی‌شد؛
 *   · «دادهٔ ناموجود» و «±۰٫۵٪» هر دو یک خاکستری بودند، پس دو معنای متفاوت
 *     یک ظاهر داشتند.
 *
 * ── راه‌حل ───────────────────────────────────────────────────────────────
 * رنگِ پایه از توکنِ معناییِ `--success`/`--danger` می‌آید (پس با تم می‌چرخد)
 * و شدت با **شفافیت** ساخته می‌شود، نه با هفت رنگِ دستی. سقفِ شفافیت ۰٫۴۵
 * است: در بدترین جفت (سبزِ تمِ تیره) متنِ `--text` روی آن ۵٫۷:۱ می‌دهد، یعنی
 * برچسب در هر دو تم و هر هفت پله بالای حدِ AA می‌ماند.
 */

/** سقفِ شفافیتِ کاشی — بالاتر از این، متن در تمِ تیره زیرِ AA می‌افتد. */
export const MAX_TINT = 0.45;

export type HeatDirection = "up" | "down" | "flat" | "unknown";

export interface HeatTile {
  /** توکنِ رنگِ پایه (`var(--…)`) — در «ناموجود» و «خنثی» رنگِ معنایی نیست. */
  color: string;
  /** شفافیتِ کاشی، ۰ تا `MAX_TINT`. */
  opacity: number;
  /** جهت — برای وقتی که رنگ نباید تنها حاملِ معنا باشد. */
  direction: HeatDirection;
}

/**
 * پله‌های شدت. همان بازه‌های «نبض بازار» تا خوانندهٔ صفحه دو زبانِ متفاوت
 * نبیند؛ فقط ترجمهٔ رنگ عوض شده است.
 */
const STEPS: ReadonlyArray<{ min: number; opacity: number }> = [
  { min: 4, opacity: MAX_TINT },
  { min: 2, opacity: 0.3 },
  { min: 0.5, opacity: 0.16 },
];

/** آستانهٔ «بی‌تغییر» — زیرِ این، جهت معنا ندارد. */
export const FLAT_THRESHOLD = 0.5;

export function heatTile(changePercent: number | null | undefined): HeatTile {
  if (typeof changePercent !== "number" || !Number.isFinite(changePercent)) {
    // «نداریم» رنگِ معنایی نمی‌گیرد و با «صفر» یکی نمی‌شود: کاشیِ بی‌رنگ با
    // مرزِ کارت. نسخهٔ قبل هر دو را یک خاکستری می‌کرد.
    return { color: "var(--line-strong)", opacity: 0.35, direction: "unknown" };
  }
  const mag = Math.abs(changePercent);
  if (mag < FLAT_THRESHOLD) {
    return { color: "var(--text-3)", opacity: 0.14, direction: "flat" };
  }
  const step = STEPS.find((s) => mag > s.min) ?? STEPS[STEPS.length - 1];
  return {
    color: changePercent > 0 ? "var(--success)" : "var(--danger)",
    opacity: step.opacity,
    direction: changePercent > 0 ? "up" : "down",
  };
}

/**
 * برچسبِ کاشی همیشه `--text` است.
 *
 * انتخابِ رنگِ متن بر اساسِ روشناییِ کاشی (کارِ رایج) اینجا لازم نیست، چون
 * سقفِ `MAX_TINT` تضمین می‌کند حتی پررنگ‌ترین کاشی هم زمینه‌ای بماند که
 * `--text` رویش بالای ۵:۱ است — در هر دو تم. یک رنگِ متن یعنی یک کنتراستِ
 * تضمین‌شده، به‌جای دو شاخه که هر کدام جداگانه می‌توانند بشکنند.
 */
export const HEAT_LABEL_COLOR = "var(--text)";

/** متنِ کوتاهِ جهت — برای صفحه‌خوان، وقتی رنگ تنها نشانه است. */
export function heatDirectionLabel(d: HeatDirection): string {
  if (d === "up") return "صعودی";
  if (d === "down") return "نزولی";
  if (d === "flat") return "بی‌تغییر";
  return "بدون داده";
}
