# اعتبارسنجی callback وبینار — 2026-10-30

> سابقهٔ PR351@92، **NOT_READY**؛ این نتیجه‌ها پذیرش امنیتی/نصب نیستند. [قرارداد جایگزین](../p05-webinar-binding-v1-20261030/CONTRACT.fa.md) و [اعتبارسنجی نامزد جدید](../p05-webinar-binding-v1-20261030/VALIDATION.fa.md) مرجع این شاخه‌اند. جزئیات شاهد فعال خارج Git محفوظ است.

## رفتار نهایی

پرداخت با authority از جدول canonical خوانده و با payment_id ورودی و payment_id/user ثبت‌نام تطبیق می‌یابد. مبلغ همان amount ثبت‌شده است؛ قیمت جاری وبینار در verification مصرف نمی‌شود. پاسخ provider به‌تنهایی success/paid نمی‌سازد: RPC موجود و readback مستقلِ همان شناسه/مبلغ/user/authority/ref و وضعیت ثبت‌شده لازم‌اند. ثبت‌نام فقط با مقایسهٔ id/payment_id/user/webinar/status=pending تغییر و دوباره خوانده می‌شود؛ refunded/free یا اتصال تغییرکرده احیا نمی‌شوند.

unknown نه failure قطعی است، نه مجوز retry داخلی یا grant. پس از lost-ack، تنها همان ردیف دوباره خوانده می‌شود. در بازپخش paid/paid، هیچ verify/writer/audit دوباره انجام نمی‌شود. recovery صریحِ paid/pending همان پرداختِ قبلاً تسویه‌شده را مصرف می‌کند و verify دوباره نمی‌خواهد؛ هیچ تراکنش/entitlement/دعوت/پیام یا خرید تازه نمی‌سازد. audit مالی RPC موجود حفظ است؛ audit وبینار فقط پس از تغییر شرطیِ تأییدشده best-effort است. تضمین exactly-once برای audit بیرون تراکنش، بدون قرارداد پایگاه، ادعا نشده است.

## شواهد آفلاین

- baseline روی f93: **۱۳۳/۱۳۳** آزمون موجود موفق بود. این آزمون‌ها پیش‌تر binding درست را ثابت نمی‌کردند.
- سه آزمون تازه، **RED۱۳۳/۳** واقعی دادند: callback برای binding نامنطبق success می‌داد؛ با snapshot مبلغ۱۰۰ و قیمت تغییرکرده۹۹۹، مبلغ۹۹۹۰ در stub verification دیده شد؛ با عدم ثبت محلی باز هم success می‌داد. اعداد فقط fixture آزمون‌اند، نه قیمت/مدت/سیاست محصول.
- آزمون‌های تکمیلی، شکل نامعتبر status و تغییر webinar بین خواندن و نوشتن را نیز یافتند؛ وضعیت باید واقعاً string canonical و شناسهٔ وبینار در CAS/readback ثابت باشد.
- نتیجه نهایی **۱۴۸/۱۴۸**: قرارداد واقعی verifier و callback عمومی پیشین محفوظ؛ callback وبینار با readهای canonical کامل، query تکراری، خطا/نبود/شکل نامعتبر، مبلغ snapshot، binding، unknown/NOK، شکست قطعی با readback، settlement lost-ack/error/ref mismatch، readback ناموفق، partial recovery، acknowledgement بدون commit، free/refunded، تغییر اتصال/کاربر/وبینار، paid فاقد receipt معتبر و callbackهای هم‌پوشان آزموده شد.
- این harness، **کد واقعی TS را در VM** بار می‌کند و همه I/O را جایگزین می‌کند. provider[] فقط آرایهٔ درخواست‌های شبیه‌سازی‌شده در VM است؛ درخواست شبکهٔ واقعی به provider، ایجاد charge، DB یا پیام وجود ندارد. `PAYMENT_TEST_SOURCE` در محیط اجرا unset بود و source از همین checkout خوانده شد. fallback fetch و dependency ناشناخته در harness fail می‌شوند.
- آزمون هم‌پوشانی فقط مدل کنترل‌شدهٔ I/O و CAS را بررسی می‌کند؛ شاهد اجرای تراکنش یا رقابت روی PostgreSQL/درگاه نصب‌شده نیست. verify هم‌زمان ممکن است برای همان authority بیش از یک‌بار درخواست شود؛ هیچ request-payment/charge تازه‌ای ایجاد نمی‌شود. بازپخش بعد از ثبت paid بی‌اثر است.
- lint دو فایل بدون هشدار/خطا، typecheck کامل با `--noEmit --incremental false` و diff-check موفق. scan پیش از commit و CI head دقیق پس از push جدا ثبت می‌شوند؛ نتایج آینده پیشاپیش موفق فرض نمی‌شوند.

## بازتولید

```text
node --test lib/zarinpal.test.mjs
node node_modules/next/dist/bin/next lint --file app/api/webinars/payment/callback/route.ts --file lib/zarinpal.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

لاگ‌های خام در `outputs/p05-webinar-callback-binding-20261030` والد checkout: baseline.log، red.log، review-red.log، green-initial.log، green.log، lint.log و typecheck.log. base و source نهایی، canonical blob hash، نتایج CI/Preview و مرز تحویل در outputs و PRbody ثبت می‌شوند؛ commit وضعیت بعد از head نهایی ساخته نمی‌شود.

## حدود و بازگشت

تنها route callback وبینار و harness موجود و SPEC/همین سند تغییر می‌کنند. **callback عمومی، lib/zarinpal.ts، start-route، package، SQL/Auth/env، containment و پرچم‌ها عوض نمی‌شوند.** فروش فعال نشده، مرجع حق خدمت یا شرط کسب‌وکاری ساخته نشده، MB/MG/D032 بازپرسیده نشده‌اند. موضوع دیررس/ظرفیت/refund/انتقال حقوق و مرز خدمت باید از همان قرارداد مصوب بیاید؛ این کد receipt تسویه را با مجوز استفاده یکی نمی‌کند.

شکاف initiation هنوز باز است: start-route وبینار در این مبنا amount_toman ناسازگار می‌نویسد و از callback عمومی استفاده می‌کند. این برش آن را متصل نمی‌کند؛ «فروش وبینار سرتاسری کار می‌کند» ادعا نمی‌شود. نصب schema/ACL واقعی، گردش پول واقعی، callback واقعی درگاه و پذیرش عملیاتی/آرش در این تحویل آزموده نشده‌اند. هیچ callback دارای authority واقعی یا ساختگی در Preview/Production فراخوانی نمی‌شود؛ Preview فقط build metadata است. برگشت با revert همین برش؛ بدون DDL/بازکردن پرداخت.

مبنای API خواندن/فیلتر و RPC مطابق مستندات فعلی [Supabase filters](https://supabase.com/docs/reference/javascript/using-filters) و [database functions](https://supabase.com/docs/guides/database/functions) بررسی شد؛ هیچ migration یا ابزار SQL عملیاتی استفاده نشد.
