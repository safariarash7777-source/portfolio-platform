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
};

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

    this.queues = { interactive: [], background: [] };
    this.active = 0;
    this.inFlight = new Map();  // dedupeKey → Promise
    this.cache = new Map();     // dedupeKey → { at, value }
    this.m = {
      sent: 0, ok: 0, err4xx: 0, err429: 0, err5xx: 0, timeout: 0, networkErr: 0,
      retries: 0, backoffMsTotal: 0,
      dedupeInFlight: 0, dedupeCache: 0,
      queuedPeak: 0, queueWaitMsTotal: 0, queueWaitSamples: 0, queueWaitMaxMs: 0,
      rejectedQueueTimeout: 0, byProducer: {},
    };
  }

  metrics() {
    return {
      ...this.m,
      active: this.active,
      queueDepth: this.queues.interactive.length + this.queues.background.length,
      cacheSize: this.cache.size,
      rateLimit: { perSec: this.o.ratePerSec, concurrency: this.o.concurrency },
      queueWaitAvgMs: this.m.queueWaitSamples
        ? Math.round(this.m.queueWaitMsTotal / this.m.queueWaitSamples) : 0,
    };
  }

  #bump(producer, field) {
    const p = (this.m.byProducer[producer] ||= { sent: 0, ok: 0, failed: 0, retries: 0, dedupe: 0 });
    p[field] += 1;
  }

  /** تنها راهِ تماس با BrsApi. */
  async request({ endpoint, params = {}, producer = "unknown",
                  priority = "background", dedupeTtlMs = 0, timeoutMs }) {
    if (!endpoint) throw new Error("endpoint required");
    if ("key" in params) throw new Error("کلیدِ API نباید در params باشد");
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

    const p = this.#run({ endpoint, params, producer, priority, dedupeTtlMs, dk, timeoutMs })
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
