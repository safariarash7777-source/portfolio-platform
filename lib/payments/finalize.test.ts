import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  finalizePaidAccess,
  type FinalizePorts,
  type FinalizeRpcInput,
  type FinalizeRpcResult,
  type PaymentRow,
  type RegistrationRow,
} from "./finalize";
import { entitlementSource } from "@/lib/entitlements";

/**
 * مسیرِ واحدِ نهایی‌سازیِ پرداخت — هر شاخهٔ شکست.
 *
 * ── چرا این تست‌ها با پورتِ جعلی نوشته شده‌اند ──────────────────────────────
 * مسیرِ واقعی به زرین‌پال و Postgres وصل است. آزمودنِ «پاسخِ جعلیِ درگاه» ارزشی
 * ندارد و توهمِ پوشش می‌سازد؛ چیزی که واقعاً باید اثبات شود این است که **منطقِ
 * تصمیمِ ما** در هر شکستِ ممکن حالتِ درست را برمی‌گرداند. پس پورت‌ها جعل
 * می‌شوند و خودِ تصمیم سنجیده می‌شود.
 *
 * چیزی که این‌ها اثبات **نمی‌کنند**: اتمیک‌بودنِ تراکنش و قیدِ یکتای دیتابیس.
 * آن‌ها در SQL هستند و فقط با اجرای واقعیِ migration اثبات می‌شوند —
 * `lib/payments/sql-contract.test.ts` وجودشان را در فایل می‌سنجد و بخشِ
 * «آزمونِ دود» در `docs/RUNBOOK-payment-activation.md` رفتارشان را.
 */

const AUTHORITY = "A00000000000000000000000000000000001";
const USER = "11111111-1111-1111-1111-111111111111";
const OTHER_USER = "22222222-2222-2222-2222-222222222222";
const PAYMENT_ID = "33333333-3333-3333-3333-333333333333";
const REG_ID = "44444444-4444-4444-4444-444444444444";
const WEBINAR_ID = "55555555-5555-5555-5555-555555555555";

interface FakeOptions {
  payment?: PaymentRow | null;
  paymentError?: unknown;
  registration?: RegistrationRow | null;
  registrationError?: unknown;
  gatewayOk?: boolean;
  gatewayRefId?: string | null;
  /** خطای شبیه‌سازی‌شدهٔ RPC — نمایندهٔ شکستِ اعطای دسترسی یا هر گاردِ دیگر. */
  rpcError?: unknown;
  /** رفتارِ سفارشیِ RPC، برای سناریوی هم‌زمانی. */
  rpc?: (input: FinalizeRpcInput) => Promise<{ result: FinalizeRpcResult | null; error: unknown }>;
  inviteLink?: string | null;
}

interface FakeState {
  ports: FinalizePorts;
  rpcCalls: FinalizeRpcInput[];
  gatewayCalls: Array<{ authority: string; amount: number }>;
  failPaymentCalls: string[];
  failures: Array<{ stage: string; message: string; userId: string | null }>;
  inviteLinkCalls: number;
}

function makePorts(opts: FakeOptions = {}): FakeState {
  const state: FakeState = {
    rpcCalls: [],
    gatewayCalls: [],
    failPaymentCalls: [],
    failures: [],
    inviteLinkCalls: 0,
    ports: null as unknown as FinalizePorts,
  };

  const payment =
    opts.payment === undefined
      ? ({
          id: PAYMENT_ID,
          user_id: USER,
          amount: 5_000_000,
          status: "pending",
          ref_id: null,
        } as PaymentRow)
      : opts.payment;

  state.ports = {
    async loadPaymentByAuthority() {
      return { payment: opts.paymentError ? null : payment, error: opts.paymentError ?? null };
    },
    async loadRegistrationByPaymentId() {
      return {
        registration: opts.registrationError ? null : (opts.registration ?? null),
        error: opts.registrationError ?? null,
      };
    },
    async verifyWithGateway(authority, amount) {
      state.gatewayCalls.push({ authority, amount });
      return {
        ok: opts.gatewayOk ?? true,
        refId: opts.gatewayRefId === undefined ? "REF-123" : opts.gatewayRefId,
      };
    },
    async failPayment(authority) {
      state.failPaymentCalls.push(authority);
      return { error: null };
    },
    async finalizePaidAccess(input) {
      state.rpcCalls.push(input);
      if (opts.rpc) return opts.rpc(input);
      if (opts.rpcError) return { result: null, error: opts.rpcError };
      return {
        result: {
          user_id: payment?.user_id ?? USER,
          payment_id: PAYMENT_ID,
          entitlement_id: "ent-1",
          expires_at: input.expiresAt,
          already_finalized: payment?.status === "paid",
          registration_id: input.registrationId,
        },
        error: null,
      };
    },
    async recordFailure(entry) {
      state.failures.push({
        stage: entry.stage,
        message: entry.message,
        userId: entry.userId,
      });
    },
    createInviteLink: async () => {
      state.inviteLinkCalls += 1;
      return opts.inviteLink ?? "https://t.me/+invite";
    },
    now: () => new Date("2026-08-16T00:00:00.000Z"),
  };

  return state;
}

const REG: RegistrationRow = { id: REG_ID, webinar_id: WEBINAR_ID, user_id: USER };

// ══════════════════════════════════════════════════════════════════════════
// ۱. authority نامعتبر
// ══════════════════════════════════════════════════════════════════════════

describe("authority نامعتبر", () => {
  test("authorityِ تهی → شکست، بدونِ هیچ تماسِ بیرونی", async () => {
    const s = makePorts();
    const out = await finalizePaidAccess({
      authority: "",
      gatewayStatus: "OK",
      product: "consulting",
      ports: s.ports,
    });
    assert.equal(out.status, "failed");
    assert.equal(out.status === "failed" && out.reason, "missing_authority");
    assert.equal(s.gatewayCalls.length, 0, "درگاه نباید صدا زده شود");
    assert.equal(s.rpcCalls.length, 0, "RPC نباید صدا زده شود");
  });

  test("authorityِ ناشناخته → پرداختی پیدا نمی‌شود، هیچ چیزی نهایی نمی‌شود", async () => {
    const s = makePorts({ payment: null });
    const out = await finalizePaidAccess({
      authority: "AUTHORITY-JAALI",
      gatewayStatus: "OK",
      product: "consulting",
      ports: s.ports,
    });
    assert.equal(out.status, "failed");
    assert.equal(out.status === "failed" && out.reason, "payment_not_found");
    assert.equal(s.rpcCalls.length, 0);
    assert.equal(s.failPaymentCalls.length, 0, "پرداختِ ناموجود نباید failed شود");
  });

  test("خطای خواندنِ پرداخت به‌جای موفقیتِ کاذب، شکست می‌دهد و ثبت می‌شود", async () => {
    // اگر خطای دیتابیس مثلِ «پرداخت پیدا نشد» رفتار می‌کرد، یک قطعیِ گذرای
    // Supabase تبدیل می‌شد به «پرداخت شما ناموفق بود» بدونِ هیچ ردی.
    const s = makePorts({ paymentError: { message: "connection reset" } });
    const out = await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "consulting",
      ports: s.ports,
    });
    assert.equal(out.status, "failed");
    assert.equal(out.status === "failed" && out.reason, "payment_lookup_failed");
    assert.equal(s.failures.length, 1);
    assert.equal(s.failures[0].stage, "payment_lookup");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ۲. عدمِ تطابقِ پرداخت/ثبت‌نام و کاربر
// ══════════════════════════════════════════════════════════════════════════

describe("بایندِ پرداخت ↔ ثبت‌نام ↔ کاربر", () => {
  test("ثبت‌نام فقط از راهِ payment_id پیدا می‌شود، نه از query", async () => {
    const s = makePorts({ registration: REG });
    await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "webinar",
      ports: s.ports,
    });
    // شناسه‌ای که به RPC می‌رود همان ثبت‌نامِ متصل به رکوردِ پرداخت است.
    assert.equal(s.rpcCalls[0].registrationId, REG_ID);
  });

  test("پرداختِ وبینار بدونِ ثبت‌نامِ متصل → registrationId تهی می‌ماند", async () => {
    // RPC خودش این حالت را می‌پذیرد (فقط دسترسی می‌دهد)؛ چیزی که نباید رخ دهد
    // این است که شناسه‌ای از جای دیگر حدس زده شود.
    const s = makePorts({ registration: null });
    const out = await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "webinar",
      ports: s.ports,
    });
    assert.equal(s.rpcCalls[0].registrationId, null);
    assert.equal(out.status, "success");
    assert.equal(out.status === "success" && out.webinarId, null);
  });

  test("خطای خواندنِ ثبت‌نام مسیر را متوقف می‌کند و پرداخت را نهایی نمی‌کند", async () => {
    const s = makePorts({ registrationError: { message: "relation does not exist" } });
    const out = await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "webinar",
      ports: s.ports,
    });
    assert.equal(out.status, "failed");
    assert.equal(out.status === "failed" && out.reason, "registration_lookup_failed");
    assert.equal(s.rpcCalls.length, 0, "با ثبت‌نامِ نامعلوم نباید نهایی شود");
    assert.equal(s.failures[0].stage, "registration_lookup");
  });

  test("کاربرِ ناهمخوان: RPC رد می‌کند و نتیجه «موفق» نیست", async () => {
    // بایندِ واقعی در SQL است (`ثبت‌نام به کاربرِ دیگری تعلق دارد`). اینجا
    // اثبات می‌شود که ردِ RPC هرگز به صفحهٔ موفقیتِ کامل نمی‌رسد.
    const s = makePorts({
      registration: { id: REG_ID, webinar_id: WEBINAR_ID, user_id: OTHER_USER },
      rpcError: { message: "ثبت‌نام به کاربرِ دیگری تعلق دارد." },
    });
    const out = await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "webinar",
      ports: s.ports,
    });
    assert.equal(out.status, "access_pending");
    assert.equal(s.failures[0].stage, "finalize_rpc");
    assert.match(s.failures[0].message, /کاربرِ دیگری/);
  });

  test("پرداختِ متصل به ثبت‌نامِ دیگر: ردِ RPC موفقیت تولید نمی‌کند", async () => {
    const s = makePorts({
      registration: REG,
      rpcError: { message: "ثبت‌نام به این پرداخت متصل نیست." },
    });
    const out = await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "webinar",
      ports: s.ports,
    });
    assert.notEqual(out.status, "success");
    assert.equal(out.status, "access_pending");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ۳. مبلغ
// ══════════════════════════════════════════════════════════════════════════

describe("مبلغ", () => {
  test("مبلغ از رکوردِ خودمان می‌رود، نه از query یا قیمتِ فعلیِ محصول", async () => {
    const s = makePorts({
      payment: {
        id: PAYMENT_ID,
        user_id: USER,
        amount: 7_500_000,
        status: "pending",
        ref_id: null,
      },
    });
    await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "webinar",
      ports: s.ports,
    });
    assert.equal(s.gatewayCalls[0].amount, 7_500_000, "verify با مبلغِ رکوردِ ما");
    assert.equal(s.rpcCalls[0].amount, 7_500_000, "RPC با همان مبلغ");
  });

  test("عدمِ تطبیقِ مبلغ در RPC → موفقیتِ کامل اعلام نمی‌شود", async () => {
    const s = makePorts({ rpcError: { message: "عدم تطبیق مبلغ پرداخت." } });
    const out = await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "consulting",
      ports: s.ports,
    });
    assert.equal(out.status, "access_pending");
    assert.match(s.failures[0].message, /عدم تطبیق مبلغ/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ۴. لغو و شکستِ verify
// ══════════════════════════════════════════════════════════════════════════

describe("لغو و شکستِ تأیید", () => {
  test("لغوِ کاربر (Status ≠ OK) → fail_payment، بدونِ تماس با verify", async () => {
    const s = makePorts();
    const out = await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "NOK",
      product: "consulting",
      ports: s.ports,
    });
    assert.equal(out.status, "failed");
    assert.equal(out.status === "failed" && out.reason, "cancelled");
    assert.deepEqual(s.failPaymentCalls, [AUTHORITY]);
    assert.equal(s.gatewayCalls.length, 0, "پرداختِ لغوشده نباید verify شود");
    assert.equal(s.rpcCalls.length, 0, "و قطعاً نباید دسترسی بگیرد");
  });

  test("شکستِ verifyِ درگاه → fail_payment و هیچ دسترسی‌ای", async () => {
    const s = makePorts({ gatewayOk: false });
    const out = await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "consulting",
      ports: s.ports,
    });
    assert.equal(out.status, "failed");
    assert.equal(out.status === "failed" && out.reason, "gateway_verify_failed");
    assert.deepEqual(s.failPaymentCalls, [AUTHORITY]);
    assert.equal(s.rpcCalls.length, 0);
  });

  test("پرداختی که قبلاً failed شده دوباره نهایی نمی‌شود", async () => {
    // گذارِ مجاز فقط pending → paid|failed است؛ failed → paid وجود ندارد.
    const s = makePorts({
      payment: {
        id: PAYMENT_ID,
        user_id: USER,
        amount: 5_000_000,
        status: "failed",
        ref_id: null,
      },
    });
    const out = await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "consulting",
      ports: s.ports,
    });
    assert.equal(out.status, "failed");
    assert.equal(out.status === "failed" && out.reason, "already_failed");
    assert.equal(s.gatewayCalls.length, 0);
    assert.equal(s.rpcCalls.length, 0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ۵. replay و callbackِ تکراری
// ══════════════════════════════════════════════════════════════════════════

describe("replay و تکرار", () => {
  const paidPayment: PaymentRow = {
    id: PAYMENT_ID,
    user_id: USER,
    amount: 5_000_000,
    status: "paid",
    ref_id: "REF-123",
  };

  test("callbackِ replay شده روی پرداختِ نهایی‌شده، درگاه را دوباره صدا نمی‌زند", async () => {
    // کدِ ۱۰۱ زرین‌پال («قبلاً تأیید شده») مقدارِ ok می‌دهد؛ بدونِ این گارد
    // هر بار بازکردنِ لینکِ بازگشت یک verifyِ تازه بود.
    const s = makePorts({ payment: paidPayment });
    const out = await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "consulting",
      ports: s.ports,
    });
    assert.equal(out.status, "success");
    assert.equal(out.status === "success" && out.alreadyFinalized, true);
    assert.equal(s.gatewayCalls.length, 0);
  });

  test("replay دسترسیِ دوم نمی‌سازد — همان source می‌رود", async () => {
    const s = makePorts({ payment: paidPayment });
    await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "consulting",
      ports: s.ports,
    });
    assert.equal(s.rpcCalls.length, 1);
    assert.equal(s.rpcCalls[0].source, entitlementSource("consulting", AUTHORITY));
    // idempotency واقعی روی همین کلید در دیتابیس بسته شده
    // (uq_entitlements_user_source).
  });

  test("replay با registration_idِ بی‌ربط، ثبت‌نامِ دیگری را پرداخت‌شده نمی‌کند", async () => {
    // شناسه هرگز از query خوانده نمی‌شود؛ همیشه از رکوردِ پرداخت می‌آید.
    const s = makePorts({ payment: paidPayment, registration: null });
    await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "webinar",
      ports: s.ports,
    });
    assert.equal(s.rpcCalls[0].registrationId, null);
  });

  test("دو callbackِ پشتِ سرِ هم، دو بار اثرِ جانبی تولید نمی‌کنند", async () => {
    const s1 = makePorts();
    const first = await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "consulting",
      ports: s1.ports,
    });
    assert.equal(first.status === "success" && first.alreadyFinalized, false);

    const s2 = makePorts({ payment: paidPayment });
    const second = await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "consulting",
      ports: s2.ports,
    });
    assert.equal(second.status === "success" && second.alreadyFinalized, true);
    assert.equal(
      s2.inviteLinkCalls,
      0,
      "بارِ دوم نباید لینکِ دعوتِ تازه بسازد"
    );
  });

  test("هم‌زمانی: بازندهٔ مسابقه هم نتیجهٔ درست می‌گیرد، نه دسترسیِ دوم", async () => {
    // شبیه‌سازیِ سریالی‌شدنِ `FOR UPDATE`: اولین RPC نهایی می‌کند، دومی همان
    // ردیف را می‌بیند و `already_finalized` برمی‌گرداند.
    let calls = 0;
    const rpc = async (input: FinalizeRpcInput) => {
      calls += 1;
      return {
        result: {
          user_id: USER,
          payment_id: PAYMENT_ID,
          entitlement_id: "ent-1", // همان ردیف در هر دو بار
          expires_at: input.expiresAt,
          already_finalized: calls > 1,
          registration_id: input.registrationId,
        },
        error: null,
      };
    };
    const a = makePorts({ rpc });
    const b = makePorts({ rpc });
    const [r1, r2] = await Promise.all([
      finalizePaidAccess({
        authority: AUTHORITY,
        gatewayStatus: "OK",
        product: "consulting",
        ports: a.ports,
      }),
      finalizePaidAccess({
        authority: AUTHORITY,
        gatewayStatus: "OK",
        product: "consulting",
        ports: b.ports,
      }),
    ]);
    assert.equal(r1.status, "success");
    assert.equal(r2.status, "success");
    assert.equal(calls, 2, "هر دو RPC را صدا زدند");
    // نکتهٔ اصلی: دقیقاً یکی از دو نتیجه «تازه» است.
    const fresh = [r1, r2].filter(
      (r) => r.status === "success" && !r.alreadyFinalized
    );
    assert.equal(fresh.length, 1, "فقط یک نهایی‌سازیِ تازه");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ۶. شکستِ نوشتن — RPC و اعطای دسترسی
// ══════════════════════════════════════════════════════════════════════════

describe("شکستِ نوشتن", () => {
  test("شکستِ RPC هرگز به‌عنوانِ خریدِ کاملِ موفق نشان داده نمی‌شود", async () => {
    const s = makePorts({ rpcError: { message: "deadlock detected" } });
    const out = await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "consulting",
      ports: s.ports,
    });
    assert.equal(out.status, "access_pending");
    assert.notEqual(out.status, "success");
  });

  test("شکستِ اعطای دسترسی ماندگار ثبت می‌شود، نه فقط console", async () => {
    const s = makePorts({ rpcError: { message: "اعطای دسترسی انجام نشد." } });
    await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "consulting",
      ports: s.ports,
    });
    assert.equal(s.failures.length, 1);
    assert.equal(s.failures[0].stage, "finalize_rpc");
    assert.equal(s.failures[0].userId, USER, "کاربر باید قابلِ پیدا کردن باشد");
    assert.match(s.failures[0].message, /اعطای دسترسی/);
  });

  test("نتیجهٔ تهی از RPC مثلِ خطا رفتار می‌کند", async () => {
    // اگر `result` تهی و `error` هم تهی باشد، «موفق» فرض کردن یعنی مشتری
    // صفحهٔ سبز می‌بیند و دسترسی ندارد.
    const s = makePorts({ rpc: async () => ({ result: null, error: null }) });
    const out = await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "consulting",
      ports: s.ports,
    });
    assert.equal(out.status, "access_pending");
    assert.equal(s.failures.length, 1);
  });

  test("replayِ پرداختِ نهایی‌شده با RPCِ خراب هم access_pending می‌دهد", async () => {
    const s = makePorts({
      payment: {
        id: PAYMENT_ID,
        user_id: USER,
        amount: 5_000_000,
        status: "paid",
        ref_id: "REF-123",
      },
      rpcError: { message: "timeout" },
    });
    const out = await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "consulting",
      ports: s.ports,
    });
    assert.equal(out.status, "access_pending");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ۷. مسیرِ موفق — دسترسیِ درست
// ══════════════════════════════════════════════════════════════════════════

describe("پرداختِ موفق → دسترسیِ درست", () => {
  test("مشاوره: نوع، منبع و انقضای درست به RPC می‌رود", async () => {
    const s = makePorts();
    const out = await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "consulting",
      ports: s.ports,
    });

    assert.equal(out.status, "success");
    const call = s.rpcCalls[0];
    assert.equal(call.kind, "consulting");
    assert.equal(call.source, `payment:${AUTHORITY}`);
    assert.equal(call.refId, "REF-123");
    // ۱۶ مرداد ۱۴۰۵ = 2026-08-16 → سه ماه بعد
    assert.equal(call.expiresAt, "2026-11-16T00:00:00.000Z");
    assert.equal(call.inviteLink, "https://t.me/+invite");
  });

  test("وبینار: نوع و منبعِ مخصوصِ خودش، بدونِ لینکِ دعوت", async () => {
    const s = makePorts({ registration: REG });
    const out = await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "webinar",
      ports: s.ports,
    });

    assert.equal(out.status, "success");
    assert.equal(out.status === "success" && out.webinarId, WEBINAR_ID);
    const call = s.rpcCalls[0];
    assert.equal(call.kind, "webinar");
    assert.equal(call.source, `webinar_payment:${AUTHORITY}`);
    assert.equal(call.registrationId, REG_ID);
    assert.equal(call.inviteLink, null, "مسیرِ وبینار لینکِ کانال نمی‌سازد");
  });

  test("دو محصول منبعِ متفاوت می‌سازند حتی با authorityِ یکسان", async () => {
    // اگر قالبِ `source` مشترک بود، خریدِ وبینار می‌توانست دسترسیِ مشاوره را
    // «قبلاً اعطا شده» ببیند و هیچ‌کدام ساخته نشود.
    assert.notEqual(
      entitlementSource("consulting", AUTHORITY),
      entitlementSource("webinar", AUTHORITY)
    );
  });

  test("انقضا همیشه در آینده است و به RPC می‌رسد", async () => {
    const s = makePorts();
    await finalizePaidAccess({
      authority: AUTHORITY,
      gatewayStatus: "OK",
      product: "consulting",
      ports: s.ports,
    });
    const expires = new Date(s.rpcCalls[0].expiresAt).getTime();
    assert.ok(expires > new Date("2026-08-16T00:00:00.000Z").getTime());
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ۸. گاردِ ساختاری — یک ماشینِ حالت، نه دو تا
// ══════════════════════════════════════════════════════════════════════════

test("هیچ مسیرِ APIای مستقیماً روی payments نمی‌نویسد", async () => {
  // این تست علتِ اصلیِ باگ را قفل می‌کند. اگر روزی کسی دوباره در یک route
  // مستقیم `from("payments").update(...)` بنویسد، همان ماشینِ حالتِ دوم
  // برمی‌گردد و این تست قرمز می‌شود.
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");

  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue;
      const src = readFileSync(full, "utf8");
      // `.from("payments")` که به update/insert/upsert/delete ختم شود.
      if (/from\(\s*["']payments["']\s*\)[\s\S]{0,200}?\.(update|insert|upsert|delete)\(/.test(src)) {
        offenders.push(full);
      }
    }
  };
  walk(join(process.cwd(), "app", "api"));

  assert.deepEqual(
    offenders,
    [],
    `نوشتنِ مستقیم روی payments فقط از راهِ RPC مجاز است:\n${offenders.join("\n")}`
  );
});
