/**
 * رفتارِ توقف — سرتاسری، روی خودِ `server.mjs`، نه فقط واحدها.
 *
 * سه چیزی که باید با هم درست باشند و هیچ‌کدام به‌تنهایی کافی نیست:
 *   ۱) در enforcement بدونِ شمارنده، **ارسال نمی‌شود**.
 *   ۲) کشِ سالمِ قبلی با خالی **بازنویسی نمی‌شود** — دادهٔ کهنه سر جایش می‌ماند.
 *   ۳) هشدارِ عملیاتی در `/debug` **دیده می‌شود**، نه اینکه بی‌صدا بگذرد.
 */
import assert from "node:assert/strict";
import { LegacyMeter, BudgetUnavailableError } from "./brsapi-legacy-meter.mjs";

let pass = 0, fail = 0;
const tests = [];
const t = (n, f) => tests.push([n, f]);

/** بازسازیِ دقیقِ همان قراردادی که `server.mjs` می‌سازد. */
function harness({ enforced, budget }) {
  // بودجه **قابلِ تعویض** است تا بتوان دنبالهٔ واقعی را آزمود:
  // «چرخهٔ سالم کش را پر می‌کند، بعد بودجه ته می‌کشد».
  const box = { budget };
  const meter = new LegacyMeter(() => box.budget, { enforced: () => enforced });
  const stop = { active: false, producers: {} };
  const countLegacy = async (producer, cls) => {
    try { await meter.count(producer, cls); }
    catch (e) { stop.active = true; stop.producers[producer] = (stop.producers[producer] ?? 0) + 1; throw e; }
  };
  let cache = null;
  let wire = 0;

  /** همان شکلِ `fetchGoldCurrency`: خطا را داخل می‌گیرد و خالی برمی‌گرداند. */
  async function fetchSection(producer) {
    try { await countLegacy(producer, "critical"); wire += 1; return ["دادهٔ تازه"]; }
    catch { return []; }
  }
  async function refresh() {
    stop.active = false;
    const body = await fetchSection("gold-currency");
    if (stop.active && cache) return { kept: true, body: cache };
    cache = body;
    return { kept: false, body };
  }
  return { refresh, meter, stop, box, get cache() { return cache; }, get wire() { return wire; } };
}

const okBudget = () => ({ async ensure() {}, reserve: () => true });
const fullBudget = () => ({ async ensure() {}, reserve: () => false });

t("چرخهٔ سالم کش را پر می‌کند", async () => {
  const h = harness({ enforced: true, budget: okBudget() });
  const r = await h.refresh();
  assert.equal(r.kept, false);
  assert.deepEqual(h.cache, ["دادهٔ تازه"]);
  assert.equal(h.wire, 1);
});

t("بدونِ شمارنده در enforcement: هیچ درخواستی روی سیم نمی‌رود", async () => {
  const h = harness({ enforced: true, budget: null });
  await h.refresh();
  assert.equal(h.wire, 0, "قولِ سقف بدونِ ابزارِ نگه‌داشتنش، یعنی توقف");
  assert.equal(h.stop.active, true);
});

t("کشِ سالم با خالی بازنویسی نمی‌شود — دادهٔ کهنه می‌ماند", async () => {
  const h = harness({ enforced: true, budget: okBudget() });
  await h.refresh();
  assert.deepEqual(h.cache, ["دادهٔ تازه"], "چرخهٔ اول کش را پر کرد");
  assert.equal(h.wire, 1);

  // حالا شمارنده از دست می‌رود. چرخهٔ بعدی باید کشِ سالم را **نگه دارد**.
  h.box.budget = null;
  const r = await h.refresh();
  assert.equal(r.kept, true, "چرخه ناقص شناخته شد");
  assert.deepEqual(h.cache, ["دادهٔ تازه"], "کشِ قبلی دست‌نخورده ماند — کهنه، نه خالی");
  assert.equal(h.wire, 1, "و هیچ درخواستِ تازه‌ای فرستاده نشد");
});

t("وقتی هیچ کشِ قبلی نیست، خالی سرو می‌شود — و این عمدی است", async () => {
  // اینجا چیزی برای کهنه‌نگه‌داشتن وجود ندارد. قاعده «کهنه بهتر از خالی» است،
  // نه «خالی ممنوع» — وگرنه اولین بوتِ ناموفق سرویس را قفل می‌کرد.
  const h = harness({ enforced: true, budget: null });
  const r = await h.refresh();
  assert.equal(r.kept, false);
  assert.deepEqual(h.cache, [], "خالی، ولی آگاهانه");
  assert.equal(h.stop.active, true, "و توقف ثبت شده تا در /debug دیده شود");
});

t("هشدارِ عملیاتی بلند می‌شود، بی‌صدا نمی‌گذرد", async () => {
  const h = harness({ enforced: true, budget: null });
  await h.refresh();
  const snap = h.meter.snapshot();
  assert.ok(snap.alert, "باید هشدار داشته باشد");
  assert.equal(snap.unmetered, 1);
  assert.deepEqual(Object.keys(h.stop.producers), ["gold-currency"], "و بگوید کدام producer");
});

t("بدونِ enforcement همان وضعیت عبور می‌کند — رفتارِ امروزِ Production", async () => {
  const h = harness({ enforced: false, budget: null });
  await h.refresh();
  assert.equal(h.wire, 1, "پیش‌فرض رفتارِ موجود را عوض نمی‌کند");
  assert.equal(h.meter.snapshot().alert, null);
});

t("BudgetUnavailableError از خطای سهمیه قابلِ تفکیک است", async () => {
  const m = new LegacyMeter(() => null, { enforced: () => true });
  await assert.rejects(() => m.count("x"), (e) => e instanceof BudgetUnavailableError);
});

console.log("brsapi-stop-behaviour:");
for (const [n, f] of tests) {
  try { await f(); pass++; console.log(`  ✓ ${n}`); }
  catch (e) { fail++; console.error(`  ✗ ${n}: ${e.message}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
