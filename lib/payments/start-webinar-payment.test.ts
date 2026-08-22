import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  startWebinarPayment,
  type RegistrationRow,
  type StartPorts,
} from "./start-webinar-payment";
import type { ExistingPayment } from "./webinar-retry";

/**
 * شاخه‌های شکستِ «شروعِ پرداختِ وبینار».
 *
 * سه ادعای Command Center اینجا اثبات می‌شود:
 *   • درخواستِ دوم لینکِ اول را یتیم نمی‌کند؛
 *   • مبلغِ کلاینت هرگز به تابعِ دیتابیس نمی‌رسد؛
 *   • شکستِ ثبتِ ممیزی نه URL برمی‌گرداند و نه ادعای شواهد می‌کند.
 */

const USER = "user-1";
const REG = "reg-1";
const PRICE = 5_000_000;
const NOW = new Date("2026-08-20T12:00:00Z");

function registration(over: Partial<RegistrationRow> = {}): RegistrationRow {
  return {
    id: REG,
    webinar_id: "web-1",
    payment_status: "pending",
    payment_id: null,
    webinarTitle: "وبینارِ نمونه",
    priceToman: PRICE,
    ...over,
  };
}

interface Spy {
  gatewayCalls: number;
  rpcCalls: Array<{ expectedAmount: number; authority: string }>;
  auditCalls: number;
}

function ports(
  over: Partial<StartPorts> = {},
  reg: RegistrationRow = registration(),
  payment: ExistingPayment | null = null
): { ports: StartPorts; spy: Spy } {
  const spy: Spy = { gatewayCalls: 0, rpcCalls: [], auditCalls: 0 };
  const base: StartPorts = {
    async loadRegistration() {
      return { registration: reg, error: null };
    },
    async loadPayment() {
      return { payment, error: null };
    },
    async loadResumeHintMinutes() {
      return 15;
    },
    async requestGatewayPayment() {
      spy.gatewayCalls += 1;
      return { ok: true, authority: "NEW-AUTH", startPayUrl: "https://gw/StartPay/NEW-AUTH" };
    },
    async createWebinarPayment(input) {
      spy.rpcCalls.push({
        expectedAmount: input.expectedAmount,
        authority: input.authority,
      });
      return { paymentId: "pay-new", error: null };
    },
    async recordLinkFailure() {
      spy.auditCalls += 1;
      return { persisted: true, error: null };
    },
    resumeUrl: (a) => `https://gw/StartPay/${a}`,
    now: () => NOW,
  };
  return { ports: { ...base, ...over }, spy };
}

const run = (p: StartPorts) =>
  startWebinarPayment({
    userId: USER,
    registrationId: REG,
    callbackPath: "/api/webinars/payment/callback",
    ports: p,
  });

describe("مسیرِ عادی", () => {
  test("بدونِ پرداختِ قبلی لینکِ تازه ساخته می‌شود", async () => {
    const { ports: p, spy } = ports();
    const out = await run(p);
    assert.equal(out.status, "created");
    assert.equal(spy.gatewayCalls, 1);
    assert.equal(spy.rpcCalls.length, 1);
  });

  test("مبلغِ ارسالی به RPC از ردیفِ وبینار می‌آید، نه از کلاینت", async () => {
    const { ports: p, spy } = ports();
    await run(p);
    assert.equal(spy.rpcCalls[0].expectedAmount, PRICE);
  });

  test("وبینارِ رایگان پرداخت نمی‌گیرد", async () => {
    const { ports: p, spy } = ports({}, registration({ priceToman: 0 }));
    const out = await run(p);
    assert.equal(out.status, "rejected");
    assert.equal(spy.gatewayCalls, 0, "برای وبینارِ رایگان نباید تراکنش ساخته شود");
  });

  test("ثبت‌نامِ ناموجود ۴۰۴ می‌دهد و به درگاه نمی‌رود", async () => {
    const { ports: p, spy } = ports({
      async loadRegistration() {
        return { registration: null, error: null };
      },
    });
    const out = await run(p);
    assert.equal(out.status === "rejected" && out.httpStatus, 404);
    assert.equal(spy.gatewayCalls, 0);
  });
});

describe("تلاشِ دوباره — هیچ پرداختِ موفقی یتیم نمی‌شود", () => {
  const pendingPay: ExistingPayment = {
    id: "pay-old",
    status: "pending",
    authority: "OLD-AUTH",
    created_at: "2026-08-20T11:55:00Z",
  };

  test("پرداختِ در جریان از سر گرفته می‌شود و authorityِ تازه ساخته نمی‌شود", async () => {
    const { ports: p, spy } = ports({}, registration({ payment_id: "pay-old" }), pendingPay);
    const out = await run(p);
    assert.equal(out.status, "resumed");
    assert.equal(out.status === "resumed" && out.paymentUrl, "https://gw/StartPay/OLD-AUTH");
    assert.equal(spy.gatewayCalls, 0, "⚠️ ساختِ تراکنشِ دوم همان باگِ اصلی است");
    assert.equal(spy.rpcCalls.length, 0);
  });

  test("پرداختِ خیلی قدیمی هم جایگزین نمی‌شود", async () => {
    // پیش از این، گذشتِ زمان اجازهٔ جایگزینی می‌داد. آن فرض سند نداشت.
    const ancient: ExistingPayment = { ...pendingPay, created_at: "2025-01-01T00:00:00Z" };
    const { ports: p, spy } = ports({}, registration({ payment_id: "pay-old" }), ancient);
    const out = await run(p);
    assert.equal(out.status, "resumed");
    assert.equal(spy.gatewayCalls, 0);
  });

  test("پس از پنجرهٔ راهنما، فقط پرچمِ کمک روشن می‌شود — نه جایگزینی", async () => {
    const old: ExistingPayment = { ...pendingPay, created_at: "2026-08-20T11:00:00Z" };
    const { ports: p, spy } = ports({}, registration({ payment_id: "pay-old" }), old);
    const out = await run(p);
    assert.equal(out.status, "resumed");
    assert.equal(out.status === "resumed" && out.offerHelp, true);
    assert.equal(spy.gatewayCalls, 0, "پرچمِ راهنما نباید تراکنشِ تازه بسازد");
  });

  test("پس از بازیابیِ حاکمیتیِ ادمین (failed)، تلاشِ تازه مجاز است", async () => {
    const cancelled: ExistingPayment = { ...pendingPay, status: "failed" };
    const { ports: p, spy } = ports({}, registration({ payment_id: "pay-old" }), cancelled);
    const out = await run(p);
    assert.equal(out.status, "created");
    assert.equal(spy.gatewayCalls, 1);
  });

  test("اگر وضعیتِ پرداختِ قبلی خوانده نشد، لینکِ تازه ساخته نمی‌شود", async () => {
    const { ports: p, spy } = ports(
      { async loadPayment() { return { payment: null, error: new Error("boom") }; } },
      registration({ payment_id: "pay-old" })
    );
    const out = await run(p);
    assert.equal(out.status === "rejected" && out.httpStatus, 503);
    assert.equal(spy.gatewayCalls, 0, "در ابهام نباید لینکِ دوم ساخت");
  });

  test("نبودِ تنظیمِ راهنما هیچ تصمیمی را عوض نمی‌کند", async () => {
    const { ports: p, spy } = ports(
      { async loadResumeHintMinutes() { return null; } },
      registration({ payment_id: "pay-old" }),
      pendingPay
    );
    const out = await run(p);
    assert.equal(out.status, "resumed");
    assert.equal(spy.gatewayCalls, 0);
  });

  test("ثبت‌نامِ پرداخت‌شده هیچ لینکی نمی‌گیرد", async () => {
    const { ports: p, spy } = ports({}, registration({ payment_status: "paid" }));
    const out = await run(p);
    assert.equal(out.status === "rejected" && out.httpStatus, 400);
    assert.equal(spy.gatewayCalls, 0);
  });
});

describe("شکستِ اتصال و ممیزی", () => {
  const failingRpc = {
    async createWebinarPayment() {
      return { paymentId: null, error: new Error("لینک ثبت نشد") };
    },
  };

  test("شکستِ اتصال هیچ URLی برنمی‌گرداند", async () => {
    const { ports: p } = ports(failingRpc);
    const out = await run(p);
    assert.equal(out.status, "link_failed");
    assert.ok(!("paymentUrl" in out), "هیچ لینکی نباید در پاسخ باشد");
  });

  test("شکستِ اتصال ردِ ماندگار ثبت می‌کند", async () => {
    const { ports: p, spy } = ports(failingRpc);
    const out = await run(p);
    assert.equal(spy.auditCalls, 1);
    assert.equal(out.status === "link_failed" && out.evidenceRecorded, true);
  });

  test("اگر ثبتِ ممیزی هم شکست بخورد، ادعای شواهد نمی‌کنیم", async () => {
    const { ports: p } = ports({
      ...failingRpc,
      async recordLinkFailure() {
        return { persisted: false, error: new Error("audit down") };
      },
    });
    const out = await run(p);
    assert.equal(out.status, "link_failed");
    assert.equal(
      out.status === "link_failed" && out.evidenceRecorded,
      false,
      "⚠️ ادعای «ثبت شد» وقتی چیزی ثبت نشده، همان چیزی است که بازبینی رد کرد"
    );
  });

  test("شکستِ ممیزی هم URL برنمی‌گرداند", async () => {
    const { ports: p } = ports({
      ...failingRpc,
      async recordLinkFailure() {
        return { persisted: false, error: new Error("audit down") };
      },
    });
    const out = await run(p);
    assert.equal(out.status, "link_failed");
  });

  test("پاسخِ تهیِ RPC هم شکست است، نه موفقیت", async () => {
    const { ports: p } = ports({
      async createWebinarPayment() {
        return { paymentId: null, error: null };
      },
    });
    const out = await run(p);
    assert.equal(out.status, "link_failed");
  });

  test("شکستِ درگاه به ثبتِ ممیزیِ اتصال نمی‌رسد", async () => {
    const { ports: p, spy } = ports({
      async requestGatewayPayment() {
        return { ok: false, message: "درگاه در دسترس نیست." };
      },
    });
    const out = await run(p);
    assert.equal(out.status, "gateway_failed");
    assert.equal(spy.auditCalls, 0);
  });
});
