# P04 — ورود فایل و نگاشت v0.1

وضعیت: طراحی قابل بازبینی؛ endpoint یا importer نصب‌شده نیست. نام ستون‌های فایل هنوز نیازمند inventory P05 است. مبنای canonical: [قرارداد](CANONICAL-CONTRACT.md).

| ورودی فایل/مینی‌اپ | مقصد موجود یا افزونه لازم | قاعده |
|---|---|---|
| owner / Telegram identity | UUID نشست و mapping مورد تأیید P01/P05 | مقدار داخل فایل تعیین‌کننده مالک نیست |
| external position id | position_key + جدول نگاشت رسید | ردیف تکراری همان منبع دوباره افزوده نشود |
| ticker / label | symbol یا manual_label | دقیقاً یکی؛ تطبیق مبهم نیازمند انتخاب عضو |
| class | asset_class | دسته ناشناخته خطا؛ حذف خاموش ممنوع |
| quantity / quantity unit | qty / unit | واحد مبلغ از واحد مقدار جدا؛ فقدان مقدار حدس نشود |
| valuation mode / value / currency | valuation_mode / declared_value / IRR یا IRT | ارزش کل قلم قبل از مالکیت؛ ریال مضرب10، پول داخلی تومان |
| acquisition cost | cost_basis | واحد فایل صریح؛ endpoint فعلی تومان می‌خواهد |
| ownership | ownership_pct | 0<درصد<=100 با حداکثر دو اعشار؛ درصد نامعلوم را 100 فرض نکن |
| value source/date/status | valuation_source/as_of/status | منبع و زمان واقعی؛ زمان import جای زمان قیمت نیست |
| cash | قلم دارایی در همان دفتر + حساب پیشنهادی | واحد و دامنه وجه نقد صریح؛ دسته/واحد از قرارداد ابزار P02 |
| account / purpose / liquidity | افزونه همان مدل، پس از P00 | موجود نیست؛ default تجاری اختراع نشود |
| last member confirmation | metadata نسخه پیشنهادی | created_at سرور به معنی تأیید آخرین قیمت عضو نیست |
| liabilities | member_debt_positions همان نسخه | جدا از دارایی و جریان؛ خالص منفی رد نشود |
| deposit/withdrawal/trade | رویداد اظهارشده پیشنهادی | snapshot را معامله واقعی کارگزاری ننام |

چرخه: parse محلی محدود → preview با شماره ردیف/واحد/خطا و مجموع‌های قابل اتکا → مقایسه با نسخه جاری → تأیید عضو → commit همان snapshot canonical با base_version/client_token → رسید. هیچ parse یا preview نوشتنی نیست. فهرست errors و warnings، اقلام بی‌قیمت و unresolved mapping آشکار باشد؛ commit تا رفع خطا/ابهام منع شود. endpoint فعلی سقف500 قلم دارد؛ سقف فایل/نوع CSV یا XLSX و سیاست نگهداری فایل هنوز باید تعیین و آزموده شود.

رسید پیشنهادی: شناسه import، مالک، hash فایل، نسخه parser/mapping، source namespace، external-id mapping، base/created version، تعداد ورودی/تکراری/ردشده/ثبت‌شده، تأیید عضو و زمان، وضعیت commit. counts قبل و بعد باید قابل تطبیق باشند؛ retry دقیق رسید و نسخه قبلی را برگرداند، تغییر محتوای همان token تعارض است. hash به‌تنهایی مشکل فایل یکسان با ترتیب متفاوت یا اصلاح دیرهنگام را حل نمی‌کند؛ key منبع/ردیف و نسخه mapping لازم است.

نمونه قطعی ساختگی: خانه با declared value=2,000,000,000 IRR و ownership=50 => 100,000,000 تومان متعلق به عضو؛ بدهی=120,000,000 IRT => خالص=-20,000,000 در پوشش کامل. افزودن قلم unpriced باید وضعیت partial را روشن کند، نه ارزش صفر. این نمونه fixture طراحی است و در این نوبت آزمون runtime نشده است.

فایل با واحد پول نامعلوم، 11 ریال، نماد مبهم، ردیف duplicate، مقدار نامعتبر یا مالک بیگانه باید خطای قابل اصلاح بدهد و نسخه نسازد. stale base در دو تب باید409 بدهد و preview/ورودی حفظ شود. انتقال miniapp ابتدا dry-run با داده ساختگی و reconciliation؛ مهاجرت مشتری واقعی بدون گیت P01/P04/P05 انجام نمی‌شود.
