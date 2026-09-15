# میزِ تحلیل مدیریتی (#115) — چه چیزی قابل‌اجراست و چه چیزی نیست

## اندازه‌گیریِ زنده — نه فرض

پرس‌وجوی فقط‌خواندنیِ کاتالوگِ Production، ۲۰۲۶-۰۹-۱۵:

```sql
select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and (c.relname like '%intel%' or c.relname like '%event%' or c.relname like '%approval%');
-- → alert_events, portfolio_snapshots, portfolio_versions, portfolios
```

**هیچ جدولِ `intel_*` روی Production وجود ندارد.** `phase20` و `phase22` اجرا نشده‌اند و
پشتِ دروازهٔ بکاپ‌اند (بستهٔ `D` در `COMMAND-CENTER`). پس:

- این میز **امروز دادهٔ زنده ندارد** و نباید طوری معرفی شود که انگار دارد.
- مسیرِ کد اما **آماده و آزمودنی** است: نبودِ جدول به پیامِ صریح تبدیل می‌شود، نه به
  صفحهٔ خالی و نه به عددِ ساختگی. `board.test.ts` این را گارد می‌کند:
  `explainIntelligenceFailures(["missing_table"])` باید `phase22` را نام ببرد.
- `workflow.test.ts` خودِ فایلِ migration را گارد می‌کند که برای Production
  `NOT_APPLIED` برچسب خورده باشد.

## تصمیمِ merge که باید دیده شود

`#115` سه هفته از `main` عقب بود و در `lib/intelligence/admin-view.ts` با
`createAdminClient()` (service-role، دورزدنِ RLS) می‌خواند. `main` در این فاصله همان
مسیر را عمداً به **کلاینتِ نشست** برده بود و دو گاردِ صریح هم برایش گذاشته
(`prove-guards`: «میز دوباره RLS را دور بزند» و «مصرف‌کنندهٔ تأییدنشدهٔ سکرتِ سرور»).

گرفتنِ سمتِ `#115` یعنی پس‌گرفتنِ یک تصمیمِ امنیتی. پس **ساختارِ `#115` نگه داشته شد و
کلاینتِ `main`**: `loadAdminIntelligenceView` می‌ماند، ولی با `createClient()` از
`@/lib/supabase/server`. جدول‌های `intel_*` زیرِ `intel_admin_all` هستند
(`FOR ALL TO authenticated` با شرطِ ادمین)، پس نشستِ ادمین همان دسترسی را دارد و چیزی
از دست نمی‌رود. سودِ جانبی: روی محیطی که کلیدِ service-role ندارد، این RSC دیگر پرتاب
نمی‌کند.

همین منطق در `app/api/admin/desk/route.ts` هم اعمال شد: مفهومِ `filter` از `#115`
(تا «آخرین اجرای موفق» با «آخرین اجرا» یکی نشود) نگه داشته شد، ولی روی کلاینتِ نشست.

## دسترسی

`app/(protected)/admin/layout.tsx` سمتِ سرور `profiles.role !== "admin"` را
`redirect("/dashboard")` می‌کند، و مسیرِ API هم گیتِ خودش را دارد. هیچ صفحه یا
اطلاعاتِ مدیریتی عمومی نشد.

## دادهٔ نمایشی

`lib/intelligence/staging-fixture.test.ts` فقط یک فایلِ SQLِ **staging** را گارد می‌کند و
از هیچ route یا کامپوننتی import نمی‌شود (بررسی‌شده). هیچ fixtureی در مسیرِ Production
نیست.

## آنچه آزموده نشد

نمای واقعیِ صفحه: ورود به `/admin/intelligence` اعتبارنامهٔ ادمین می‌خواهد که در محیطِ
عامل نیست. پس **عکسی از این صفحه تحویل نشده** و ادعای «دیدم که درست است» هم نشده.
آنچه اثبات شد: typecheck، lint، ۸۰۱ تستِ `test:core`، build، و هر ۳۲ گاردِ
`prove-guards` که با تزریقِ نقص قرمز می‌شوند.
