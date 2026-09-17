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

/** ذخیره‌گاهِ درون‌حافظه‌ای که قفلِ یکتاییِ دیتابیس را تقلید می‌کند. */
class FakeStore implements AlertStorePort {
  events = new Map<string, { id: string; userId: string }>();
  deliveries: { eventId: string; channel: string; status: string; attempt: number; error: string | null; sentAt: string | null }[] = [];
  private seq = 0;

  private keyOf(userId: string, alertKey: string) {
    return `${userId}::${alertKey}`;
  }

  async loadState(userId: string) {
    const sentIds = new Set(this.deliveries.filter((d) => d.status === "sent").map((d) => d.eventId));
    const mine = [...this.events.entries()]
      .filter(([k, e]) => e.userId === userId && sentIds.has(e.id))
      .map(([k, e]) => ({ alertKey: k.split("::")[1]!, id: e.id }));
    const last = mine[mine.length - 1];
    if (!last) return { lastKey: null, lastSentAt: null };
    const sentAt = this.deliveries.find((d) => d.eventId === last.id && d.status === "sent")?.sentAt ?? null;
    return { lastKey: last.alertKey, lastSentAt: sentAt };
  }

  async claimEvent(input: ClaimInput): Promise<ClaimResult> {
    const k = this.keyOf(input.userId, input.alertKey);
    const existing = this.events.get(k);
    if (existing) {
      const mine = this.deliveries.filter((d) => d.eventId === existing.id);
      return {
        claimed: false,
        eventId: existing.id,
        alreadyDelivered: mine.some((d) => d.status === "sent"),
        attemptsRecorded: mine.length,
      };
    }
    const id = `ev-${++this.seq}`;
    this.events.set(k, { id, userId: input.userId });
    return { claimed: true, eventId: id, alreadyDelivered: false, attemptsRecorded: 0 };
  }

  async recordDelivery(d: Parameters<AlertStorePort["recordDelivery"]>[0]) {
    // قیدهای دیتابیس اینجا هم اعمال می‌شوند تا بدل از واقعیت سست‌تر نباشد.
    if (d.status === "sent" && !d.sentAt) throw new Error("sent بدون زمان");
    if (d.status === "failed" && !d.error) throw new Error("failed بدون دلیل");
    this.deliveries.push(d);
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

const opts = { thresholdPoints: 5, cooldownHours: 24, maxAttempts: 2, now: NOW };
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
    assert.equal(store.deliveries.length, 1);
    assert.equal(store.deliveries[0]!.status, "sent");
    assert.ok(store.deliveries[0]!.sentAt, "زمان ارسال ثبت شد");
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
    assert.ok(store.deliveries.every((d) => d.status === "failed"));
    assert.ok(store.deliveries.every((d) => d.error), "هر شکست دلیل دارد");
  });

  test("هر تلاش جداگانه ثبت می‌شود", async () => {
    const store = new FakeStore();
    const sink = new FailSink();
    await run(store, [sink]);
    assert.equal(sink.calls, 2, "maxAttempts رعایت شد");
    assert.deepEqual(store.deliveries.map((d) => d.attempt), [1, 2]);
  });

  test("تلاشِ دوم که موفق شود، ارسال محسوب می‌شود و سومی نمی‌رود", async () => {
    const store = new FakeStore();
    const sink = new FlakySink();
    const out = await run(store, [sink]);
    assert.equal(out.sent, true);
    assert.equal(sink.calls, 2);
    assert.deepEqual(store.deliveries.map((d) => d.status), ["failed", "sent"]);
  });

  test("استثنای کانال، مسیر را نمی‌اندازد و شکست ثبت می‌شود", async () => {
    const store = new FakeStore();
    const out = await run(store, [new ThrowSink()]);
    assert.equal(out.sent, false);
    assert.ok(store.deliveries.every((d) => d.status === "failed"));
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
    assert.ok(store.deliveries.some((d) => d.status === "failed"));
    assert.ok(store.deliveries.some((d) => d.status === "sent"));
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

describe("گاردِ هم‌زمانی پوچ نیست", () => {
  test("رقیبِ در حالِ اجرا مانع ارسالِ دوم می‌شود، نه یک شکستِ ثبت‌شده", async () => {
    // این تست تفاوتِ دو حالت را تثبیت می‌کند. اگر کسی بعداً `attemptsRecorded`
    // را بردارد، یکی از این دو ادعا می‌شکند.
    const store = new FakeStore();
    await store.claimEvent({
      userId: "u-9", alertKey: "k", holdingVersionId: "hv", targetVersionId: "tv",
      breachedClasses: ["gold"], maxDeviationPoints: 10,
    });

    // هیچ تلاشی ثبت نشده ⇒ رقیب در راه است.
    const claim = await store.claimEvent({
      userId: "u-9", alertKey: "k", holdingVersionId: "hv", targetVersionId: "tv",
      breachedClasses: ["gold"], maxDeviationPoints: 10,
    });
    assert.equal(claim.claimed, false);
    assert.equal(claim.attemptsRecorded, 0);

    // پس از ثبتِ یک شکست، همان ادعا دیگر «در راه» نیست.
    await store.recordDelivery({
      eventId: claim.eventId!, channel: "log", status: "failed",
      attempt: 1, error: "شکست", sentAt: null,
    });
    const after = await store.claimEvent({
      userId: "u-9", alertKey: "k", holdingVersionId: "hv", targetVersionId: "tv",
      breachedClasses: ["gold"], maxDeviationPoints: 10,
    });
    assert.equal(after.attemptsRecorded, 1);
    assert.equal(after.alreadyDelivered, false);
  });
});
