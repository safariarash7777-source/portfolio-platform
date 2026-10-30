# P10.1 — projection خالص تاریخچهٔ موجود

مرجع نیاز: PR332@8dc2faf، `docs/ops/research-history-v04-20261030/SPEC.fa.md`؛ مرجع وضعیت مشترک را فقط root می‌نویسد. مبنا محصول PR338@732be473، هرگز lab339.

## تطبیق پیش از تغییر

`event-inbox.ts` رخداد/شاهد بازار و `analysis-memory.ts` رد تحلیل/نتیجه را می‌سازند؛ adapter تاریخچه worker/workbook نیستند. `research-worker.ts` state نسخه۱/۲ و last-run را جایگزین می‌کند؛ at ورودی زمان پایان نیست. `workbook-store.ts`، StoredVersion و StoredReview را دارد. route فعلی reviews از `research_workbook_reviews`، ستون‌های id/version_id/decision/note/reviewed_at را می‌خواند؛ reviewed_by در این قرارداد نیست. openWorkbook بازبینی‌ها را برای همه versionIdها می‌خواند، نه فقط نسخه آخر. store/route/helpers دست‌نخورده می‌مانند.

## رفتار و قرارداد

- فقط فایل جدید `lib/intelligence/research-history.ts` و آزمون آن؛ ورودی snapshotهای ازقبل خوانده‌شده با وضعیت read/unavailable؛ بدون IO یا ساخت consumer مجوزدار تازه.
- sourceId نام مرجع غیرحساس و پایدار را caller مجاز می‌دهد؛ زمان readAt جدا از زمان منبع/ثبت/بازبینی است. متن خطا، body، title، note، prompt، credential و provenance آزاد کپی نمی‌شوند.
- worker یک مشاهده وضعیت است، نه بازسازی انتقال‌ها. status ذخیره‌شده، نقش، موفقیت مدل/مقصد یا زمان پایان تولید نمی‌کند. نتیجه نوشتن worker unknown می‌ماند.
- هویت رویداد از مرجع/نوع/فیلدهای هویتی موجود؛ تکرار دقیق یک رویداد است. تعارض یک هویت با metadata متفاوت حذف دلخواه ندارد: آن رویداد از خروجی کنار و شمار تعارض گزارش می‌شود.
- بازبینی به versionId خودش وصل است؛ وجود v2 بازبینی v1 را به v2 منتقل نمی‌کند. actor بازبینی null است؛ createdBy معتبر فقط هویت است، نه نقش.
- نبود ورودی، شکست خواندن، ساختار نامعتبر و مجموعه خوانده‌شده خالی جدا هستند. پوشش هرگز live/all-analysts/append-only نیست؛ هیچ transition گمشده ساخته نمی‌شود.

## اجرا و پایان این برش

۱. پیاده‌سازی projection و پوشش محدودیت‌ها. ۲. آزمون duplicate/conflict، نسخه state۱/۲، زمان/actor ناموجود یا نامعتبر، unknown write، v1/v2 و بازبینی، عدم نشت متن خصوصی، unavailable≠empty. ۳. typecheck/lint و PR روی شاخه محصول؛ registry مشترک با root است. ۴. رسید SHA/مسیر/آزمون/محدودیت در همین دامنه و PR، بدون claim اتصال عملیاتی یا اتمام P10.

ثبت آینده، IO adapter، نصب/runtime، lock/ledger/Hermes، DB/DDL/grant، مدل/POST و نمایش مصرف‌کننده مرحله بعد با گیت جداست. اطلاعات ۴۲entry محلی تنها شاهد محدود root است و fixture این برش نیست.
