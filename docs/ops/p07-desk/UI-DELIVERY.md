# P07 — تحویل UI دستی و مسیر نمونه

2026-10-02؛ مبنا195@31c44ab، همان شاخه/PR206. **کد متصل، آزمون سبک موفق؛ نمایش مرورگری/candidate و build جدید در صف P00 است.** این تحویل پذیرش کامل P07 نیست.

## اتصال و مالکیت

ACK مستقیم P00 محدوده `app/(protected)/admin/desk/page.tsx` و فقط سه prop اختیاری `transport/initialWorkbook/onWorkbookChange` در `ResearchWorkbook.tsx` را مجاز کرد. صفحه همان AdminShell/layout و ArashCommandDesk را حفظ و P07DeskIntegration را کنار آن نشان می‌دهد. PublicationWorkbench/Auth/API/SQL/globals/lock/workflow تغییر نکردند. ACK جداگانه P00 فقط افزودن سه تست اختصاصی به انتهای `test:core` را مجاز کرد؛ همه ورودی‌های قبلی محفوظ‌اند.

| اتصال | قرارداد |
|---|---|
| transport | پیش‌فرض همان fetch/no-store فعلی؛ fixture صریح فقط در نمونه توسعه |
| initialWorkbook | فقط seed اولیه؛ با parseWorkbook allowlist بازسازی، بدون approval؛ ویرایش اولیه dirty است |
| onWorkbookChange | callback اختیاری برای همین workbook؛ هویت یا حق تأیید تولید نمی‌کند |
| PublicationWorkbench | فرم موجود بدون تغییر، transport wrapper P07 برای پیش‌نمایش و UX؛ فرمان/کلید تکرار/optimistic base همان موجود |
| نمونه | `/admin/desk?p07=sample` فقط NODE_ENV=development؛ زیر gate admin موجود. در production query نمونه را فعال نمی‌کند |

داده ساختگی در P07DeskScenario/createP07WorkflowFixture فقط حافظه همان نمونه است. APIهای workbook از handlers واقعی list/open/save/decide با store ساختگی استفاده می‌کنند؛ فرمان publication از publicationCommand موجود عبور می‌کند. شبیه‌سازی state/approval، اثبات native SQL/RLS نیست. نمونه ledger اجرایی یا sender/provider ندارد.

## رفتار قابل بازبینی

صف امروز شمار فهرست اخیر را نشان می‌دهد، نه آمار کل؛ unavailable از empty جداست. متن/رونویسی دستی، تأیید رونویسی، گزاره و انتخاب شاهد و ابهام در آماده‌سازی صفحه‌اند. انتقال فقط با انتخاب صریح انسان: مشاهده→evidence.statement و تفسیر→interpretation؛ source/date/scenarios خودکار ساخته نمی‌شوند. roundtrip از parseWorkbook بررسی شد؛ اصل ورودی/metadata/ابهام در interpretation دفن یا در انتشار کپی نمی‌شوند.

اصل/claim association/ابهام ساختاریافته **سروری نیستند**؛ فایل محلی با برچسب persisted=false شامل intake و canonicalWorkbookDraft است. پیش از خروج، دریافت فایل و هشدار تغییرهای ذخیره‌نشده وجود دارد. ویرایش سناریو و ذخیره/بازبینی از همان ResearchWorkbook انجام می‌شود. هر تغییر نسخه تازه است؛ آماده‌سازی بعد review به UUID همان پژوهش و signature همین ورودی مقید می‌شود. تغییر ورودی یا انتخاب پژوهش دیگر در UX آماده‌سازی، ready/publish را متوقف می‌کند. خطای دریافت نتیجه review، متن را نگه می‌دارد و دوباره‌دریافت صف می‌تواند binding را بازیابی کند.

در همان PublicationWorkbench، متن مخاطب مستقل نوشته می‌شود. نخستین ready/publish پیش‌نمایش همان UUID ذخیره‌شده را باز می‌کند؛ بازبینی preview و privacy فرم لازم‌اند. بعد save تازه، ack قبلی پاک می‌شود. اصلاح با همان aggregate/base و withdraw با دلیل موجود انجام می‌شود؛ withdraw به gate آماده‌سازی وابسته نیست. سرور موجود هنوز current/version/approval/grant را بررسی می‌کند. کنترل ابهام UX است و از آن enforcement global/API نتیجه گرفته نمی‌شود؛ structured metadata و deadline در SQL هنوز غایب‌اند.

محدودیت موجود: approvedHere ویرایشگر قدیمی، وجود هر review approved را نشان می‌دهد حتی اگر بعداً returned شده باشد. ACK سه props مجوز تغییر این رفتار نبود؛ server/current و صف canonical آن را فعال نمی‌پذیرند. اصلاح badge جداگانه نیاز هماهنگی مالک دارد. history قدیمی immutable است، اما نمای کامل نسخه‌های قدیم/سطح member archive هنوز قرارداد و API جدا می‌خواهد.

## سه گردش ساختگی برای نمایش توسط P00 — browser NOT_RUN

1. در نمونه، متن «شاهد ساختگی برای آزمون» و یک گزاره observation با e1 ثبت و دستی به شاهد منتقل شود؛ ابهام آزمایشی ثبت و انسانی رفع شود. ادامه در کاربرگ، تکمیل فرم موجود، ذخیره v1 و تأیید همان نسخه. در انتشار پژوهش تأییدشده و cohort ساختگی انتخاب، متن مخاطب مستقل نوشته و save شود. ready اول preview را باز کند؛ پس از بازبینی همین نسخه و privacy، ready و publish فقط در fixture اجرا شوند.
2. تفسیر پژوهش تغییر کند، v2 ذخیره و تأیید شود؛ approval v1 کافی نباشد. دفتر انتشار خودکار پژوهش تازه را دوباره دریافت کند و متن draft موجود را دور نریزد. در همان aggregate پژوهش v2 و متن اصلاح‌شده ذخیره، preview تازه بازبینی و ready/publish اجرا شوند. نسخه قدیم با save draft تازه non-current است؛ fallback ممنوع.
3. با دلیل نمونه withdraw انجام شود؛ ready/publish بعدی رد و نسخه متوقف‌شده active نشود. history fixture و متن نسخه اول محفوظ بمانند. برای خطای503/409، «درخواست بعدی» فعال و متن روی صفحه باقی بماند؛ retry save همان idempotency قبلی را حفظ کند.

هیچ‌یک از این گردش‌ها نمونه واقعی آرش یا پیام مشتری نیست. سه گردش انسانی سندACCEPTANCE همچنانNOT_RUN، زمان‌هاnull و گیت native/candidate/Production باز است.

## شواهد و قدم بعد

- 52 آزمون سبک:21 اختصاصی P07 و31 regression workbook/store/publication/feed، 0fail/0skip؛ سه گردش transport/handler ساختگی در آن‌ها هستند.
- TypeScript و lint کل مخزن موفق. چهار بررسی static React با `tsx docs/ops/p07-desk/static-ui-check.ts`: فرم/برچسب نمونه، preview بدون metadata خصوصی، seed ویرایشگر واقعی، غیرفعال‌بودن fixture خارج development. static markup تعامل مرورگر نیست.
- build سنگین این تغییر مطابق دستور P00 اجرا نشد؛ build47 قبلی متعلق به کد قبل UI است و به این head انتقال داده نمی‌شود. آزمون کامل CI/native/browser و نمایش P00 بعد نوبت منابع لازم‌اند.
- React skill: callback/transport پایدار، state فرم حفظ، label/fieldset/role status و کنترل قابل لمس، بدون CSS خارج token یا provider. این مرور جای آزمون keyboard/RTL مرورگر را نمی‌گیرد.

قدم بعد P00: ترکیب SHA این PR با قرارداد P01/P03، نوبت build و نمایش سه گردش fixture زیر admin gate. P07/P03/P04/P08: بررسی [پیشنهاد دقیق افزونه](DECISION-EXTENSION-PROPOSAL-v0.2.md) پیش از writer/reader/schema افزایشی. بدون مرز مشترک، migration ساخته/نصب یا deadline فعال معرفی نشود.
