# M2 — دسترسی به همان وبینار؛ بستهٔ بازبینی مستقل

> وضعیت: **LOCAL_CODE_AND_ISOLATED_SQL_VERIFIED · REVIEW_PENDING · منتشر نشده**. کد و SQL در محیط مصنوعی محلی سنجیده شده‌اند؛ نصب SQL، امنیت production، مرورگر واقعی و انتشار پذیرفته نشده‌اند. این سند جایگزین DECISION-LOG، COMMAND-CENTER یا MIGRATION-LEDGER نیست.

## مبنا و سازگاری

- main رسمی مبنا: `72e2b3e32d8a80fa9544105f0e439012d9c48738`؛ tree: `35bb65a5d21c72729bccf323294642c9a442e6bb`.
- commit امضاشده و ۹ blob متفاوت با مبنای قبلی c257، فقط‌خواندنی از GitHub دریافت و SHAهای commit/tree/blob دقیقاً تطبیق داده شدند. checkout و شاخهٔ جدید: `m2-72e-worktree` / `codex/m2-exact-webinar-72e`.
- patch قبلی `a0eef3e97337619a2fd63af798d3cd43af23018f6e26ec5395b2d07cecb5bff6` روی main تازه فقط در COMMAND-CENTER تعارض داشت. بخش M2 به سند تازه افزوده شد؛ گزارش انتشار داده و تغییرات دیگر main حفظ شدند. کد وبینار/پرداخت main بین این دو مبنا تغییر نکرده بود.
- worktreeها و artifactهای B1، verifier و M2 قبلی محفوظ‌اند. verifier سه‌حالته در main موجود است؛ بستهٔ قدیمی proof.ok یا full/سه‌ماه وارد مسیر تازه نشده است.
- فقط کد/آزمون آفلاین و SQL ایزوله مجاز بود. نشست مالک، Auth واقعی، پرداخت/ایمیل/تلگرام واقعی، DB زنده، تنظیم سیستم، نصب dependency، push، merge و deploy استفاده یا اجرا نشدند.

## تصمیم مالک و قرارداد محصول

مالک در ۲۰۲۶-۱۰-۱۳ تعیین کرد: مدیر هر زمان خواست وبینار تعریف کند؛ ثبت‌نام‌کننده فقط طبق تنظیمات **همان وبینار** دسترسی بگیرد. توضیح دامنه کنار D-024 ثبت است؛ تصمیم سایر محصولات بسته نشده است.

منابع: PRODUCT-BLUEPRINT؛ Wave C در INTELLIGENCE-DESK-RATIONALIZATION؛ D-024؛ schema فاز ۸؛ قرارداد مالی فاز ۵ و containment فاز ۳۰. مدل موجود webinars و ثبت‌نام یکتای (webinar_id,user_id) بازاستفاده می‌شود.

| انتخاب مدیر | قرارداد |
|---|---|
| access_enabled | پیش‌فرض false؛ تعریف/انتشار به‌تنهایی دسترسی نمی‌دهد |
| access_starts_at / access_ends_at | بازهٔ صریح و متناهی؛ مستقل از starts_at / ends_at رویداد |
| price_toman | عدد صحیح نامنفی، انتخاب صریح؛ فرم ساخت خالی و SQL بدون default؛ صفر طبق منبع رایگان |
| registration_open / status | ثبت‌نام در published یا live با سیاست معتبر؛ cancelled دسترسی نمی‌دهد |
| max_capacity | NULL همان ظرفیت نامحدود منبع؛ سیاست پولی دارای سقف هنوز ناقص است |

قیمت، مدت، کادنس سه‌ماهه، global full، کانال یا ضبط از روی fallback، متن یا زمان رویداد ساخته نمی‌شود. قیمت و بازه پس از وجود هر ثبت‌نام ثابت‌اند؛ مدیر می‌تواند دسترسی را غیرفعال کند.

## ثبت‌نام، درخواست و settlement

- RPC ثبت‌نام با نشست و auth.uid اجرا می‌شود؛ DTO شامل registration_id، webinar_id، payment_status، needs_payment و already_registered است. UI registration.id را نمی‌خواند و از قیمت نمایشی، موفقیت رایگان حدس نمی‌زند.
- access_qualified برای تمام ردیف‌های قدیمی false است. رایگان فقط با قیمت صفر رکورد معتبر و RPC ثبت‌نامِ وضعیت/ظرفیت/مالکیت‌سنج، واجدشرایط می‌شود.
- prepare_webinar_payment پیش از تماس provider یک تلاش ماندگار requesting رزرو می‌کند. یک registration فقط یک تلاش دارد؛ درخواست هم‌زمان، unknown و retry خودکار درخواست مالی دوم نمی‌سازند.
- requestPayment برای وبینار callback اختصاصی با registration_id می‌گیرد. attach_webinar_payment در یک تراکنش authority، payment_id، مبلغ ثابت amount، کاربر و وبینار را پیوند می‌دهد؛ amount_toman یا description در ledger نوشته نمی‌شود.
- requesting/unknown خودکار reset نمی‌شود. ready شناخته‌شده پس از پاسخ گم‌شده حفظ می‌شود؛ URL پس از بستن ثبت‌نام، لغو، غیرفعال‌شدن، پایان بازه یا failed شدن ledger عرضه نمی‌شود.
- callback فقط binding ذخیره‌شده را می‌خواند. Status query، مبلغ یا payment_id مرورگر مجوز نیستند. verified معتبر با کد 100/101 و ref مثبت لازم است؛ unknown دسترسی، failed قطعی، لغو یا بازپرداخت نیست.
- settle_webinar_payment، verify_payment canonical و تغییر همان ثبت‌نام به paid/qualified را اتمی انجام می‌دهد. status=verified نوشته نمی‌شود. رسید باید تمام binding و وضعیت‌ها را تأیید کند.
- رد معتبر تنها reject_webinar_payment را اجرا می‌کند. replay failed بدون provider/نوشتن دوباره failed می‌ماند؛ رسید ناسازگار unknown است. replay paid با همان ref بدون اعطای دوباره یا پیام بیرونی است؛ ref ناسازگار رد می‌شود.
- callback عمومی ledger وابسته به وبینار را پیش از مسیر دعوت عمومی به callback اختصاصی می‌فرستد. مسیر تازه entitlement یا عضویت کانال نمی‌سازد؛ دعوت کانال در UI/API وبینار تا سیاست مستقل غیرفعال است.
- تأیید مالیِ قبلاً معتبر ممکن است پس از لغو/انقضا ثبت شود؛ دریافت لینک همچنان سیاست جاری را می‌سنجد. provider/verifier خام هنوز await می‌شوند؛ این فاز deadline، cancellation یا rollback درخواست بیرونی اضافه نمی‌کند.

## نشت لینک و دو وبینار

فقط حذف platform_url از API کافی نیست. proposal سیاست SELECT عمومی کل ردیف webinars را حذف می‌کند؛ سیاست‌های مدیر حفظ می‌شوند. list_public_webinars تنها metadata می‌دهد و API نیز whitelist بدون لینک جلسه دارد.

proposal سیاست INSERT مستقیم عضو در webinar_registrations را حذف می‌کند. عضو نمی‌تواند paid/free/qualified جعل کند یا RPC وضعیت/ظرفیت را دور بزند؛ سیاست خواندن ثبت‌نام خود و مدیریت موجود حفظ می‌شود.

webinar_access با نشست، ثبت‌نام همان کاربر در همان وبینار، qualification، بازهٔ [start,end)، وضعیت و provenance کامل پرداخت تصمیم می‌گیرد. entitlement عمومی مجوز جلسه نیست. API پاسخ مثبت را دوباره از نظر user/webinar/time/HTTPS می‌سنجد و private,no-store برمی‌گرداند. UI لینک زندهٔ خام را نمایش نمی‌دهد.

آزمون منفی: پرداخت A، دسترسی B را باز نمی‌کند؛ عضو دیگر لینک A نمی‌گیرد؛ pending/legacy/unknown لینک نمی‌گیرند؛ replay همان callback نه B را واجدشرایط می‌کند، نه full و نه کانال می‌سازد. حفظ دسترسی عمومی مشروع قبلی جداگانه سنجیده شده است.

این گیت، افشای لینک توسط سایت را کنترل می‌کند. جلوگیری از استفادهٔ دیگری از لینک کپی‌شده در پلتفرم بیرونی جلسه اثبات نشده است.

## سه P2 بازبین و رفتار UI

۱. status=unknown/failed فقط وقتی webinar_id callback با همان کارت برابر باشد، آن کارت را محدود می‌کند. callback A کارت رایگان B را قفل نمی‌کند؛ callback فاقد scope هشدار می‌دهد و قفل عمومی نمی‌سازد. SQL مستقل از query از تلاش مالی تکراری جلوگیری می‌کند.
۲. ref هم‌زمان submit مدیر پیش از render، دوبار handler را به یک POST محدود می‌کند. پاسخ گم‌شده ممکن است پس از commit باشد؛ UI پیام صریح و توقف ساخت مجدد تا بررسی فهرست می‌دهد. این محافظ فقط در همان mount است؛ reload یا درخواست API تازه idempotency پایدار نیست و می‌تواند ایجاد تکراری کند. قرارداد پایدارِ ساخت هنوز طراحی نشده است.
۳. UI published و live را مانند RPC ثبت‌نام‌پذیر می‌داند. اعتبارسنجی ناموفق، guard را برای ورودی اصلاح‌شده آزاد می‌کند.

محافظ lifetime از هدایت/تغییر UI دیرهنگام بعد از unmount جلوگیری می‌کند؛ درخواست سرور را لغو نمی‌نامد. round-trip ویرایش زمان با ثانیه/میلی‌ثانیه در TZ=Asia/Tehran، offset=-210، موفق است.

متن وبینار در AccessStatusCard اکنون زمان/بازهٔ همان محصول را بیان می‌کند و وعدهٔ وبینار فصلی، full یا کانال نمی‌دهد. قواعد و grantهای عمومی قدیمی حذف نشده‌اند.

## SQL proposal و شاهد واقعی

proposed-exact-webinar.sql هنوز **PROPOSAL_NOT_INSTALLED** است. اضافه‌ها: سه فیلد سیاست در webinars؛ access_qualified در ثبت‌نام؛ جدول webinar_payment_attempts با PK ثبت‌نام، authority/payment یکتا، binding ثابت و سابقهٔ RESTRICT؛ دو trigger guard و ۹ RPC. قفل مشترک: webinar → registration → attempt → payment. EXECUTE عمومی RPCهای حساس پس گرفته و نقش نشست/سرویس صریح تفکیک می‌شود. هیچ تغییر زندهٔ امنیتی انجام نشده است.

isolated-acceptance.mjs روی PostgreSQL 17.11 در کانتینر اختصاصی m2-webinar-sql-20261013-72e، با image از قبل نصب‌شده اجرا شد: network=none، بدون پورت میزبان، بدون volume میزبان، CPU/memory محدود. کانتینر و پورت E2E دست‌کاری نشدند.

fixture از bootstrap آزمون مخزن، schema واقعی فازهای ۵/۸/۱۱/۳۰، audit/versioning و خطوط مرتبط ACL/search_path فاز ۱۵ استفاده می‌کند؛ کل فاز ۱۵ و snapshot امنیت production نیست. دو پروفایل legacy default privileges و strict explicit grants سنجیده شدند. Auth/claims و provider مصنوعی‌اند؛ routeهای واقعی register/payment/callback/access/list به RPC واقعی PostgreSQL وصل‌اند.

| شاهد | نتیجه |
|---|---|
| main تمیز 72e با lifecycle/UI نهایی | ۱۸۸ آزمون؛ ۲ موفق، ۱۸۶ شکست؛ exit 1 |
| regression P2 پیش از اصلاح | پنج آزمون scope/submit شکست؛ آزمون live جداگانه شکست |
| Node نهایی با TZ=Asia/Tehran | ۳۳۷/۳۳۷؛ verifier ۱۳۳ + route mock ۱۳۹ + component mock ۴۹ + SQL ایستا ۱۶؛ exit 0 |
| PostgreSQL واقعی با داده مصنوعی | ۴۲/۴۲ سناریو در دو پروفایل؛ grammar/DDL، RLS/EXECUTE، جعل، ظرفیت، دو وبینار، concurrency، replay، rollback و DTOهای route واقعی؛ exit 0 |
| typecheck کامل / lint ۱۷ فایل | exit 0؛ صفر هشدار |
| diff / artifact | diff-check و apply-check روی main تمیز 72e موفق؛ hash و تأیید مجدد artifact نهایی در JSON همراه تحویل |
| مرورگر، DB/پرداخت/Auth واقعی، نصب و انتشار | انجام نشده؛ پذیرش مستقل باقی است |

لاگ‌ها: m2-72e-before-final.log، m2-72e-after-final.log، m2-72e-sql-accepted.log، m2-72e-typecheck-final.log، m2-72e-lint-final.log، m2-72e-p2-before/after.log و m2-72e-live-before.log. خطاهای اولیهٔ harness از identity ساختگی اشتباه و مقایسهٔ DTO خام با timestamp نرمال‌شده بود؛ هر دو در harness اصلاح شدند. عیب SQL از آن‌ها نتیجه‌گیری نشد.

## ظرفیت محدود، legacy و بازمانده‌ها

- پولی دارای سقف: محافظه‌کارانه بسته می‌ماند. شمار منبع فقط paid/free است؛ pending reservation/release/TTL اختراع نشده. مالیِ قبلی حذف یا با پرداخت تازه جایگزین نمی‌شود. فعال‌سازی به تصمیم صریح و قرارداد آزمودهٔ رزرو/آزادسازی نیاز دارد.
- رایگان دارای سقف: همان شمار paid/free با قفل حفظ شده؛ دو ثبت‌نام هم‌زمان برای یک صندلی فقط یک موفق دارند. legacy paid/free همچنان در شمار صندلی منبع هستند، اما qualification ندارند.
- legacy: reconciliation جدا باید user/webinar/قیمت تاریخی/authority/payment/audit و حق ثبت‌نام را تطبیق دهد و مدیر بازه را صریح تعیین کند؛ مبلغ امروز شاهد مبلغ تاریخی نیست. این بسته ابزار promotion قدیمی ندارد. guard بازهٔ وبینار دارای ثبت‌نام را ثابت می‌کند؛ رفع بازهٔ null قدیمی به برنامهٔ بازبینی‌شدهٔ جدا نیاز دارد.
- fn_user_access، lib/access.ts، middleware و writer قدیمی admin/entitlements هنوز هر entitlement فعال را full می‌دانند و writer پیش‌فرض سه‌ماه دارد. آن قرارداد قدیمی اصلاح نشده و grant مشروعی حذف نشده است. مسیر M2 هرگز به آن writer/table وارد نمی‌شود؛ qualification A سطح عمومی حساب را تغییر نمی‌دهد. reconciliation grantهای قدیمی، مجوز خودکار برای revoke یا تبدیل جمعی نیست.
- FKهای RESTRICT سابقهٔ تلاش مالی را نگه می‌دارند؛ اثر بر cascade حذف حساب باید جدا پذیرفته شود. بازگشت از نصب آینده نیازمند snapshot ACL/function/policy و برنامهٔ جدا است؛ rollback آزموده‌شده rollback تراکنش settlement است.
- ضبط، بازپخش ویدئو، ماژول‌های اضافی، بازپرداخت، بدون‌انقضا و کانال پیاده یا تصویب نشده‌اند. replay این گزارش فقط تکرار callback/settlement است.
- اقدام بعدی با بازبین مستقل: review patch و SQL، snapshot واقعی schema/ACL در مرحلهٔ مجاز، پذیرش مرورگر و برنامهٔ نصب/بازگشت. تا آن زمان هیچ merge، نصب یا انتشار مجاز نیست.
