# P07 — میز آرش و گردش انتشار

۲ اکتبر ۲۰۲۶، تهران. مالک: چت `01a0f780-070d-78f2-bbff-242b6a9c9ce8`. برنامهٔ مصوب v0.1 در checkout جهت محصول، فایل‌های 00/01/03/04 و EXECUTION-ORDER خوانده شد و اصل آن‌ها تغییر نکرد.

**وضعیت این تحویل: تطبیق مستقل، قرارداد پیشنهادی و adapter آماده‌سازی آفلاین؛ manifest/مالکیت P00 دریافت شد، اتصال وابسته منتظر قرارداد پایدار P01 و سازگاری P03 است.** این تحویل P07 کامل، نصب schema یا پذیرش انسانی نیست. شواهد IE01 و PR196 حفظ شده‌اند؛ آزمون چهار حالت مالی دوباره ساخته نشده است.

## مبنا و بازاستفاده

شاخهٔ ایزوله `codex/p07-desk-contract-20261002`، checkout `portfolio-p07-desk`، پایهٔ PR195@`31c44ab635b672b589b7833bcbc78b41d36f1e75`. PR191@`a83f71d922a93ec2bfb398a306d7b282ce1db81f` زیر آن است. metadata تازهٔ PR168/176/191/195 خوانده شد؛ هر چهار مورد draft/open/unmerged بودند. انتخاب این base برای تطبیق، جای manifest نهایی P00 نیست.

| نیاز مصوب P07 | موجود در پایه | شکاف و اقدام در مالکیت P07 |
|---|---|---|
| امروز و اولویت‌ها | `/admin/desk`، ArashCommandDesk، command-desk، DailyPublicationLane | صف قدیمی intel_* با research-workbook همان موجودیت نیست؛ شمار اخیر را آمار کل ننامیم. اولویت خطای منبع/ابهام/بازبینی باید شفاف‌تر شود |
| پژوهش و شاهد | research-workbook و phase34؛ شواهد، تفسیر، شاهد مخالف و سه سناریو | نگاشت مستقیم claim→evidence و فهرست ابهام تصمیم/درصد موجود نیست؛ صحت منبع با تکمیل ساختار اثبات نمی‌شود |
| ورود متن/ویس | ورود دستی و JSON کاربرگ؛ متن مستقل انتشار | منشأ متن/ویس و تأیید transcript قرارداد ندارند. فعلاً provider متصل نشود؛ نقل دستی با منشأ داخلی و تأیید انسانی طراحی شود |
| تأیید همان نسخه | workbook-store و reviews؛ publication_private.approved/current | تغییر پژوهش approval قدیمی را نامعتبر می‌کند؛ UI ResearchWorkbook، approvedHere را با وجود هر approval می‌سنجد و بازگرداندن بعدی را در آن نشانگر لحاظ نمی‌کند؛ اصلاح فقط پس از مالکیت فایل |
| مخاطب و متن عضو | PublicationWorkbench و publication.v1؛ public/cohort و site/telegram | فرم و برچسب «متن مخاطب» پیش‌نمایش دقیق allowlist با زمینه مخاطب نیست؛ preview مستقل و بازبینی حریم خصوصی لازم است |
| اصلاح/پس‌گرفتن | نسخه انتشار append-only و فرمان withdraw، event/reader موجود | تاریخچهٔ admin فقط نسخه‌های اخیر aggregate را فهرست می‌کند؛ دلیل رابطهٔ supersedes/retraction و زمان اعتبار در DTO نیست |
| تصمیم و اندازه | هیچ DecisionMetadata پایدار در publication.v1 | با P06، افزونهٔ همان body و همان انتشار؛ دفتر جدید ممنوع. SQL فعلی کلیدهای افزوده را حذف می‌کند |
| نسخه عضو و اعلان | `/publications/VERSION?cohort=COHORT`، فید/read receipt و NEXT09 | اعلان دیده‌شده، خواندن نسخه و اقدام مالی سه رخداد جدا؛ اعتبار و مجوز در هر خواندن/ارسال دوباره سنجیده شود |

چهار فایل workbook/publication/UI منتخب176 با191 تفاوت ندارند؛ فایل‌های research-workbook/workbook-store/phase34 در168 نیز با پایه195 برابرند. قابلیت‌های موجود دوباره ساخته نمی‌شوند. [شواهد تطبیق](BASELINE.json)، [قرارداد پیشنهادی](DECISION-CONTRACT-DRAFT.md) و [گیت‌های پذیرش](ACCEPTANCE.md) مرجع‌اند.

## مالکیت و وابستگی

مالکیت تثبیت‌شده در P00-BASELINE و پیام P00: **`docs/ops/p07-desk/**`، `lib/intelligence/p07-*` و `components/admin/P07*`**. P07 نویسندهٔ افزونهٔ تصمیم است؛ قبل از تغییر publication.v1 سازگاری با P03 و مصرف P06/P08 ثبت شود. اتصال به ResearchWorkbook/PublicationWorkbench/ArashCommandDesk و مسیرهای admin، API/RPC و migrationهای publication/workbook نیازمند هماهنگی مالک فایل است؛ این تحویل آن فایل‌های موجود را تغییر نمی‌دهد.

P01 مالک Auth/session/error classification؛ P00 مالک محیط و ترتیب schema؛ P03 مالک feed/member UI؛ P05 مالک ارسال/opt-in/outbox؛ P06 مالک معنای اندازه/مخرج و موتور مالی؛ P08 مالک assistant/provider. با P06/P08 مستقیم هماهنگ شده است. قرارداد مالی P04@`ab2a0fd` خوانده شد؛ private holdingVersionId در publication عمومی قرار نمی‌گیرد.

گیت کد وابسته: SHA پایه و schema manifest P00 دریافت شد؛ تأیید قرارداد admin/session در P01 و تعیین اتصال مسیرهای مشترک باز است. manifest هجده مرحله را VERIFIED_INPUT_NOT_APPLIED و محیط را INSTALLING_NOT_ACCEPTED ثبت کرده است. پذیرش زندهٔ لیارا در چت P00 در جریان است؛ manifest به معنی backend آماده نیست. این شاخه به آن سرویس وصل نشده است.

## کد مستقل قابل بازبینی

`lib/intelligence/p07-preparation.ts` افزونهٔ آفلاین است: parseManualIntake ورودی دستی را محدود و allowlist می‌کند، manualIntakeIssues ابهام/رونویسی تأییدنشده/اتصال شاهد ناقص را گزارش می‌دهد و prepareAudiencePreview با parsePublication موجود فقط متن و مخاطب مجاز را بازسازی می‌کند. source URL، مقدار مالی، هویت و approval تولید نمی‌شود. موارد checklist صرفاً ادعای ساختاری کاربرند؛ فهرست خالی اثبات صحت، مجوز یا تأیید انسانی نیست.

این adapter به route/UI/server متصل نیست و metadata آن با parser/SQL فعلی ذخیره نمی‌شود؛ وضعیت دقیق PERSISTENCE_NOT_IMPLEMENTED است. preview پیش‌نمایش نویسندهٔ draft است، نه خواندن واقعی عضو و نه ایجاد grant. متن آزاد و URL مجاز ساختاری هنوز بازبینی حریم خصوصی می‌خواهند. زمان اعتبار/تصمیم/جایگزینی در آن پیاده نشده و قرارداد مالی DRAFT باقی است. آزمون‌های این adapter همگی نمونه ساختگی‌اند؛ شواهد اجرا در BASELINE.json ثبت می‌شود.

## نخستین کارهای اجرایی پس از گیت

1. افزودن preview allowlist و حفظ متن در خطا به Workbench موجود؛ نمای مخاطب نباید از body کامل پژوهش ساخته شود.
2. ورود دستی متن و transcript ویس، منشأ/تأیید انسانی، ابهام و claim/evidence؛ ذخیره در همان نسخه پژوهش با قرارداد نسخه‌دار، نه مخزن یادداشت جدید.
3. افزونهٔ DecisionMetadata با P06؛ validation در مرز سرور/SQL، بازتاب زمان اعتبار و جایگزینی در canonical reader/resolver. UI-only guard کافی نیست.
4. تاریخچهٔ اصلاح/پس‌گرفتن از همان tables/commands/events، بدون mutation نسخه قدیم؛ consumers P03/P05/P08 از یک effective-state contract استفاده کنند.
5. اجرای سه گردش واقعی با آرش و ثبت دقیقه‌ها؛ fixture فنی فقط برچسب ساختگی دارد و آن گیت را نمی‌بندد.

خط مبنای زمان انسان، تعداد گروه‌ها، دامنه خدمات کانال، واژگان قدیمی UI، سیاست نگهداری صوت و provider باز هستند. تصویب برنامه مقدار این تصمیم‌ها را تعیین نمی‌کند. استفاده دستی میز به AI وابسته نیست. در این مرحله فقط adapter مستقل و اسناد/آزمون آن اضافه شده‌اند؛ صفحهٔ قابل استفاده، schema، سرویس، Production، provider، خرید یا پیام واقعی تغییر نکرده است.
