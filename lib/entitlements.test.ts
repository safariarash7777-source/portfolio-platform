import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ENTITLEMENT_MONTHS,
  addMonthsClamped,
  entitlementExpiry,
  isEntitlementKind,
  entitlementSource,
  authorityFromSource,
  SOURCE_PREFIX,
} from "./entitlements";

describe("addMonthsClamped", () => {
  test("افزودن ماهِ ساده", () => {
    const from = new Date("2026-01-15T10:00:00.000Z");
    assert.equal(addMonthsClamped(from, 3).toISOString(), "2026-04-15T10:00:00.000Z");
  });

  test("۳۱ ژانویه + ۱ ماه به ۲۸ فوریه کلمپ می‌شود، نه ۳ مارس", () => {
    // `setMonth` خامْ سرریز می‌کند و چند روز دسترسیِ اضافه می‌دهد.
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

  test("هر چیزِ دیگری رد می‌شود", () => {
    for (const bad of ["admin", "", null, undefined, 3, {}, "CONSULTING"]) {
      assert.equal(isEntitlementKind(bad), false, String(bad));
    }
  });

  test("هر نوعِ معتبر یک پیشوندِ منبع دارد", () => {
    // اگر نوعی اضافه شود و پیشوندش جا بماند، `source` رشتهٔ `undefined:` می‌شود
    // و idempotency بی‌صدا می‌شکند.
    for (const kind of Object.keys(ENTITLEMENT_MONTHS) as Array<keyof typeof ENTITLEMENT_MONTHS>) {
      assert.equal(typeof SOURCE_PREFIX[kind], "string", kind);
      assert.ok(SOURCE_PREFIX[kind].length > 0, kind);
    }
  });
});

describe("قالبِ source", () => {
  const AUTHORITY = "A00000000000000000000000000000000001";

  test("هر محصول پیشوندِ خودش را دارد", () => {
    assert.equal(entitlementSource("consulting", AUTHORITY), `payment:${AUTHORITY}`);
    assert.equal(entitlementSource("webinar", AUTHORITY), `webinar_payment:${AUTHORITY}`);
  });

  test("دو محصول با authorityِ یکسان منبعِ یکسان نمی‌سازند", () => {
    // اگر یکسان می‌شد، قیدِ یکتای (user_id, source) خریدِ دومِ کاربر را
    // «تکراری» می‌دید و دسترسیِ دوم هرگز ساخته نمی‌شد.
    assert.notEqual(
      entitlementSource("consulting", AUTHORITY),
      entitlementSource("webinar", AUTHORITY)
    );
  });

  test("رفت‌وبرگشت: authority از source بازخوانده می‌شود", () => {
    for (const kind of ["consulting", "webinar", "manual"] as const) {
      assert.equal(authorityFromSource(entitlementSource(kind, AUTHORITY)), AUTHORITY);
    }
  });

  test("ورودیِ بی‌قالب null می‌دهد", () => {
    assert.equal(authorityFromSource(null), null);
    assert.equal(authorityFromSource(undefined), null);
    assert.equal(authorityFromSource(""), null);
    assert.equal(authorityFromSource("payment:"), null);
    assert.equal(authorityFromSource("bدونِ-دونقطه"), null);
  });

  test("authorityِ حاوی دونقطه هم درست بازخوانده می‌شود", () => {
    // `lastIndexOf` عمدی است؛ با `indexOf` این حالت می‌شکست.
    assert.equal(authorityFromSource("payment:a:b:c"), "c");
  });
});
