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
  rpcCalls: Array<{ expectedAmount: number; replace: boolean; authority: string }>;
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
    async loadStaleMinutes() {
      return 60;
    },
    async requestGatewayPayment() {
      spy.gatewayCalls += 1;
      return { ok: true, authority: "NEW-AUTH", startPayUrl: "https://gw/StartPay/NEW-AUTH" };
    },
    async createWebinarPayment(input) {
      spy.rpcCalls.push({
        expectedAmount: input.expectedAmount,
        replace: input.replace,
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

const run = (p: StartPorts, replace = false) =>
  startWebinarPayment({
    userId: USER,
    registrationId: REG,
    replaceRequested: replace,
    callbackPath: "/api/webinars/payment/callback",
    ports: p,
  });

describe("مسیرِ عادی", () => {
  test("بدونِ پرداختِ قبلی لینکِ تازه ساخته می‌شود", async () => {
    const { ports: p, spy } = ports();
    const out = await run(p);
    assert.equal(out.status, "created");
    assert.equal(spy.gatewayCalls, 1);
    assert.equal(spy.rpcCalls[0].replace, false);
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

describe("تلاشِ دوباره — لینکِ اول یتیم نمی‌شود", () => {
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
    assert.equal(spy.gatewayCalls, 0, "⚠️ اگر اینجا تراکنشی ساخته شود، همان باگِ اصلی است");
    assert.equal(spy.rpcCalls.length, 0);
  });

  test("درخواستِ جایگزینی پیش از پنجره رد می‌شود، بدونِ تماس با درگاه", async () => {
    const { ports: p, spy } = ports({}, registration({ payment_id: "pay-old" }), pendingPay);
    const out = await run(p, true);
    assert.equal(out.status === "rejected" && out.httpStatus, 409);
    assert.equal(out.status === "rejected" && out.reason, "not_stale_yet");
    assert.equal(spy.gatewayCalls, 0);
  });

  test("جایگزینیِ پرداختِ کهنه با پرچمِ صریح به RPC می‌رسد", async () => {
    const stale: ExistingPayment = { ...pendingPay, created_at: "2026-08-20T10:00:00Z" };
    const { ports: p, spy } = ports({}, registration({ payment_id: "pay-old" }), stale);
    const out = await run(p, true);
    assert.equal(out.status, "created");
    assert.equal(spy.rpcCalls[0].replace, true);
  });

  test("اگر وضعیتِ پرداختِ قبلی خوانده نشد، لینکِ تازه ساخته نمی‌شود", async () => {
    const { ports: p, spy } = ports(
      {
        async loadPayment() {
          return { payment: null, error: new Error("boom") };
        },
      },
      registration({ payment_id: "pay-old" })
    );
    const out = await run(p);
    assert.equal(out.status === "rejected" && out.httpStatus, 503);
    assert.equal(spy.gatewayCalls, 0, "در ابهام نباید لینکِ دوم ساخت");
  });

  test("نبودِ تنظیمِ پنجره باعثِ جایگزینیِ زودهنگام نمی‌شود", async () => {
    const { ports: p } = ports(
      { async loadStaleMinutes() { return null; } },
      registration({ payment_id: "pay-old" }),
      pendingPay
    );
    const out = await run(p, true);
    assert.equal(out.status, "rejected", "پیش‌فرضِ نبودِ تنظیم باید محافظه‌کارانه باشد");
  });

  test("ثبت‌نامِ پرداخت‌شده هیچ لینکی نمی‌گیرد", async () => {
    const { ports: p, spy } = ports({}, registration({ payment_status: "paid" }));
    const out = await run(p, true);
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
