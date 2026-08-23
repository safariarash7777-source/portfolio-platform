#!/usr/bin/env node
/**
 * اثباتِ شکست‌پذیریِ گاردها.
 *
 * یک تستِ سبز به‌تنهایی چیزی ثابت نمی‌کند — شاید اصلاً چیزی را نمی‌سنجد.
 * این اسکریپت برای هر گارد **نقصِ واقعی را برمی‌گرداند**، تست را اجرا می‌کند و
 * انتظار دارد قرمز شود؛ بعد گارد را سرِ جایش می‌گذارد و انتظار دارد سبز شود.
 *
 *   node scripts/prove-guards.mjs
 *
 * فایل‌ها همیشه بازگردانده می‌شوند، حتی اگر وسطِ کار خطا بدهد.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

/** هر مورد: نقصی که واقعاً یک بار وجود داشته یا می‌تواند برگردد. */
const CASES = [
  {
    name: "گاردِ قیمتِ صفر",
    defect: "قیمتِ صفر «واقعی» شمرده شود — «۰ تومان» دوباره رندر می‌شود",
    file: "lib/market-price.ts",
    from: "Number.isFinite(price) && price > 0",
    to: "Number.isFinite(price) && price >= 0",
    test: "lib/market-price.test.ts",
  },
  {
    name: "گاردِ درصدِ نامعتبر",
    defect: "NaN از گارد رد شود — «• ٪NaN» رندر می‌شود",
    file: "lib/market-ticker-select.ts",
    from: 'return typeof value === "number" && Number.isFinite(value);',
    to: 'return typeof value === "number";',
    test: "lib/market-ticker-select.test.ts",
  },
  {
    name: "مقاومت به نبودِ نماد",
    defect: "نمادِ غایب با اولین دارایی موجود جایگزین شود",
    file: "lib/market-ticker-select.ts",
    from: "    if (hit) out.push(hit); // نبود ⇒ رد می‌شود. بدونِ جایگزین، بدونِ صفر.",
    to: "    out.push(hit ?? [...index.values()].find((a) => !out.includes(a))!);",
    test: "lib/market-ticker-select.test.ts",
  },
  {
    name: "مهرِ زمانیِ منبعِ درست",
    defect: "سنِ دادهٔ ایران با ساعتِ CoinGecko گزارش شود (باگِ اصلی)",
    file: "lib/market-freshness.ts",
    from: "  if (input.usesIr) {\n    const a = validAge(input.irFetchedAt, input.now);\n    if (a != null) ages.push(a);\n  }",
    to: "  if (input.usesIr) {\n    const a = validAge(input.globalFetchedAt, input.now);\n    if (a != null) ages.push(a);\n  }",
    test: "lib/market-freshness.test.ts",
  },
  {
    name: "ادعای همگانی در هیرو",
    defect: "«هر تحلیل …» دوباره به متنِ عمومی برگردد",
    file: "components/landing/Hero.tsx",
    from: "وضعیتِ روزِ بازار با زمانِ به‌روزرسانی، و مطالبِ منتشرشده با منبع و",
    to: "هر تحلیل فرض‌ها و سناریوهایش را همراه دارد. مطالبِ منتشرشده با منبع و",
    test: "lib/public-claims.test.ts",
  },
  {
    name: "کپیِ تکراریِ نوار برای صفحه‌خوان",
    defect: "`aria-hidden` از کپیِ دوم برداشته شود — قیمت‌ها دو بار خوانده می‌شوند",
    file: "components/market/MarketTicker.tsx",
    from: '<ul className="ticker-row" aria-hidden="true">',
    to: '<ul className="ticker-row">',
    test: "lib/market-ticker-select.test.ts",
  },
];

function runTest(file) {
  const r = spawnSync("npx", ["tsx", "--test", file], { encoding: "utf8", timeout: 300000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const fail = Number((out.match(/^# fail (\d+)$/m) || [])[1] ?? -1);
  return { passed: r.status === 0 && fail === 0, fail };
}

const restore = [];
let bad = 0;

process.on("exit", () => {
  for (const [f, s] of restore.reverse()) writeFileSync(f, s);
});

console.log("اثباتِ شکست‌پذیریِ گاردها — هر گارد باید با نقصِ واقعی قرمز شود.\n");

for (const c of CASES) {
  const original = readFileSync(c.file, "utf8");
  if (!original.includes(c.from)) {
    console.log(`✗ ${c.name}: لنگرِ جهش در ${c.file} پیدا نشد — اسکریپت از کد عقب افتاده.`);
    bad++;
    continue;
  }
  restore.push([c.file, original]);

  // ۱) نقص را برگردان → باید قرمز شود
  writeFileSync(c.file, original.replace(c.from, c.to));
  const red = runTest(c.test);

  // ۲) گارد را برگردان → باید سبز شود
  writeFileSync(c.file, original);
  restore.pop();
  const green = runTest(c.test);

  const ok = !red.passed && green.passed;
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${c.name}`);
  console.log(`    نقص     : ${c.defect}`);
  console.log(`    با نقص  : ${red.passed ? "سبز ← تست چیزی نمی‌سنجد!" : `قرمز (${red.fail} مردود)`}`);
  console.log(`    با گارد : ${green.passed ? "سبز" : `قرمز (${green.fail} مردود) ← بازگردانی خراب است`}`);
  console.log(`    تست     : ${c.test}\n`);
}

console.log(bad === 0
  ? `همهٔ ${CASES.length} گارد شکست‌پذیر ثابت شدند.`
  : `${bad} از ${CASES.length} مورد ثابت نشد.`);
process.exit(bad === 0 ? 0 : 1);
