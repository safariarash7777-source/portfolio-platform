// تست واژه‌نامه (WP-G) — SPEC-learning-hub §۱ و §۵
// تضمین‌ها: یکتایی id، اعتبار seeAlso، نبود واژگان ممنوع مثبت، جستجو، getTerm صادق.
import { strict as assert } from "node:assert";
import test from "node:test";
import { GLOSSARY, getTerm, searchGlossary } from "./glossary";

test("glossary: idها یکتا و غیرخالی‌اند", () => {
  const ids = GLOSSARY.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of GLOSSARY) {
    assert.ok(t.id.length > 0 && /^[a-z0-9-]+$/.test(t.id), `id نامعتبر: ${t.id}`);
    assert.ok(t.term.length > 0 && t.short.length > 0 && t.long.length > 0);
  }
});

test("glossary: پوشش کامل جدول SPEC §۱ (۱۸ واژه)", () => {
  assert.ok(GLOSSARY.length >= 18, `فقط ${GLOSSARY.length} واژه — SPEC حداقل ۱۸ می‌خواهد`);
});

test("glossary: همهٔ seeAlso به idهای موجود اشاره می‌کنند (و نه به خود واژه)", () => {
  const ids = new Set(GLOSSARY.map((t) => t.id));
  for (const t of GLOSSARY) {
    for (const ref of t.seeAlso) {
      assert.ok(ids.has(ref), `${t.id}: seeAlso ناموجود «${ref}»`);
      assert.notEqual(ref, t.id, `${t.id}: seeAlso به خودش`);
    }
  }
});

test("glossary: هیچ واژهٔ ممنوع مثبت (توصیه/سیگنال/تضمین/وعدهٔ سود) در متن‌ها", () => {
  // الگوهای نفی‌دار مجاز است (مثل «صف به‌تنهایی معیار تصمیم نیست»)؛ کاربرد مثبت ممنوع.
  const FORBIDDEN = [/توصیه(?!\s*(نمی|نیست))/, /سیگنال/, /تضمین/, /وعده/, /سود\s*قطعی/];
  for (const t of GLOSSARY) {
    const text = `${t.term} ${t.short} ${t.long}`;
    for (const re of FORBIDDEN) {
      assert.ok(!re.test(text), `${t.id}: واژهٔ ممنوع «${re}» در متن`);
    }
  }
});

test("glossary: getTerm — موجود برمی‌گردد، ناموجود null صادق", () => {
  assert.equal(getTerm("nav")?.term, "NAV (ابطال / صدور)");
  assert.equal(getTerm("ناموجود"), null);
});

test("glossary: جستجو — با فاصلهٔ مجازی و بدون آن کار می‌کند", () => {
  const r1 = searchGlossary("حجم مبنا");
  assert.ok(r1.some((t) => t.id === "base-volume"));
  const r2 = searchGlossary("NAV");
  assert.ok(r2.some((t) => t.id === "nav"));
  // خالی → کل فهرست
  assert.equal(searchGlossary("").length, GLOSSARY.length);
  // بی‌نتیجه → آرایهٔ خالی (نه throw)
  assert.equal(searchGlossary("zzz-هیچ").length, 0);
});
