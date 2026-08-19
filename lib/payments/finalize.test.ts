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
import { entitlementSource, productFromSource, isPaidProduct } from "@/lib/entitlements";

/**
 * مسیرِ واحدِ نهایی‌سازیِ پرداخت — هر شاخهٔ شکست.
 *
 * ── چرا با پورتِ جعلی ────────────────────────────────────────────────────────
 * مسیرِ واقعی به زرین‌پال و Postgres وصل است. آنچه باید اثبات شود این است که
 * **منطقِ تصمیمِ ما** در هر شکستِ ممکن حالتِ درست را برمی‌گرداند.
 *
 * ── بازنگریِ Command Center ──────────────────────────────────────────────────
 * نسخهٔ اولِ همین فایل صریحاً انتظار داشت پرداختِ وبینار **بدونِ ثبت‌نام** موفق
 * شود. آن تست، باگ را تثبیت می‌کرد نه اینکه بگیردش. حالا همان حالت باید رد شود.
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
  rpcError?: unknown;
  rpc?: (input: FinalizeRpcInput) => Promise<{ result: FinalizeRpcResult | null; error: unknown }>;
  failPaymentError?: unknown;
  recordFailurePersisted?: boolean;
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

function payment(over: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: PAYMENT_ID,
    user_id: USER,
    amount: 5_000_000,
    status: "pending",
    ref_id: null,
    purpose: "consulting",
    ...over,
  };
}

function makePorts(opts: FakeOptions = {}): FakeState {
  const state: FakeState = {
    rpcCalls: [], gatewayCalls: [], failPaymentCalls: [], failures: [],
    inviteLinkCalls: 0, ports: null as unknown as FinalizePorts,
  };
  const row = opts.payment === undefined ? payment() : opts.payment;

  state.ports = {
    async loadPaymentByAuthority() {
      return { payment: opts.paymentError ? null : row, error: opts.paymentError ?? null };
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
      return { error: opts.failPaymentError ?? null };
    },
    async finalizePaidAccess(input) {
      state.rpcCalls.push(input);
      if (opts.rpc) return opts.rpc(input);
      if (opts.rpcError) return { result: null, error: opts.rpcError };
      return {
        result: {
          user_id: row?.user_id ?? USER,
          payment_id: PAYMENT_ID,
          entitlement_id: "ent-1",
          expires_at: "2026-11-16T00:00:00.000Z",
          already_finalized: row?.status === "paid",
          registration_id: input.registrationId,
          purpose: input.kind,
        },
        error: null,
      };
    },
    async recordFailure(entry) {
      state.failures.push({ stage: entry.stage, message: entry.message, userId: entry.userId });
      const persisted = opts.recordFailurePersisted !== false;
      return { persisted, error: persisted ? null : { message: "audit_log unreachable" } };
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

const run = (ports: FinalizePorts, product: "consulting" | "webinar", gatewayStatus = "OK", authority = AUTHORITY) =>
  finalizePaidAccess({ authority, gatewayStatus, product, ports });

// ══════════════════════════════════════════════════════════════════════════
// بند ۱ و ۳ — نوعِ محصول به پرداخت بسته است؛ callbackِ اشتباه رد می‌شود
// ══════════════════════════════════════════════════════════════════════════

describe("بایندِ نوعِ محصول به ردیفِ پرداخت", () => {
  test("callbackِ وبینار نمی‌تواند پرداختِ مشاوره را نهایی کند", async () => {
    const s = makePorts({ payment: payment({ purpose: "consulting" }) });
    const out = await run(s.ports, "webinar");
    assert.equal(out.status, "failed");
    assert.equal(out.status === "failed" && out.reason, "product_mismatch");
    assert.equal(s.rpcCalls.length, 0, "نباید حتی به RPC برسد");
    assert.equal(s.gatewayCalls.length, 0);
  });

  test("callbackِ مشاوره نمی‌تواند پرداختِ وبینار را نهایی کند", async () => {
    const s = makePorts({ payment: payment({ purpose: "webinar" }) });
    const out = await run(s.ports, "consulting");
    assert.equal(out.status, "failed");
    assert.equal(out.status === "failed" && out.reason, "product_mismatch");
    assert.equal(s.rpcCalls.length, 0);
  });

  test("پرداختِ بدونِ purpose (رکوردِ قدیمی) نهایی نمی‌شود", async () => {
    const s = makePorts({ payment: payment({ purpose: null }) });
    const out = await run(s.ports, "consulting");
    assert.equal(out.status, "failed");
    assert.equal(out.status === "failed" && out.reason, "product_mismatch");
  });

  test("عدمِ تطابقِ نوع ماندگار ثبت می‌شود", async () => {
    const s = makePorts({ payment: payment({ purpose: "consulting" }) });
    await run(s.ports, "webinar");
    assert.equal(s.failures.length, 1);
    assert.equal(s.failures[0].stage, "product_mismatch");
    assert.equal(s.failures[0].userId, USER);
  });

  test("نوعی که به RPC می‌رود همان نوعِ ردیفِ پرداخت است، نه ادعای فراخواننده", async () => {
    const s = makePorts({ payment: payment({ purpose: "webinar" }), registration: REG });
    await run(s.ports, "webinar");
    assert.equal(s.rpcCalls[0].kind, "webinar");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// بند ۲ — یک authority نمی‌تواند دو نوع دسترسی بسازد
// ══════════════════════════════════════════════════════════════════════════

describe("یک authority ⇒ یک محصول", () => {
  test("همان authority از دو callback: دقیقاً یکی می‌گذرد", async () => {
    // این دقیقاً همان سناریوی گزارشِ Command Center است.
    const row = payment({ purpose: "consulting" });
    const a = makePorts({ payment: row });
    const b = makePorts({ payment: row });

    const viaConsulting = await run(a.ports, "consulting");
    const viaWebinar = await run(b.ports, "webinar");

    assert.equal(viaConsulting.status, "success");
    assert.equal(viaWebinar.status, "failed");
    assert.equal(viaWebinar.status === "failed" && viaWebinar.reason, "product_mismatch");

    const totalRpc = a.rpcCalls.length + b.rpcCalls.length;
    assert.equal(totalRpc, 1, "فقط یک نهایی‌سازی، نه دو تا");
  });

  test("قالبِ source دیگر دو پیشوندِ متفاوت برای یک authority نمی‌سازد", () => {
    // منبع حالا از خودِ purpose ساخته می‌شود و purpose یکتاست، پس دو رشتهٔ
    // متفاوت برای یک authority ممکن نیست مگر purpose عوض شود — که تغییرناپذیر است.
    assert.equal(entitlementSource("consulting", AUTHORITY), `consulting:${AUTHORITY}`);
    assert.equal(entitlementSource("webinar", AUTHORITY), `webinar:${AUTHORITY}`);
    assert.equal(productFromSource(`webinar:${AUTHORITY}`), "webinar");
    assert.equal(productFromSource(`manual:${AUTHORITY}`), null);
    assert.ok(isPaidProduct("consulting") && !isPaidProduct("manual"));
  });
});

// ══════════════════════════════════════════════════════════════════════════
// بند ۴ — وبینار بدونِ ثبت‌نامِ متصل رد می‌شود
// ══════════════════════════════════════════════════════════════════════════

describe("ثبت‌نامِ وبینار الزامی است", () => {
  test("پرداختِ وبینار بدونِ ثبت‌نام → رد، نه موفقیت", async () => {
    // ⚠️ نسخهٔ قبلیِ همین تست عکسِ این را ادعا می‌کرد.
    const s = makePorts({ payment: payment({ purpose: "webinar" }), registration: null });
    const out = await run(s.ports, "webinar");
    assert.equal(out.status, "failed");
    assert.equal(out.status === "failed" && out.reason, "registration_missing");
    assert.equal(s.rpcCalls.length, 0, "بدونِ ثبت‌نام نباید نهایی شود");
    assert.equal(s.failures[0].stage, "registration_missing");
  });

  test("ثبت‌نامِ متعلق به کاربرِ دیگر رد می‌شود", async () => {
    const s = makePorts({
      payment: payment({ purpose: "webinar" }),
      registration: { id: REG_ID, webinar_id: WEBINAR_ID, user_id: OTHER_USER },
    });
    const out = await run(s.ports, "webinar");
    assert.equal(out.status, "failed");
    assert.equal(out.status === "failed" && out.reason, "registration_missing");
    assert.equal(s.rpcCalls.length, 0);
  });

  test("خطای خواندنِ ثبت‌نام مسیر را متوقف می‌کند", async () => {
    const s = makePorts({
      payment: payment({ purpose: "webinar" }),
      registrationError: { message: "relation does not exist" },
    });
    const out = await run(s.ports, "webinar");
    assert.equal(out.status === "failed" && out.reason, "registration_lookup_failed");
    assert.equal(s.rpcCalls.length, 0);
  });

  test("مشاوره ثبت‌نام لازم ندارد و اصلاً دنبالش نمی‌گردد", async () => {
    const s = makePorts({ payment: payment({ purpose: "consulting" }) });
    const out = await run(s.ports, "consulting");
    assert.equal(out.status, "success");
    assert.equal(s.rpcCalls[0].registrationId, null);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// بند ۹ — خطاهای failPayment و ثبتِ ممیزی واقعاً بررسی می‌شوند
// ══════════════════════════════════════════════════════════════════════════

describe("شکستِ نوشتن دیده می‌شود", () => {
  test("خطای failPayment هنگام لغو، ماندگار ثبت می‌شود", async () => {
    const s = makePorts({ failPaymentError: { message: "deadlock" } });
    const out = await run(s.ports, "consulting", "NOK");
    assert.equal(out.status === "failed" && out.reason, "cancelled");
    assert.deepEqual(s.failPaymentCalls, [AUTHORITY]);
    assert.ok(
      s.failures.some((f) => f.stage === "fail_payment"),
      "پرداخت روی pending مانده و باید ردی داشته باشد"
    );
  });

  test("خطای failPayment پس از شکستِ verify هم ثبت می‌شود", async () => {
    const s = makePorts({ gatewayOk: false, failPaymentError: { message: "timeout" } });
    const out = await run(s.ports, "consulting");
    assert.equal(out.status === "failed" && out.reason, "gateway_verify_failed");
    assert.ok(s.failures.some((f) => f.stage === "fail_payment"));
  });

  test("failPaymentِ موفق ردِ اضافه نمی‌سازد", async () => {
    const s = makePorts();
    await run(s.ports, "consulting", "NOK");
    assert.equal(s.failures.length, 0);
  });

  test("اگر ثبتِ شکست هم شکست بخورد، خروجی صادقانه می‌گوید ردی نیست", async () => {
    const s = makePorts({ rpcError: { message: "boom" }, recordFailurePersisted: false });
    const out = await run(s.ports, "consulting");
    assert.equal(out.status, "access_pending");
    assert.equal(
      out.status === "access_pending" && out.failureRecorded,
      false,
      "UI نباید وعدهٔ پیگیری بدهد وقتی هیچ ردی ثبت نشده"
    );
  });

  test("ثبتِ موفقِ شکست، failureRecorded=true می‌دهد", async () => {
    const s = makePorts({ rpcError: { message: "boom" } });
    const out = await run(s.ports, "consulting");
    assert.equal(out.status === "access_pending" && out.failureRecorded, true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// حالت‌های پایه‌ای که باید حفظ می‌شدند
// ══════════════════════════════════════════════════════════════════════════

describe("گاردهای پیشین", () => {
  test("authorityِ تهی → هیچ تماسِ بیرونی", async () => {
    const s = makePorts();
    const out = await run(s.ports, "consulting", "OK", "");
    assert.equal(out.status === "failed" && out.reason, "missing_authority");
    assert.equal(s.gatewayCalls.length + s.rpcCalls.length, 0);
  });

  test("authorityِ ناشناخته رد می‌شود", async () => {
    const s = makePorts({ payment: null });
    const out = await run(s.ports, "consulting");
    assert.equal(out.status === "failed" && out.reason, "payment_not_found");
    assert.equal(s.failPaymentCalls.length, 0);
  });

  test("خطای خواندنِ پرداخت با «پیدا نشد» یکی نیست", async () => {
    const s = makePorts({ paymentError: { message: "connection reset" } });
    const out = await run(s.ports, "consulting");
    assert.equal(out.status === "failed" && out.reason, "payment_lookup_failed");
    assert.equal(s.failures[0].stage, "payment_lookup");
  });

  test("مبلغ از رکوردِ خودمان می‌رود", async () => {
    const s = makePorts({ payment: payment({ amount: 7_500_000 }) });
    await run(s.ports, "consulting");
    assert.equal(s.gatewayCalls[0].amount, 7_500_000);
    assert.equal(s.rpcCalls[0].amount, 7_500_000);
  });

  test("لغو → fail_payment، بدونِ verify و بدونِ دسترسی", async () => {
    const s = makePorts();
    const out = await run(s.ports, "consulting", "NOK");
    assert.equal(out.status === "failed" && out.reason, "cancelled");
    assert.equal(s.gatewayCalls.length, 0);
    assert.equal(s.rpcCalls.length, 0);
  });

  test("پرداختِ failed دوباره نهایی نمی‌شود", async () => {
    const s = makePorts({ payment: payment({ status: "failed" }) });
    const out = await run(s.ports, "consulting");
    assert.equal(out.status === "failed" && out.reason, "already_failed");
    assert.equal(s.rpcCalls.length, 0);
  });

  test("replay: درگاه دوباره صدا زده نمی‌شود و دعوتِ تازه ساخته نمی‌شود", async () => {
    const s = makePorts({ payment: payment({ status: "paid", ref_id: "REF-123" }) });
    const out = await run(s.ports, "consulting");
    assert.equal(out.status, "success");
    assert.equal(out.status === "success" && out.alreadyFinalized, true);
    assert.equal(s.gatewayCalls.length, 0);
    assert.equal(s.inviteLinkCalls, 0);
  });

  test("شکستِ RPC هرگز موفقیتِ کامل نشان داده نمی‌شود", async () => {
    const s = makePorts({ rpcError: { message: "deadlock detected" } });
    const out = await run(s.ports, "consulting");
    assert.equal(out.status, "access_pending");
  });

  test("نتیجهٔ تهی از RPC مثلِ خطا رفتار می‌کند", async () => {
    const s = makePorts({ rpc: async () => ({ result: null, error: null }) });
    const out = await run(s.ports, "consulting");
    assert.equal(out.status, "access_pending");
  });

  test("مسیرِ وبینار لینکِ دعوتِ کانال نمی‌سازد", async () => {
    const s = makePorts({ payment: payment({ purpose: "webinar" }), registration: REG });
    await run(s.ports, "webinar");
    assert.equal(s.rpcCalls[0].inviteLink, null);
    assert.equal(s.inviteLinkCalls, 0);
  });

  test("مشاوره لینکِ دعوت می‌سازد و به RPC می‌دهد", async () => {
    const s = makePorts();
    await run(s.ports, "consulting");
    assert.equal(s.rpcCalls[0].inviteLink, "https://t.me/+invite");
  });

  test("مدتِ دسترسی از سمتِ TypeScript فرستاده نمی‌شود", () => {
    // بند ۱۰: هیچ فیلدی برای مدت/انقضا در قراردادِ RPC نیست، پس هیچ
    // فراخواننده‌ای نمی‌تواند دسترسیِ طولانی‌تر بخرد.
    const s = makePorts();
    return run(s.ports, "consulting").then(() => {
      const keys = Object.keys(s.rpcCalls[0]);
      assert.ok(!keys.includes("expiresAt"), "expiresAt نباید در ورودی باشد");
      assert.ok(!keys.includes("source"), "source را SQL می‌سازد");
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// گاردِ ساختاری
// ══════════════════════════════════════════════════════════════════════════

test("هیچ مسیرِ APIای مستقیماً روی payments نمی‌نویسد", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue;
      const src = readFileSync(full, "utf8");
      if (/from\(\s*["']payments["']\s*\)[\s\S]{0,200}?\.(update|insert|upsert|delete)\(/.test(src)) {
        offenders.push(full);
      }
    }
  };
  walk(join(process.cwd(), "app", "api"));
  assert.deepEqual(offenders, [], `نوشتنِ مستقیم روی payments ممنوع:\n${offenders.join("\n")}`);
});

test("هیچ‌جا مدتِ دسترسی هاردکد نشده", async () => {
  // بند ۱۰: عددِ «۳ ماه» نباید در کدِ TypeScript برگردد.
  const { readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const p = join(process.cwd(), "lib", "entitlements.ts");
  assert.ok(existsSync(p));
  const src = readFileSync(p, "utf8");
  assert.doesNotMatch(src, /ENTITLEMENT_MONTHS/, "ثابتِ مدت باید حذف شده باشد");
  assert.doesNotMatch(src, /addMonthsClamped/, "محاسبهٔ مدت باید در SQL باشد");
});
