# P08 — اتصال آفلاین retrieval/response و ارزیابی اجرایی

2026-10-02. ادامه همان برنامه مصوب03/P08، شاخه مستقل PR202؛ شروع مرحله از`e4419f96b52dfdb9f94e70b6760fdf1ff62ac63a` روی مبنای ثابتP00/195@31c44ab. فایل‌های این مرحله فقط `lib/assistant/**` و `docs/ops/p08-assistant/**` هستند. testها به فایل‌های از قبل ثبت‌شده افزوده شدند؛ package scripts، Auth، publication، schema، هویت، دارایی، consent و notification مشترک تغییر نکردند.

## قابلیت ساخته‌شده و حدود

`retrieval-response.ts` به‌جای یک reader موازی، خود `getScopedPublication`، validator `isPublicationDetail` و publication.v1 موجود را مصرف می‌کند. handler همان `read_cohort_research_publication` با version UUID و cohort دقیق را از connector تازه صدا می‌زند. همین مسیر قبل بازیابی و پس از تولید fake response دوباره اجرا می‌شود. DTO، content و sources با نسخه/شناسه دقیق fingerprint می‌شوند؛ revoke/withdraw/returned approval/new draft/expiry یا تغییر متن/نسخه خروجی را حذف می‌کند.401/403/404 عدم دسترسی و503 فقدان پاسخ معتبر است؛ خطا به empty یا پاسخ history تبدیل نمی‌شود.

P03 handoff مرجع: PR209@`a44aff3b301cd2d4635f14ac4069e50c466cfe02`، FEED-READ-CONTRACT-v1 و checkpointP07/P00. Reader/DTO195 استفاده‌شده همان قراردادpublication.v1 دارد. `connect` یک dependency صاحب هویت است؛ fixture connector شبیه‌سازی RPC است و جای native Auth/SQL/RLS یا grant واقعی را نمی‌گیرد. P01 helper جدید در این مرحله وارد فایل مشترک نشده است. تا گیتlive، هیچ route یا نشست مشتری فعال نیست.

تاریخچه فقط در مرز ورودی پذیرفته و سپس کنار گذاشته می‌شود؛ در بازیابی، provider payload، fingerprint authority یا logger نقشی ندارد. question خام، کلید اضافی یا مبلغ خصوصی در درخواست به provider راه ندارد؛ registry ثابت fixture سؤال را به intent و اشاره‌گر منبع تبدیل می‌کند. جملهٔ مجاز باید در content همان DTO باشد و بازبینی privacy داشته باشد. provider فقط جملهٔ extractive مجاز را با token opaque برمی‌گرداند؛ metadata هویت/دوره/نسخه و raw content/history به آن نمی‌رود. parser معنایی سؤال آزاد و دفاع معنایی مدل واقعی هنوز ساخته/پذیرفته نیست.

## زمان اعتبار P07

Port تزریق‌شده`p07.validity.draft.v1`، evaluator موجود `evaluateDraftValidity` از P07@`af212ca4c3d6b58e27bf20e9d93a2378b215aaba` است؛ blob=`db08a643de6825dda521c6630d8b4540c9b7a326`. Snapshot اصلی در fixtures/p07-validity-source.txt و loader آزمون در فایل.ts است؛ تنها import path به research-workbook canonical195 تغییر کرده، الگوریتم همان owner است. آزمون blob/import-diff این برابری را اثبات می‌کند. P00 archive فقط در docs را ACK کرد؛ انتقال helper به runtime ترکیبی همچنان متعلقP00/P07 است.

برای decision فقط `[validFrom,validUntil)` با ساعت صریح و offset؛ شروع شامل، پایان حتی با microsecond برابر غیرشامل. bounds/clock مجهول یا نامعتبر→UNKNOWN و فاقد پاسخ فعال. bounds از port جدا خوانده می‌شود؛ در publication.v1 فعلی نصب نشده و `asOf/publishedAt` deadline نیست. Education بدون deadline به تصمیم فعال تبدیل نمی‌شود و از همین منبع آموزشی مجاز خوانده می‌شود. grant expiry مستقل است. parser/clock دوم، DTO جدید یا migration مشترک ساخته نشد.

## ارجاع مشترک P11

`receipt-handoff.ts` و `answerAndReferFixture` نیاز به قضاوت جدید را با providerCalls=0 به همان handoff موجود وصل می‌کنند. pre authority/subject/consent → transition با revision → commit صاحب case → receipt → `projectSupport` صاحبP11 و verify/pre/post → بازخوانی نهایی. رضایت ندارد=pending_consent؛ receipt، hash، lineage یا grant نامطمئن=unavailable، بدون تأیید received. firstHumanResponseAt و SLA همچنانnull هستند؛ دریافت درخواست وعده پاسخ یا حل نیست.

receipt فقط `p08.handoff.receipt.fixture.v0.1` با case/subject opaque، revisions، state، consentVersion، publicationVersionRef، occurredAt، sourceRef انتقال، transitionHash و environment=synthetic است. P11 مالک projection/tracking است؛ دفتر case دوم یا event schema تازه ساخته نشد. سؤال/مبلغ در receipt/telemetry/provider صفر است. ذخیره/ارسال متن سؤال در ticket واقعی، receipt واقعی، CAS واقعی و grant server هنوزNOT_RUN. Sourceهای archivedP11 فقط برای آزمون همان کد صاحب مصرف می‌شوند؛ قرارداد hash/measurement در P08 بازپیاده‌سازی نشده است. SHA و hash این dependency در provenance receipt مرحله تثبیت می‌شود.

P11 canonical fixture snapshot در commit`8eab5d5471d1ed8aa89921e58dc8f476513fb818` تثبیت شد و owner archive بدون تغییر را ACK کرد. `support.mjs`، `measurement.mjs`، `receipt.schema.json` و `event.schema.json` با blobهای همان commit دقیقاً برابرند؛ [PROVENANCE.json](fixtures/PROVENANCE.json). هیچ snapshot uncommitted به‌عنوان مرجع نهایی مصرف نشد. این receipt همچنان synthetic-only است و پذیرش receipt server یا پاسخ انسانی نیست.

## مجموعه60 و شواهد

evaluation.json همان60 سؤال و rubric انسانی را نگه می‌دارد و oracle صریحmachine برای sourceKeys و source/deny/noanswer اضافه می‌کند. harness به canonical fixture corpus با UUID نسخه، fake RPC، fake provider و clock قطعی وصل است. نتیجه فعلی60 PASS/0 FAIL:35 منبع،11 deny و14 noanswer. این **امتیاز کیفیت پاسخ نیست**: زبان‌مدل واقعی ارزیابی نشده، humanReviewed=false، answerQualityScore=null و هزینه واقعیnull.

Corpus جملات extractive ساختگی برای سنجش provenance/control است؛ در گزارش candidateAnswer/citations و humanReview=null می‌ماند تا بازبین بتواند کیفیت پاسخ هر سؤال را جدا بسنجد. draft داخلیC14/C19 از member reader رد می‌شود؛ C18 راهنمایP06 و C20 عملیات مدل با پیش‌نیاز باز پاسخ خودکار ندارند. دامنه پنج نقش حذف نشده؛35 پاسخ منبع‌دار به معنی کامل‌شدن همه نقش‌ها یا معیار90٪ انسانی نیست.

اجرا: `node node_modules/tsx/dist/cli.mjs docs/ops/p08-assistant/run-machine-evaluation.ts`؛ خروجی [evaluation-machine-results.json](evidence/evaluation-machine-results.json). تغییر عمدی expected source در آزمون کنترل، دقیقاًیکFAIL می‌دهد؛ harness از observed output انتظار را تولید نمی‌کند. خطای اولیه schema آرایهٔ oracle و وابستگی schemaP11 با شواهد red حفظ و اصلاح شدند.

78 آزمون هدفمند در [retrieval-receipt-tests.txt](evidence/retrieval-receipt-tests.txt)،0fail/0skip؛ شامل pre/post revoke، withdrawal،new draft،approval returned،grant/decision expiry مستقل، microsecond equality،unknown boundary،history خصوصی،503،actor/cohort دقیق،wrong version،receipt tamper/consent/revoke و اتصال judgement→receipt است. Typecheck و scoped lint سبک موفق‌اند. Local build سنگین طبق صفP00 در این مرحله شروع نشد؛ build و suites استاندارد درCI همان head تحویل جدا گزارش می‌شوند. شمار machine60 و test78 به یکدیگر یا ارزیابی انسانی جمع نمی‌شوند.

## گیت و اقدام بعد

مالکP08: تحویل code/ports/harness و نگاشت نسخه؛ P00: bind helperهایP07/P11 و manifest/پنجره منابع؛ P01/P03/P07: native actor/grant/current/version/validity؛ P11: receipt/storage/tracking و پاسخ‌گوی نام‌دار/رضایت/نگهداری؛ آرش: بازبینی60 سؤال، دامنه خدمت، provider/region/retention/budget/SLA. Ledger بودجه قبلی هنوز به provider زنده وصل نیست و این مرحله آن را فعال نمی‌کند. راهنمایP06، مشتری/index، provider هزینه‌دار، live collector، schema/Production/merge/خرید/پیام واقعی خاموش یاNOT_RUN هستند. مرحله بعد فقط پس قرارداد پایدار و محیط مجاز، پذیرش مستقل portها و corpus بازبینی‌شده است.
