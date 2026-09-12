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
  constructor(getBudget, { enforced = legacyEnforced, makeFallback = null } = {}) {
    this.getBudget = getBudget;
    this.isEnforced = enforced;
    this.makeFallback = makeFallback;
    this.fallbackBudget = null;
    this.fallbackUsed = 0;
    this.used = Object.create(null);
    this.rejected = Object.create(null);
    this.overBudgetPassed = Object.create(null);
    this.unmetered = 0;
  }

  #bump(map, producer) { map[producer] = (map[producer] ?? 0) + 1; }

  /**
   * کدام بودجه باید تصمیم بگیرد.
   *
   * وقتی انبارِ ماندگار نیست، در حالتِ **شمارش** همان «دیده‌نشده» گزارش
   * می‌شود. در حالتِ **اجرا** اما «نشمردن» یعنی مصرفِ نامحدود — دقیقاً همان
   * چیزی که سوییچِ اجرا قرار بود ببندد. پس یک سقفِ **درون‌فرایندی** ساخته
   * می‌شود: با هر restart صفر می‌شود، پس تضمینِ روزانه **نیست**؛ ولی
   * «نامحدود» را به «محدود در هر فرایند» تبدیل می‌کند. این تنزل در
   * `snapshot().fallback` دیده می‌شود، نه پنهان.
   */
  #resolveBudget() {
    const shared = this.getBudget();
    if (shared) return { budget: shared, degraded: false };
    if (!this.isEnforced() || !this.makeFallback) return { budget: null, degraded: false };
    this.fallbackBudget ??= this.makeFallback();
    return { budget: this.fallbackBudget ?? null, degraded: this.fallbackBudget !== null };
  }

  /**
   * یک واحدِ مصرفِ مسیرِ قدیمی را ثبت می‌کند.
   * در حالتِ اجرا، وقتی بودجه اجازه ندهد `LegacyBudgetError` پرتاب می‌شود.
   */
  async count(producer, budgetClass = "standard") {
    const { budget: b, degraded } = this.#resolveBudget();
    if (degraded) this.fallbackUsed += 1;
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
      // سقفِ درون‌فرایندیِ اضطراری: فقط در حالتِ اجرا و فقط وقتی انبارِ
      // ماندگار نیست. `null` یعنی هرگز لازم نشد.
      fallback: this.fallbackBudget
        ? { reason: "no persistent store, enforcement on", calls: this.fallbackUsed, ...this.fallbackBudget.snapshot() }
        : null,
    };
  }
}
