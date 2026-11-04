# P07 — اتصال محدود metadata رسمی گزارش به جدول جاری، فقط کد

مبنای این برش `5b5974405a952fe782419a23ca03134c7247cd7e` و شاخه والد ثابت PR394 است. بسته بازبینی‌شده `010bce411d698895ebe0fc9c76cf0d397320825f44c34de48bfc49f291bd3e8d` به‌همراه شاهد مسیر کد ناشر `ca2008d5a334eb34dbf85d6421158b10a3e3f30d8b06400c8954f24c113c370c`، فقط قرارداد scope و دوره B را پشتیبانی می‌کند. این سند شرح تغییر برای بازبین است؛ وضعیت کل پروژه همچنان در COMMAND-CENTER با مالکیت هماهنگ‌کننده است.

## مشکل و رفتار تغییر

Excel می‌تواند عنوان عمومی «صورت سود و زیان» داشته باشد، درحالی‌که گزارش رسمی دارای isConsolidated=false، مدت شش ماه و پایان دوره صریح است. parser قبلی فقط عنوان/شرح/سربرگ محلی جدول را می‌خواند؛ این نمونه در scope_unknown می‌ماند. مسیر اختیاری جدید در همان admitN10Html، بایت‌های گزارش رسمی و Excel و URLهای همان اطلاعیه را کنترل می‌کند و فقط به جدول یکتای منطبق و ستون B اجازه استفاده از metadata می‌دهد.

readN10ReportMetadata دریافت شبکه، اجرای JavaScript یا نوشتن ندارد. JSON literal با کلید تکراری رد می‌شود؛ parser موجود capitalization با سیاست آخرین کلید برنده برای این کار مناسب نیست و تغییر نکرده است. شناسه گزارش، تاریخ، هش، sheet/table/meta در production hardcode نشده‌اند؛ نمونه‌های آزمون شناسه‌های متفاوت دارند.

کنترل‌ها: هش بایت کامل و UTF-8، URL رسمی و LetterSerial با decode فقط یک‌بار بدون تبدیل + به فاصله، همان URLهای announcement، تطبیق هدر نام/نماد/تاریخ/حسابرسی/مدت، sheet منتخب یکتا، table و cell یکتا، انواع صریح، B1/B2 معتبر و قابل‌مشاهده، context واقعی از extractN10Tables، شرح/عنوان و پنج لنگر مالی جاری منطبق. دامنه یا مدت محلی متناقض را metadata ریشه بازنویسی نمی‌کند. تاریخ جلالی جدید با طول واقعی ماه و سال بررسی می‌شود؛ calendar=jalali و periodKind=cumulative در نتیجه بازرسی صریح‌اند.

## قرارداد backend تا مصرف‌کننده

- relay/codal.mjs: downloadAndParse همچنان فقط Excel دریافت می‌کند و ورودی جدید را نمی‌فرستد. هیچ caller، budget، env یا collector تغییر نکرده است؛ مسیر جدید در runtime فعال نشده است.
- lib/fundamental/types.ts: CodalN10Data سرمایه و standalone کامل می‌خواهد. خروجی inspectN10ReportBinding همیشه data=null دارد و CodalN10Data نیست؛ وارد ذخیره‌سازی یا UI نمی‌شود.
- lib/fundamental/supabase.ts: فقط گزارش‌های دارای واحد معتبر و دامنه شرکت در n10Periods قرار می‌گیرند. این reader و قرارداد ذخیره تغییر نکرده‌اند.
- app/symbol/[symbol]/page.tsx همان period_months، unit، scope و مبالغ را به lib/core/quarterly.ts می‌دهد. فصل دوم فقط ۶ماهه منهای ۳ماهه معتبر در همان زنجیره است؛ فقدان/ناسازگاری ۳ماهه، خروجی فصل را null نگه می‌دارد. کد محاسبات تغییر نکرده؛ آزمون رگرسیون اضافه شده است.

## مرزهای محفوظ

مدت B به contextMonths منتقل نمی‌شود؛ بنابراین به C ارث نمی‌رسد. D، سایر contextها و سرمایه مستقل‌اند. میلیون ریال به EPS و درصد تعمیم داده نمی‌شود. چهار خانه درصد Excel که خالی‌اند با صفر JSON پر نمی‌شوند؛ برابری کامل جدول ادعا نشده و ۳۳ خانه پنهان نمونه پذیرفته نشده‌اند.

در نمونه عمومی فولادِ بایگانی‌شده، با ورودی اختیاری metadata، بازرسی current-column-bound و calendar=jalali/periodKind=cumulative/months=6 است؛ پذیرش کامل هنوز data=null و period_unverified به‌علت مدت C دارد. بدون این ورودی، نتیجه قبلی scope_unknown باقی است. بسته مالی مستقل سرمایه نیز همچنان لازم است. در fixture مصنوعی، فقط پس از ارائه مدت صریح C و context جداگانه سرمایه، مسیر کامل می‌تواند از همان normalizeN10 موجود خروجی بگیرد.

## آزمون و محدودیت شواهد

آزمون‌های منفی: تاریخ نامعتبر جلالی/روز کبیسه، ۶ماهه≠فصل یا ماه، scope متناقض، جدول/ستون/کلید تکراری، نوع نامعتبر، URL یا هش نامنطبق، B ناسازگار، درصد خالی و جلوگیری از ارث‌بری C/D/جدول دیگر. آزمون‌های جدید از entrypoint فعلی codal-n10-admission.test.mjs در CI اجرا می‌شوند؛ workflow موازی ساخته نشده است.

اسکریپت بازرسی قبلی ابتدا هش فایل کاری CRLF را با Git LF مقایسه کرده و شکست خورده بود؛ اصلاح verifier تنها تبدیل line ending برای source محلی را انجام داد. spanهای HTML همیشه از raw UTF-8 بدون newline normalization استخراج شده‌اند. این سابقه مربوط به ابزار خروجی است، نه تغییر parser یا داده.

### خطای واقعی بارگذار آزمون و نتیجه اصلاح

در نسخه کدی `99a6d1e4a8a328ea92e0bf63ffeee38fc690da12` این بخش از سابقه هنوز در **همین سند** نوشته نشده بود؛ تنها سابقه CRLF بالا موجود بود. ادعای قبلی درباره ثبت loader failure در این سند تصحیح می‌شود. لاگ خام تلاش ناموفق واقعاً محفوظ است و برای ساخت شاهد دوباره تولید نشده است.

مسیر دقیق فایل، نسبت به ریشه workspace یعنی پوشه والد checkout، `outputs/p07-metadata-binding-implementation-20261104/legacy-codal.log` است؛ معادل آن از ریشه checkout، `../outputs/p07-metadata-binding-implementation-20261104/legacy-codal.log` است. SHA-256 فایل اصلی `93cd4ccb24fa6bf72075c36be1e6f3bc27f8a0c4d93ea22c5bbb7b38c0517a3a` است. این artifact خارج Git نگهداری می‌شود و لینک دانلود عمومی ندارد. excerpt واقعی آن:

```text
actual-codal-offline.mjs:5
import { readN10ReportMetadata } from "./codal-report-metadata.mjs";
^^^^^^

SyntaxError: Cannot use import statement outside a module
```

این تلاش با exit=1 روی Node v24.22.1 شکست خورد. علت، باقی‌ماندن import تازه در بدنه‌ای بود که loader آزمون با `vm.runInThisContext` اجرا می‌کرد. اصلاح موجود در همان نسخه کدی، import را مثل سایر importهای شناخته‌شده حذف و **خود تابع واقعی** `readN10ReportMetadata` را به wrapper تزریق کرد؛ تابع جعلی جای آن قرار نگرفت. لاگ اجرای موفق بعدی `outputs/p07-metadata-binding-implementation-20261104/legacy-codal-final.log`، SHA-256 `b96dbd5a550159a987b78fa674eb14aee39f0981aac86e4b8e9191078a93b10b` است؛ suite مشترک ۹ آزمون producer با fail=0 و guard شبکه/childProcess=0 ثبت شده است. اصلاح مستندات کنونی هیچ‌کدام از این آزمون‌ها یا خطا را دوباره اجرا نکرده است.

### شمارش و نسخه دقیق CI

برای نسخه کدی `99a6d1e4a8a328ea92e0bf63ffeee38fc690da12`، **۱۲۱ آزمون admission و ۱۴ آزمون quarterly، هرکدام یک‌بار** گزارش می‌شوند. اجراهای تکراری همان آزمون در Core/Calc یا اجرای مستقل suite مشترک producer، تعداد سناریوهای تازه محسوب نمی‌شوند. این اعداد ادعای تعداد کل آزمون‌های مخزن نیستند.

[CI 41769978743](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/41769978743) روی Node22.23.4 هر پنج job الزامی را پاس کرد. checkout واقعی آن merge ref با SHA `f6b236391568acad87f6076413686ed2add96827` بود؛ tree آن `dc524568fec78d6d7aad604cd529ff94c5857bda` دقیقاً با tree نسخه کدی 99a6 برابر بود. base همان `5b5974405a952fe782419a23ca03134c7247cd7e` است. job اختیاری native اجرا نشد و پذیرش واقعی محسوب نمی‌شود. رسید جزئیات: `outputs/p07-metadata-binding-implementation-20261104/CI-PASS.json` نسبت به ریشه workspace.

این نتیجه متعلق به نسخه کدی 99a6 است؛ commit تکمیلی حاضر فقط همین سند را تغییر می‌دهد. SHA جدید مستندات و وضعیت CI احتمالی آن جداگانه در بدنه PR406 ثبت می‌شوند و با نتیجه CI بالا یکسان فرض نمی‌شوند.

پاس‌شدن آزمون‌ها/CI مجوز merge یا فعال‌سازی نیست. این برش هیچ DB، relay، Production، محیط یا داده‌ای را تغییر نمی‌دهد. اتصال عملیاتی منبع، کنترل مدت C و سرمایه و بازبینی مصرف‌کننده گیت‌های بازند.

## ادامه بررسی actual archive — ۴ نوامبر، بدون تغییر admission

بسته محلی outputs/p07-admission-followup-20261104/ روی همین source99/doc133 آماده شد. شش آزمون actual archive موفق و guard شبکه/child process صفر است؛ runtime تغییر نکرد و full admission همچنان data:null / period_unverified است. نسخه PR412/5fe و P14 دست‌نخورده ماندند.

کمترین علت نخست: table904/C1 وC2 فقط پایان دوره1404/06/31 و پایان سال مالی1404/12/29 دارند؛ مدت یا شروع در metadata و متن محلی این ستون نیست. شش‌ماهه صریح context9 به‌دلیل هندسه merged و فقدان اتصال metadata به C منتقل نشد. JSON رسمی منتخب فقط table904/941 را دارد؛ context4/5 سرمایه هنوز هویت مستقل table/scope ندارند. برابری سه مبلغ سرمایه جای stock/asOf و احراز هویت را نمی‌گیرد.

شاهد تازه EPS: A27/B27 سود پایه هر سهم308 و A28/B28 سود خالص هر سهم با واحد صریح ریال306 در JSON و Excel جدا هستند. B28 فرمول متنی =ROUND((B21/B29)*A30,0) و C28 فرمول =ROUND((C21/C29)*B30,0) دارد؛ A30/B30 مقدار1000 اما isVisible=false هستند. هیچ فرمول یا hidden cell اجرا/فعال نشده و این دو مفهوم EPS یکسان نشدند. وجود EPS صریح تأیید است، اما admission و EPS TTM همچنان جدا بازند.

در بسته23fragment با بازه UTF-8 و SHA256 و RESULT.fa.md ثبت شده است. اقدام بعدی مالک منبع: شاهد رسمی مدت همان C یا اتصال رسمی قالب/گروه ستون یادداشت، و هویت مستقل جدول سرمایه با stock/asOf. این بسته مجوز دریافت، SQL، انتشار یا تغییر قرارداد partial نیست؛ CI/integration و مرجع وضعیت با هماهنگ‌کننده است.
