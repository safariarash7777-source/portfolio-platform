# NEXT-06 — خانهٔ عضو؛ گزارش اجرای مستقل

تاریخ: 2026-10-01، Asia/Tehran. دستور: NEXT-06.md و NEXT-06-ACTIVATION-20261001.md در checkout جهت محصول، با DD-033 مقدم بر DD-032. وضعیت: پیاده‌سازی موجود قابل بازبینی؛ **پذیرش کامل NEXT06 باز است**. این فایل و مرز مالکیت قبل از ویرایش صفحات ثبت شدند. محیط #173 و گیت انسانی آن حفظ شده‌اند.

## پایه و بررسی کار موازی

شاخه `codex/next-06-member-home-20261001` در worktree `portfolio-next-06` از snapshot ثابت `1d409325f01b2b8f247dffb411b1b10f650b88cf` ساخته شد. این snapshot ترکیب بازبینی FOLLOWUP06 است، نه ادغام main یا نسخهٔ پذیرفته‌شده. شامل #168=`15eebc9`، #173=`6787005`، #175=`bb7c2f9`، #177=`27e59ad`، #176=`d697635` و #174=`95cfa34` است. headهای API04/پوسته05/انتشار08 و #173 از GitHub بازخوانی شدند. PR و فایل اجرایی دیگری برای NEXT06 در PRهای باز، checkoutها و چت‌های فعال پیدا نشد. کار FOLLOWUP06 تجمیع و کار Auth/طراحی مستقل است؛ فایل‌های آن‌ها بازنویسی نمی‌شوند. base نهایی PR و SHA اجرایی پس از ساخت ثبت خواهند شد.

## مالکیت فایل‌ها پیش از تغییر

- `app/(protected)/dashboard/page.tsx`: خانهٔ عضو با خلاصهٔ مالی موجود و دوره‌ها.
- `app/(protected)/dashboard/portfolio/page.tsx`: انتقال نمای قبلی مدیریت سبد، با حفظ DashboardClient و داده/مسیرهای شخصی آن.
- `components/member/*`: تعامل انتخاب دوره، نیازسنجی، وبینار و منابع، بدون تغییر پوسته/توکن/فونت.
- `lib/member/*`: adapter و اعتبارسنجی DTO موجود، گروه‌بندی نمایشی grantها و آزمون رفتار؛ مرجع مجوز همان API04 است.
- `package.json`: فقط ثبت آزمون‌های مرتبط در script موجود، بدون وابستگی تازه.
- همین گزارش و `docs/assets/member-home/*`: شواهد پاک‌سازی‌شده و محدودیت‌های پذیرش.
- `app/member-home-preview/page.tsx` و `lib/member/fixture.ts`: نمونهٔ صریح و محلی اجزای همین محصول، غیرفعال به‌صورت پیش‌فرض؛ fixture شاهد Auth/Storage نیست.
- الحاقیه قبل از اتصال Auth: `components/member/ProfileStatus.tsx` و `lib/member/profile.ts` فقط مصرف read-only DTO اعلام‌شدهٔ مالک PR180 و پیوند به صفحهٔ همان مالک؛ بدون فرم هویتی، writer یا endpoint جدید. آزمون guard وضعیت به `lib/member/home.test.ts` افزوده می‌شود.

Navbar/Footer/globals/brand/format/Auth/مدل مالی و جداول ledger متعلق به مالک‌های فعلی‌اند و در دامنهٔ ویرایش این بسته قرار ندارند. تغییر احتمالی مرز فایل بعداً صریح در همین گزارش ثبت می‌شود.

## قراردادهای مصرف‌شده و خلأهای اولیه

API04 seasonal.v0.1: me/cohorts projection هر grant، module-access مرجع مجوز، cohort metadata عمومی، needs-assessment چهار فیلد/نسخه، webinar join فقط در درخواست مجاز، resources لیست RLS و URL کوتاه‌عمر. نسخه‌های مختلف یک cohort فقط برای نمایش گروه‌بندی می‌شوند؛ از moduleKeys یا نقش، مجوز استنتاج نمی‌شود. پایان از API خوانده می‌شود و قاعدهٔ سه‌ماه D-034 تعیین نمی‌شود.

#173: loadPortfolioSnapshot/loadVersionDebts/buildBalanceSheet/BalanceSheetSummary با همان UUID نشست؛ انقضای دوره، دادهٔ مالی را حذف یا مخفی نمی‌کند. #177: اجزای Navbar/Footer، کلاس‌های card/input/btn و مسیر درخواست مشاوره. #174: `/dashboard/market/:module?cohort=uuid` با کنترل سرور. #176: GET `/api/publications/:versionId` محتوای مجاز را باز می‌کند، اما در نسخهٔ بررسی‌شده **فهرست publication مجاز عضو و قرارداد خوانده‌نشده/mark-read وجود ندارد**؛ endpoint ادمین list قابل مصرف عضو نیست. اعلان مقصددار cohort هنوز مالک NEXT09 است. این خلأ با مدل انتشار/notification یا شرط امنیتی کلاینتی جبران نمی‌شود؛ منابع تازهٔ RLS از قرارداد04 نمایش داده می‌شوند و اتصال feed08/read-state تا قرارداد مالک مربوط باز می‌ماند.

قرارداد نهایی Auth مالک PR180 از `AUTH-API-CONTRACT-v1.md` خوانده شد؛ کد اعلام‌شده `05d5ae63f424c556656de2fd267e7ab0d32a4407` و head محلی مستندات `bb4f2f3e53859bbecb0ec942975ffb06fd2d2828` است. GET `/api/auth/identity` با DTO `auth.identity.v1` فقط به وضعیت recorded/incomplete/phoneVerified/version و pending رسمی projection می‌شود؛ نام، کدملی و contact در state خانه نگه‌داری یا نمایش داده نمی‌شوند. پیوند تکمیل/اصلاح به صفحهٔ مالک `/account/mobile?next=...` است. نصب‌نشده404، نیاز ورود401، خطای503/شبکه و دادهٔ معتبر خالی جدا هستند؛ دادهٔ ناقص، مجوز دوره یا نیازسنجی را تعیین نمی‌کند. فرم هویتی، writer، OTP یا account-link تازه ساخته نشد. در پایهٔ ثابت PR181 endpoint180 نصب نیست؛ UI صریحاً اتصال‌نداشتن را نشان می‌دهد و هیچ redirect اجباری نمی‌کند. DD-033 و حفظ ورود ایمیل رعایت شد. پذیرش اتصال واقعی identity180 پس از تجمیع با مالک Auth باز است؛ 503 قرارداد فعلی علت ماشینی disabled در برابر unavailable ندارد و نباید از متن error حدس زده شود.

## ابزار و پذیرش

مهارت Next.js و React best practices برای Server/Client boundary، params/searchParams async، خواندن مستقل موازی و بررسی TSX خوانده شدند. Supabase و computer-use برای بررسی قرارداد/دسترسی و پذیرش محلی استفاده خواهند شد؛ اجرای واقعی و نتیجه جدا ثبت می‌شود. برند و RTL موجود بر توصیه‌های عمومی مقدم‌اند. آزمون fixture جای Auth/Storage واقعی نیست. هیچ migration مشترک، پیام واقعی، merge یا Production مجاز/انجام‌شده نیست.

## قرارداد حداقلی پیشنهادی feed08؛ اجرا نشده و نیازمند تعیین مالک backend

جست‌وجو در کد #176 و پایهٔ ترکیبی انجام شد. `list_research_publications()` در `20260930182918_research_publication_queue.sql` کنترل admin دارد و فهرست داخلی است. `read_research_publication(version)` محتوای تأییدشده و published جاری را با audience و `seasonal_module_access('resources', cohort)` بررسی می‌کند. مسیر موجود `/api/publications/:versionId` برای detail است. اعلان‌های قدیمی `announcement_deliveries` و `mark_announcement_seen(uuid)` بر UUID اعلان کار می‌کنند و نگاشت publication-version/cohort ندارند. پیشنهاد NEXT01 برای فهرست cohort در #175/#176 پیاده نشده است؛ منبع تازه04 را publication خوانده‌نشده نام‌گذاری نکردیم.

پیشنهاد برای توافق مالک انتشار08، API04 و اعلان09:

- `GET /api/cohorts/:id/publications?cursor=...`: نشست واقعی، مجوز فعلی resources همان cohort و predicate canonical انتشار؛ فقط نسخهٔ جاری published و تحقیق هنوز approved. DTO پیشنهادی versionId، title، summary، publishedAt، sources مجاز، detailHref محلی، readAt/hasBeenRead و nextCursor؛ page-size محدود و ترتیب پایدار. بدنهٔ داخلی، یادداشت خصوصی و UUID صاحب پرونده وارد feed نمی‌شود.
- `POST /api/publications/:versionId/read`: بعد از همان کنترل دسترسی detail، ثبت idempotent خواندن برای `auth.uid()` و همان نسخه. ارسال اعلان/بازکردن فهرست، خواندن تلقی نمی‌شود؛ اصلاح محتوا با نسخهٔ جدید دوباره خوانده‌نشده است. table احتمالی `research_publication_reads` تنها پس از بررسی نبود نگاشت دقیق موجود و با RLS مالک، بدون حساب/grant/notification موازی.
- لغو/انقضا/لغو دوره و پس‌گرفتن تأیید تحقیق در درخواست بعدی به list/detail/read اعمال شود. خطای سرویس 503 از deny و فهرست خالی جدا باشد. cursor نامعتبر، cohort بیگانه، نسخهٔ قدیمی و replay آزموده شوند. مرجع مجوز و allowlist detail/list مشترک بماند؛ شرط کلاینتی جای RLS نیست.
- مالک backend باید `lib/intelligence/publication-server.ts` و HTTP adapter مربوط، `app/api/cohorts/[id]/publications/route.ts`، `app/api/publications/[id]/read/route.ts` و migration/آزمون publication را بررسی و مالکیت دقیق را اعلام کند. مصرف UI در `components/member` متعلق به NEXT06 است. هیچ‌یک از این endpointها یا table پیشنهادی در این PR ساخته نشده‌اند.

قرارداد profile/onboarding دریافت و مصرف read-only آن ساخته شد؛ نصب endpoint/صفحهٔ PR180 در پایهٔ integration هنوز لازم است. حفظ ورودی و writer نسخه‌دار فرم هویتی متعلق به همان مالک است. قاعدهٔ سه‌ماه D-034 باز است؛ فقط `startsAt/endsAtExclusive` واقعی API نمایش داده می‌شود.

## تحویل مسیر به مالک integration

`/dashboard` خانهٔ عضو است؛ نمای قبلی داده/هدف/سبد با همان `DashboardClient` و loaderها به `/dashboard/portfolio` منتقل شد و لینک آن در خانه وجود دارد. لینک‌های مستقیم holdings، consultation و market تغییر نکرده‌اند. middleware و accountEntryHref مقصد محلی به‌همراه query/hash را حفظ می‌کنند؛ مسیر تازه portfolio و انتخاب cohort در آزمون return-path پوشش داده شدند. مالک integration باید در لینک‌هایی که منظورشان مدیریت قبلی سبد است `/dashboard/portfolio` را مقصد کند؛ لینک عمومی «خانهٔ من» همچنان `/dashboard` است. هیچ مسیری حذف یا endpoint مالی تازه ساخته نشده است.

انتخاب دوره عمداً ناوبری کامل سند دارد تا نشست، خلاصهٔ SSR و cohort تازه دوباره خوانده شوند؛ پیش‌نویس آموزشی در sessionStorage مختص account/cohort باقی می‌ماند. در build محلی پشت gateway، کلیک Link پاسخ RSC 200 داشت ولی URL ثابت ماند؛ علت کامل RSC تعیین نشده و تغییر به ناوبری سند در محدودهٔ این component انجام شد. این یافته به‌عنوان ایراد Production یا Auth جدید گزارش نمی‌شود؛ مسیرهای مشترک خارج از این محدوده باید در پذیرش integration بازبینی شوند.

## تحویل قابل بازبینی

- [PR181](https://github.com/safariarash7777-source/portfolio-platform/pull/181)، Draft/Open، بدون merge یا Production.
- base بازبینی `codex/next-06-review-base-20261001@1d409325f01b2b8f247dffb411b1b10f650b88cf` است. شاخهٔ base صرفاً کپی snapshot اعلام‌شده است؛ FOLLOWUP06 یا PRهای مالک تغییر نکرده‌اند. مالک integration می‌تواند commitهای بعد از این base را منتقل کند؛ مهاجرت یا merge main انجام نشده است.
- آخرین کد اجرایی `6ffce1b00eb6ee87a788a099a181c16c87549243`؛ commit بعدی تنها گزارش و شواهد دارد. SHA نهایی PR و CI دقیق همان head از GitHub خوانده می‌شوند. اجرای اولیهٔ CI پنج job سبز بود؛ نتیجهٔ اولیه جای بررسی head نهایی نیست.
- اسناد و شواهد فقط در همین بسته‌اند. Blueprint، اسناد مرکزی، Navbar/Footer/فونت/برند، فایل‌های مالک Auth و محیط #173 ویرایش نشدند.

## پذیرش و حد واقعی شواهد

| سناریو | نتیجه و شاهد |
|---|---|
| دو دورهٔ هم‌پوشان، مجوز هر ماژول، source/end/Tehran | PASS؛ API04 واقعی، guard DTO و انتخاب صریح cohort؛ هیچ union کلاینتی برای اجازه ساخته نشد. انتخاب دوره در build نهایی سند کامل را بارگذاری می‌کند. |
| دو مشتری با محتوا و مالی جدا | PASS؛ GoTrue واقعی A/B، B فقط منبع B و cohort خودش را دید. لینک مستقیم A برای B هشدار عضویت دارد؛ فایل و مالی A دیده نشد. `real-member-B*.txt/png` و `real-http.json`. |
| نقش admin به‌تنهایی، انقضا و لغو | PASS برای کنترل دسترسی؛ admin بدون grant مجوز module ندارد. انقضای واقعی و revoke canonical در درخواست بعدی لیست/صدور را می‌بندند؛ cohort مستقل B باقی است. `real-expired*`، `real-revoked*`، `real-revocation.json`. |
| ذخیره/ادامه/تعارض نیازسنجی | PASS؛ چهار فیلد موجود، GET/POST واقعی، 409، حفظ متن و دریافت مبنای تازه؛ نسخه‌های A در cohort A از1تا8 باقی‌اند. پیش‌نویس فقط همان account/cohort در sessionStorage تا2ساعت؛ تعویض دوره، متن A را به B نداد و بازگشت آن را بازیابی کرد. فیلد مالی/هویتی تازه یا ارسال LLM ندارد. |
| ورود و مسیرهای قبلی | PASS؛ ورود واقعی A/B/A با next همان cohort؛ لینک خانه→portfolio→خانه کار کرد. DashboardClient/loaderهای قبلی و مسیرهای holdings/consultation/market حفظ شدند. پایان نشست در sandbox دوباره login با همان next را نشان داد. |
| مالی و UUID پس از دوره | PASS؛ همان loader/#173/RPC با UUID واقعی Auth. اظهار2000تومان با مالکیت50٪→1000؛ دارایی بی‌قیمت در پرونده؛ بدهی1500→خالص جزئی−500. A دو نسخهٔ مالی دارد، B هیچ نسخهٔ A را نمی‌خواند. در انقضا/revoke مالی و پاسخ‌ها باقی‌اند. `real-environment.json` و تصاویر واقعی. این شاهد تازه جای گیت انسانی #173 نیست. |
| Storage خصوصی | PASS محلی واقعی؛ Storage API، volume اختصاصی و bucket خصوصی، RLS فعال، فایل مصنوعی36byte و لینک60ثانیه‌ای؛ B امضای مستقیم فایل A را نگرفت. مسیر gateway صرفاً transport است و پاسخ GoTrue/PostgREST/Storage را جعل نمی‌کند. policy نهاییِ بدون تغییر migration04 بعد از ایجاد schema واقعی Storage نصب شد. |
| موبایل، خطا، برنامه و نبود محتوا | PASS محدودهٔ رابط؛ 390px بدون overflow، متن و وضعیت خطا از empty جدا. قبل/حین/بعد، scheduled/cancelled/never/empty/save-error با fixture صریح و آزمون؛ انقضا و revoke علاوه بر fixture با backend واقعی. fixture شاهد فراهم‌کنندهٔ وبینار یا ارسال واقعی نیست. |
| پروفایل مشترک180 | PASS adapter/16 آزمون member و وضعیت نبود نصب در runtime نهایی؛ مسیر/DTO از مالک دریافت شد، فرم مالک تکرار نشد. نصب180 و سناریوی واقعی phone/identity در تجمیع **OPEN**. هیچ تأیید کلی هویت ادعا نشده است. |
| publication08/read-state و اعلان09 | **BLOCKED برای پذیرش کامل**؛ detail08 موجود است ولی فهرست عضو/read-state غایب است؛ پیشنهاد و فایل‌های مالک در همین گزارش. منابع تازه04 به‌عنوان publication خوانده‌نشده معرفی نشده‌اند. |

آزمون‌های محلی: 1255 core (شامل16member)، 5seasonal، typecheck، lint کامل، production build، secret scan و diff-check موفق‌اند. 22سناریوی HTTP/Auth/RLS/Storage روی کد `9bd5945` و سناریوهای revoke پس از آن انجام شدند. پس از افزودن read-only profile، کنترل مجوز/UUID/history با سه حساب روی کد نهایی دوباره اجرا شد؛ `real-final-read.json` فاصلهٔ SHAها و نبود تغییر backend را صریح ثبت می‌کند. assertion ناموفق قدیمی یا تلاش مرورگر، PASS نهایی محسوب نشده است.

## محیط بازبینی و محدودیت‌ها

محیط مستقل `member06-local` در `http://127.0.0.1:3500` با Next3480، network/DB/Auth/REST/Storage و volumeهای prefix member06 است. سه حساب و همه داده‌ها مصنوعی‌اند؛ initial auth.users=0، بدون backup دادهٔ واقعی و بدون mock auth bootstrap. کلیدها/گذرواژه‌ها در مسیر خصوصی ACL محدود خارج Git هستند؛ هیچ توکن یا URL امضاشده در شواهد ذخیره نشده است. egress خارجی اپ قطع است و endpoint LLM/SMTP/SMS تنظیم نشده. فایل‌ها فقط با service-role محلی ابزار پذیرش بارگذاری شدند؛ اپ کلید server ندارد. راهنمای پایهٔ Storage از [compose رسمی Supabase](https://raw.githubusercontent.com/supabase/supabase/master/docker/docker-compose.yml) تطبیق شد؛ image نصب‌شده با digest در manifest ثبت است، نه ادعای نصب آخرین نسخه.

مرورگر CUA تنها ابزار تعامل UI بود؛ lint/test/build و API آزمون از CLI جدا بودند. نمونه‌های `fixture-*` متعلق به preview صریح و SHA اولیه‌اند؛ پیش‌نمایش در build واقعی نهایی404 است. تصاویر `real-*` و `real-final-read.json` شاهد اتصال واقعی محلی‌اند. برای بازتولید، همان migrationهای hashدار manifest را روی DB تازه با Storage واقعی نصب، حساب‌های تأییدشدهٔ GoTrue مصنوعی و cohort/grantهای مصنوعی را ایجاد کنید؛ سپس API canonical نیازسنجی، مالی، module-access و resource issuance را با cookie واقعی SSR اجرا کنید. فرمان‌های اجرا: `node node_modules/tsx/dist/cli.mjs --test lib/member/home.test.ts`، scriptهای `test:core`/`test:seasonal`، `tsc --noEmit`، `eslint . --max-warnings=0` و build؛ تنظیمات خصوصی محلی وارد repository نشده‌اند.

محدودیت API04 مشاهده‌شده برای مالک آن: admin برای عملیات، metadata resource را طبق RLSadmin می‌خواند، ولی Storage بدون grant فایل صادر نمی‌کند؛ route فعلی خطای Storage را503 برمی‌گرداند، نه403. همچنین `/api/me/cohorts` بی‌نشست503 می‌دهد چون adapter موجود AuthSessionMissingError را خطای سرویس می‌گیرد؛ داده‌ای افشا نشد و صفحهٔ protected به login صحیح می‌رود. اصلاح طبقه‌بندی این دو خطا باید با مالک04/Auth انجام شود؛ این بسته server آن‌ها را تغییر نداده است. retry503 در خانه آن را «نداشتن عضویت» تعبیر نمی‌کند.

لینک امضاشدهٔ قبلاً صادرشده تا TTL60ثانیه capability است؛ لغو مجوز صدور بعدی را می‌بندد، ولی بایت‌های دانلودشده یا URL پیشین فوراً پس گرفته نمی‌شوند. لینک provider فقط به محیط مصنوعی اشاره دارد؛ سرویس واقعی برگزاری، OTP/SMTP، شاهکار/ثبت‌احوال و فعال‌سازی180 در این PR آزموده/منتشر نشده‌اند. D-034، تعیین backend feed/read-state، اتصال09 و گیت‌های انسانی DEV07/#173 و پذیرش مشترک10 بازند. موفقیت فنی محلی/CI اجازهٔ merge یا انتشار نمی‌دهد.
