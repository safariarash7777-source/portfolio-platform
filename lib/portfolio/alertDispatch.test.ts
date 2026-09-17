/**
 * مسیرِ اجراییِ هشدار — با بدلِ ذخیره‌گاه و گیرنده.
 *
 * چیزی که اینجا اثبات می‌شود رفتارِ **مسیر** است، نه رفتارِ موتور: هم‌زمانی،
 * پاسخِ گم‌شده، شکستِ ارسال، تلاشِ دوباره، ری‌استارتِ پردازش و جداییِ دو عضو.
 * تستِ موتور (`alerts.test.ts`) هیچ‌کدامِ این‌ها را نمی‌بیند.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { dispatchRebalanceAlert, type AlertSinkPort, type AlertStorePort, type ClaimInput, type ClaimResult } from "./alertDispatch";
import { alertKey } from "./alerts";
import type { RebalanceResult } from "./contracts";

const NOW = new Date("2026-09-17T12:00:00Z");

const result = (delta: number, definitive = true): RebalanceResult => ({
  identity: { holdingVersionId: "hv-1", targetVersionId: "tv-1", pricedAt: NOW.toISOString() },
  rows: [
    { assetClass: "gold", value: 100, currentWeightPct: 40, targetWeightPct: 40 + delta, deltaPercentagePoints: delta, valueDelta: 10 },
    { assetClass: "equity_ir", value: 100, currentWeightPct: 60, targetWeightPct: 60 - delta, deltaPercentagePoints: -delta, valueDelta: -10 },
  ],
  totalValue: 200,
  fullCoverage: true,
  gaps: [],
  definitive,
  notes: [],
});

/**
 * ذخیره‌گاهِ درون‌حافظه‌ای که قفلِ یکتایی و دفترِ append-onlyِ دیتابیس را تقلید
 * می‌کند — با همان قیدها، تا بدل از واقعیت سست‌تر نباشد.
 */
class FakeStore implements AlertStorePort {
  events = new Map<string, { id: string; userId: string }>();
  deliveries: { eventId: string; channel: string; status: string; attempt: number; error: string | null; sentAt: string | null; createdAt: string }[] = [];
  private seq = 0;
  /** ساعتِ ساختگی برای مهرِ ردیف‌ها؛ تست می‌تواند جلو ببردش. */
  clock = new Date("2026-09-17T12:00:00Z");

  private keyOf(userId: string, alertKey: string) {
    return `${userId}::${alertKey}`;
  }

  private summarise(eventId: string) {
    const mine = this.deliveries.filter((d) => d.eventId === eventId);
    const terminal = new Set(mine.filter((d) => d.status !== "pending").map((d) => `${d.channel}#${d.attempt}`));
    const open = mine
      .filter((d) => d.status === "pending" && !terminal.has(`${d.channel}#${d.attempt}`))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
    return {
      alreadyDelivered: mine.some((d) => d.status === "sent"),
      openAttempt: open
        ? { channel: open.channel as "log" | "email" | "telegram", attempt: open.attempt, startedAt: open.createdAt }
        : null,
      finishedAttempts: terminal.size,
    };
  }

  async loadState(userId: string) {
    const sentIds = new Set(this.deliveries.filter((d) => d.status === "sent").map((d) => d.eventId));
    const mine = [...this.events.entries()]
      .filter(([, e]) => e.userId === userId && sentIds.has(e.id))
      .map(([k, e]) => ({ alertKey: k.slice(userId.length + 2), id: e.id }));
    const lastEntry = mine[mine.length - 1];
    if (!lastEntry) return { lastKey: null, lastSentAt: null };
    const sentAt = this.deliveries.find((d) => d.eventId === lastEntry.id && d.status === "sent")?.sentAt ?? null;
    return { lastKey: lastEntry.alertKey, lastSentAt: sentAt };
  }

  async claimEvent(input: ClaimInput): Promise<ClaimResult> {
    const k = this.keyOf(input.userId, input.alertKey);
    const existing = this.events.get(k);
    if (existing) return { claimed: false, eventId: existing.id, ...this.summarise(existing.id) };
    const id = `ev-${++this.seq}`;
    this.events.set(k, { id, userId: input.userId });
    return { claimed: true, eventId: id, alreadyDelivered: false, openAttempt: null, finishedAttempts: 0 };
  }

  async beginAttempt(input: { eventId: string; channel: string; attempt: number }) {
    // ⚠️ همان قیدِ `rad_attempt_once` دیتابیس. **قفلِ واقعیِ هم‌زمانی همین است**:
    // دو پردازش که هر دو «تلاشِ ۱» را برمی‌دارند، فقط یکی‌شان می‌تواند ردیفِ
    // آغاز را بنویسد. بدونِ اعمالِ این قید در بدل، تست از واقعیت سست‌تر بود.
    const dup = this.deliveries.some(
      (d) => d.eventId === input.eventId && d.channel === input.channel &&
             d.attempt === input.attempt && d.status === "pending"
    );
    if (dup) throw new Error("تلاش با همین شماره از قبل آغاز شده است");
    this.deliveries.push({
      eventId: input.eventId, channel: input.channel, status: "pending",
      attempt: input.attempt, error: null, sentAt: null, createdAt: this.clock.toISOString(),
    });
  }

  async finishAttempt(input: { eventId: string; channel: string; attempt: number; status: string; error: string | null; sentAt: string | null }) {
    // قیدهای واقعیِ دیتابیس اینجا هم اعمال می‌شوند.
    if (input.status === "sent" && !input.sentAt) throw new Error("sent بدون زمان");
    if (input.status === "failed" && !input.error) throw new Error("failed بدون دلیل");
    if (input.status === "unknown" && !input.error) throw new Error("unknown بدون دلیل");
    const dup = this.deliveries.some(
      (d) => d.eventId === input.eventId && d.channel === input.channel &&
             d.attempt === input.attempt && d.status === input.status
    );
    if (dup) throw new Error("همان تلاش دوبار همان وضعیت گرفت");
    this.deliveries.push({ ...input, createdAt: this.clock.toISOString() });
  }

  /** فقط برای تست: تلاش‌های باز. */
  openAttempts() {
    return this.deliveries.filter((d) => d.status === "pending" &&
      !this.deliveries.some((t) => t.status !== "pending" && t.eventId === d.eventId && t.channel === d.channel && t.attempt === d.attempt));
  }
}

class OkSink implements AlertSinkPort {
  readonly channel = "log" as const;
  calls = 0;
  async deliver() { this.calls++; return { ok: true }; }
}
class FailSink implements AlertSinkPort {
  readonly channel = "email" as const;
  calls = 0;
  async deliver() { this.calls++; return { ok: false, error: "شبکه قطع بود" }; }
}
/** بار اول شکست، بار دوم موفق — برای آزمونِ تلاشِ دوباره. */
class FlakySink implements AlertSinkPort {
  readonly channel = "telegram" as const;
  calls = 0;
  async deliver() { this.calls++; return this.calls === 1 ? { ok: false, error: "۵۰۳" } : { ok: true }; }
}
class ThrowSink implements AlertSinkPort {
  readonly channel = "email" as const;
  async deliver(): Promise<{ ok: boolean }> { throw new Error("کلید نامعتبر"); }
}

/** ردیف‌های پایانی — `pending` ردِ آغاز است، نه نتیجه. */
const terminal = (store: FakeStore) => store.deliveries.filter((d) => d.status !== "pending");

const opts = {
  thresholdPoints: 5, cooldownHours: 24,
  maxAttempts: 2, maxTotalAttempts: 5, attemptLeaseMinutes: 10,
  now: NOW,
};
const run = (store: AlertStorePort, sinks: AlertSinkPort[], res = result(10), userId = "u-1") =>
  dispatchRebalanceAlert({ userId, result: res }, { store, sinks, options: opts });

describe("ارسال و ثبت", () => {
  test("انحرافِ معتبر رویدادِ قابلِ پیگیری می‌سازد و به گیرنده می‌رسد", async () => {
    const store = new FakeStore();
    const sink = new OkSink();
    const out = await run(store, [sink]);

    assert.equal(out.sent, true);
    assert.equal(out.reason, "sent");
    assert.ok(out.eventId, "رویداد شناسه دارد");
    assert.equal(sink.calls, 1);
    assert.equal(terminal(store).length, 1);
    assert.equal(terminal(store)[0]!.status, "sent");
    assert.ok(terminal(store)[0]!.sentAt, "زمان ارسال ثبت شد");
    // ردِ آغاز هم هست و پیش از نتیجه نوشته شده.
    assert.equal(store.deliveries[0]!.status, "pending");
  });

  test("نتیجهٔ غیرقطعی هیچ رویدادی نمی‌سازد", async () => {
    const store = new FakeStore();
    const out = await run(store, [new OkSink()], result(10, false));
    assert.equal(out.sent, false);
    assert.equal(out.reason, "not_definitive");
    assert.equal(store.events.size, 0, "رویدادِ بی‌پشتوانه ثبت نمی‌شود");
  });

  test("انحرافِ زیرِ آستانه هشدار نمی‌سازد", async () => {
    const store = new FakeStore();
    const out = await run(store, [new OkSink()], result(1));
    assert.equal(out.reason, "below_threshold");
    assert.equal(store.events.size, 0);
  });
});

describe("ضدتکرار", () => {
  test("اجرای دوباره روی همان وضعیت پیام دوم نمی‌فرستد", async () => {
    const store = new FakeStore();
    const sink = new OkSink();
    await run(store, [sink]);
    const second = await run(store, [sink]);

    assert.equal(second.sent, false);
    assert.equal(second.reason, "duplicate", "وضعیت از دیتابیس خوانده شد، نه از حافظه");
    assert.equal(sink.calls, 1, "گیرنده فقط یک‌بار صدا خورد");
  });

  test("دو اجرای هم‌زمان فقط یک پیام می‌دهند", async () => {
    const store = new FakeStore();
    const sink = new OkSink();
    // هر دو وضعیت را «خالی» می‌بینند؛ تفکیک فقط از قفلِ ادعا می‌آید.
    const [a, b] = await Promise.all([run(store, [sink]), run(store, [sink])]);
    const sent = [a, b].filter((r) => r.sent);
    assert.equal(sent.length, 1, "دقیقاً یکی فرستاد");
    assert.equal(sink.calls, 1);
    assert.equal(store.events.size, 1);
  });

  test("پاسخِ گم‌شده: تلاشِ دوباره پیامِ تازه نمی‌سازد", async () => {
    const store = new FakeStore();
    const sink = new OkSink();
    await run(store, [sink]); // ارسال شد ولی فرض کنیم پاسخ به کلاینت نرسید
    const retry = await run(store, [sink]);
    assert.equal(retry.reason, "duplicate");
    assert.equal(sink.calls, 1);
  });

  test("نوسانِ کوچکِ قیمت وضعیتِ تازه نیست", async () => {
    const store = new FakeStore();
    const sink = new OkSink();
    await run(store, [sink], result(10));
    const again = await run(store, [sink], result(11)); // همان دسته‌ها، عددِ کمی متفاوت
    assert.equal(again.reason, "duplicate");
    assert.equal(sink.calls, 1);
  });

  test("ری‌استارتِ پردازش حافظه را پاک نمی‌کند", async () => {
    const store = new FakeStore();
    await run(store, [new OkSink()]);
    // «پردازشِ تازه» = گیرنده و شیء تازه، همان ذخیره‌گاه.
    const freshSink = new OkSink();
    const afterRestart = await run(store, [freshSink]);
    assert.equal(afterRestart.reason, "duplicate");
    assert.equal(freshSink.calls, 0);
  });

  test("فاصلهٔ مجاز رعایت می‌شود و پس از آن وضعیتِ تازه دوباره هشدار می‌دهد", async () => {
    const store = new FakeStore();
    const sink = new OkSink();
    await run(store, [sink]);

    // وضعیتِ تازه (نسخهٔ دارایی عوض شده) ولی هنوز داخلِ فاصله.
    const newState = { ...result(10), identity: { holdingVersionId: "hv-2", targetVersionId: "tv-1", pricedAt: NOW.toISOString() } };
    const cooling = await dispatchRebalanceAlert(
      { userId: "u-1", result: newState },
      { store, sinks: [sink], options: { ...opts, now: new Date("2026-09-17T13:00:00Z") } }
    );
    assert.equal(cooling.reason, "cooling_down");

    const later = await dispatchRebalanceAlert(
      { userId: "u-1", result: newState },
      { store, sinks: [sink], options: { ...opts, now: new Date("2026-09-19T12:00:00Z") } }
    );
    assert.equal(later.sent, true, "پس از پایان فاصله، وضعیت تازه دوباره هشدار می‌دهد");
  });
});

describe("شکست و تلاش دوباره", () => {
  test("شکستِ ارسال موفقیت گزارش نمی‌شود", async () => {
    const store = new FakeStore();
    const out = await run(store, [new FailSink()]);
    assert.equal(out.sent, false);
    assert.equal(out.reason, "delivery_failed");
    assert.ok(terminal(store).every((d) => d.status === "failed"));
    assert.ok(terminal(store).every((d) => d.error), "هر شکست دلیل دارد");
  });

  test("هر تلاش جداگانه ثبت می‌شود", async () => {
    const store = new FakeStore();
    const sink = new FailSink();
    await run(store, [sink]);
    assert.equal(sink.calls, 2, "maxAttempts رعایت شد");
    assert.deepEqual(terminal(store).map((d) => d.attempt), [1, 2]);
  });

  test("تلاشِ دوم که موفق شود، ارسال محسوب می‌شود و سومی نمی‌رود", async () => {
    const store = new FakeStore();
    const sink = new FlakySink();
    const out = await run(store, [sink]);
    assert.equal(out.sent, true);
    assert.equal(sink.calls, 2);
    assert.deepEqual(terminal(store).map((d) => d.status), ["failed", "sent"]);
  });

  test("استثنای کانال، مسیر را نمی‌اندازد و شکست ثبت می‌شود", async () => {
    const store = new FakeStore();
    const out = await run(store, [new ThrowSink()]);
    assert.equal(out.sent, false);
    assert.ok(terminal(store).every((d) => d.status === "failed"));
  });

  test("رویدادی که ارسالش شکست خورده، بعداً دوباره تلاش می‌شود", async () => {
    const store = new FakeStore();
    await run(store, [new FailSink()]);        // شکست خورد
    const recover = await run(store, [new OkSink()]); // همان وضعیت، کانالِ سالم
    assert.equal(recover.sent, true, "شکستِ شبکه نباید هشدار را تا ابد ببلعد");
    assert.equal(recover.eventId, [...store.events.values()][0]!.id, "رویدادِ تازه ساخته نشد");
  });

  test("یک کانالِ موفق کافی است، حتی اگر دیگری بیفتد", async () => {
    const store = new FakeStore();
    const out = await run(store, [new FailSink(), new OkSink()]);
    assert.equal(out.sent, true);
    assert.ok(terminal(store).some((d) => d.status === "failed"));
    assert.ok(terminal(store).some((d) => d.status === "sent"));
  });

  test("نبودِ گیرنده، ارسال جا نمی‌زند", async () => {
    const store = new FakeStore();
    const out = await run(store, []);
    assert.equal(out.sent, false);
    assert.equal(out.reason, "no_sink");
  });
});

describe("جداییِ دو عضو", () => {
  test("هشدارِ عضو اول جلوی هشدارِ عضو دوم را نمی‌گیرد", async () => {
    const store = new FakeStore();
    const sink = new OkSink();
    const a = await run(store, [sink], result(10), "u-1");
    const b = await run(store, [sink], result(10), "u-2");

    assert.equal(a.sent, true);
    assert.equal(b.sent, true, "وضعیت هر عضو مستقل است");
    assert.notEqual(a.eventId, b.eventId);
    assert.equal(store.events.size, 2);
  });
});


/**
 * ── پنج حالتِ قطعِ کار که بازبینی خواست ─────────────────────────────────────
 *
 * برای هرکدام دو چیز اثبات می‌شود: **چه در دیتابیس می‌ماند** و **ادامهٔ کار
 * چطور انجام می‌شود**. شمردنِ پیام‌های ارسال‌شده به‌تنهایی هیچ‌کدام را نشان
 * نمی‌دهد.
 */
describe("قطعِ کار و بازیابی", () => {
  // ⚠️ کلید باید **همانی** باشد که موتور می‌سازد، وگرنه تست رویدادِ دیگری
  // می‌سازد و بی‌سروصدا چیزِ اشتباهی را اثبات می‌کند.
  const KEY = alertKey(result(10), ["gold", "equity_ir"]);

  /** کانالی که وسطِ ارسال، پردازش را «می‌کُشد». */
  class CrashSink implements AlertSinkPort {
    readonly channel = "log" as const;
    calls = 0;
    async deliver(): Promise<{ ok: boolean }> {
      this.calls++;
      throw Object.assign(new Error("PROCESS_DIED"), { fatal: true });
    }
  }

  test("۱ — مرگ پس از ثبتِ آغاز و پیش از ارسال: ردِ باز می‌ماند و هشدار گم نمی‌شود", async () => {
    const store = new FakeStore();
    // «مرگ» را با پرش از finishAttempt شبیه‌سازی می‌کنیم: فقط آغاز ثبت می‌شود.
    const claim = await store.claimEvent({
      userId: "u-1", alertKey: KEY, holdingVersionId: "hv-1", targetVersionId: "tv-1",
      breachedClasses: ["gold"], maxDeviationPoints: 10,
    });
    await store.beginAttempt({ eventId: claim.eventId!, channel: "log", attempt: 1 });

    // آنچه در دیتابیس مانده: دقیقاً یک تلاشِ باز، بدونِ نتیجه.
    assert.equal(store.openAttempts().length, 1);
    assert.equal(store.deliveries.filter((d) => d.status === "sent").length, 0);

    // بلافاصله: دستِ رقیب فرض می‌شود و دست نمی‌خورد.
    const soon = await run(store, [new OkSink()]);
    assert.equal(soon.reason, "in_flight");

    // پس از پایانِ اجاره: تلاشِ رها **نامعلوم** ثبت و کار از سر گرفته می‌شود.
    const later = await dispatchRebalanceAlert(
      { userId: "u-1", result: result(10) },
      { store, sinks: [new OkSink()], options: { ...opts, now: new Date("2026-09-17T12:30:00Z") } }
    );
    assert.equal(later.sent, true, "هشدار برای همیشه مسدود نشد");
    assert.ok(store.deliveries.some((d) => d.status === "unknown"), "تلاشِ رها نامعلوم ثبت شد");
    assert.equal(store.openAttempts().length, 0, "هیچ تلاشِ بازی باقی نماند");
  });

  test("۲ — گیرنده پیام را گرفت ولی پاسخ گم شد: نه موفقیت جعل می‌شود نه شکست", async () => {
    const store = new FakeStore();
    const claim = await store.claimEvent({
      userId: "u-2", alertKey: KEY, holdingVersionId: "hv-1", targetVersionId: "tv-1",
      breachedClasses: ["gold"], maxDeviationPoints: 10,
    });
    // پیام رسید، ولی پردازش پیش از ثبتِ نتیجه مُرد — از بیرون همان حالتِ ۱ است.
    await store.beginAttempt({ eventId: claim.eventId!, channel: "log", attempt: 1 });

    const after = await dispatchRebalanceAlert(
      { userId: "u-2", result: result(10) },
      { store, sinks: [new OkSink()], options: { ...opts, now: new Date("2026-09-17T12:30:00Z") } }
    );

    const abandoned = store.deliveries.find((d) => d.status === "unknown");
    assert.ok(abandoned, "تلاشِ رها ثبت شد");
    assert.equal(abandoned!.sentAt, null, "موفقیت جعل نشد");
    assert.match(abandoned!.error!, /معلوم نیست/, "دلیلِ نامعلومی ثبت شد");
    // ⚠️ نتیجهٔ صادق: پیام دوباره می‌رود. چون کانال ضدتکرار ندارد، احتمالِ
    // پیامِ تکراری واقعی است و ادعای تضمین نمی‌شود.
    assert.equal(after.sent, true);
  });

  test("۳ — شکستِ قطعی سپس تلاشِ مجدد", async () => {
    const store = new FakeStore();
    const failed = await run(store, [new FailSink()]);
    assert.equal(failed.sent, false);
    assert.equal(store.openAttempts().length, 0, "شکست، تلاشِ باز جا نمی‌گذارد");

    const retry = await run(store, [new OkSink()]);
    assert.equal(retry.sent, true);
    assert.equal(retry.eventId, failed.eventId, "رویدادِ تازه ساخته نشد");
  });

  test("۴ — دو پردازش هم‌زمان یک هشدار را برمی‌دارند", async () => {
    const store = new FakeStore();
    const s1 = new OkSink();
    const s2 = new OkSink();
    const [a, b] = await Promise.all([run(store, [s1]), run(store, [s2])]);
    assert.equal([a, b].filter((r) => r.sent).length, 1, "فقط یکی فرستاد");
    assert.equal(s1.calls + s2.calls, 1);
    assert.equal(store.events.size, 1);
  });

  test("۵ — ری‌استارت با کارِ نیمه‌تمام: وضعیت از دیتابیس بازخوانده می‌شود", async () => {
    const store = new FakeStore();
    const claim = await store.claimEvent({
      userId: "u-5", alertKey: KEY, holdingVersionId: "hv-1", targetVersionId: "tv-1",
      breachedClasses: ["gold"], maxDeviationPoints: 10,
    });
    await store.beginAttempt({ eventId: claim.eventId!, channel: "log", attempt: 1 });
    await store.finishAttempt({
      eventId: claim.eventId!, channel: "log", attempt: 1,
      status: "failed", error: "شبکه", sentAt: null,
    });

    // «پردازشِ تازه» — هیچ حافظه‌ای از قبل ندارد.
    const fresh = new OkSink();
    const out = await dispatchRebalanceAlert(
      { userId: "u-5", result: result(10) },
      { store, sinks: [fresh], options: opts }
    );
    assert.equal(out.sent, true, "کارِ نیمه‌تمام ادامه یافت");
    assert.equal(out.attempts[0]!.attempt, 2, "شمارهٔ تلاش از دیتابیس ادامه پیدا کرد");
  });

  test("سقفِ کلی: رویدادی که همیشه می‌افتد بی‌نهایت تلاش نمی‌شود", async () => {
    const store = new FakeStore();
    const sink = new FailSink();
    const tight = { ...opts, maxAttempts: 2, maxTotalAttempts: 4 };
    await dispatchRebalanceAlert({ userId: "u-6", result: result(10) }, { store, sinks: [sink], options: tight });
    await dispatchRebalanceAlert({ userId: "u-6", result: result(10) }, { store, sinks: [sink], options: tight });
    const third = await dispatchRebalanceAlert({ userId: "u-6", result: result(10) }, { store, sinks: [sink], options: tight });

    assert.equal(third.reason, "exhausted");
    assert.equal(sink.calls, 4, "بیش از سقف تلاش نشد");
    // وضعیتِ پایانی در دیتابیس دیده می‌شود، نه اینکه بی‌صدا رها شود.
    assert.equal(terminal(store).filter((d) => d.status === "failed").length, 4);
  });

  test("ترتیب همیشه «اول ثبت، بعد ارسال» است", async () => {
    const store = new FakeStore();
    const sink = new CrashSink();
    await run(store, [sink]);
    // کانال منفجر شد، ولی ردِ آغاز از قبل نوشته شده بود.
    assert.equal(sink.calls, 2);
    assert.equal(store.deliveries.filter((d) => d.status === "pending").length, 2);
    assert.equal(store.deliveries.filter((d) => d.status === "failed").length, 2);
  });
});
