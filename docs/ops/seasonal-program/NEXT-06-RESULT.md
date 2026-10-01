# NEXT-06 — خانهٔ عضو؛ گزارش اجرای مستقل

تاریخ شروع: 2026-10-01، Asia/Tehran. دستور: NEXT-06.md و NEXT-06-ACTIVATION-20261001.md در checkout جهت محصول، با DD-033 مقدم بر DD-032. وضعیت: در حال اجرا؛ این فایل قبل از ویرایش صفحات ثبت شد. محیط #173 و گیت انسانی آن حفظ می‌شوند.

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

Navbar/Footer/globals/brand/format/Auth/مدل مالی و جداول ledger متعلق به مالک‌های فعلی‌اند و در دامنهٔ ویرایش این بسته قرار ندارند. تغییر احتمالی مرز فایل بعداً صریح در همین گزارش ثبت می‌شود.

## قراردادهای مصرف‌شده و خلأهای اولیه

API04 seasonal.v0.1: me/cohorts projection هر grant، module-access مرجع مجوز، cohort metadata عمومی، needs-assessment چهار فیلد/نسخه، webinar join فقط در درخواست مجاز، resources لیست RLS و URL کوتاه‌عمر. نسخه‌های مختلف یک cohort فقط برای نمایش گروه‌بندی می‌شوند؛ از moduleKeys یا نقش، مجوز استنتاج نمی‌شود. پایان از API خوانده می‌شود و قاعدهٔ سه‌ماه D-034 تعیین نمی‌شود.

#173: loadPortfolioSnapshot/loadVersionDebts/buildBalanceSheet/BalanceSheetSummary با همان UUID نشست؛ انقضای دوره، دادهٔ مالی را حذف یا مخفی نمی‌کند. #177: اجزای Navbar/Footer، کلاس‌های card/input/btn و مسیر درخواست مشاوره. #174: `/dashboard/market/:module?cohort=uuid` با کنترل سرور. #176: GET `/api/publications/:versionId` محتوای مجاز را باز می‌کند، اما در نسخهٔ بررسی‌شده **فهرست publication مجاز عضو و قرارداد خوانده‌نشده/mark-read وجود ندارد**؛ endpoint ادمین list قابل مصرف عضو نیست. اعلان مقصددار cohort هنوز مالک NEXT09 است. این خلأ با مدل انتشار/notification یا شرط امنیتی کلاینتی جبران نمی‌شود؛ منابع تازهٔ RLS از قرارداد04 نمایش داده می‌شوند و اتصال feed08/read-state تا قرارداد مالک مربوط باز می‌ماند.

Auth مشترک در حال تکمیل است. خانه فقط نشست معتبر createClient/getUser و همان login/next را مصرف می‌کند؛ شماره/کدملی/OTP یا account-link جدید نمی‌سازد. DD-033 حفظ ایمیل و موبایل را الزامی می‌کند؛ نبود endpoint نهایی profile/onboarding در پایه، به‌عنوان وابستگی دقیق گزارش می‌شود.

## ابزار و پذیرش

مهارت Next.js و React best practices برای Server/Client boundary، params/searchParams async، خواندن مستقل موازی و بررسی TSX خوانده شدند. Supabase و computer-use برای بررسی قرارداد/دسترسی و پذیرش محلی استفاده خواهند شد؛ اجرای واقعی و نتیجه جدا ثبت می‌شود. برند و RTL موجود بر توصیه‌های عمومی مقدم‌اند. آزمون fixture جای Auth/Storage واقعی نیست. هیچ migration مشترک، پیام واقعی، merge یا Production مجاز/انجام‌شده نیست.

## قرارداد حداقلی پیشنهادی feed08؛ اجرا نشده و نیازمند تعیین مالک backend

جست‌وجو در کد #176 و پایهٔ ترکیبی انجام شد. `list_research_publications()` در `20260930182918_research_publication_queue.sql` کنترل admin دارد و فهرست داخلی است. `read_research_publication(version)` محتوای تأییدشده و published جاری را با audience و `seasonal_module_access('resources', cohort)` بررسی می‌کند. مسیر موجود `/api/publications/:versionId` برای detail است. اعلان‌های قدیمی `announcement_deliveries` و `mark_announcement_seen(uuid)` بر UUID اعلان کار می‌کنند و نگاشت publication-version/cohort ندارند. پیشنهاد NEXT01 برای فهرست cohort در #175/#176 پیاده نشده است؛ منبع تازه04 را publication خوانده‌نشده نام‌گذاری نکردیم.

پیشنهاد برای توافق مالک انتشار08، API04 و اعلان09:

- `GET /api/cohorts/:id/publications?cursor=...`: نشست واقعی، مجوز فعلی resources همان cohort و predicate canonical انتشار؛ فقط نسخهٔ جاری published و تحقیق هنوز approved. DTO پیشنهادی versionId، title، summary، publishedAt، sources مجاز، detailHref محلی، readAt/hasBeenRead و nextCursor؛ page-size محدود و ترتیب پایدار. بدنهٔ داخلی، یادداشت خصوصی و UUID صاحب پرونده وارد feed نمی‌شود.
- `POST /api/publications/:versionId/read`: بعد از همان کنترل دسترسی detail، ثبت idempotent خواندن برای `auth.uid()` و همان نسخه. ارسال اعلان/بازکردن فهرست، خواندن تلقی نمی‌شود؛ اصلاح محتوا با نسخهٔ جدید دوباره خوانده‌نشده است. table احتمالی `research_publication_reads` تنها پس از بررسی نبود نگاشت دقیق موجود و با RLS مالک، بدون حساب/grant/notification موازی.
- لغو/انقضا/لغو دوره و پس‌گرفتن تأیید تحقیق در درخواست بعدی به list/detail/read اعمال شود. خطای سرویس 503 از deny و فهرست خالی جدا باشد. cursor نامعتبر، cohort بیگانه، نسخهٔ قدیمی و replay آزموده شوند. مرجع مجوز و allowlist detail/list مشترک بماند؛ شرط کلاینتی جای RLS نیست.
- مالک backend باید `lib/intelligence/publication-server.ts` و HTTP adapter مربوط، `app/api/cohorts/[id]/publications/route.ts`، `app/api/publications/[id]/read/route.ts` و migration/آزمون publication را بررسی و مالکیت دقیق را اعلام کند. مصرف UI در `components/member` متعلق به NEXT06 است. هیچ‌یک از این endpointها یا table پیشنهادی در این PR ساخته نشده‌اند.

قرارداد profile/onboarding نیز از مالک Auth لازم است: مسیر واقعی، DTO allowlist، version، وضعیت تکمیل/اصلاح، خطا و مقصد بازگشت؛ خانهٔ عضو فرم هویتی یا endpoint جایگزین نمی‌سازد. قاعدهٔ سه‌ماه D-034 باز است؛ فقط `startsAt/endsAtExclusive` واقعی API نمایش داده می‌شود.

## تحویل مسیر به مالک integration

`/dashboard` خانهٔ عضو است؛ نمای قبلی داده/هدف/سبد با همان `DashboardClient` و loaderها به `/dashboard/portfolio` منتقل شد و لینک آن در خانه وجود دارد. لینک‌های مستقیم holdings، consultation و market تغییر نکرده‌اند. middleware و accountEntryHref مقصد محلی به‌همراه query/hash را حفظ می‌کنند؛ مسیر تازه portfolio و انتخاب cohort در آزمون return-path پوشش داده شدند. مالک integration باید در لینک‌هایی که منظورشان مدیریت قبلی سبد است `/dashboard/portfolio` را مقصد کند؛ لینک عمومی «خانهٔ من» همچنان `/dashboard` است. هیچ مسیری حذف یا endpoint مالی تازه ساخته نشده است.
