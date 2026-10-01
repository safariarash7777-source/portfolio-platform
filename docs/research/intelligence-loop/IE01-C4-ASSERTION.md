# اصلاح تناقض assertion مربوط به EPS در C4

۲ اکتبر ۲۰۲۶، تهران. پایهٔ immutable: PR192@`1c24c16960a6ce5c837aad251f2f8ebb85ff7448`؛ شاخهٔ مستقل `codex/ie01-c4-assertion-20261002`. این اصلاح فقط harness است؛ parser، engine، manifest، fixture، شواهد اولیه و معیار واحد تغییر نکرده‌اند.

در harness اولیه، `unitContract({normalized:null, ratios:null})` رد کامل سند را مطابق قرارداد قبول می‌کرد، اما assertion بعدی EPS از خروجیِ غایب عدد می‌خواست و FAIL می‌شد. این تناقض قبل از اصلاح با اجرای مستقیم همان predicate و assertion بازتولید شد. اصلاح محصول به خاطر این نقص آزمون نباید مجبور به پذیرش سند نامعتبر شود.

اکنون `assertEpsPreserved` همهٔ سطرهای tokenدار «خالص هر سهم» را از جدول‌های ورودی با جدول‌های مرجع، بدون تبدیل عدد یا تغییر متن، مقایسه می‌کند؛ مرجع خالی مجاز نیست. اگر normalized حاضر باشد، EPS خروجی نیز باید با مرجع برابر باشد. اگر normalized=null باشد، حفظ توکن‌های ورودی کافی است و شرط مستقل واحد همچنان ratios=null را الزام می‌کند. رد سند همراه با نسبت عددی معتبر نیست.

[هفت آزمون سلامت](C4-ASSERTION-TESTS.txt) موفق‌اند: رد کامل با ورودی EPS دست‌نخورده قبول می‌شود؛ تغییر token ورودی، تغییر EPS خروجی، مرجع خالی و نسبت عددی همراه رد سند رد می‌شوند. دو اجرای واقعی اصلاح‌شده، روی همان کد ثابت191، هنوز C1/C3=PASS و C2/C4=FAIL دارند. هیچ شکست محصول skip یا به PASS تبدیل نشده است.

- [شواهد جدید](IE01-C4-ASSERTION-EVIDENCE.json) و [اجرای تکراری](IE01-C4-ASSERTION-REPLAY.json)
- [شواهد immutable قبلی](IE01-EVIDENCE.json)؛ inputDigest و outputDigest تک‌تک caseها و hash همه fixtureها عیناً برابرند.

digest کلی payload جدید `fa25bd79d26d43610f75a5c9456865c0c6c5c903ee06733e8dc18403d9129d41` است؛ تفاوت با payload قبلی فقط از نام assertion اصلاح‌شده می‌آید. actual outputs و input bytes تغییر نکرده‌اند. timestampهای جدید زمان اجرای واقعی‌اند؛ شاهد اولیه بازنویسی نشده است.

```powershell
node scripts/research/ie01/run.mjs IE01-C4-ASSERTION-EVIDENCE.json
node scripts/research/ie01/run.mjs IE01-C4-ASSERTION-REPLAY.json
node --test scripts/research/ie01/run.test.mjs
```

دو فرمان case همچنان exit1 دارند. guard شبکه/پردازش برقرار است؛ upstream/liveDB/model/Production اجرا نشده است. این تحویل فقط تصحیح آزمون است؛ رفع C2/C4 و پذیرش روی SHA محصولِ اصلاح‌شده هنوز به تحویل مالک داده وابسته است. منشأ واقعی گزارش همچنان نامعلوم است.
