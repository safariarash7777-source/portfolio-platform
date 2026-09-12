// brsapi-client.mjs — تنها درگاهِ تماس با BrsApi.
//
// ── مسئله‌ای که حل می‌کند ───────────────────────────────────────────────────
// امروز ۹ تولیدکنندهٔ مستقل در یک پروسه هرکدام سقفِ هم‌زمانیِ **خودشان** را
// دارند (`NAV_CONCURRENCY=4`, `META_CONCURRENCY=4`, `CANDLE_CONCURRENCY=3`, …)
// و هیچ‌چیز هماهنگشان نمی‌کند — پس سقف‌ها **جمع می‌شوند**: در بدترین هم‌ترازی
// تا **۲۱ درخواستِ هم‌زمان** روی یک کلید و یک IP. با تأخیرِ ~۲۰۰ms هر درخواست
// این یعنی نرخِ لحظه‌ایِ ~۱۰۰ req/s، ده برابرِ هدف.
//
// اندازه‌گیریِ ۱۴۰۵/۰۶/۱۹ (سندِ `docs/BRSAPI-CLIENT-DESIGN.md`) نشان داد
// **مسئله نرخِ پایدار نیست**: کلِ مصرفِ یک روز با ۱۰ req/s فقط ۳ تا ۲۰ دقیقه
// زمانِ دیواری می‌خواهد. مسئله **تراکمِ لحظه‌ای** است. این ماژول آن را صاف می‌کند.
//
// ── آنچه این ماژول عمداً نمی‌کند ────────────────────────────────────────────
// • هیچ endpointِ تازه‌ای نمی‌سازد و هیچ پارامتری حدس نمی‌زند (قاعدهٔ `Q1`).
// • کلیدِ API را در `params` نمی‌پذیرد؛ خودش اضافه می‌کند تا در لاگ/متریک نیفتد.
// • هیچ هماهنگیِ بین‌نمونه‌ای ندارد — رجوع به بخشِ «چند نمونه» پایین.
//
// ── چند نمونه (replica) ────────────────────────────────────────────────────
// محدودکننده و شمارنده‌های اینجا **درون‌حافظه‌ای و per-process** هستند. با دو
// نمونه، نرخِ واقعیِ روی کلید دو برابرِ تنظیم می‌شود و سقفِ روزانه بی‌معنا.
// شواهدِ نوشتنِ Supabase می‌گوید امروز **یک نمونه** فعال است (۸۰ پنجرهٔ
// ۳۰ دقیقه‌ایِ متوالی، دقیقاً یک ردیف در هر پنجره، کمینه‌فاصلهٔ ۳۰٫۰۵ دقیقه).
// ولی این **استنتاج از رفتارِ نوشتن** است، نه خواندنِ کنسولِ Liara.
// ⇒ `BRSAPI_CLIENT_ENABLED=1` تا تأییدِ تک‌نمونه‌بودن در کنسول، **گیتِ rollout**
//   دارد. جزئیات در سندِ طراحی، بخشِ rollout.

const DEFAULTS = {
  ratePerSec: Number(process.env.BRSAPI_RATE_PER_SEC || 10),
  concurrency: Number(process.env.BRSAPI_CONCURRENCY || 4),
  timeoutMs: Number(process.env.BRSAPI_TIMEOUT_MS || 15_000),
  queueWaitMs: Number(process.env.BRSAPI_QUEUE_WAIT_MS || 60_000),
  maxAttemptsBackground: 4,
  maxAttemptsInteractive: 2,
  backoffBaseMs: 1_000,
  backoffMaxMs: 60_000,

  // ── بودجهٔ روزانه ────────────────────────────────────────────────────────
  // سهمیهٔ کلیدِ اصلی ۱۰٬۰۰۰/روز است. سقفِ سخت **زیرِ** آن می‌ماند تا حاشیه‌ای
  // برای کارِ دستی، اشکال‌زدایی و خطای شمارش بماند.
  hardCeiling: Number(process.env.BRSAPI_DAILY_HARD || 9_000),
  softBudget: Number(process.env.BRSAPI_DAILY_SOFT || 6_000),
};

/**
 * طبقهٔ بودجه‌ایِ یک تولیدکننده — **محورِ جدا از `priority`**.
 *
 * `priority` دربارهٔ **تأخیر** است: چه کسی زودتر از صف خدمت بگیرد.
 * `budgetClass` دربارهٔ **کمیابی** است: وقتی بودجه ته می‌کشد، چه کسی قربانی شود.
 *
 * این دو یکی نیستند و ادغامشان غلط می‌شد: دورِ NAV از نظرِ تأخیر `background`
 * است (کسی پشتِ خط منتظرش نیست) ولی از نظرِ بودجه `critical` است — اگر NAV
 * نباشد، حباب کلاً محاسبه نمی‌شود. برعکس، یک درخواستِ `interactive` از مسیرِ
 * اشکال‌زدایی می‌تواند از نظرِ بودجه کاملاً `bulk` باشد.
 */
export const BUDGET_CLASSES = ["critical", "standard", "bulk"];

/**
 * سقفِ مصرفِ هر طبقه.
 *
 * `bulk` در `softBudget` می‌ایستد، `critical` تا `hardCeiling` ادامه می‌دهد، و
 * `standard` وسطِ این دو. نتیجه **تنزلِ تدریجی** است نه قطعِ ناگهانی: اول
 * بک‌فیل و آرشیو می‌ایستند، بعد کارهای معمولی، و چرخهٔ بازار و NAV تا آخرین
 * واحدِ بودجه زنده می‌مانند.
 */
export function classCeiling(budgetClass, { softBudget, hardCeiling }) {
  switch (budgetClass) {
    case "critical": return hardCeiling;
    case "bulk":     return Math.min(softBudget, hardCeiling);
    default:         return Math.min(hardCeiling, softBudget + Math.floor((hardCeiling - softBudget) / 2));
  }
}

/** کلیدِ روزِ تهران — مبنای ریستِ شمارنده (هم‌ترازِ بقیهٔ ماژول‌های رله). */
export function tehranDayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(now);
}

/**
 * بودجهٔ روزانهٔ سراسری.
 *
 * ── چرا رزرو **همگام** است ───────────────────────────────────────────────
 * بررسی و افزایشِ شمارنده باید بدونِ هیچ `await` بینشان انجام شود. اگر بینشان
 * `await` باشد، ده کارِ هم‌زمان همگی «هنوز جا هست» را می‌بینند و بعد همگی
 * افزایش می‌دهند — و سقف رد می‌شود. جاوااسکریپت تک‌نخی است، پس یک تابعِ
 * کاملاً همگام این مسابقه را حذف می‌کند.
 *
 * ── چرا retryها هم حساب می‌شوند ──────────────────────────────────────────
 * هر تلاشِ دوباره یک درخواستِ **واقعی** روی سیم است و از سهمیهٔ تأمین‌کننده کم
 * می‌کند. اگر نشمریم، بودجه دیگر بودجه نیست — یک تخمینِ خوش‌بینانه است که
 * دقیقاً در بدترین روز (روزی که پر از ۵xx است) بیشترین خطا را دارد.
 */
export class DailyBudget {
  constructor({ softBudget, hardCeiling, now = () => Date.now() }) {
    this.softBudget = softBudget;
    this.hardCeiling = hardCeiling;
    this.now = now;
    this.day = "";
    this.used = 0;
    this.rejected = 0;
    this.rejectedByClass = { critical: 0, standard: 0, bulk: 0 };
    this.usedByClass = { critical: 0, standard: 0, bulk: 0 };
    this.#roll();
  }

  #roll() {
    const k = tehranDayKey(new Date(this.now()));
    if (k !== this.day) {
      this.day = k;
      this.used = 0;
      this.rejected = 0;
      this.rejectedByClass = { critical: 0, standard: 0, bulk: 0 };
      this.usedByClass = { critical: 0, standard: 0, bulk: 0 };
    }
  }

  /** بدونِ رزرو — فقط برای پیش‌بررسی و متریک. */
  wouldAdmit(budgetClass) {
    this.#roll();
    if (this.used >= this.hardCeiling) return false;
    return this.used < classCeiling(budgetClass, this);
  }

  /**
   * رزروِ یک واحد. **همگام و اتمیک.**
   * خروجی: `true` اگر رزرو شد، `false` اگر بودجه اجازه نداد.
   */
  reserve(budgetClass) {
    this.#roll();
    // سقفِ سخت اول — هیچ طبقه‌ای، حتی `critical`، از آن رد نمی‌شود.
    if (this.used >= this.hardCeiling || this.used >= classCeiling(budgetClass, this)) {
      this.rejected += 1;
      this.rejectedByClass[budgetClass] = (this.rejectedByClass[budgetClass] ?? 0) + 1;
      return false;
    }
    this.used += 1;
    this.usedByClass[budgetClass] = (this.usedByClass[budgetClass] ?? 0) + 1;
    return true;
  }

  snapshot() {
    this.#roll();
    return {
      day: this.day,
      softBudget: this.softBudget,
      hardCeiling: this.hardCeiling,
      used: this.used,
      remaining: Math.max(0, this.hardCeiling - this.used),
      remainingByClass: Object.fromEntries(
        BUDGET_CLASSES.map((c) => [c, Math.max(0, classCeiling(c, this) - this.used)]),
      ),
      usedByClass: { ...this.usedByClass },
      rejectedByBudget: this.rejected,
      rejectedByClass: { ...this.rejectedByClass },
      softExhausted: this.used >= this.softBudget,
    };
  }
}


/**
 * بودجهٔ روزانه با شمارندهٔ **ماندگار و مشترک**.
 *
 * جایگزینِ مستقیمِ `DailyBudget` است (همان `reserve`/`wouldAdmit`/`snapshot`)
 * به‌اضافهٔ `ensure()` که کلاینت پیش از رزروِ همگام `await`ش می‌کند، و
 * `release()` برای خاموشیِ مرتب.
 *
 * ── چرا `reserve` همگام مانده ───────────────────────────────────────────────
 * اگر رزرو `async` می‌شد، بینِ «بررسیِ سقف» و «ارسال» یک نقطهٔ yield باز می‌شد
 * و چند کارِ هم‌زمان می‌توانستند از سقف رد شوند. پس هزینهٔ شبکه به `ensure()`
 * منتقل شده که **پیش از** بلوکِ همگام صدا زده می‌شود.
 *
 * ── چرا معمولاً `ensure()` منتظر نمی‌ماند ───────────────────────────────────
 * وقتی موجودیِ اجاره زیرِ خطِ هشدار برود، شارژِ بعدی در پس‌زمینه شروع می‌شود.
 * فقط وقتی اجاره واقعاً ته کشیده باشد `await` واقعی رخ می‌دهد.
 */
export class PersistentDailyBudget {
  constructor({
    store,
    softBudget,
    hardCeiling,
    leaseSize = 50,
    lowWaterRatio = 0.4,
    degradedCeiling = 100,
    now = () => Date.now(),
    onError = null,
  }) {
    if (!store) throw new Error("PersistentDailyBudget بدونِ store معنا ندارد");
    this.store = store;
    this.softBudget = softBudget;
    this.hardCeiling = hardCeiling;
    this.leaseSize = Math.max(1, leaseSize);
    this.lowWaterRatio = lowWaterRatio;
    this.degradedCeiling = Math.max(0, degradedCeiling);
    this.now = now;
    this.onError = onError;
    this.day = "";
    this.#resetDay(tehranDayKey(new Date(this.now())));
  }

  #resetDay(key) {
    this.day = key;
    this.granted = 0;          // جمعِ واحدهایی که امروز به ما اجاره داده شده
    this.spent = 0;            // از آن، چقدر خرج کرده‌ایم
    this.globalLeased = 0;     // آخرین عددی که انبار دربارهٔ کلِ مصرفِ روز گفت
    this.rejected = 0;
    this.rejectedByClass = { critical: 0, standard: 0, bulk: 0 };
    this.usedByClass = { critical: 0, standard: 0, bulk: 0 };
    this.leaseCalls = 0;
    this.leaseStarved = 0;     // «اجاره ته کشید» — با «بودجه تمام شد» یکی نیست
    this.storeErrors = 0;
    this.degradedUsed = 0;
    this.lastStoreError = null;
    this.storeHealthy = true;
    this.pending = null;
  }

  #roll() {
    const k = tehranDayKey(new Date(this.now()));
    if (k !== this.day) this.#resetDay(k);
  }

  /** موجودیِ خرج‌نشدهٔ اجاره. */
  get leaseRemaining() { return Math.max(0, this.granted - this.spent); }

  /**
   * برآوردِ مصرفِ **سراسری**: آنچه انبار می‌گوید اجاره رفته، منهای آن بخش از
   * اجارهٔ خودمان که هنوز خرج نشده. با یک replica دقیق است؛ با چند replica
   * یک کرانِ پایین است — ولی سقفِ سخت را انبار تضمین می‌کند، نه این عدد.
   */
  get used() { return Math.max(0, this.globalLeased - this.leaseRemaining); }

  wouldAdmit(budgetClass) {
    this.#roll();
    if (this.leaseRemaining <= 0 && this.degradedRemaining(budgetClass) <= 0) return false;
    const u = this.used;
    if (u >= this.hardCeiling) return false;
    return u < classCeiling(budgetClass, this);
  }

  /**
   * چرا رد شد — **خالص**، بدونِ اثرِ جانبی.
   * `"budget"` یعنی سهمیهٔ روز (یا طبقه) واقعاً تمام شده.
   * `"lease"` یعنی سهمیه هست ولی اجارهٔ این فرایند نرسیده — حالتِ چند-replica.
   * این دو را یکی شمردن یعنی روزی که مشکل «هماهنگی» است، «سهمیه» گزارش شود.
   */
  rejectionReason(budgetClass) {
    this.#roll();
    const u = this.used;
    if (u >= this.hardCeiling || u >= classCeiling(budgetClass, this)) return "budget";
    if (this.leaseRemaining <= 0 && this.degradedRemaining(budgetClass) <= 0) return "lease";
    return null;
  }

  /**
   * ثبتِ ردشدنی که در مسیرِ **پیش‌بررسی** رخ داد و هرگز به `reserve` نرسید.
   * بدونِ این، شمارندهٔ ردشدنِ بودجه فقط نیمی از ردشدن‌ها را می‌دید — و
   * شمارنده‌ای که بخشی از واقعیت را نمی‌بیند، بدتر از نداشتنِ شمارنده است.
   */
  noteRejected(budgetClass) {
    const why = this.rejectionReason(budgetClass);
    if (!why) return;
    if (why === "lease") this.leaseStarved += 1;
    this.rejected += 1;
    this.rejectedByClass[budgetClass] = (this.rejectedByClass[budgetClass] ?? 0) + 1;
  }

  /** مجوزِ اضطراری فقط برای `critical` و فقط وقتی انبار در دسترس نیست. */
  degradedRemaining(budgetClass) {
    if (this.storeHealthy || budgetClass !== "critical") return 0;
    return Math.max(0, this.degradedCeiling - this.degradedUsed);
  }

  /**
   * پیش‌نیازِ **غیرِهمگام** رزرو. کلاینت این را `await` می‌کند و بعد بلوکِ
   * همگامِ `reserve` را اجرا می‌کند.
   */
  async ensure() {
    this.#roll();
    const lowWater = Math.ceil(this.leaseSize * this.lowWaterRatio);
    if (this.leaseRemaining > lowWater) return;
    const p = this.#topUp();
    // فقط وقتی واقعاً چیزی برای خرج‌کردن نداریم منتظر می‌مانیم؛ وگرنه شارژ
    // در پس‌زمینه انجام می‌شود و این درخواست معطل نمی‌ماند.
    if (this.leaseRemaining <= 0) await p;
  }

  #topUp() {
    if (this.pending) return this.pending;
    const day = this.day;
    this.pending = (async () => {
      try {
        const want = Math.min(this.leaseSize, Math.max(1, this.hardCeiling - this.globalLeased));
        const r = await this.store.lease(day, want, this.hardCeiling);
        if (day !== this.day) return;          // روز وسطِ کار عوض شد؛ دور بریز.
        this.leaseCalls += 1;
        this.granted += r.granted;
        this.globalLeased = r.leasedBefore + r.granted;
        if (typeof r.hardCeiling === "number" && r.hardCeiling > 0) {
          this.hardCeiling = Math.min(this.hardCeiling, r.hardCeiling);
        }
        this.storeHealthy = true;
        this.lastStoreError = null;
      } catch (e) {
        this.storeErrors += 1;
        this.storeHealthy = false;
        this.lastStoreError = String(e && e.message ? e.message : e).slice(0, 200);
        if (this.onError) { try { this.onError(e); } catch { /* لاگ نباید مسیر را بشکند */ } }
      } finally {
        this.pending = null;
      }
    })();
    return this.pending;
  }

  /** رزروِ یک واحد. **همگام و اتمیک** — هیچ `await`ی داخلش نیست. */
  reserve(budgetClass) {
    this.#roll();

    if (this.leaseRemaining > 0) {
      const u = this.used;
      if (u >= this.hardCeiling || u >= classCeiling(budgetClass, this)) {
        this.rejected += 1;
        this.rejectedByClass[budgetClass] = (this.rejectedByClass[budgetClass] ?? 0) + 1;
        return false;
      }
      this.spent += 1;
      this.usedByClass[budgetClass] = (this.usedByClass[budgetClass] ?? 0) + 1;
      return true;
    }

    // اجاره ته کشیده. اگر انبار سالم است یعنی بودجهٔ روز تمام شده.
    if (this.storeHealthy) {
      this.leaseStarved += 1;
      this.rejected += 1;
      this.rejectedByClass[budgetClass] = (this.rejectedByClass[budgetClass] ?? 0) + 1;
      return false;
    }

    // انبار در دسترس نیست: مجوزِ اضطراریِ محدود، فقط `critical`.
    if (this.degradedRemaining(budgetClass) > 0) {
      this.degradedUsed += 1;
      this.usedByClass[budgetClass] = (this.usedByClass[budgetClass] ?? 0) + 1;
      return true;
    }

    this.rejected += 1;
    this.rejectedByClass[budgetClass] = (this.rejectedByClass[budgetClass] ?? 0) + 1;
    return false;
  }

  /** پس‌دادنِ اجارهٔ خرج‌نشده روی خاموشیِ مرتب. بهترین‌کوشش. */
  async release() {
    const back = this.leaseRemaining;
    if (back <= 0) return 0;
    try {
      const n = await this.store.release(this.day, back);
      this.granted -= n;
      this.globalLeased = Math.max(0, this.globalLeased - n);
      return n;
    } catch (e) {
      this.storeErrors += 1;
      this.lastStoreError = String(e && e.message ? e.message : e).slice(0, 200);
      return 0;
    }
  }

  snapshot() {
    this.#roll();
    const u = this.used;
    return {
      day: this.day,
      persistent: true,
      softBudget: this.softBudget,
      hardCeiling: this.hardCeiling,
      used: u,
      remaining: Math.max(0, this.hardCeiling - u),
      remainingByClass: Object.fromEntries(
        BUDGET_CLASSES.map((c) => [c, Math.max(0, classCeiling(c, this) - u)]),
      ),
      usedByClass: { ...this.usedByClass },
      rejectedByBudget: this.rejected,
      rejectedByClass: { ...this.rejectedByClass },
      softExhausted: u >= this.softBudget,
      lease: {
        size: this.leaseSize,
        granted: this.granted,
        spent: this.spent,
        remaining: this.leaseRemaining,
        calls: this.leaseCalls,
        starved: this.leaseStarved,
      },
      store: {
        healthy: this.storeHealthy,
        errors: this.storeErrors,
        lastError: this.lastStoreError,
        degradedCeiling: this.degradedCeiling,
        degradedUsed: this.degradedUsed,
      },
    };
  }
}

/** خطای ردشدن به‌خاطرِ بودجه — تا فراخوان بتواند از خطای شبکه جدایش کند. */
export class BudgetExceededError extends Error {
  constructor(budgetClass, snapshot) {
    super(`daily budget exhausted for class "${budgetClass}" (used ${snapshot.used}/${snapshot.hardCeiling})`);
    this.name = "BudgetExceededError";
    this.budgetClass = budgetClass;
    this.budget = snapshot;
  }
}

/** خطاهایی که اصلاً retry نمی‌شوند — قاعدهٔ `Q1`. */
export function isRetryable(status) {
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  // ۴xxِ غیرِ ۴۲۹: URL یا پارامتر غلط است. تکرار درستش نمی‌کند و فقط
  // ریسکِ بنِ IP را بالا می‌برد — همان چیزی که اسکیل هشدارش را می‌دهد.
  return false;
}

/**
 * تأخیرِ backoff با **full jitter**.
 *
 * چرا full jitter و نه «پایه + نوسانِ کوچک»: وقتی یک دورِ ۴۰۰تایی هم‌زمان ۴۲۹
 * می‌گیرد، backoffِ بدونِ jitter همه را **دقیقاً با هم** برمی‌گرداند و موجِ دوم
 * عیناً مثلِ موجِ اول است. full jitter موج را پخش می‌کند.
 */
export function backoffDelayMs(attempt, { baseMs, maxMs }, rand = Math.random) {
  const ceiling = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.floor(rand() * ceiling);
}

/** کلیدِ dedup — بدونِ کلیدِ API، با پارامترهای مرتب تا ترتیب کلید را عوض نکند. */
export function dedupeKey(endpoint, params = {}) {
  const parts = Object.keys(params).sort().map((k) => `${k}=${String(params[k])}`);
  return parts.length ? `${endpoint}?${parts.join("&")}` : endpoint;
}

/**
 * سطلِ نشتی (leaky bucket).
 *
 * پنجرهٔ ثابت عمداً انتخاب نشده: با پنجرهٔ ثابت می‌توان ۱۰ تا در آخرین
 * میلی‌ثانیهٔ یک پنجره و ۱۰ تا در اولین میلی‌ثانیهٔ پنجرهٔ بعد فرستاد — یعنی
 * ۲۰ تا در یک لحظه، دقیقاً همان تراکمی که می‌خواهیم حذف کنیم.
 */
export class LeakyBucket {
  constructor({ ratePerSec, now = () => Date.now() }) {
    this.intervalMs = 1000 / ratePerSec;
    this.now = now;
    this.nextAt = 0;
    this.slowUntil = 0;
    this.slowFactor = 1;
  }
  /** میلی‌ثانیهٔ انتظار تا نوبتِ بعدی، و رزروِ آن نوبت. */
  take() {
    const t = this.now();
    if (t > this.slowUntil) this.slowFactor = 1;
    const gap = this.intervalMs * this.slowFactor;
    const at = Math.max(t, this.nextAt);
    this.nextAt = at + gap;
    return at - t;
  }
  /**
   * پس از ۴۲۹ نرخِ **سراسری** نصف می‌شود، نه فقط آن یک درخواست عقب می‌افتد.
   * دلیل: ۴۲۹ یعنی نرخِ ما غلط بوده. اگر فقط همان درخواست عقب بیفتد، بقیهٔ
   * صف با همان نرخِ غلط ادامه می‌دهند و موجِ ۴۲۹ تکرار می‌شود.
   */
  slowDown(forMs, factor = 2) {
    this.slowFactor = factor;
    this.slowUntil = this.now() + forMs;
  }
}

export class BrsApiClient {
  constructor(opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    this.o = o;
    this.base = (o.base || "").replace(/\/+$/, "");
    this.key = o.key || "";
    this.headers = o.headers || {};
    this.fetchImpl = o.fetchImpl || globalThis.fetch;
    this.now = o.now || (() => Date.now());
    this.sleep = o.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.rand = o.rand || Math.random;
    this.bucket = new LeakyBucket({ ratePerSec: o.ratePerSec, now: this.now });
    this.budget = o.budget || new DailyBudget({
      softBudget: o.softBudget, hardCeiling: o.hardCeiling, now: this.now,
    });

    this.queues = { interactive: [], background: [] };
    this.active = 0;
    this.inFlight = new Map();  // dedupeKey → Promise
    this.cache = new Map();     // dedupeKey → { at, value }
    this.m = {
      sent: 0, ok: 0, err4xx: 0, err429: 0, err5xx: 0, timeout: 0, networkErr: 0,
      retries: 0, backoffMsTotal: 0,
      dedupeInFlight: 0, dedupeCache: 0,
      queuedPeak: 0, queueWaitMsTotal: 0, queueWaitSamples: 0, queueWaitMaxMs: 0,
      rejectedQueueTimeout: 0, rejectedByBudget: 0, byProducer: {},
    };
  }

  metrics() {
    return {
      ...this.m,
      budget: this.budget.snapshot(),
      active: this.active,
      queueDepth: this.queues.interactive.length + this.queues.background.length,
      cacheSize: this.cache.size,
      rateLimit: { perSec: this.o.ratePerSec, concurrency: this.o.concurrency },
      queueWaitAvgMs: this.m.queueWaitSamples
        ? Math.round(this.m.queueWaitMsTotal / this.m.queueWaitSamples) : 0,
    };
  }

  #bump(producer, field) {
    const p = (this.m.byProducer[producer] ||= {
      sent: 0, ok: 0, failed: 0, retries: 0, dedupe: 0, rejectedByBudget: 0,
    });
    p[field] = (p[field] ?? 0) + 1;
  }

  /** تنها راهِ تماس با BrsApi. */
  async request({ endpoint, params = {}, producer = "unknown",
                  priority = "background", budgetClass = "standard",
                  dedupeTtlMs = 0, timeoutMs }) {
    if (!endpoint) throw new Error("endpoint required");
    if ("key" in params) throw new Error("کلیدِ API نباید در params باشد");
    if (!BUDGET_CLASSES.includes(budgetClass)) {
      throw new Error(`budgetClass نامعتبر: ${budgetClass}`);
    }
    const dk = dedupeKey(endpoint, params);

    if (dedupeTtlMs > 0) {
      const c = this.cache.get(dk);
      if (c && this.now() - c.at < dedupeTtlMs) {
        this.m.dedupeCache += 1; this.#bump(producer, "dedupe");
        return c.value;
      }
    }
    const flying = this.inFlight.get(dk);
    if (flying) {
      this.m.dedupeInFlight += 1; this.#bump(producer, "dedupe");
      return flying;
    }

    // پیش‌بررسیِ بودجه **قبل از صف**: کاری که به‌هرحال رد می‌شود نباید نوبتِ
    // صف و یک اسلاتِ هم‌زمانی را اشغال کند. بودجه در طولِ روز فقط بالا می‌رود،
    // پس ردِ اینجا در ادامه هم رد می‌ماند (جز در گذارِ روز، که بررسیِ دومِ
    // داخلِ هر تلاش آن را درست می‌گیرد).
    if (typeof this.budget.ensure === "function") await this.budget.ensure();
    if (!this.budget.wouldAdmit(budgetClass)) {
      if (typeof this.budget.noteRejected === "function") this.budget.noteRejected(budgetClass);
      this.m.rejectedByBudget += 1; this.#bump(producer, "rejectedByBudget");
      throw new BudgetExceededError(budgetClass, this.budget.snapshot());
    }

    const p = this.#run({ endpoint, params, producer, priority, budgetClass, dedupeTtlMs, dk, timeoutMs })
      .finally(() => this.inFlight.delete(dk));
    this.inFlight.set(dk, p);
    return p;
  }

  async #run(job) {
    await this.#acquire(job.priority);
    try {
      const value = await this.#attempt(job);
      if (job.dedupeTtlMs > 0) this.cache.set(job.dk, { at: this.now(), value });
      return value;
    } finally {
      this.#release();
    }
  }

  #acquire(priority) {
    const q = this.queues[priority] || this.queues.background;
    if (this.active < this.o.concurrency && !this.queues.interactive.length && !this.queues.background.length) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, at: this.now() };
      q.push(entry);
      this.m.queuedPeak = Math.max(this.m.queuedPeak,
        this.queues.interactive.length + this.queues.background.length);
      // مهلتِ انتظارِ صف **جدا** از مهلتِ خودِ درخواست است. اگر یکی بود، در
      // ازدحام همهٔ کارها با هم timeout می‌شدند و هیچ‌کدام فرصتِ اجرا نمی‌گرفت.
      entry.timer = setTimeout(() => {
        const i = q.indexOf(entry);
        if (i >= 0) q.splice(i, 1);
        this.m.rejectedQueueTimeout += 1;
        reject(new Error(`queue wait exceeded ${this.o.queueWaitMs}ms`));
      }, this.o.queueWaitMs);
      if (entry.timer.unref) entry.timer.unref();
    });
  }

  #release() {
    this.active -= 1;
    // اولویت: کارِ تعاملی همیشه قبل از پس‌زمینه — وگرنه یک بک‌فیلِ ۴۰۰تایی
    // می‌تواند چرخهٔ کوچکِ بازار را پشتِ خودش گرسنه نگه دارد.
    const next = this.queues.interactive.shift() || this.queues.background.shift();
    if (!next) return;
    clearTimeout(next.timer);
    const waited = this.now() - next.at;
    this.m.queueWaitMsTotal += waited;
    this.m.queueWaitSamples += 1;
    this.m.queueWaitMaxMs = Math.max(this.m.queueWaitMaxMs, waited);
    this.active += 1;
    next.resolve();
  }

  async #attempt(job) {
    const maxAttempts = job.priority === "interactive"
      ? this.o.maxAttemptsInteractive : this.o.maxAttemptsBackground;
    let lastErr = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const wait = this.bucket.take();
      if (wait > 0) await this.sleep(wait);

      // شارژِ اجارهٔ بودجه — تنها نقطهٔ غیرِهمگامِ مسیرِ بودجه، و **پیش از**
      // بلوکِ همگامِ زیر. با بودجهٔ درون‌حافظه‌ای این تابع وجود ندارد و
      // چیزی عوض نمی‌شود.
      if (typeof this.budget.ensure === "function") await this.budget.ensure();

      // رزروِ بودجه **همگام و بلافاصله پیش از ارسال** — هیچ `await`ی بینِ رزرو
      // و `fetch` نیست، وگرنه چند کارِ هم‌زمان می‌توانستند از سقف رد شوند.
      // تلاشِ دوباره هم اینجاست، یعنی **retryها هم از بودجه کم می‌کنند**.
      if (!this.budget.reserve(job.budgetClass)) {
        this.m.rejectedByBudget += 1; this.#bump(job.producer, "rejectedByBudget");
        const err = new BudgetExceededError(job.budgetClass, this.budget.snapshot());
        if (attempt === 1) throw err;
        // اگر تلاشِ اول رفته و بودجه وسطِ کار ته کشیده، همان خطای آخر را
        // برمی‌گردانیم ولی علتِ واقعی را هم می‌چسبانیم.
        err.cause = lastErr;
        throw err;
      }

      const qs = new URLSearchParams({ ...job.params, key: this.key }).toString();
      const url = `${this.base}/${job.endpoint}?${qs}`;
      this.m.sent += 1; this.#bump(job.producer, "sent");

      try {
        const res = await this.fetchImpl(url, {
          headers: this.headers,
          signal: AbortSignal.timeout(job.timeoutMs ?? this.o.timeoutMs),
        });
        if (res.ok) {
          const body = await res.json();
          this.m.ok += 1; this.#bump(job.producer, "ok");
          return body;
        }
        if (res.status === 429) {
          this.m.err429 += 1;
        } else if (res.status >= 500) {
          this.m.err5xx += 1;
        } else {
          this.m.err4xx += 1;
        }
        lastErr = new Error(`http ${res.status}`);
        lastErr.status = res.status;
        if (!isRetryable(res.status)) break;

        // `Retry-After` بر محاسبهٔ ما مقدم است — منبع بهتر می‌داند.
        const ra = Number(res.headers?.get?.("retry-after"));
        const delay = Number.isFinite(ra) && ra > 0
          ? ra * 1000
          : backoffDelayMs(attempt, { baseMs: this.o.backoffBaseMs, maxMs: this.o.backoffMaxMs }, this.rand);
        if (res.status === 429) this.bucket.slowDown(Math.max(delay, this.o.backoffBaseMs));
        if (attempt < maxAttempts) {
          this.m.retries += 1; this.m.backoffMsTotal += delay; this.#bump(job.producer, "retries");
          await this.sleep(delay);
        }
      } catch (e) {
        const timedOut = e?.name === "TimeoutError" || /timeout/i.test(e?.message ?? "");
        if (timedOut) this.m.timeout += 1; else this.m.networkErr += 1;
        lastErr = e;
        if (attempt < maxAttempts) {
          const delay = backoffDelayMs(attempt, { baseMs: this.o.backoffBaseMs, maxMs: this.o.backoffMaxMs }, this.rand);
          this.m.retries += 1; this.m.backoffMsTotal += delay; this.#bump(job.producer, "retries");
          await this.sleep(delay);
        }
      }
    }
    this.#bump(job.producer, "failed");
    throw lastErr ?? new Error("request failed");
  }
}

/** فعال بودنِ کلاینت — پیش‌فرض **خاموش**؛ مسیرِ قدیمی دست‌نخورده می‌ماند. */
export function clientEnabled() {
  return process.env.BRSAPI_CLIENT_ENABLED === "1";
}
