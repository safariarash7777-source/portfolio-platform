# Hermes روی سرور موجود — بررسی فقط‌خواندنی ۴ نوامبر

[نمونهٔ واقعی SSH](capacity-062807.json) در۰۶:۲۸UTC با احراز موفق و exit0 انجام شد؛ توقف پیش از احراز در بررسی پیشین، وضع همین لحظه نیست. چهار هسته منطقی، CPU مشغول۲۲٫۶۲٪ کل هسته‌ها در۱٫۰۰۱ثانیه، MemAvailable۵٫۷۲GiB و دیسک آزاد۱۳٫۴۲GiB ثبت شد. iowait/steal این نمونه صفر بودند. ظرفیت پایدار یا فضای کافی برای ساخت سنگین اثبات نشده است.

۲۵ ردیف Docker اندازه‌گیری شدند؛ نمونهٔ قبلی فقط هشت نام را allowlist کرده بود. این اختلاف پوشش، شاهد ساخته‌شدن۱۷سرویس تازه نیست. CPU هر container بر مبنای یک هسته و نمونه‌ای جداست؛ حافظه تقریبی است. دو ردیف app با صفر/حدصفر، سلامت یا مصرف واقعی صفر را ثابت نمی‌کنند. هیچ سرویس قدیمی/آزمایشی متوقف یا حذف نشد. DB پین‌شده قبل و بعد سالم و restartCount0 بود.

Hermes در PATH سیستم و distribution پایتون سیستم پیدا نشد و پوشهٔ /root/.hermes مشاهده نشد؛ از این دامنهٔ محدود، نبود Hermes در همهٔ کاربران/venv/containerها نتیجه نمی‌شود. فایل auth خوانده، منتقل یا ساخته نشد؛ مدل فراخوانی نشد.

طبق [مستند اصلی Hermes](https://hermes-agent.nousresearch.com/docs/integrations/providers)، نسخهٔ جاری از OAuth اشتراک ChatGPT از مسیر Codex پشتیبانی می‌کند؛ خود سند، tierهای واجد شرایط و نحوهٔ شمارش مصرف را قطعی نمی‌داند. این شاهد سازگاری نسخهٔ نصب‌شده نیست. [runtime اختیاری Codex app-server](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/codex-app-server-runtime.md) نسخهٔ CLI و احراز جدا لازم دارد؛ اینجا نصب یا آزموده نشد.

[راهنمای رسمی OpenAI](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions) می‌گوید مصرف پنج‌ساعتهٔ Plus بین برنامه‌ها مشترک است؛ همان قاعده به Pro تعمیم داده نمی‌شود و نوع حساب این بررسی معلوم نیست. بنابراین Hermes راه دورزدن محدودیت مصرف یا سهمیهٔ رایگان تازه محسوب نمی‌شود. [model/list](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server) کاتالوگ است و دسترسی واقعی مدل را اثبات نمی‌کند؛ هیچ inference انجام نشده است.

[الگوی رسمی VM خودمیزبان](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms) هویت میزبان پایدار و انتقال امن credential را توضیح می‌دهد؛ اجرای آن در این بررسی انجام یا مجاز نشده است. [حدود استفادهٔ Sign in with ChatGPT](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt) نیز اجازه نمی‌دهد اشتراک شخصی را بدون بررسی شرایط، خدمت همهٔ اعضای پلتفرم فرض کنیم.

پیشنهاد آماده برای مرحلهٔ بعد، صرفاً یک مأموریت داخلی خواندنی هم‌زمان است: سقف یک CPU منطقی، MemoryMax1536MiB، workspace512MiB و مهلت۲۱۰ثانیه؛ بدون وزن محلی، build/مرورگر سنگین، fallback پولی یا auxiliary خودکار. مدل/حساب و نسخه باید پیش از اجرا صریح و قابل بررسی باشند. ظرفیت ممتد و تداخل با سرویس‌های موجود نیازمند مشاهده در همان پایلوت مجاز است. هیچ نصب، انتقال، ارتقا، ری‌استارت، خرید یا تغییر سرویس انجام نشد.
