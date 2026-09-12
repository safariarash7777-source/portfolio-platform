/**
 * شمارشِ مصرفِ مسیرِ **قدیمی** در همان بودجهٔ روزانه.
 *
 * ── مسئله‌ای که حل می‌کند ──────────────────────────────────────────────────
 * بودجه فقط مسیرهایی را می‌دید که به کلاینتِ مرکزی مهاجرت کرده‌اند. یعنی
 * خاموش‌کردنِ `BRSAPI_CLIENT_ENABLED` مصرف را **نامرئی** می‌کرد، نه کمتر.
 * سقفی که با یک سوییچ کور می‌شود سقف نیست — و شمارنده‌ای که بخشی از واقعیت
 * را نمی‌بیند، روزی برای اشتباه‌ترین دلیل باور می‌شود.
 *
 * ── چرا پیش‌فرض فقط می‌شمارد و رد نمی‌کند ───────────────────────────────────
 * امروز پرچم در Production خاموش است. اگر همین حالا مسیرِ قدیمی هم شروع به
 * رد‌کردن کند، اولین دیپلوی رفتارِ Production را عوض می‌کند — همان چیزی که
 * قرار بود نکنیم. پس حفره از «نامرئی» به «دیده‌شده» می‌رود، و تبدیلش به
 * «بسته» یک **تصمیمِ صریح** است (`BRSAPI_BUDGET_ENFORCE_LEGACY=1`)، نه یک
 * اثرِ جانبیِ دیپلوی.
 *
 * سوییچِ اجرا عمداً از پرچمِ کلاینت جداست، تا کسی با روشن‌کردنِ یکی، ناخواسته
 * رفتارِ دیگری را هم فعال نکند.
 */

export class LegacyBudgetError extends Error {
  constructor(producer) {
    super(`daily budget exhausted (legacy path, producer "${producer}")`);
    this.name = "LegacyBudgetError";
    this.producer = producer;
  }
}

export function legacyEnforced(env = process.env) {
  return env.BRSAPI_BUDGET_ENFORCE_LEGACY === "1";
}

export class LegacyMeter {
  /**
   * @param getBudget تابعی که بودجهٔ مشترک را می‌دهد (یا `null` اگر نساخته شده).
   *                  تابع است نه مقدار، چون بودجه تنبل ساخته می‌شود.
   */
  constructor(getBudget, { enforced = legacyEnforced } = {}) {
    this.getBudget = getBudget;
    this.isEnforced = enforced;
    this.used = Object.create(null);
    this.rejected = Object.create(null);
    this.overBudgetPassed = Object.create(null);
    this.unmetered = 0;
  }

  #bump(map, producer) { map[producer] = (map[producer] ?? 0) + 1; }

  /**
   * یک واحدِ مصرفِ مسیرِ قدیمی را ثبت می‌کند.
   * در حالتِ اجرا، وقتی بودجه اجازه ندهد `LegacyBudgetError` پرتاب می‌شود.
   */
  async count(producer, budgetClass = "standard") {
    const b = this.getBudget();
    if (!b) {
      // بدونِ شمارنده، این مصرف واقعاً دیده نمی‌شود. **پنهانش نمی‌کنیم** —
      // خودِ همین «ندیدن» یک عدد است که در `/debug` گزارش می‌شود.
      this.unmetered += 1;
      return;
    }
    if (typeof b.ensure === "function") await b.ensure();
    const admitted = b.reserve(budgetClass);
    this.#bump(this.used, producer);
    if (admitted) return;

    this.#bump(this.rejected, producer);
    if (this.isEnforced()) throw new LegacyBudgetError(producer);
    this.#bump(this.overBudgetPassed, producer);
  }

  snapshot() {
    return {
      enforced: this.isEnforced(),
      used: { ...this.used },
      rejected: { ...this.rejected },
      overBudgetPassed: { ...this.overBudgetPassed },
      unmetered: this.unmetered,
    };
  }
}
