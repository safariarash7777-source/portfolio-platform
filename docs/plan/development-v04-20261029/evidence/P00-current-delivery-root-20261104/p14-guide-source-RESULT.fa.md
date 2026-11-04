# P07/P14 — راهنمای منبع نمودارهای شرکت، نامزد مستقل PR408

مبنا دقیق: `7fd355b8f7c39328b5f545831e1ced41bb9e1936`. تغییر نامزد فقط در `CompanyReportSources.tsx` و `SymbolDossier.module.css` است. این مؤلفه در page فقط با `previewView` فعالِ شرکت متصل می‌شود؛ قرارداد داده، نمودار، فیلتر، URL، محاسبه، parser و loader عوض نشده‌اند. checkout اصلی همچنان PR412/5fe و تمیز است. adoption، CI کامل و Preview با هماهنگ‌کننده است؛ لینک Preview7fd شاهد این تغییر تازه نیست.

## نتیجه رابط

در شناسنامهٔ موجود، چهار بخش بازوبسته‌شونده با17 توضیح اضافه شد. هر توضیح زمان مبنا، واحد/تعریف و شرط نمایش یا گپ را می‌گوید؛ منبع هر خانواده نیز صریح است. اطلاعات منبعِ واقعی بالای مؤلفه، شامل تاریخ نامعلوم و واحد نامعلوم، عیناً حفظ شده است. راهنما الگوریتم دوم تشخیص آمادگی نیست و از حضور یک گزارش نتیجه نمی‌گیرد که همه نمودارها آماده‌اند. علت وضعیت فعلی همچنان کنار همان نمودار است.

## ادامه حلقه آرشیو P07، بدون تغییر

سه فایل موجود Decision/main/scripts با SHA قبلی تطبیق داده شدند.12 fragment رسمی با بازه بایتی و hash دوباره خوانده شد: datasource→indexDto→کپی JSON→sheet→table→cell→template. constructor cell ویژگی‌های خام را عبور می‌دهد؛ این مسیر، مدت مالی غایب C را تولید نمی‌کند و برای context4/5 جدول سرمایه metadata تازه نمی‌آورد. نام قالب FinancialStatement-Listed-Product-V9 در JSON، قاعده مالیِ مدت یا دامنه نیست.

`changeSheet(this.value)` در HTML فقط محل فراخوانی است؛ تعریف literal آن در دو bundle موجود پیدا نشد. JSON انتخاب‌شده فقط sheet1/table904 و941 دارد. جست‌وجوی literal و همین fragmentها، نبود هر کد غیرمستقیم یا فایل دریافت‌نشده را اثبات نمی‌کنند. نتیجه همچنان عدم شاهد مستقل برای C/context9 و سرمایه است؛ هیچ guard، تاریخ، رقم، واحد یا scope تعمیم داده نشد. `archive-lineage.json` شواهد و حدود را نگه می‌دارد؛ GET و اجرای کد ناشر صفر.

## نقشه نمودار به قرارداد واقعی source7fd

در جدول زیر «منبع» مسیر محاسبه/خواندن واقعی است، نه ادعای تازگی یا پذیرش هر ردیف. نام کوتاه MC=MonthlySalesCharts، FC=FundamentalCharts، QC=QuarterlyCharts و SF=SymbolFundamentalCard است. snapshotهای کامل قبل/بعد در بسته‌اند.

| نمایش | منبع و فیلد/تابع | زمان مبنا و واحد | شرط گپ یا محدودیت واقعی |
|---|---|---|---|
| روند کارت بنیادی | SF ← buildFundamentalCard، months12، monthlyYoY، latestProducts | ن-۳۰های موجود؛ مبالغ ورودی میلیون ریال، نمایش میلیارد تومان؛ جزئیات آخرین ماه مستقل | ماه غایب داده تازه تولید نمی‌کند؛ monthlyMarketUnavailableReason برای بازار؛ با نمودار ماهانه انتخاب‌پذیر یکسان نیست. |
| فروش ماهانه | MC.MonthlyBars ← buildMonthlySales.currentMonths.amount / priorMonths؛ avgCurrent | سال تقویمی انتخاب‌شده و قبل؛ period_end؛ نمایش میلیارد تومان/همت | ماه بدون مبلغ معتبر null؛ میانگین از ماه‌های حاضر است، نه12ماهِ پرشده با صفر. |
| فروش تجمیعی | MC.CumulativeChart ← currentMonths.cumulative | fy_cumulative_amount خود گزارش از آغاز سال مالی، در محور ماه انتخابی؛ مبلغ | حلقه خالی از عدد یک ماه پر نمی‌شود؛ connectNulls=false. |
| روند نرخ | MC.RateChart ← rateModel.rateSeries؛ meaningfulRate و hasRateUnit | محصول×بازار انتخابی، currentFY؛ ریال/مخرج معتبر همسان با quantityUnit | نرخ/مخرج/مقدار نامعتبر یا ماه مفقود نقطه ندارد؛ گروه‌های واحد جدا. |
| ترکیب آخرین ماه | MC.MixChart ← latestMix و latestMonthKey | آخرین گزارش بازه؛ سهم درصد و مبلغ میلیون ریال با فرمت تومان | بدون latestMix کارت نیست؛ بازار نامعلوم از مقدار صفر صادرات جداست. |
| تولید/فروش محصول اصلی | MC.ProdSalesChart ← quantitySeries یا prodVsSales؛ hasQuantityUnit | کالای اصلی، بازار و واحد مشخص؛ ماه‌های سال انتخابی | نبود مقدار کامل/واحد، نقطه خالی؛ خدمات کنار گذاشته می‌شود. |
| حاشیه‌های گزارش | FC.MarginsChart ← deriveN10.margins / priorMargins | دوره تجمعی مرجع، نه لزوماً سالانه؛ درصد | early gate ن-۱۰ با واحد میلیون ریال و scope company؛ بدون priorMargins نمودار null؛ هر نسبت غیرقابل محاسبه حذف. |
| سود خالص گزارش | FC.NetProfitChart ← standalone.net_profit / prior.net_profit | دوره مرجع و مشابه قبل؛ میلیون ریال→همت/میلیارد تومان | بدون prior مقایسه رسم نمی‌شود؛ تبدیل دلاری اختیاری از fxRate معتبر و یادداشت نرخ روز. |
| سهم محصولات کل بازه | FC.SalesMixChart ← deriveN30.productMix؛ با withKnownMonthlyQuantities | تمام ن-۳۰های بسته، نه سال انتخابی MC؛ درصد سهم مبلغ | طول productMix شرط رندر؛ marketUnavailableReason جدا برای صادرات. |
| نرخ/مقدار پرفروش کل بازه | FC.ProductRateChart ← topProductMonths | تمام بازه، محصول پرفروش؛ نرخ و مقدار وابسته به واحد کالا | شرط رسم: نام محصول و دست‌کم یک rate غیرnull پس از guard موجود؛ ناقص‌بودن مقدار الزاماً کل نمودار نرخ را حذف نمی‌کند. |
| تولید/فروش کل بازه | FC.ProdVsSalesChart ← deriveN30.prodVsSales | کل بسته؛ مقادیر کامل/هم‌واحد پس از withKnownMonthlyQuantities | دست‌کم یک ماه با production/sales غیرnull؛ بقیه ماه‌ها گپ. واحد تازه‌ای در این patch تأیید نشده است. |
| روند سالانه | FC.TrendChart ← deriveN10.trend ← sales_trend_5y | سال هر ردیف رسمی در گزارش مرجع؛ مبلغ و درصد | طول trend>0، نه الزام5سال کامل؛ fxRate واحد برای همه سال‌ها نرخ تاریخی هرسال نیست. |
| درآمد/سود فصلی | QC ← deriveQuarters(quarterInputs)؛ revenue/netProfit | زنجیره3/6/9/12ماهه، fiscalChainKey؛ ورودی میلیون ریال، نمایش میلیارد تومان | scope/unit معتبر، زنجیره کامل؛ adjusted یا مقدارnull گپ؛ فیلتر4/8/12 فقط نمایش را محدود می‌کند. |
| حاشیه‌های فصلی | QC.marginData ← DerivedQuarter margins | همان فصل‌ها؛ درصد | درآمد فصل مثبت لازم؛ connectNulls=false. |
| P/E TTM | QC.peData ← page.peSeries ← ttmSeries و peOf؛ getSymbolHistory | قیمت آخرین روز بازه[g−14روز,g]؛ چهار فصل، سرمایه پایان پنجره؛ نسبت بدون واحد | پنجره/سرمایه/قیمت/EPS معتبر؛ برای نمودار حداقل2نقطه. chart-pe-ttm فقط ارجاع به همین نمودار است، نمودار دوم نیست. |
| قیمت پایانی | overview.HistoryChart ← readSymbolHistory/history.close | trade_date هر رکورد؛ ریال | نقطه close=null حذف؛ این مسیر کدال نیست. |
| ورود پول حقیقی | overview.HistoryChart ← netIndividualFlow(historyRow) | trade_date همان رکورد؛ ورودی ریال، نمایش تقسیم بر1e9 = میلیارد ریال/روز | netFlow=null حذف؛ از قیمت جاری یا صورت مالی ساخته نمی‌شود. |

### مرز تاریخ و منشأ

- `ReportSource.publishedAt` متن محلی جلالی است؛ UTC قطعی نیست. `records` می‌تواند تاریخ دوره، انتشار، دریافت و parserVersion هر رکورد را جدا نگه دارد. این patch زمان جدید یا امروز را جای فیلد غایب نمی‌گذارد.
- یک source_url برای بسته ن-۳۰، منشأ همه دوره‌ها نیست؛ متن موجود این را صریح می‌گوید و حفظ شده است. هنوز لینک مستقیم هر نقطه به رکورد، در این برش ساخته نشده است.
- n10Periods ورودی دوره‌ای محدود دارد؛ metadata منتشرشدن هر نقطه TTM و زمان دقیق قیمت منتخب به props فعلی QC منتقل نمی‌شود. راهنما زمان انتخاب را توضیح می‌دهد و timestamp ساختگی نمی‌سازد.
- گزارش شش‌ماهه‌ای که PR406 نمی‌پذیرد، به‌واسطه این patch وارد صفحه یا نمودار نمی‌شود. راهنما برچسب «آماده» برای نمودار یا داده اضافه نمی‌کند.

## آزمون و حدود تحویل

سه رندر SSR (خطای خواندن، خالی، واحد/زمان نامعلوم) با React واقعی انجام شد؛ بخش منابع قبلی در هر سه مورد با baseline از نظر خروجی HTML دقیقاً یکسان ماند. چهار disclosure بسته و17 عنوان معنا/منبع دیده شدند. CSS-module و CodalSourceLink تغییرنکرده در این بررسی shim نمایشی‌اند؛ این آزمون تأیید امنیت URL یا مرورگر نیست. formatter واقعی استفاده شد.

TypeScript نامزد با overlay خواندنی روی مسیر واقعی و dependencyهای نصب‌شده موفق شد؛ build کامل exact7fd+patch با هماهنگ‌کننده است. ESLint نهایی بدون پیام و CSS parse موفق. نخستین lint به‌دلیل cwd نادرست هشدار تشخیص React داشت؛ cwd ابزار به repo اصلاح و رسید نهایی جدا نگهداری شد. هیچ دور جدید QA فولاد یا شش آزمون P07 تکرار نشد.

این برش فقط توضیح رابط است؛ تغییر محاسبات، fetch، API، env، SQL، auth یا هزینه ندارد. برای پذیرش بعدی، هماهنگ‌کننده patch دو فایل را روی PR408 بررسی/ادغام کند و در Preview همان منبع، بازشدن disclosureها و خوانایی موبایل را ببیند؛ این بسته چنین پذیرش مرورگری را ادعا نمی‌کند.
