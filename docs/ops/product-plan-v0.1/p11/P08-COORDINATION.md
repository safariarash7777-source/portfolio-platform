# قرارداد اتصال P08 به P11 — مصرف و ارجاع

2026-10-02 تهران؛ پاسخ به هماهنگی P08 درباره دفتر ماندگار آفلاین. قرارداد مرجع P11: PR203@02d5aaa9f95723856c5f376bf630f2abfa1448ad، measurement.v0.1. ورودی P08 خوانده‌شده: checkout مستقل portfolio-p08-assistant@b813d2e23d79af06938b83fb6084bc266027509c، PR202، fixture-service.ts و RESULT.md. این پرونده نگاشت/الزام اندازه‌گیری است، تأیید اجرای ledger آینده یا گیت عرضه نیست.

## دو محدوده داده

1. **projection سنجش محصول:** همان event.schema.json بدون فیلد تازه. assistant.result فقط status=sourced/referred/unsourced/failed و durationMs دارد؛ subject/source/version keyهای opaque طبق قرارداد. نتیجه با منبع باید به نسخه معتبر متصل شود؛ referred فقط تصمیم به ارجاع است، نه دریافت انسانی یا پاسخ.
2. **metadata محدود دفتر P08 و هزینه:** invocation/reservation/ticket ref opaque، policyVersion، windowKey، modelVersion، promptVersion، نسخه منبع، زمان وقوع/ثبت، محیط و SHA، code محدود، حالت رزرو، inputTokens/outputTokens و usageSource/usageStatus مجازند. متن سؤال/پاسخ، history، ویس، مبلغ یا تعداد دارایی، credential/access token، شناسه تماس و receipt مشتری ممنوع. نسخه مدل/provider از allowlist کنترل‌شده بیاید؛ برچسب آزاد از payload عضو نپذیرید. شمار token مصرفی credential نیست؛ با واحد token و منبع معتبر ثبت شود. هرگونه افزایش schema تحلیل باید با نسخه و بازبینی P00 انجام شود، نه ارسال فیلدهای جدید به measurement.v0.1.

هیچ کدام مدل هویت/مجوز/انتشار یا دفتر مالی عضو ایجاد نمی‌کنند. مالکیت فایل lib/assistant/** با P08؛ فایل‌های این مسیر با P11. سیاست mapping ناشناس، نگهداری و دسترسی دفتر محدود با P00 و مالک عملیات تعیین شود؛ collector واقعی تا آن زمان خاموش.

## سنجه مصرف و رزرو

| حالت دفتر P08 | تفسیر P11 | شمارش هزینه/ظرفیت |
|---|---|---|
| reserved پیش از dispatch | تعهد ظرفیت، نه مصرف قطعی | در ظرفیت outstanding حساب شود؛ هزینه واقعی null |
| dispatch ثبت‌شده | درخواست از boundary گذشت؛ موفقیت مدل نیست | فقط dispatch count؛ بدون ساخت مصرف |
| settled با usage معتبر | مصرف تأییدشده با واحد و منبع | هر invocation یک‌بار، مجموع input/output جدا؛ اصلاح usage رسید نسخه‌دار داشته باشد |
| timeout/نتیجه مبهم | مصرف و نتیجه نامعلوم، نه صفر | رزرو حفظ؛ هزینه null و coverage ناقص؛ خودکار dispatch دوباره یا آزادسازی نکنید |
| failed پیش از dispatch با اثبات | provider فراخوانی نشده | هزینه provider صفر فقط با شاهد، سایر هزینه‌ها جدا؛ release reservation طبق سیاست صاحب |
| denied/بودجه نامعلوم | فراخوانی انجام نشود | denial جدا؛ سقف تجاری/provider/SLA را fixture تعیین نمی‌کند |

محاسبه ظرفیت محافظه‌کارانه از مصرف settled معتبر + reservationهای outstanding در همان policy/window انجام شود. restart باید سیاست/ledger قابل اعتماد را بازیابی کند؛ ذخیره گم‌شده، خراب یا دوره نامعلوم مجوز reset و درخواست تازه نیست. سقف هم‌زمانی member/cohort از policy مصوب بیاید؛ null توقف dispatch است. fixture عدد token دارد ولی baseline عملیات واقعی نیست.

برای هزینه پولی واقعی: مبلغ، currency/unit، period، usage source، تعرفه و نسخه/تاریخ آن، allocation و invoice/reconciliation در دفتر محدود هزینه کسب‌وکار لازم است. token × قیمت حافظه یا رزرو × قیمت، هزینه تأییدشده نیست. provider/تعرفه نامعلوم → cost=null، نه صفر. نرخ تبدیل با منبع/تاریخ؛ دوباره‌شماری settle/invoice ممنوع. گزارش aggregate مجموع اندازه‌گیری‌شده را از total با پوشش کامل جدا نام‌گذاری کند.

## ارجاع انسانی و projection پشتیبانی

| حالت P08 | mapping فعلی P11 | برداشت مجاز |
|---|---|---|
| pending_consent | رخداد support.opened تولید نشود | رضایت هنوز نیست، درخواست ارسال/دریافت نشده |
| received | support.lifecycle action=opened پس از receipt معتبر | دریافت واقعی سؤال در صف مجاز؛ نه پاسخ قطعی یا فوری |
| assigned | فقط metadata محدود ticket | صاحب عملیاتی تخصیص یافته؛ پاسخ اول انسانی هنوز رخ نداده |
| first human response | support.lifecycle action=responded، اگر شاهد واقعی باشد | زمان اولین پاسخ انسانی؛ acknowledgment خودکار کافی نیست |
| resolved | support.lifecycle action=resolved با شاهد حل | وضعیت حل؛ تأیید عضو جدا ثبت شود |
| closed | خودکار resolved تولید نشود | بسته‌شدن ممکن است انصراف/لغو/عدم رضایت باشد؛ دلیل محدود در دفتر اصلی، شمار حل جدا |

اگر lifecycle فعلی P08 مرحله first_response ندارد، timestamp/receipt محدود جدا اضافه کند یا سنجه پاسخ اول UNKNOWN بماند؛ assigned را جای آن نگذارید. replay همان انتقال، شمار تازه نسازد؛ lifecycleهای متعدد یک ticket از هم متمایز و sourceRef انتقال پایدار باشند. لغو consent قبل از دریافت/ارسال در boundary اعمال شود؛ وضعیت stored به تنهایی مجوز جدید نمی‌دهد. زمان backlog از received و زمان انتظار رضایت جدا، با بازه تهران و ticket باز سانسورشده گزارش شود.

## مسئول و گیت

- P08: قرارداد/اثبات مصرف، رزرو/settle/هم‌زمانی/restart و state machine ارجاع در fixture؛ متن/محتوای خصوصی در telemetry صفر.
- P01: هویت، مجوز و منبع معتبر وضعیت رضایت؛ P08 حق ساخت grant موازی ندارد. رضایت ارجاع، دسترسی مشاور به سبد یا اعلان تلگرام نیست.
- آرش/عملیات با P00: تعیین پاسخ‌گوی نام‌دار، جانشین، ساعات/SLA، دامنه رضایت و نگهداری. این تصمیم‌ها در حال حاضر مصوب فرض نمی‌شوند.
- P11: تعریف مخرج، coverage، مصرف واقعی در برابر رزرو/نامعلوم، زمان پاسخ/حل و گزارش هفتگی. G2 fixture/رفتار بسته و G3 سفر مشترک همچنان شاهد محیط و بازبینی انسانی لازم دارند؛ G4 تصمیم مالک عرضه است.

آزمون پیشنهادی صاحب P08: دو درخواست هم‌زمان با سقف مشترک، retry/idempotency، crash بعد از reserve و قبل/بعد dispatch، timeout نامطمئن، settle تکراری/متناقض، window/policy تغییرکرده، ledger خراب/گم‌شده؛ برای ارجاع pending_consent/revoke، دریافت بدون SLA، assigned بدون پاسخ و closed بدون حل. همه آفلاین/مصنوعی؛ provider، route مشتری و پیام واقعی فعال نشوند. P11 پس از دریافت SHA و شاهد، نگاشت و پوشش را بازبینی می‌کند؛ این سند PASS آن آزمون‌ها نیست.
