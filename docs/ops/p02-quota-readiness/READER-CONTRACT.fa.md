# قرارداد دریافت/اعتبار داده برای P01

تغییر افزودهٔ P02 در reader موجود است؛ جدول، ingestion یا موتور مالی جدید ندارد. `app/api/market` از قبل `availability` را ارسال می‌کند و هر state غیر ready را `partial=true` می‌داند؛ route و UI تغییر نکرده‌اند.

| فیلد | معنی |
|---|---|
| `state` | ready، stale، error، timeout و دو مقدار افزوده unknown-time / partial |
| `receivedAt` | زمان دریافت snapshot؛ timestamp مثبت/متناهی یا null |
| `sourceAt` | alias قدیمی receivedAt برای سازگاری؛ زمان قیمت نیست |
| `validAt` | قدیمی‌ترین زمان معتبر همهٔ خانواده‌های دارای داده، فقط وقتی همه clock معتبر دارند؛ در غیر این صورت null |
| `readAt` | زمان خواندن سایت؛ برای تاریخ قیمت استفاده نشود |
| `reason` | empty-source، invalid-receipt-time، old-receipt، rejected-rows، missing-price-time، old-price-time، read-error، read-timeout یا null |
| `families` | gold/currency/funds/stocks/crypto/options/indices؛ state، rows، rejectedRows، unknownTimeRows، staleRows، validAt |

ردیف خانواده‌ها تعداد **همین payload** است؛ expected universe یا اثبات gap تاریخی نیست. `unavailable` برای خانوادهٔ خالی دلیل توقف نماد/تعطیلی یا حذف داده را مشخص نمی‌کند. metadata نوع rejectedRows تعداد همهٔ ردیف‌های ردشده توسط validator موجود است؛ دلیل تک‌ردیف یا واحد خاص را استنتاج نکنید.

ready فقط وقتی دادهٔ پذیرفته‌شده موجود، receipt معتبر، clock همهٔ ردیف‌ها معلوم و غیرکهنه است. آستانهٔ کهنگی همان سیاست موجود ۳۰ دقیقه و تحمل آینده ۲ دقیقه است؛ این شاخص نمایش است و **الزام به انتشار قیمت تازه در تعطیلی بورس** ایجاد نمی‌کند. پاسخ HTTP200 به‌تنهایی ready نمی‌سازد. fresh receipt ساعت منبع را تغییر نمی‌دهد. زمان شاخص برای سطرهای سهام/صندوق یا option جایگزین نمی‌شود.

اولویت state: نبود داده → error؛ receipt نامعتبر/آینده → unknown-time؛ receipt قدیمی → stale؛ ورودی ردشده → partial؛ clock مفقود/آیندهٔ ردیف → unknown-time؛ ردیف کهنه → stale؛ وگرنه ready. `families` همزمان جزئیات را نگه می‌دارد، حتی اگر state کلی اولویت دیگری داشته باشد. شکست بازخوانی با cache → stale و reason read-error/read-timeout؛ داده و clock قبلی حفظ می‌شوند.

اعتبار unit stock/fund همان union موجود toman/usd است و واحد ناشناخته یا rial تبدیل نمی‌شود. crypto فقط unit صریح usd می‌پذیرد. NAV/change مفقود null می‌مانند. snapshot صرفاً crypto، options یا شاخص دیگر به اشتباه خالی شناخته نمی‌شود. options فعلی clock منبع در قرارداد reader ندارد؛ تا اصلاح ingestion مربوط، unknown-time می‌ماند. global reader فقط receivedAt را اضافه می‌کند و validAt=null است؛ این بسته تازگی قیمت CoinGecko را اثبات نمی‌کند.

P01 می‌تواند دو زمان «آخرین دریافت» و «زمان داده» و متن stale/unknown/partial را نمایش دهد. این بسته هیچ صفحهٔ رابط را تغییر نمی‌دهد؛ پذیرش UI با مالک P01 است. در payload تماماً مردود که reader cache قبلی را برمی‌گرداند، جزئیات ورودی مردود تازه در cache موجود نیست و reason خطای بازخوانی نشان داده می‌شود.

آزمون actual-reader با fetch مصنوعی و بدون service-role: ۴۸ ساعت receipt قدیمی، clock مفقود با شاخص تازه، receipt آینده، mixed clocks، رد واحد و crypto-only. آزمون قبلی حفظ ۷۶۰ سهم/۳۳۳ صندوق در شکست منبع و cooldown نیز محفوظ است. روز و ساعت تمام fixtureها ثابت‌اند؛ شبکهٔ واقعی یا provider فراخوانی نمی‌شود.
