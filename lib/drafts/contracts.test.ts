import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DIRECTION_LABEL,
  MIN_NOTE_LENGTH,
  buildDraftQueue,
  toCard,
  validateDismissal,
  type DraftRow,
} from "@/lib/drafts/contracts";
import { isDataFault } from "@/lib/desk/contracts";

const row = (over: Partial<DraftRow> = {}): DraftRow => ({
  id: "d1",
  symbol: "فولاد",
  direction: "buy",
  status: "pending",
  source: "engine",
  reasons: [],
  created_at: "2026-08-24T06:00:00.000Z",
  ...over,
});

describe("واژگان — جهتِ دیدگاه، نه دستورِ معامله", () => {
  test("نگاشتِ جهت همان نگاشتِ کارنامه است — یک محصول، یک واژگان", () => {
    assert.equal(DIRECTION_LABEL.buy, "صعودی");
    assert.equal(DIRECTION_LABEL.sell, "نزولی");
  });

  test("جهتِ ناشناخته «نامعلوم» است و به یکی از دو گزینه نمی‌افتد", () => {
    const card = toCard(row({ direction: "wat" }));
    assert.equal(card.direction, null);
    assert.equal(card.directionLabel, "نامعلوم");
    assert.notEqual(card.directionLabel, DIRECTION_LABEL.buy);
  });

  test("هیچ واژهٔ ممنوعی در خروجیِ قرارداد نیست", () => {
    const text = JSON.stringify([
      DIRECTION_LABEL,
      buildDraftQueue([row()]),
      buildDraftQueue([]),
      buildDraftQueue(null),
    ]);
    assert.doesNotMatch(text, /سیگنال|توصیه|بخرید|بفروشید|قیمت هدف|پیشنهاد/);
  });
});

describe("`reasons` هر شکلی دارد و هیچ‌کدام نباید بترکاند", () => {
  test("آرایهٔ رشته همان‌طور می‌ماند و مقدارِ پوچ کنار می‌رود", () => {
    const card = toCard(row({ reasons: ["یک", "  ", "", "دو", 42, null] as unknown }));
    assert.deepEqual(card.reasons, ["یک", "دو"]);
  });

  test("شیءِ سبکِ کارنامه (`{ text }`) خوانده می‌شود", () => {
    assert.deepEqual(toCard(row({ reasons: { text: "دلیلِ نوشته‌شده" } })).reasons, ["دلیلِ نوشته‌شده"]);
  });

  test("شکلِ ناشناخته آرایهٔ خالی می‌شود، نه متنِ ساختگی", () => {
    for (const value of [null, undefined, 7, "رشتهٔ خام", {}, { text: "  " }]) {
      assert.deepEqual(toCard(row({ reasons: value })).reasons, [], `شکلِ ${JSON.stringify(value)}`);
    }
  });
});

describe("صف — خالی، پر، و خوانده‌نشده سه چیزِ متفاوت‌اند", () => {
  test("خوانده‌نشده `null` است و خرابیِ داده حساب می‌شود", () => {
    const q = buildDraftQueue(null);
    assert.equal(q.count, null);
    assert.equal(q.state, "unavailable");
    assert.equal(isDataFault(q.state), true);
    assert.equal(q.cards.length, 0);
    assert.match(q.detail, /با «صفِ خالی» یکی نیست/);
  });

  test("دلیلِ شکست اگر داده شود همان نشان داده می‌شود", () => {
    assert.match(buildDraftQueue(null, "کدِ ۴۲۰۰۱").detail, /۴۲۰۰۱/);
  });

  test("خالی یک واقعیتِ معتبر است و ادعای بررسی نمی‌کند", () => {
    const q = buildDraftQueue([]);
    assert.equal(q.count, 0);
    assert.equal(q.state, "empty");
    assert.doesNotMatch(q.detail, /همه بررسی شد|کامل/);
  });

  test("فقط بازنشده‌ها شمرده می‌شوند", () => {
    const q = buildDraftQueue([
      row({ id: "a" }),
      row({ id: "b", status: "approved" }),
      row({ id: "c", status: "rejected" }),
      row({ id: "d" }),
    ]);
    assert.deepEqual(q.cards.map((c) => c.id), ["a", "d"]);
    assert.equal(q.count, 2);
    assert.equal(q.state, "awaiting_review");
  });

  test("صفی که فقط موردِ بسته دارد خالی است، نه منتظرِ بازبینی", () => {
    const q = buildDraftQueue([row({ status: "approved" })]);
    assert.equal(q.count, 0);
    assert.equal(q.state, "empty");
  });
});

describe("گیتِ یادداشت", () => {
  test("یادداشتِ کوتاه یا خالی رد می‌شود", () => {
    for (const note of ["", "   ", "ا".repeat(MIN_NOTE_LENGTH - 1)]) {
      assert.ok(validateDismissal(note), `«${note}» باید رد شود`);
    }
  });

  test("یادداشتِ کافی می‌گذرد", () => {
    assert.equal(validateDismissal("دادهٔ پشتیبان ندارد"), null);
    assert.equal(validateDismissal("ا".repeat(MIN_NOTE_LENGTH)), null);
  });
});
