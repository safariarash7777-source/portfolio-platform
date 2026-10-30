# P03.5 — قرارداد داخلی درخواست و پایان

وضعیت: قرارداد داخلی و validator قابل اجرا؛ writer، endpoint، schema، نصب، حق متصل و عرضهٔ عملیاتی **ساخته یا مشاهده نشده‌اند**. مبنا `START-A334@497ae4681783db7aa9bd9339993c36a29e93ed56` است. PR357@775 و PR355@a482 ثابت‌اند. مرجع وضعیت کل برنامه همچنان `docs/COMMAND-CENTER.md` نزد هماهنگ‌کننده است.

## نیاز مصوب و مرز این برش

AD-18 درخواست مستقل قابل اتصال به توصیه، AD-20 درخواست ← پاسخ تأییدشده ← پیگیری و backlog P03.5 پایان درخواست را می‌خواهند. این‌ها نیاز مصوب‌اند؛ نبود مدل اجرایی شکاف فنی است. CM-19 تعهد زمان رسیدگی را جدا باز نگه می‌دارد. این برش قیمت، SLA، سهمیه، مدت تازه، grant یا تبدیل حقوق گذشته تعریف نمی‌کند.

فایل‌ها: `lib/consultation/tickets.ts`، `ticketIntent.ts`، `tickets.test.ts`، همین سند و `package.json`. تنها استثنای package، افزودن مسیر literal `lib/consultation/tickets.test.ts` به `test:core` موجود است؛ dependency، lock، بقیهٔ scriptها و سایر فیلدهای package ثابت‌اند. import جانبی اولیه از `contracts.test.ts` حذف شد تا آن فایل عین مبنا بماند و آزمون‌ها دوباره اجرا نشوند. registry guard، workflow، API، SQL، Auth، Workspace، layout و پنج سند مادر تغییر ندارند. import یا transport محصولی برای قرارداد تازه وجود ندارد؛ فقط تست آن را مصرف می‌کند.

## دسترسی قدیمی در برابر حق خدمت جدید

بازبینی تکمیلی هماهنگ‌کننده مرز تأیید قبلی را روشن کرد: فیلتر kind/date/revoked فقط شاهد **دسترسی تحلیلی قدیمی consulting** است، نه اثبات حق مصرف مشاوره یا تیکت تازه. O10 و نگاشت خرید قدیم به حق همین خدمت هنوز تصمیم وابستهٔ باز است؛ این برش سؤال تازه یا اعطای خودکار ایجاد نمی‌کند.

| شاهد واقعی در کد | قرارداد این برش |
|---|---|
| `sql/phase11_access_tiers.sql`، جدول `public.entitlements` | consulting در توضیح مهاجرت منشأ دسترسی کامل تحلیلی برای مشتری مشاوره است؛ service_id، اعتبار باقی‌مانده و نسخهٔ شرایط فروش ندارد. منبع قدیمی حفظ می‌شود؛ جدول حق موازی ساخته نمی‌شود. |
| `kind` برابر consulting/webinar/manual و `user_id` | فقط ردیف consulting همان عضو وارد طبقه‌بندی legacy consulting می‌شود. این ردیف به‌تنهایی حق همین خدمت نیست؛ full/admin/webinar/manual نیز چنین حقی ایجاد نمی‌کنند. |
| `starts_at` و `expires_at` هر دو NOT NULL؛ `revoked_at` | فعال‌بودن legacy: `revoked_at IS NULL` و `starts_at <= زمان ارزیابی < expires_at`. این بازه شاهد مدت یا اعتبار خدمت جدید نیست. زمان و حق معتبر عملیات آینده باید در backend کنترل شوند. |
| `source` یک منشأ ممیزی است | `source='admin_grant'` روی ردیف consulting با `kind='manual'` فرق دارد؛ منشأ و شناسهٔ همان ردیف حفظ می‌شوند و اعتبار یا خدمت جدید تولید نمی‌کنند. |
| `lib/access.ts` و `fn_user_access` | هر حق فعال یا admin را full می‌کنند؛ برای مجوز خدمت شخصی استفاده نمی‌شوند. |
| `app/api/admin/entitlements/route.ts` | مسیر grant موجود است؛ فراخوانی نشد و حق ساختگی ایجاد نشد. پیش‌فرض سه‌ماههٔ قدیمی، مدت تازهٔ محصول نیست. |

`classifyLegacyConsultingAccess` فقط نمونهٔ **درون حافظه** از ستون‌های موجود را طبقه‌بندی می‌کند؛ خوانندهٔ DB یا مجوز نیست. خروجی `legacyAccessState` از `serviceRightState:'not_connected'` جداست و فیلد مبهم state/حق فعال ندارد. `matchingLegacyEntitlementIds` فقط شناسه‌های قدیم را برای تطبیق حفظ می‌کند؛ grant، تبدیل یا حذف انجام نمی‌شود. ورودی ready باید فهرست کاملِ مختص عضو و ستون‌های `id,user_id,kind,source,starts_at,expires_at,revoked_at` باشد. شکست/نقص/دادهٔ ناسازگار legacy unknown است؛ snapshot متصل‌نشده legacy not_connected است. legacy فعال نیز همیشه `serviceRightState:not_connected`، `writeEnabled:false` و `authority:not_connected` دارد. زمان ورودی classifier برای آزمون است، زمان معتبر تراکنش تولید نیست. سقف ۱۰۰۰ ردیف فقط کران پردازش قرارداد است، سهمیهٔ خدمت نیست.

نمونه‌های ساختگی قابل اجرا در تست، بدون تغییر حقوق واقعی:

| نمونهٔ ردیف قدیمی و زمان ارزیابی | legacyAccessState | serviceRightState | اثر روی همان درخواست |
|---|---|---|---|
| consulting با source=admin_grant، از ۱ اکتبر تا ۱ نوامبر؛ ارزیابی ۲۴ اکتبر | active | not_connected | حق مشاوره/تیکت یا تعداد اعتبار ثابت نمی‌شود؛ نوشتن همچنان بسته است. |
| همان ردیف، ارزیابی دقیقاً در expires_at | inactive | not_connected | انقضای legacy شاهد انقضای یک حق خدمت مستقل نیست؛ تاریخچهٔ مجاز حذف نمی‌شود. |
| همان ردیف با revoked_at ثبت‌شده | inactive | not_connected | لغو legacy خودکار به تبدیل/حذف خدمت یا آرشیو تازه منجر نمی‌شود؛ عملیات وابسته هنوز اتصال حق معتبر ندارد. |

پیشنهاد مشخص برای اتصال بعدی: خرید واقعاً مرتبط به همین خدمت، گیرنده و نسخهٔ شرایط فروشی که معتبر پذیرفته شده است با شواهد قابل بازخوانی تطبیق داده شوند. شرایط باید دامنهٔ خدمت و اثر هر عملیات همان درخواست را روشن کنند؛ اگر اعتبار/مدت/تعداد در سند معتبر وجود ندارد، نامعلوم بماند و عدد ساخته نشود. ردیف consulting قدیمی فقط یکی از شواهد تطبیق است، نه قرارداد مصرف. نگاشت خرید قدیم و شرایطش در O10 باقی می‌ماند و بدون تصمیم معتبر مالک به حق جدید تبدیل نمی‌شود. پس از اتصال واقعی، backend می‌تواند حق همان عملیات را در همان تراکنش و با مرجع خرید/شرایط بررسی کند؛ requestId و تاریخچهٔ موجود ثابت می‌مانند. تا آن زمان همهٔ خروجی‌های داخلی، حتی با legacy فعال و lookup موفق، writeEnabled:false دارند. این پیشنهاد schema یا reader حق خدمت پیاده‌شده نیست.

## شکل درخواست و رویدادها

پاکت `consultation-ticket-request.v1` شامل `expectedActorId`، `clientToken` و command است. `requestId` شناسهٔ پایدار مستقل و `clientToken` شناسهٔ همان تلاش شبکه است؛ تلاش تازه یا retry هویت درخواست را عوض نمی‌کند. subject تا ۲۰۰ و متن/دلیل تا ۲۰۰۰ نویسهٔ Unicode، پاکت تا ۲۰۰۰۰ بایت است. این کران‌های فنی، سهمیهٔ تجاری نیستند.

| command | دادهٔ اختصاصی | نقش پیشنهادی طبق الگوی موجود |
|---|---|---|
| open | subject، text، recommendation صریحاً null یا مرجع کامل؛ baseVersion=0 | عضو همان رابطه |
| member_followup | text، نسخهٔ فعلی درخواست | عضو همان رابطه |
| advisor_clarification | text، نسخهٔ فعلی درخواست | مشاور مالک ثبت‌شدهٔ همان رابطه |
| link_recommendation | مرجع دقیق نسخهٔ منتشرشده یا سابقهٔ مجاز پس‌گرفته‌شده | همان مشاور مالک؛ پیوند، توصیه را دوباره معتبر نمی‌کند |
| close | reason غیرخالی و نسخهٔ فعلی درخواست | همان مشاور مالک؛ پایان مستقل از اعلام انجام اقدام است |

همه commandها `relationshipId`، `requestId` و `baseVersion` دارند. نقش‌های فوق **مجوز نوشتن متصل نیستند**؛ validator فقط سازگاری با read مجاز موجود، نقش، رضایت، lookup و نسخه را بررسی می‌کند. backend آینده باید هویت واقعی، فعال‌بودن registry، اختیار مالک، رضایت و حق **همین خدمت از خرید/شرایط معتبر** را در همان تراکنش و با کنترل هم‌زمانی دوباره بررسی کند؛ kind consulting جانشین آن نیست. هیچ `actorRole`، زمان ثبت، hash معتبر یا ادعای حق از فرمان کلاینت پذیرفته نمی‌شود.

رویداد شامل شناسه، actor، version، زمان ثبت، command نرمال و hash مرجع backend است. تاریخچهٔ ready از open نسخهٔ ۱ شروع می‌شود؛ نسخه و baseVersion پیوسته‌اند، شناسه‌ها یکتا و زمان‌ها مرتب‌اند. close رویدادی append-only و نهایی است؛ پس از آن رویداد تازه یا آغاز مجدد همان درخواست پذیرفته نمی‌شود. بازگشایی یا حذف رویداد در این قرارداد تعریف نشده است. سقف ۵۰۰ رویداد کران serialization است؛ تاریخچهٔ بریده‌شده ready معرفی نمی‌شود.

`validateTicketContinuation` بازخوانی تازه را با prefix تأییدشده تطبیق می‌دهد و کوتاه‌شدن یا بازنویسی گذشته را رد می‌کند. اگر یکی از خواندن‌ها unavailable باشد، تداوم unknown می‌ماند. این کنترل کلاینت جانشین immutable storage در DB نیست.

## پیوند دقیق، تاریخچه و رضایت

مرجع توصیه فقط `{sessionId,version,contentHash}` کامل است؛ null یعنی درخواست مستقل. ID یا hash ارسالی کلاینت دسترسی ایجاد نمی‌کند. منبع تطبیق، همان `ConsultationRead` معتبر با رابطه و جلسات مجاز است و validator همان قرارداد موجود را دوباره اعمال می‌کند. جلسهٔ موجود با نسخه/hash متفاوت یا draft/approved منتشرنشده رد می‌شود. مرجع تاریخیِ خارج پنجرهٔ مجاز `unknown` می‌ماند؛ از latest، index یا نام مشابه جایگزین نمی‌شود. پیوند تازه بدون resolved دقیق آماده نمی‌شود.

پیوند به نسخهٔ پس‌گرفته‌شده صرفاً برای سؤال/سابقه است؛ معتبرشدن، تأیید دوباره یا انتشار توصیه نیست. `withdrawn` ممکن است پیش از انتشار رخ داده باشد: resolver علاوه بر مرجع کامل، تأیید و رویداد publish همان جلسه را در read مجاز می‌خواهد؛ نبود شاهد unknown است و پیوند تازه آماده نمی‌شود. backend آینده باید همان گیرنده و انتشار تاریخی مجاز آن نسخه را از مرجع واقعی کنترل کند؛ وجود sessionId یا resolver کلاینت کافی نیست. تغییر توصیه همچنان نسخهٔ تازه و مسیر تأیید/انتشار موجود می‌خواهد؛ متن توضیح آزاد جای آن نیست.

مرز خواندن از `consultation_private.access` و `validateConsultationRead` موجود گرفته شده است: عضو تاریخچهٔ خودش را پس از لغو رابطه حفظ می‌کند؛ مشاور لغوشده/غیرفعال حق تاریخچه را از DTO تازه به دست نمی‌آورد. آماده‌سازی هر command تازه پس از لغو رد می‌شود. مرز عملیاتی انقضای حق و خواندن آرشیو باید هنگام اتصال backend مطابق قرارداد خدمت بررسی شود؛ این فایل مسیر جاری را مسدود یا مجاز نمی‌کند.

سؤال، پیام یا feedback قدیمی به درخواست تازه تبدیل نمی‌شود؛ `done`، `viewed`، آخرین پیام یا وجود پاسخ به معنی close نیستند. شناسهٔ سؤال قدیمی در پاکت جدید جایی ندارد و fields اضافی رد می‌شوند.

## intent، رسید و بازخوانی

`createTicketIntent` به lookup صریح `consultation-ticket-lookup.v1` برای **actor، relationshipId، requestId و همان clientToken** نیاز دارد. lookup دو بخش request و attempt دارد و هر بخش found/confirmed_absent/unavailable است. found درخواست، read همان درخواست را می‌خواهد؛ found تلاش، رسید دقیق همان فرمان را می‌خواهد. null، read خام، وضعیت مبهم absent یا token دیگر، شاهد نبودن نیستند و رد می‌شوند. این فقط validator مدل داخلی با authority:not_connected است؛ lookup واقعی DB یا شاهد عملیاتی تولید نمی‌کند. backend آینده باید lookup معتبر را در مرجع اصلی و همان تراکنش انجام دهد؛ DTO کلاینت مجوز absence نیست.

آماده‌سازی fresh فقط با attempt=confirmed_absent مجاز به ادامهٔ بررسی ساختاری است؛ open علاوه بر آن request=confirmed_absent می‌خواهد و پیگیری request=found با تاریخچهٔ معتبر و CAS درست می‌خواهد. unavailable یا found receipt وارد مسیر fresh نمی‌شوند. JSON intent ثابت و frozen است و همواره `serviceRightState:not_connected`، `writeEnabled:false` و `service_entitlement_not_connected` دارد. هیچ fetch، URL، endpoint، grant یا adapter DB ندارد.

`recoverTicketIntent` پیش از هر pending/receipt return، هویت، همان relationshipId و نقش معتبر خواندن تاریخچه را با `validateTicketHistoryAccess` و قرارداد consultation موجود **بیرون catch خطای lookup** کنترل می‌کند. مشاور لغوشده/غیرفعال، تغییر حساب یا رابطهٔ انتخاب‌شده fail-closed هستند و هیچ result/body/receipt خصوصی برنمی‌گردد؛ خطای مجوز به unavailable عادی تبدیل نمی‌شود. عضو صاحب رابطه، تاریخچهٔ خودش را پس از لغو حفظ می‌کند و fresh write همچنان رد است.

فقط در context مجازِ همان رابطه، recovery همیشه body، requestId و token محفوظ را نگه می‌دارد و هیچ intent یا token تازه‌ای نمی‌سازد. ورودی صریح knownReceipt، رسید قبلاً دریافت‌شده یا null به معنی «رسید محفوظ محلی نداریم» است؛ این null هرگز شاهد نبود در DB نیست. رسید شناخته‌شده در شکست بعدی lookup یا گزارش نبود متناقض حفظ می‌شود. found receipt فقط با اثر دقیق در read مستقل confirmed می‌شود؛ در نبود/خطای read یا ناهماهنگی readback_pending می‌ماند. lookup نامعلوم/ناقص/متعلق به token دیگر، بدون رسید قبلی unavailable است و با رسید قبلی readback_pending می‌ماند. confirmed_absent نیز همان intent را نگه می‌دارد، نه تلاش تازه یا اجازهٔ ارسال. ناپدیدشدن درخواستِ قبلاً موجود برای یک پیگیری/پایان، وضعیت ناسازگار و unavailable است. در نتیجه نتیجهٔ نامعلوم نوشتن عملیاتی در این برش تولید نمی‌شود؛ recovery عملیاتی واقعی پس از اتصال backend باید همین مرز را با منبع معتبر رعایت کند.

رسید `consultation-ticket-write.v1` باید دقیقاً actor، token، command، رویداد، نسخهٔ base+1، reused و canonicalContentHash را داشته باشد. hash را backend محاسبه می‌کند؛ این برش الگوریتم مستقل hash نمی‌سازد. `ticketReceiptVisible` فقط وجود **همان رویداد** با همان actor/request/command/version/hash در read مستقل معتبر را می‌پذیرد؛ موفقیت GET یا خود رسید کافی نیست. این validator رسید معتبر تولید نمی‌کند. reused و وضعیت HTTP هنگام طراحی endpoint واقعی با الگوی موجود بسته خواهند شد؛ اکنون endpointی وجود ندارد.

نمونه‌های زیر ساختگی و توضیحی‌اند؛ از طریق تست واقعی validator اجرا می‌شوند:

1. عضو درخواست Q بدون توصیه را با token اول و lookup صریح confirmed_absent برای درخواست و همان تلاش، برای بررسی آماده می‌کند؛ تغییر token، Q را عوض نمی‌کند و absence تلاش دیگر به آن سرایت نمی‌کند. history نمونهٔ ثبت‌شدهٔ نسخهٔ ۱ باز است و حق نوشتن همچنان متصل نیست.
2. آرش در نسخهٔ ۲ درخواست، پیوند به جلسهٔ S نسخهٔ ۱ با hash همان نسخه را اضافه می‌کند. وجود S نسخهٔ ۲ یا نسخهٔ پیش‌نویس، جای مرجع اول را نمی‌گیرد.
3. followup با baseVersion قدیمی رد می‌شود. پس از read معتبر نسخهٔ ۲، command تازه می‌تواند برای بررسی آماده شود؛ ارسال هنوز بسته است.
4. close با reason در نسخهٔ ۳، رویداد تازه است. پاک‌کردن یا ویرایش رویداد ۱، فقدان نسخهٔ ۲ و رویداد ۴ بعد close رد می‌شوند. done اقدام، این پایان را تولید نمی‌کند.
5. خطای خواندن تاریخچه → status=null، نه open یا فهرست خالی. خواندن بعدی ممکن است تاریخچه را بازیابی کند، ولی تداوم با snapshot نامعلوم verified اعلام نمی‌شود.

## پیش‌نیاز تحویل backend بعدی

پیشنهاد نام فایل‌ها برای مرحلهٔ بعد، **ساخته نشده**: migration با نام ساخته‌شده توسط CLI طبق روال مخزن برای events/receipts خصوصی؛ leaf سرور `ticketServer.ts` و route زیر همان فضای consultation پس از تصویب قرارداد. پنهان‌بودن route به‌تنهایی مرز مجوز نیست؛ مطابق [راهنمای رسمی RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)، grant و سیاست داده باید با هم محدود شوند. فایل SQL یا API اکنون اضافه نشده است.

backend باید: اتصال معتبر حق خدمت به خرید/شرایط و زمان DB، registry مالک، رضایت، قفل actor/request، lookup صریح درخواست و همان receipt با found/confirmed_absent/unavailable پیش از fresh append، CAS، قیود پیوند به گیرنده/جلسهٔ مجاز، ثبت append-only و رسید قابل بازخوانی را در همان تراکنش تضمین کند. grant ساختگی، bypass با legacy consulting/admin/full، schema موازی حق و مهاجرت حدسی legacy مجاز نیست. نصب target، schema/ACL واقعی، تضمین هم‌زمانی با لغو حق/رضایت، cleanup آزمایشگاه و پذیرش مرورگر هنوز شاهد ندارند. آغاز عرضه یا ثبت پاسخ از طرف آرش از این قرارداد نتیجه نمی‌شود.

## شواهد محلی

۶۸ آزمون قرارداد/درخواست/سرور/پاسخ موجود پاس شدند؛ ۲۷ مورد جدید، validator و resolver و intent/lookup/recovery واقعی این برش را اجرا می‌کنند. با مسیر literal در `test:core`، آزمون‌های تیکت جدا از ۱۲ آزمون contracts موجود ثبت‌اند؛ import جانبی حذف شده است. نمونه‌ها در حافظه‌اند و دادهٔ واقعی عضو، حق، پاسخ، رضایت یا ثبت‌نام تغییر نکرده است.

CI منبع 4b4a9aa پذیرفته نشد: registry guard فایل tickets.test.ts را orphan تشخیص داد، هرچند import قبلی آن را اجرا می‌کرد. رفع صرفاً ثبت literal و حذف import است؛ guard دست‌نخورده مانده است. آزمون focused registry پیش از رفع ۱ شکست و پس از آن ۲/۲ پاس داشت؛ شش recovery regression و همان suite گستردهٔ ۶۸ مورد با پنج entry صریح دوباره پاس شدند. این‌ها جای CI منبع تازه را نمی‌گیرند؛ اجرای کامل Core و CI قبلی با suite محدود محلی یکی معرفی نمی‌شود.

شش regression مستقل مرز recovery را پوشش می‌دهند: مشاور revoked، مشاور disabled، تغییر selected relationship، تغییر actor، حفظ تاریخچهٔ عضو پس از لغو، و حفظ exact bytes/رسید روی unavailable مجاز. سه مورد اول پیش از guard در منبع c2eeb8b شکست می‌خوردند و پس از رفع هر شش پاس شدند؛ هیچ کاهش گیت یا تغییر سیاست consultation لازم نشد. این شاهد محلی است و آزمون writer/DB عملیاتی محسوب نمی‌شود.

```text
node node_modules/tsx/dist/cli.mjs --test lib/consultation/tickets.test.ts lib/consultation/contracts.test.ts lib/consultation/request.test.ts lib/consultation/server.test.ts scripts/testing/consultation-replies/replies.test.ts
```

آزمون‌ها شامل cross-actor/رابطه، نسخه/hash ناقص یا غلط، مرجع تاریخی و خارج پنجره، لغو رضایت و غیرفعال‌شدن مشاور، CAS، شکست خواندن، بازنویسی prefix، پایان نهایی، receipt/readback دقیق، منبع admin_grant در برابر kind manual، حق ناقص/خراب/نامرتبط و مرز شروع/انقضا هستند. دقت میکروثانیهٔ timestampهای PostgreSQL در classifier و ترتیب رویداد حفظ می‌شود؛ `Date.parse` به‌تنهایی مبنای این مرز نیست. این آزمون، اثر تراکنش DB یا منبع زمان/حق واقعی را اثبات نمی‌کند.
