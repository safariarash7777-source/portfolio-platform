# p07.decision.proposal.v0.2 — شکل فنی پیشنهادی، اجرا نشده

2026-10-02؛ این نسخه دقیق‌تر از جدول اولیه قراردادDRAFT است، نه wire نصب‌شده یا تصمیم تجاری. ACK اصول P03/P04/P08 و base195 محفوظ؛ **enum نهایی، نسخه DTO، migration و سیاست محصول OPEN**. publication.v1 فعلی هیچ کلید جدید این سند را ذخیره/اجرا نمی‌کند.

## محل یگانه و مرز تغییر

پیشنهاد: افزونه `decision` در body همان research_publication_versions و `preparation` در body همان research_workbook_versions با نسخه parser سازگار جدید. جدول/دفتر موازی یا metadata در متن interpretation ساخته نشود. workbook.version1 و publication.v1 legacy خوانا بمانند، اما از legacy فاقد زمان/اندازه تصمیم فعال نتیجه گرفته نشود. نام wire جدید و ترتیب migration را P00 با P03 تعیین کند؛ DTO جدید قبل از writer/SQL/read enforcement منتشر نشود.

پیشنهاد کمینه schema در همان tables: body fields و validate/RPC/reader نسخه‌دار به‌صورت additive؛ 18مرحله قدیم بدون تغییر، پس از آن migration جدید با CLI/نام/hash/order مصوبP00. مالک writer/parserP07 و reader/list/detail/markP03 است؛ migration مشترک فعلاً صفر. authority همان server/session/grant/review/commands موجود است، نه JSON import.

## شکل decision — قرارداد پیشنهادی برای بازبینی مالکان

| فیلد | مقدار/قاعده پیشنهادی |
|---|---|
| actionKind | observe / target_weight / reduce_position / increase_position؛ طبق پیشنهادP06، نهایی نشده |
| sizeBasis | none فقط observe؛ target_weight_pct فقط target_weight؛ position_pct فقط کاهش/افزایش موقعیت |
| sizeValue | observe=null؛ درصد finite و unit=percent؛ target مقدار0…100، position مقداربزرگتر0 تا100. **target0 برای اجرای موتور unresolved**؛ validation اجرایی آن تا تصمیم representation بسته بماند |
| denominator.kind | none برای observe، allocatable_investment_assets برای target، instrument_position برای position_pct؛ مخرج با مبنا ناسازگار رد شود |
| denominator.rulesVersion | observe با none=null؛ برای اندازه‌دار شناسه نسخه قواعد قابل بررسیP04، unknown رد؛ نه کل ثروت یا خانه/بدهی پیش‌فرض |
| instrumentId / allocationClass | observe هر دوnull؛ target شناسه allocationClass عمومی و instrumentId=null؛ position شناسه instrumentId عمومی و allocationClass=null. اعتبار مرجع باP02/P04، نه متن آزاد حدسی. position_key عضو اینجا ممنوع |
| validFrom / validUntil | هر دو timestamp offsetدار لازم برای تصمیم؛ [from,until)، پایان بعد شروع. predicate نمونه p07.validity.draft.v1 فقط fixture است؛ clockDB/shared predicate آینده لازم |
| assumptions / activationConditions / endConditions | متن روشن و محدود، با claim/evidence مصوب؛ شروط مبهم حل‌نشده پیش از ready رد |
| supersedes | نسخه نخست=null؛ پس از آن UUID پیشین همان aggregate، رابطه بدون چرخه؛ policy save-immediate فعلی حفظ. delayed-until-publish نیاز تصمیم جدا |
| correctionReason | نخستین نسخه=null؛ اصلاح دلیل انسانی در history/command همان دفتر؛ author/review/time از سرور |
| retraction | همان فرمان withdraw/reason؛ stop در active decision دوم قرار نگیرد |

درصد بالا قرارداد واحد است، محاسبه مشتری نیست. مبلغ/تعداد/اهرم/آستانه مادی/مخاطب مناسب بدون قرارداد ابزار/سیاست معتبر وارد enum نشوند. موتور مالی و P04 هویت محاسبه را با holdingVersion، research/publicationVersion، زمان قیمت، قواعد scope، اقلام منتخب و تأیید عضو در **context خصوصی** می‌سنجند؛ این فیلدها در انتشار cohort/public/trace خارجی نیستند.

## preparation ساختاریافته — حداقل نیاز بررسی، امروز unpersisted

در همان research body آینده: kind متن/voice_manual، متن داخلی محدود، provenance opaque/digest اگر واقعاً موجود، تأیید رونویسی انسانی، claims با id/type/text/evidenceIds صریح و ابهام‌ها با id/text/status/resolutionNote. source locator/storage/auth/retention باز است؛ URL عمومی یا زمان ساختگی ساخته نشود. همه idها یکتا، evidenceIds به همان نسخه معتبر و count/byte limits در سرور حفظ شوند. resolutionNote لازم و با همان review انسانی/version مرتبط؛ boolean کلاینت مجوز/هویت انسانی نیست. تغییر مادی preparation، نسخه و review تازه می‌خواهد. parser/SQL/reader داخلی آن را نگه دارند و projection عضو آن را حذف کند.

تا آن تغییر مشترک، UI فقط mapping صریح متن به فیلدهای فعلی و فایل محلی persisted=false دارد؛ author یا verifier و metadata سروری ادعا نمی‌شود. منبع کامل‌شده صحت ناشر را ثابت نمی‌کند. preview allowlist و human privacy review همچنان جدا لازم‌اند.

## predicate مشترک و سازگاری

تصمیم فعال آینده = published + current + latest approved research + exact grant + زمان معتبر + آماده‌سازی معتبر طبق قرارداد نهایی. یک authority در canonical SQL reader، list/detail/mark و retrieval/send؛ هیچ cache/client-clock fallback. marked-read قبلی مجوز یا اقدام نیست، receipt UUID نسخه حفظ می‌شود و نسخه تازه unread است. legacy education از تصمیم فعال جدا، بدون جعل expiry.

تاریخچه عضو، نام wire، معنای target0، واحد/مرجع ابزار و schema approval هنوز نیاز ACK دارند؛ توافق اصول ساعت از آن‌ها نتیجه نمی‌شود. پذیرش آینده: timezone-equivalent instants، start/end equality و microsecond، missing/invalid bounds، independently expired grant، draft supersession، withdrawn/returned/replayed mark، ambiguity تغییرکرده و عدم نشت context خصوصی. fixture سبز و سه گردش UI ساختگی جای native/انسانی نیستند.

P04@`7b92b165d0f389cf8531dc64788f377c93825758` در ACK تازه، جهت صریح افزایش/کاهش، تفاوت مخرج target وposition و دو گزینه target0 را روشن کرد؛ P07 متن آن commit را مستقیم خواند. در پیشنهادv0.2 مسیر محافظه‌کارانه حفظ می‌شود: intent صفر حدس/نرمال‌سازی نشود و اجرای target0 تا adapter مستقل با مجموع100 و شاهد لازم بسته بماند. گزینه حذف فقط صفر صریحِ معلوم در adapter آینده، مجوز ساخت آن از این سند نیست. توافق نهایی P03/P08/P00 و سه نمونه تاریخی انسانی باز و P06 gated است.

ACKهای پیام مستقیم بعدی، هر دو دربارهٔ همین proposal در P07@`7d284d05c37339b765ce5ea8eecbe4bc64ea4c55`: P04 اصول جهت/مخرج/حریم خصوصی/target0blocked را پذیرفت و scope کامل، rulesVersion معلوم و تأیید خصوصی همان holdingVersion را لازم دانست؛ SHA سند تازه P04 هنوز در آن پیام ارائه نشده بود. P08 پس از مقایسه با adapter خودش@`a83bc0191351d0e081c374d4f3fd0d4bc029f3ce` اختلافی در اصول مشاهده نکرد و port زمان موجود را بدون parser موازی مصرف می‌کند. P08 برای ACK کد/سند تازه نساخت. این رسیدهای پیام، پذیرش enum/wire/schema/preparation-validity/native/موتور target0 یا سه نمونه انسانی نیستند و آن گیت‌ها همچنان OPEN‌اند.
