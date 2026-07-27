# Findings — P2

هر ادعا برچسبِ `VERIFIED` / `INFERRED` / `UNKNOWN` دارد. فرضیه‌های ردشده هم می‌مانند.

## F-01 · محیطِ اجرا، rehearsal محلیِ Supabase را پشتیبانی نمی‌کند — VERIFIED
`supabase/` وجود ندارد، CLI نصب نیست، و **daemonِ Docker در دسترس نیست** (باینری هست).
→ معیارِ پذیرشِ «clean local apply» در B2 در این محیط **دست‌نیافتنی** است. باید صریح
`BLOCKED` گزارش شود، نه تقلبی سبز.

## F-02 · Phase G با قانونِ سختِ مخزن تصادف دارد — VERIFIED
`CLAUDE.md:12` واژهٔ «توصیه» را در هر خروجی ممنوع می‌کند؛ schemaِ Phase G فیلدی به نامِ
`recommended action` دارد. `CLAUDE.md:14` می‌گوید عددِ خامِ مالی هرگز به LLM نرود؛
Phase G تحلیلِ ایجنت روی دادهٔ بازار می‌خواهد. `lib/core/vocab.test.ts` قانون را
اجبار می‌کند. → طراحی باید پیش از کدنویسی اصلاح شود.

## F-03 · B-021 رفع شد، با اثباتِ رفتاری — VERIFIED
`app/layout.tsx:2` از `next/font/google` می‌آمد. با محیطِ تمیزِ `env -i` (بدونِ پراکسی):
- قبل: ``Failed to fetch `Vazirmatn` from Google Fonts`` → exit 1
- بعد: `✓ Compiled successfully` → exit 0
فونت از انتشارِ رسمیِ npm (`vazirmatn@33.0.3`، SIL OFL) گرفته شد و **به‌عنوانِ asset**
وارد شد، نه وابستگی — چون `B-023` هنوز باز است.

## F-04 · ادعای «B-015 بسته شد» نادرست بود — VERIFIED، تصحیح شد
P1-010 آن را CLOSED علامت زده بود. ولی افزودنِ workflow ≠ اجباری‌شدنِ آن؛ امروز یک PRِ
قرمز هم قابلِ merge است. ردیف به **OPEN** برگردانده شد.

## F-05 · سرورِ GitHub MCP ابزارِ branch protection ندارد — VERIFIED
جست‌وجو فقط `create_branch`، `create_repository`، `fork_repository`،
`list_repository_collaborators`، `update_pull_request_branch` را برمی‌گرداند. هیچ
دسترسی‌ای به `/branches/{branch}/protection`. → runbookِ دستی نوشته شد.

## F-06 · دامنهٔ واقعیِ ریسکِ xlsx کوچک‌تر از ظاهرش است — VERIFIED
تنها مصرف‌کننده: `app/api/admin/fx/seeds/route.ts` → `lib/fx/excelParse.ts`. مسیر
**فقط‌ادمین**. بردارِ حمله «هر کاربرِ اینترنتی» نیست. ریسک را کم می‌کند، صفر نمی‌کند.

## F-07 · پراکسی اکثر هاست‌ها را می‌بندد — VERIFIED
`cdn.jsdelivr.net` و `mcp.vercel.com` با 403 CONNECT رد شدند. ولی `registry.npmjs.org`
در `noProxy` است. → هر artifactِ بیرونی باید از npm بیاید. **این یعنی گزینهٔ (الف) در
ADR-004 (نصبِ xlsx از CDNِ SheetJS) در این محیط اجرانشدنی است.**

## فرضیه‌های ردشده

### R-01 · «شکستِ Vercel از `import.meta.dirname` و نسخهٔ Node است» — رد شد
در P1-011 فرضیه دادم، اصلاحش کردم و push زدم؛ **Vercel باز هم قرمز شد**. bisect نشان
داد علت، درختِ وابستگیِ ESLint است (۲۳۲ → ۵۰۷ بسته). علتِ دقیقِ سمتِ Vercel هنوز
`UNKNOWN` است چون لاگ خوانده نشده.
