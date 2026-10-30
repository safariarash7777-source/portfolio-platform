# رسید خواندن عمومی Production و مسیر ذخیره‌شدهٔ مالی

این بسته نتیجهٔ اجراهای پیشین همین مأموریت را ثبت می‌کند؛ خواندن یا dispatch تازه‌ای برای تکرار شاهد انجام نشد. کد محصول بی‌تغییر است. این فایل‌ها محلی‌اند و هنوز commit/push نشده‌اند تا commit صرفاً وضعیت، Preview تازه نسازد؛ متن و شاهد قابل بررسی در PR331 نیز ثبت شده است.

## خواندن شرکت

مسیر واقعی: https://portfolio-platform-fawn.vercel.app/api/symbol-detail?l18=%D9%81%D9%88%D9%84%D8%A7%D8%AF

Production روی f93dbdc؛ `app/api/symbol-detail/route.ts` فقط SELECT از `ir_market_snapshots` با key=`symbol_details` می‌کند. این query با key=`latest` صندوق فرق دارد. `at` از `details[فولاد].at` می‌آید، نه ساعت کل بسته. هیچ درخواست provider، relay fallback، مدل یا نوشتنی در این route نیست.

یک GET، بدون credential و redirect/retry، در UTC از `2026-10-30T14:23:12.411991Z` تا `14:23:14.900414Z`: HTTP200، no-store، cache MISS، 32136 بایت. نماد پاسخ فولاد است. SHA256 پاسخ: `b9729e75bdb3df3170f81523d02f48fb236e12dc2ad8d65eab03e962bc462f06`؛ کل body ذخیره نشده است.

- دریافت ردیف: `2026-10-30T14:21:46.585Z`، سن هنگام خواندن 88.315 ثانیه.
- تاریخ/زمان خود داده: `1405-08-06 12:30:01`؛ helper موجود `sourceTime` به `2026-10-28T09:00:01Z` تبدیل کرد؛ حدود 53.387 ساعت قدمت. این replay آفلاین همان metadata دریافتی است، نه دادهٔ مصنوعی یا دریافت دوباره.
- source: طبق مسیر کد، اسنپ‌شات ذخیره‌شدهٔ جزئیات؛ فیلد source/quality/unit صریح در body ندارد. زنجیرهٔ تولیدکنندهٔ کد relay ساعت دریافت `now` را در `entry.at` می‌گذارد؛ ساعت منبع در خود data باقی می‌ماند. این مشاهده علت توقف collector را اثبات نمی‌کند.
- واحد: قرارداد اعلام‌شدهٔ کامپوننت موجود، قیمت و EPS خام ریال است و قیمت برای نمایش بر ۱۰ تقسیم می‌شود؛ پاسخ واحد مستقلی تأیید نکرده است. pc=4210 و pl=4260 خام؛ با قرارداد کنونی 421 و 426 تومان. این پذیرش واحد مالی جدید نیست.
- اثر روی صفحه از خواندن کد: state=ok، برچسب «اسنپ‌شات با دریافت تازه» و تاریخ منبع نمایش می‌یابد؛ ساعت و کیفیت مستقل منبع ارزیابی نمی‌شود. fresh receipt به معنی fresh quote نیست. مشاهدهٔ مرورگری تازه ادعا نمی‌شود.

## قرارداد صندوق و حد شاهد

`FundsPage → readIranMarket → getIrMarket → readSupabase(key=latest) → optional relay /market.json → cache/null`.

اسکیمای موجود: snapshotQuality نسخه۱ با state/receivedAt/retained جدا برای هر خانواده؛ واحد قیمت صریح toman/usd، زمان منبع و NAV مستقل، بازده با دورهٔ واقعی. PR337 خطای خواندن را از empty معتبر جدا می‌کند. classEvidence و navClassEvidence مستقل در قرارداد منبع موجود غایب‌اند؛ نوع/نماد مجوز حدس طبقه واحد نمی‌دهد و محاسبات وابسته null می‌مانند.

فراخوانی تازهٔ `/api/market` و `/market/funds` انجام نشد: اولی می‌تواند provider و ارزیابی alert را فعال کند؛ دومی می‌تواند fallback رله داشته باشد. در routeهای موجود API عمومی صرفاً ذخیره‌شده برای key=latest یافت نشد. count/asOf/unit/quality جاری صندوق و علت رد خواندن UNKNOWN است؛ صفر/empty یا علت 402 قدیمی Preview به Production تعمیم داده نمی‌شود. اصلاح پیام خطای PR337 پذیرش پنج صندوق واقعی نیست.

## اجرای workflow ثابت

کد main f93dbdc: `.github/workflows/research-source-read.yml`، `scripts/ops/research-source-read.mjs` و wrapper موجود audit شدند. مقصد ثابت `https://62.60.191.24/liara-preview`، دو گزارش عمومی مشخص فولاد در `codal_reports`، حداکثر ۱۰ نسخه برای هر منبع، ۲۰ ثانیه برای هر SELECT، ۱۵۰ ثانیه برای CLI، سقف body هر منبع 512KiB، redirect ممنوع. credential در محیط موجود می‌ماند. CLI پین‌شده 9.5.1 فقط روی Actions اجرا می‌شود؛ نصب سرور/collector/provider/model/write ندارد. raw capture خصوصی runner به artifact منتقل نمی‌شود.

Intent UTC `2026-10-30T14:24:29.349747Z`؛ beforeRunIds=40486868612,40484350138؛ یک dispatch با 204.

Run: https://github.com/safariarash7777-source/portfolio-platform/actions/runs/41071383088

Readback: exact f93dbdc، job124116606887؛ پایان `2026-10-30T14:26:34Z` با failure. نتیجهٔ پالایش‌شده در `14:26:31.1694342Z`: `completion_marker_missing`، exitCode=null، remoteFailure=null. CLI صفر بدون completion marker، اثبات اجرای remote read نیست. بستهٔ مالی تازه دریافت نشد و موفقیت قدیمی جایگزین نشد. Artifact شکست: 12985800486، نام research-source-folad، 280 بایت، digest `sha256:2b2ab96233a59a3cdeea5c30bab09cb22ecc62ec21b0530fc00dbe804b416d20`. علت فقدان marker UNKNOWN است؛ raw capture واکشی نشد و replay انجام نشد.

آخرین ردیف تاریخی ذخیره‌شده، readAt، رسید اسنپ‌شات و آخرین job موفق ورود داده چهار مفهوم متفاوت‌اند. این بسته شاهد lastSuccessfulFinancialIngestJob ندارد: UNKNOWN.

## آزمون و اقدام بعد

شش آزمون guard workflow و ۱۴ آزمون موجود route/family/stored-reader گذشتند، fail/skip صفر؛ آزمون‌های مصنوعی صرفاً قرارداد را می‌سنجند و موفقیت live مالی نیستند. رجیستری/کد CI تغییر نکرد.

اقدام بعد C: فقط پس از تطبیق مالکیت root، اصلاح محدود زمان مستقل در همان مصرف‌کنندهٔ نماد و آزمون ثبت‌شده. اقدام root در دامنهٔ دسترسی موجود: بررسی جداگانهٔ metadata اسنپ‌شات latest صندوق و علت marker transport؛ این پیشنهاد مجوز query/dispatch تازه نیست. انتشار اصلی، پذیرش پنج صندوق و successjob همچنان بازند.
