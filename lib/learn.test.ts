import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { LESSONS, publishedLessons, hasPublishedLessons, getLesson } from "@/lib/learn";

/**
 * گاردِ صداقتِ ناحیهٔ یادگیری — `B-028` / `P2-G2-010`.
 *
 * قاعده: سرفصلِ بی‌متن **حذف نمی‌شود**، ولی مثلِ محتوای در دسترس هم رفتار
 * نمی‌کند. کارتِ کلیک‌پذیری که به صفحهٔ خالی می‌رسد — حتی با برچسبِ «به‌زودی» —
 * در عمل خوانده می‌شود «محتوا آماده است».
 *
 * این تست **نمی‌گوید** دروس باید منتشر نشوند؛ انتشار تصمیمِ آرش است. فقط
 * می‌گوید هر وضعیتی که هست، نمایش با آن بخوانَد.
 */

const ROOT = process.cwd();
const LIST_PAGE = readFileSync(join(ROOT, "app", "learn", "page.tsx"), "utf8");
const DETAIL_PAGE = readFileSync(join(ROOT, "app", "learn", "[slug]", "page.tsx"), "utf8");

test("هیچ سرفصلی حذف نشده — پیش‌نویس‌ها سرِ جایشان‌اند", () => {
  for (const slug of ["what-is-the-market", "how-to-read-a-symbol", "fundamentals-simple", "funds-the-simple-way", "risk-and-portfolio", "compass-guide"]) {
    assert.ok(getLesson(slug), `سرفصل اصلی حفظ شود: ${slug}`);
    assert.equal(getLesson(slug)?.published, false, "درس قبلی بدون متن منتشر نشود");
  }
  for (const l of LESSONS) {
    assert.ok(l.slug && l.title && l.summary, `سرفصلِ ناقص: ${l.slug}`);
  }
});

test("تنها درس کامل جدید منتشر است و به ابزار موجود وصل می‌شود", () => {
  assert.deepEqual(publishedLessons().map(l => l.slug), ["assets-debts-net-worth"]);
  const lesson = getLesson("assets-debts-net-worth")!;
  assert.ok(lesson.content && lesson.content.sections.length >= 3);
  assert.ok(lesson.content.selfCheck.question && lesson.content.selfCheck.answer);
  assert.deepEqual(lesson.content.tools.map(t => t.href), ["/dashboard/holdings", "/dashboard/holdings#debt-editor"]);
  assert.ok(readFileSync(join(ROOT, "app", "(protected)", "dashboard", "holdings", "page.tsx"), "utf8").includes('id="debt-editor"'));
  assert.match(DETAIL_PAGE, /lesson\.published && lesson\.content/);
  assert.match(DETAIL_PAGE, /<details/);
});

test("مثال تومان به سهم مالکیت و ماندهٔ بدهی متکی است، نه قسط تکراری", async () => {
  const { netWorthExample: e, netWorthContent } = await import("@/lib/learn/net-worth");
  const { formatToman } = await import("@/lib/format");
  const total = e.cashToman + e.vehicleToman * e.ownershipPercent / 100;
  assert.equal(total, 120_000_000);
  assert.equal(total - e.debtToman, 80_000_000);
  const text = netWorthContent.sections.flatMap(s => s.paragraphs).join("\n");
  assert.ok(text.includes(formatToman(total)));
  assert.ok(text.includes(formatToman(total - e.debtToman)));
  assert.ok(!text.includes(formatToman(total - e.debtToman - e.nextInstallmentToman)));
  assert.match(text, /بهره یا کارمزد ندارد/);
  assert.match(text, /بهره و کارمزد را از اصل بدهی تفکیک/);
  assert.match(text, /نامشخص/);
  assert.match(text, /جزئی/);
  assert.match(text, /صفر نکنید/);
  assert.equal(new URL(netWorthContent.sources[0].href).hostname, "www.investor.gov");
});

test("صفحهٔ واقعی درس متن، پاسخ و مسیر ابزار را رندر می‌کند؛ پیش‌نویس متن کامل ندارد", async () => {
  const pageModule = { exports: {} as {
    default: (props: { params: Promise<{ slug: string }> }) => Promise<ReactNode>;
    generateStaticParams: () => { slug: string }[];
  } };
  const imports: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime,
    "next/link": (props: { href: string; children: ReactNode }) => createElement("a", props),
    "next/navigation": { notFound: () => { throw new Error("not-found"); } },
    "@/components/layout/Navbar": () => null,
    "@/components/layout/Footer": () => null,
    "@/lib/learn": { LESSONS, getLesson },
    "@/lib/glossary": { getTerm: () => null },
  };
  runInNewContext(ts.transpileModule(DETAIL_PAGE, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, {
    module: pageModule, exports: pageModule.exports,
    require: (id: string) => { if (!(id in imports)) throw new Error(`Unexpected dependency: ${id}`); return imports[id]; },
  });
  const html = renderToStaticMarkup(await pageModule.exports.default({ params: Promise.resolve({ slug: "assets-debts-net-worth" }) }));
  assert.match(html, /دارایی، بدهی و خالص ثروت/);
  assert.match(html, /۸۰٬۰۰۰٬۰۰۰ تومان/);
  assert.match(html, /<details/);
  assert.match(html, /href="\/dashboard\/holdings#debt-editor"/);
  assert.match(html, /href="https:\/\/www.investor.gov\//);
  assert.doesNotMatch(html, /متن کامل این درس به‌زودی/);
  assert.ok(pageModule.exports.generateStaticParams().some(p => p.slug === "assets-debts-net-worth"));
  const draft = renderToStaticMarkup(await pageModule.exports.default({ params: Promise.resolve({ slug: "what-is-the-market" }) }));
  assert.match(draft, /متن کامل این درس به‌زودی/);
  assert.doesNotMatch(draft, /aria-label="متن درس"/);
  await assert.rejects(pageModule.exports.default({ params: Promise.resolve({ slug: "no-such-lesson" }) }), /not-found/);
});

test("publishedLessons دقیقاً همان‌هایی است که published دارند", () => {
  assert.deepEqual(
    publishedLessons().map((l) => l.slug),
    LESSONS.filter((l) => l.published).map((l) => l.slug)
  );
  assert.equal(hasPublishedLessons(), LESSONS.some((l) => l.published));
});

test("صفحهٔ فهرست فقط درسِ منتشرشده را لینک می‌کند", () => {
  // شرطِ لینک باید به `l.published` گره خورده باشد، نه بی‌قید.
  assert.match(
    LIST_PAGE,
    /l\.published\s*\?\s*\(\s*<Link/,
    "کارت باید فقط وقتی `published` است به <Link> تبدیل شود"
  );
  assert.match(LIST_PAGE, /aria-disabled="true"/, "کارتِ منتشرنشده باید صریحاً غیرفعال علامت بخورد");
});

test("درسِ منتشرنشده ایندکس نمی‌شود", () => {
  assert.match(
    DETAIL_PAGE,
    /robots:\s*lesson\.published\s*\?\s*undefined\s*:\s*\{\s*index:\s*false/,
    "صفحهٔ درسِ منتشرنشده باید noindex باشد"
  );
});

test("وقتی هیچ درسی منتشر نشده، متنِ سکشن این را صریح می‌گوید", () => {
  if (hasPublishedLessons()) return; // با انتشار، این بند بی‌موضوع می‌شود
  assert.match(LIST_PAGE, /هنوز هیچ درسی منتشر نشده/);
  assert.match(LIST_PAGE, /!hasPublishedLessons\(\)/, "متن باید به وضعیتِ واقعی گره خورده باشد، نه ثابت");
});

test("مسیرِ درس هنوز کار می‌کند — چیزی پاک نشده", () => {
  for (const l of LESSONS) {
    assert.ok(getLesson(l.slug), `درسِ ${l.slug} باید هنوز قابلِ بازیابی باشد`);
  }
  assert.equal(getLesson("no-such-lesson"), null);
});
