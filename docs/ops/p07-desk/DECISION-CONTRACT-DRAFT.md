# P07/P06 — افزونهٔ تصمیم در دفتر انتشار موجود، پیش‌نویس

**DRAFT / NOT IMPLEMENTED.** مبنا195@31c44ab؛ شناسهٔ موجود `publication.v1` حفظ می‌شود. این سند نسخهٔ جدید API، جدول، RPC نصب‌شده یا منبع مجوز جدید ایجاد نمی‌کند. افزودن معنای جدید ممکن است bump سازگار قرارداد و migration همان دفتر را لازم کند؛ نام نسخه و migration را P00 تعیین می‌کند.

## قرارداد واقعاً موجود

`research_workbook_versions` شناسه aggregate و UUID نسخه پژوهش دارد؛ review فقط همان نسخه را تأیید می‌کند. `research_publication_versions` شامل aggregate `publication_id`، UUID `id` نسخه، `version` عددی و `workbook_version_id` است. body فعلی نوع brief/lesson/webinar_plan، متن مخاطب، منابع تاریخ‌دار، audience/cohortIds و channels دارد. `research_publication_commands/events` همان تاریخچهٔ ready/publish/withdraw و توزیع است.

`save_research_publication` در `20260930182918_research_publication_queue.sql` (مرحله16 manifest P00)، body را با `jsonb_build_object` allowlist بازسازی می‌کند؛ کلیدهای جدید امروز **حذف می‌شوند**. parsePublication نیز آن‌ها را نگه نمی‌دارد. research-workbook v1 هم فقط فیلدهای شناخته‌شده را reconstruct می‌کند. افزونه باید parser/DTO، ذخیره و reader را هم‌زمان پوشش دهد؛ صرف افزودن UI داده را پایدار نمی‌کند.

خواندن نسخه عضو از RPC و `/publications/VERSION?cohort=COHORT`، با مجوز جاری است. `published + approvalCurrent + cohort entitlement` لازم است؛ عمومی فقط همان مسیر عمومی موجود. URL به‌تنهایی grant نیست. آدرس history/internal/source خصوصی به عضو/assistant/notification کپی نمی‌شود.

نکتهٔ current بودن: در پایه، **هر نسخهٔ جدید انتشار—even draft—نسخه قدیم aggregate را non-current می‌کند**. پس تا وقتی قرارداد جایگزینی تغییر نکرده، P08/P05 نباید نسخه قدیمی را active فرض کنند. حفظ دیدگاه قبلی تا publish نسخه تازه یک تصمیم/پیاده‌سازی جدید است، نه رفتار موجود. هر تغییر این semantics باید server/RPC/resolver همه consumers را یکجا تطبیق دهد.

## محل و هویت پیشنهادی

افزونهٔ `decision` در **همان body نسخه انتشار**، متصل به researchVersion؛ نه جدول/دفتر تصمیم مستقل. شناسه‌های نویسنده، تأییدکننده و زمان ثبت از سرور/سابقه reviews گرفته شوند، نه از ورودی مدل یا JSON import. private source/transcript در **همان body نسخه پژوهش** با allowlist جدید internal metadata پیشنهاد می‌شود؛ در projection عضو قرار نمی‌گیرد.

| فیلد پیشنهادی | قاعدهٔ draft |
|---|---|
| actionKind | مشاهده، وزن هدف، تغییر اندازه موقعیت یا توقف؛ enum دقیق با P06. واژه/دامنه خدمت باید تصمیم ثبت‌شده داشته باشد؛ تغییر نام مسئله سیاست را حل نمی‌کند |
| sizeBasis | مبنای اندازه به‌صورت enum صریح؛ position_pct با target_weight_pct متفاوت است؛ none فقط برای مشاهده |
| sizeValue | اندازهٔ صریح و واحد؛ محاسبه توسط موتور P06، نه LLM. null در فقدان داده، بدون حدس از جمله مبهم |
| denominator | متناسب با sizeBasis و طبق P04: وزن هدف بر دارایی قابل تخصیص، تغییر موقعیت بر موقعیت ابزار مشخص؛ کل ترازنامه/خانه/بدهی پیش‌فرض نیست |
| validFrom / validUntil | timestamp با timezone و معنای مصوب؛ validUntil بعد از validFrom. مجهول=UNKNOWN، نه تصمیم فعال دائمی |
| assumptions / activationConditions / endConditions | فروض و شروط بازبینی به زبان روشن؛ تفسیر مبهم شرط به آرش برگردد |
| supersedes | UUID نسخه همان publication aggregate؛ برگشت رابطه/چرخه/اشاره به نسخه بیگانه ممنوع؛ supersedes نباید مدل انتشار دوم بسازد |
| correctionReason / retraction | دلیل انسانی و فرمان همان دفتر؛ تاریخچه حفظ شود؛ retraction جایگزین private command تازه نیست |
| audience | همان public/cohort/cohortIds؛ گروه‌بندی و تناسب جدید بدون قرارداد P06 اختراع نشود |
| source provenance | متن/voice_manual، locator داخلی opaque، digest فایل/متن، تأیید transcript انسانی؛ نه URL عمومی حدسی |
| ambiguity / resolution | نوع، متن و locator شاهد، وضعیت unresolved/resolved و تأییدکنندهٔ انسانی روی همان نسخه؛ parser زبانی صحت مالی را تأیید نمی‌کند |

`holdingVersionId` خصوصی عضو فقط هنگام محاسبه/توضیح مجاز P04/P06، همراه researchVersionId/publicationVersionId در context همان عضو قرار می‌گیرد. در body انتشار عمومی/cohort، context assistant عمومی، trace خارجی یا اعلان قرار نمی‌گیرد. نسخه سبد مرجع آرش با نسخه دارایی خصوصی عضو یکسان نیست.

## وضعیت مؤثر و گیت‌ها

مدل پایه ready/publish/withdraw حفظ می‌شود. وضعیت‌های آماده‌سازی «نیازمند رفع ابهام/آماده بازبینی» projection پژوهش‌اند، نه فرمان publish جدید. مدل مؤثر پیشنهادی reader: draft، ambiguity_blocked، review_required، ready، published، superseded، withdrawn، not_yet_valid، expired، approval_invalid، unknown. علت وضعیت و نسخه/زمان ارزیابی همراه DTO لازم است؛ مشتری حق فعال‌کردن از روی cache قدیمی ندارد.

قبل از ready/publish تصمیم: پژوهش دقیقِ latest approved، فیلدهای action/اندازه/مخرج روشن، ابهام صفر یا resolved انسانی، زمان اعتبار مشخص، audience مجاز و privacyConfirmed واقعی. هر تغییر مادی نسخه جدید و بازبینی همان researchVersion می‌خواهد. import یا provider نمی‌تواند approval/active state را تعیین کند.

اعتبار و grant در **هر retrieval و قبل از پاسخ/ارسال** دوباره سنجیده شود. متن conversation یا notification قدیمی authority نیست. replaced/withdrawn/expired/approval_invalid از پاسخ/صف فعال خارج شود؛ history فقط با سطح دسترسی مناسب و برچسب تاریخی. انتشار تصمیم فاقد زمان معتبر متوقف است؛ محتوای آموزشی قدیمی بدون decision metadata، تصمیم معاملاتی فعال معرفی نمی‌شود.

تعویض/پس‌گرفتن و event مربوط باید در همان transaction canonical دفتر، با optimistic base و idempotency فعلی ثبت شوند. آستانه اعلان مادی، زمانبندی و retry ارسال با P05/P06؛ P07 sender جدید نمی‌سازد. درخواست in-flight پذیرفته‌شده توسط provider قابل پس‌گرفتن ادعا نمی‌شود.

## ورودی دستی و preview

متن/ویس اصل فقط در نمای داخلی؛ مسیر اول transcript دستی با تأیید آرش است. فایل محلی/locator خصوصی اگر هنوز ذخیره و grant مصوب ندارد، «ثبت سروری صوت» نامیده نشود. پردازش صوت، STT، URL خارجی و upload مجوز/provider/Storage P01 جدا می‌خواهند. استفاده دستی پژوهش و انتشار مستقل از آن باقی بماند.

claim type مشاهده/تفسیر/سناریو و اتصال evidenceId صریح؛ quote/offset از اصل شاهد با بازبینی انسانی، استخراج عدد مالی توسط مدل ممنوع. نشانی اصل اگر مجهول است null و گیت کیفیت باز؛ هیچ source URL برای PASS ساخته نشود.

preview عضو فقط allowlist متن نهایی، منبع عمومی مجاز، audience، افق/اعتبار و شناسه نسخهٔ انتشار؛ body پژوهش، privateNote، transcript، اطلاعات نیازسنجی خام و دارایی مشتری وارد آن نشود. این projection تضمین پاک‌بودن free-text انسانی نیست؛ بازبینی privacy لازم است. preview مجوز دیدن عضو دیگر یا صدور دسترسی نمی‌دهد.

## هم‌راستایی مالکان

P06 قرارداد action/اندازه/مخرج و مرجع را تأیید می‌کند؛ P08 این metadata را از canonical reader با مجوز دوباره می‌گیرد؛ P03 نمایش/رسید مطالعه همان version را مصرف می‌کند؛ P05 فقط event معتبر و context مجاز اعلان را می‌گیرد. Auth/schema/install از P01/P00. تا آن تطبیق، این سند مرجع offline و DRAFT است و هیچ consumer نباید آن را API عملیاتی فرض کند.

## رسید تطبیق P04/P06 — 2026-10-02

P04/P06 نسخهٔ این قرارداد در PR206@`52cd3a9490d7116c5e115be390fc945dab65905c` را خواند و ACK خود را در `docs/ops/seasonal-program/p04/P07-DECISION-ACK.md` ثبت کرد؛ commit شاهد `90c161b0aa819ab0b34d0584d1cd5dc06bcbf5bb` در شاخهٔ PR205. P07 متن و وضعیت Git فایل را مستقیم خواند. **توافق اصول مالی ثبت شد؛ enum/schema/API نهایی OPEN است.** این رسید پذیرش انسانی، شروع موتور P06 یا سیاست تجاری نیست.

توافق: همان workbook/publication، محاسبهٔ قطعی و null، context خصوصی عضو، بازسنجی زمان/grant/approval/current در لحظهٔ استفاده، حفظ تاریخچه و semantics موجود non-current شدن نسخه قبلی با draft تازه. موارد پیشنهادی زیر نیازمند تطبیق P03/P08/P00 و شاهد انسانی‌اند:

| موضوع | پیشنهاد P06 — DRAFT، پیاده‌نشده |
|---|---|
| جهت اقدام | `observe`، `target_weight`، `reduce_position`، `increase_position`؛ تغییر موقعیت بدون جهت مبهم است. توقف از همان withdraw/retraction، نه تصمیم فعال دوم |
| اندازه | `none` فقط مشاهده؛ `target_weight_pct` وزن هدف؛ `position_pct` درصد موقعیت ابزار مشخص. مقدار finite با دامنه/واحد صریح؛ مبلغ/تعداد بدون قرارداد واحد ابزار P02 پذیرفته نشود |
| مخرج وزن هدف | `allocatable_investment_assets` همراه تعریف دامنه و نسخه قواعد؛ انتخاب عضو خصوصی، کامل و مقید به نسخه |
| مخرج تغییر موقعیت | موقعیت ابزار عمومی مشخص؛ `position_key` عضو فقط context خصوصی، نه انتشار cohort/public |
| وزن صفر | موتور فعلی وزن مثبت و بردار مجموع100 می‌خواهد؛ معنای وزن هدف0 در دستور با representation بردار موتور باید تطبیق شود، پیش‌فرض قابل اجرا نیست |
| هویت محاسبه/رفع تکرار | علاوه بر researchVersion/publicationVersion/holdingVersion، زمان قیمت، نسخه قواعد دامنه، اقلام منتخب و تأیید عضو در context داخلی لازم است؛ سه شناسه به‌تنهایی کافی نیست |
| اعلان | replaced/withdrawn/expired از صف فعال خارج شوند؛ تغییر قیمت صرف با اصلاح مادی تصمیم یکی نیست. آستانه/گروه‌ها باز و ارسال با P05 |

ردیف actionKind بالای سند توصیف اولیهٔ مسئله است؛ enum بالا پیشنهاد دقیق‌تر P06 است و هیچ‌یک enum نصب‌شده یا سیاست UI محسوب نمی‌شود. افزایش/کاهش، نقدشوندگی، افق و مخاطب باید از تصمیم و شاهد انسانی آرش بیاید. سازگاری publication.v1 و رفتار read-state همچنان منتظر توافق P03 است. هیچ parser، SQL، schema، محاسبه یا وضعیت انتشار با این ACK تغییر نمی‌کند.
