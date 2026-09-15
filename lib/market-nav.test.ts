import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARKET_SECTIONS,
  normalizeFa,
  searchMarket,
  buildSearchIndex,
  isIndexableSymbol,
  type MarketSearchEntry,
} from "./market-nav";

/* ── بخش‌ها ───────────────────────────────────────────────────────────────── */

test("هیچ بخشی مسیرِ تازه نمی‌سازد — همه زیرِ /market", () => {
  for (const s of MARKET_SECTIONS) {
    assert.ok(s.href.startsWith("/market"), `${s.key} خارج از /market است: ${s.href}`);
  }
});

test("لنگرِ درون‌صفحه‌ای صریحاً برچسب anchor دارد", () => {
  for (const s of MARKET_SECTIONS) {
    assert.equal(s.href.includes("#"), s.anchor === true, `ناهماهنگیِ anchor در ${s.key}`);
  }
});

test("کلیدِ بخش‌ها یکتاست", () => {
  const keys = MARKET_SECTIONS.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

/* ── یکسان‌سازیِ فارسی ────────────────────────────────────────────────────── */

test("یِ عربی و کافِ عربی به فارسی یکسان می‌شوند", () => {
  assert.equal(normalizeFa("طلاي"), normalizeFa("طلای"));
  assert.equal(normalizeFa("ملك"), normalizeFa("ملک"));
});

test("نیم‌فاصله و اعراب حذف می‌شوند", () => {
  assert.equal(normalizeFa("درآمد‌ثابت"), "درآمدثابت");
  assert.equal(normalizeFa("طَلا"), "طلا");
});

/* ── جست‌وجو ─────────────────────────────────────────────────────────────── */

const INDEX: MarketSearchEntry[] = [
  { id: "طلا", name: "صندوق طلای لوتوس", kind: "fund", type: "طلا" },
  { id: "وبملت", name: "بانک ملت", kind: "stock" },
  { id: "کهربا", name: "صندوق طلای کهربا", kind: "fund", type: "طلا" },
  { id: "فملی", name: "ملی صنایع مس ایران", kind: "stock" },
];

test("جست‌وجوی خالی هیچ نتیجه‌ای نمی‌دهد (نه همهٔ نتایج)", () => {
  assert.deepEqual(searchMarket(INDEX, ""), []);
  assert.deepEqual(searchMarket(INDEX, "   "), []);
});

test("تطابقِ دقیقِ نماد اولِ فهرست است", () => {
  const r = searchMarket(INDEX, "طلا");
  assert.equal(r[0].id, "طلا");
});

test("جست‌وجو با یِ عربی هم نماد را پیدا می‌کند", () => {
  // کاربر «طلاي» را با یِ عربی تایپ می‌کند و منبع «طلای» را با یِ فارسی دارد.
  const r = searchMarket(INDEX, "طلاي");
  assert.ok(r.some((x) => x.id === "طلا"), "نمادِ طلا باید پیدا شود");
  // عبارتِ چندکلمه‌ای هم داخلِ نامِ کامل جست‌وجو می‌شود.
  const r2 = searchMarket(INDEX, "طلاي لوتوس");
  assert.deepEqual(r2.map((x) => x.id), ["طلا"]);
});

test("جست‌وجو در نامِ کامل کار می‌کند، نه فقط نماد", () => {
  const r = searchMarket(INDEX, "بانک ملت");
  assert.equal(r[0].id, "وبملت");
});

test("عبارتِ بی‌تطابق فهرستِ خالی می‌دهد — نه نتیجهٔ تقریبی", () => {
  assert.deepEqual(searchMarket(INDEX, "zzzz"), []);
});

test("سقفِ نتایج رعایت می‌شود", () => {
  const many: MarketSearchEntry[] = Array.from({ length: 50 }, (_, i) => ({
    id: `نماد${i}`, name: `نام ${i}`, kind: "stock" as const,
  }));
  assert.equal(searchMarket(many, "نماد", 8).length, 8);
});

/* ── قاعدهٔ Z — زیرنماد و حقِ تقدم ────────────────────────────────────────── */

test("زیرنمادِ رقم‌دار وارد نمایه نمی‌شود (قاعدهٔ Z)", () => {
  assert.equal(isIndexableSymbol("وبملت"), true);
  assert.equal(isIndexableSymbol("آوند4"), false);
  assert.equal(isIndexableSymbol("آوند۴"), false); // رقمِ فارسی
  assert.equal(isIndexableSymbol("وبملتح"), false); // حقِ تقدم
  assert.equal(isIndexableSymbol(""), false);
});

test("buildSearchIndex زیرنمادها را می‌اندازد و تکراری نمی‌سازد", () => {
  const idx = buildSearchIndex(
    [{ id: "وبملت", faName: "بانک ملت" }, { id: "آوند4", faName: "زیرنماد" }, { id: "طلا", faName: "تکراری" }],
    [{ id: "طلا", faName: "صندوق طلای لوتوس", type: "طلا" }],
  );
  assert.equal(idx.length, 2);
  const gold = idx.find((x) => x.id === "طلا");
  assert.equal(gold?.kind, "fund", "نمادِ مشترک باید صندوق بماند، نه سهم");
  assert.equal(gold?.name, "صندوق طلای لوتوس");
  assert.ok(!idx.some((x) => x.id === "آوند4"));
});

test("نمایه فقط میدان‌های لازم را حمل می‌کند (بدونِ دادهٔ مصرف‌نشده)", () => {
  const idx = buildSearchIndex([{ id: "وبملت", faName: "بانک ملت" }], []);
  assert.deepEqual(Object.keys(idx[0]).sort(), ["id", "kind", "name"]);
});
