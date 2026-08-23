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
  // ── میزِ هوشمندی (P2-INTELLIGENCE-DESK-MEGA-001) ──────────────────────────
  {
    name: "تفکیکِ تصمیمِ انسانی از خرابیِ داده",
    defect: "«پیکربندی نشده» خرابیِ داده شمرده شود — تصمیمِ نگرفته نوارِ سلامت را قرمز می‌کند",
    file: "lib/desk/contracts.ts",
    from: 'return state === "stale" || state === "empty" || state === "unavailable";',
    to: 'return state !== "ready";',
    test: "lib/desk/contracts.test.ts",
  },
  {
    name: "خرابیِ داده بر حالتِ انسانی غالب است",
    defect: "«منتظرِ بازبینی» بالاتر از «در دسترس نیست» رتبه بگیرد — فیدِ مرده پنهان می‌شود",
    file: "lib/desk/contracts.ts",
    from: "  ready: 0,\n  awaiting_review: 1,",
    to: "  ready: 0,\n  awaiting_review: 9,",
    test: "lib/desk/contracts.test.ts",
  },
  {
    name: "سبدِ مرجع تا تصمیمِ مالک fail-closed می‌ماند",
    defect: "نبودِ نگاشتِ ابزار نادیده گرفته شود — سبد «آماده» به نظر می‌رسد",
    file: "lib/intelligence/reference-portfolio.ts",
    from: "  const missingInstruments = contract.sleeves.filter((s) => s.instruments.length === 0);",
    to: "  const missingInstruments: typeof contract.sleeves = [];",
    test: "lib/intelligence/reference-portfolio.test.ts",
  },
  {
    name: "یک نقطهٔ شروعِ داخلی",
    defect: "ریشهٔ ادمین دوباره صفحهٔ خانهٔ دوم شود",
    file: "app/(protected)/admin/page.tsx",
    from: 'redirect("/admin/desk");',
    to: 'redirect("/admin/overview");',
    test: "lib/desk/navigation.test.ts",
  },
  {
    name: "تریاژ خرابی را اول می‌گذارد",
    defect: "بازبینیِ انسانی قبل از خرابیِ داده پیشنهاد شود",
    file: "lib/intelligence/command-desk.ts",
    from: "  const firstLook = byFaultSeverity[0] ?? awaiting[0] ?? unconfigured[0] ?? null;",
    to: "  const firstLook = awaiting[0] ?? byFaultSeverity[0] ?? unconfigured[0] ?? null;",
    test: "lib/intelligence/command-desk.test.ts",
  },
  {
    name: "حذفِ تکرارِ شاهد با اثرِ انگشتِ محتوا",
    defect: "دو رکورد با یک contentHash دو شاهد شمرده شوند — رخدادِ ضعیف قوی جلوه می‌کند",
    file: "lib/intelligence/event-inbox.ts",
    from: "      if (seen.has(e.contentHash)) continue;",
    to: "      if (false) continue;",
    test: "lib/intelligence/event-inbox.test.ts",
  },
  {
    name: "پستِ خامِ شبکه مستندسازی نیست",
    defect: "پستِ تأییدنشدهٔ تلگرام/اینستاگرام رخداد را «مستند» کند",
    file: "lib/intelligence/event-inbox.ts",
    from: 'const SOCIAL_KINDS: readonly SourceKind[] = ["telegram", "instagram"];',
    to: "const SOCIAL_KINDS: readonly SourceKind[] = [];",
    test: "lib/intelligence/event-inbox.test.ts",
  },
  {
    name: "گزارهٔ بدونِ شاهد مانعِ انتشار است",
    defect: "گزارهٔ بی‌شاهد از گیتِ کیفیتِ شاهد رد شود",
    file: "lib/intelligence/analysis-memory.ts",
    from: "          ? `${unsupportedClaims} گزاره هنوز شاهد ندارد`",
    to: "          ? null",
    test: "lib/intelligence/analysis-memory.test.ts",
  },
  {
    name: "«بسته‌شده» و «باطل‌شده» یکی نمی‌شوند",
    defect: "نتیجهٔ باطل‌شده مثلِ بسته‌شده گزارش شود",
    file: "lib/intelligence/analysis-memory.ts",
    from: "  if (outcome) return outcome.kind;",
    to: '  if (outcome) return "closed";',
    test: "lib/intelligence/analysis-memory.test.ts",
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
