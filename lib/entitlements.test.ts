import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ENTITLEMENT_MONTHS,
  addMonthsClamped,
  entitlementExpiry,
  grantEntitlement,
  isEntitlementKind,
  entitlementSource,
  authorityFromSource,
} from "./entitlements";

describe("addMonthsClamped", () => {
  test("افزودن ماهِ ساده", () => {
    const from = new Date("2026-01-15T10:00:00.000Z");
    assert.equal(addMonthsClamped(from, 3).toISOString(), "2026-04-15T10:00:00.000Z");
  });

  test("۳۱ ژانویه + ۱ ماه به ۲۸ فوریه کلمپ می‌شود، نه ۳ مارس", () => {
    const from = new Date("2026-01-31T00:00:00.000Z");
    assert.equal(addMonthsClamped(from, 1).toISOString(), "2026-02-28T00:00:00.000Z");
  });

  test("سالِ کبیسه: ۳۱ ژانویه ۲۰۲۸ + ۱ ماه → ۲۹ فوریه", () => {
    const from = new Date("2028-01-31T00:00:00.000Z");
    assert.equal(addMonthsClamped(from, 1).toISOString(), "2028-02-29T00:00:00.000Z");
  });

  test("عبور از مرزِ سال", () => {
    const from = new Date("2026-11-30T12:00:00.000Z");
    assert.equal(addMonthsClamped(from, 3).toISOString(), "2027-02-28T12:00:00.000Z");
  });

  test("ورودی را جهش نمی‌دهد", () => {
    const from = new Date("2026-01-15T10:00:00.000Z");
    const snapshot = from.toISOString();
    addMonthsClamped(from, 6);
    assert.equal(from.toISOString(), snapshot);
  });
});

describe("entitlementExpiry", () => {
  test("مشاوره و وبینار هر دو ۳ ماه‌اند", () => {
    assert.equal(ENTITLEMENT_MONTHS.consulting, 3);
    assert.equal(ENTITLEMENT_MONTHS.webinar, 3);
  });

  test("انقضا همیشه در آینده است", () => {
    const now = new Date();
    for (const kind of ["consulting", "webinar", "manual"] as const) {
      assert.ok(entitlementExpiry(kind, now).getTime() > now.getTime(), kind);
    }
  });
});

describe("isEntitlementKind", () => {
  test("انواعِ معتبر پذیرفته می‌شوند", () => {
    assert.ok(isEntitlementKind("consulting"));
    assert.ok(isEntitlementKind("webinar"));
    assert.ok(isEntitlementKind("manual"));
  });

  test("انواعِ نامعتبر رد می‌شوند", () => {
    assert.equal(isEntitlementKind("admin"), false);
    assert.equal(isEntitlementKind(""), false);
    assert.equal(isEntitlementKind(null), false);
    assert.equal(isEntitlementKind(3), false);
  });
});

// ── دابلِ کمینهٔ Supabase ─────────────────────────────────────────────────────
// فقط زنجیرهٔ متدهایی که `grantEntitlement` استفاده می‌کند را می‌سازد.
function fakeClient(opts: {
  existing?: Array<{ id: string; expires_at: string }>;
  lookupError?: string;
  insertError?: string;
}) {
  const inserted: Array<Record<string, unknown>> = [];
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    limit: async () => ({
                      data: opts.existing ?? [],
                      error: opts.lookupError ? { message: opts.lookupError } : null,
                    }),
                  };
                },
              };
            },
          };
        },
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          return { error: opts.insertError ? { message: opts.insertError } : null };
        },
      };
    },
  };
  return { client, inserted };
}

describe("grantEntitlement", () => {
  test("وقتی دسترسیِ قبلی نیست، ردیف درج می‌شود", async () => {
    const { client, inserted } = fakeClient({});
    const res = await grantEntitlement(client as never, {
      userId: "u-1",
      kind: "consulting",
      source: "payment:A123",
    });

    assert.equal(res.ok, true);
    assert.equal(res.ok && res.created, true);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].user_id, "u-1");
    assert.equal(inserted[0].kind, "consulting");
    assert.equal(inserted[0].source, "payment:A123");
    assert.ok(typeof inserted[0].expires_at === "string");
  });

  test("idempotent: منبعِ تکراری دوباره درج نمی‌شود", async () => {
    const { client, inserted } = fakeClient({
      existing: [{ id: "e-1", expires_at: "2026-10-01T00:00:00.000Z" }],
    });
    const res = await grantEntitlement(client as never, {
      userId: "u-1",
      kind: "webinar",
      source: "webinar_payment:A123",
    });

    assert.equal(res.ok, true);
    assert.equal(res.ok && res.created, false);
    assert.equal(res.ok && res.expiresAt, "2026-10-01T00:00:00.000Z");
    assert.equal(inserted.length, 0, "نباید ردیفِ دوم درج شود");
  });

  test("نبودِ جدول به‌عنوان table_missing طبقه‌بندی می‌شود", async () => {
    const { client } = fakeClient({
      insertError: 'relation "public.entitlements" does not exist',
    });
    const res = await grantEntitlement(client as never, {
      userId: "u-1",
      kind: "consulting",
      source: "payment:A1",
    });

    assert.equal(res.ok, false);
    assert.equal(!res.ok && res.reason, "table_missing");
  });

  test("خطای عمومی throw نمی‌کند و error برمی‌گرداند", async () => {
    const { client } = fakeClient({ insertError: "connection reset" });
    const res = await grantEntitlement(client as never, {
      userId: "u-1",
      kind: "consulting",
      source: "payment:A1",
    });

    assert.equal(res.ok, false);
    assert.equal(!res.ok && res.reason, "error");
  });

  test("استثنای پرتاب‌شدهٔ کلاینت هم گرفته می‌شود", async () => {
    const throwing = {
      from() {
        throw new Error("boom");
      },
    };
    const res = await grantEntitlement(throwing as never, {
      userId: "u-1",
      kind: "consulting",
      source: "payment:A1",
    });

    assert.equal(res.ok, false);
    assert.equal(!res.ok && res.message, "boom");
  });
});

// ── قالبِ source و آشتی‌دهی ────────────────────────────────────────────────

test("entitlementSource: قالبِ قطعی، و authorityFromSource برعکسش", () => {
  assert.equal(entitlementSource("consulting", "A00123"), "payment:A00123");
  assert.equal(entitlementSource("webinar", "A00123"), "webinar_payment:A00123");
  assert.equal(authorityFromSource("payment:A00123"), "A00123");
  assert.equal(authorityFromSource("webinar_payment:A00123"), "A00123");
});

test("authorityFromSource: ورودیِ بی‌قالب → null، نه رشتهٔ اشتباه", () => {
  // اگر اینجا رشتهٔ خام برگردد، آشتی‌دهی پرداختِ درست را «بدونِ دسترسی» می‌بیند.
  assert.equal(authorityFromSource("admin_grant"), null);
  assert.equal(authorityFromSource(null), null);
  assert.equal(authorityFromSource(""), null);
  assert.equal(authorityFromSource("payment:"), null);
});

test("رفت‌وبرگشتِ source برای هر سه نوع پایدار است", () => {
  for (const kind of ["consulting", "webinar", "manual"] as const) {
    assert.equal(authorityFromSource(entitlementSource(kind, "X9")), "X9");
  }
});
