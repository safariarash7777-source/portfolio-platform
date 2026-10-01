# نمونهٔ مستقل طراحی و فونت

مبنای اجرایی PR177 (`27e59ad`) و نمونهٔ قبلی NEXT03؛ این پوشه backend، ورود، پرداخت یا کنترل دسترسی اجرایی ندارد. داده و اقدام‌ها صریحاً نمایشی‌اند. صفحات فعال، globals و Navbar تغییر نکرده‌اند.

از ریشهٔ مخزن:

```sh
node scripts/testing/serve-visual-review.mjs
```

مقصد پیش‌فرض فقط loopback است: `http://127.0.0.1:8776`.

| نمونه | URL |
|---|---|
| خانه A / B | `/?font=a#home` / `/?font=b#home` |
| دوره | `/?font=a#course` |
| عضو / منقضی / اطلاعات ناقص | `/?font=a#member` / `/?font=a&state=expired#member` / `/?font=a&state=incomplete#member` |
| دادهٔ کهنه | `/?font=a&state=stale#member` |
| متن/جدول/فرم یکسان | `/?font=a#type` / `/?font=b#type` |
| تراکم بازار / میز آرش | `/#market` / `/#desk` |

هر CTA داخل نمونه hash مقصد دارد یا disabled با دلیل است. URLهای واقعی متناظر در گزارش آمده‌اند؛ نمونه به آنها درخواست خصوصی نمی‌فرستد. فرم مشاوره فقط پیام نمایشی می‌دهد؛ نیازسنجی در localStorage همین مرورگر ذخیره و قابل اصلاح است. اطلاعات شخصی واقعی وارد نکنید. ابزار font/state جزئی از UI پیشنهادی Production نیست.

فونت A: فایل موجود Vazirmatn v33.0.3 طبق توضیح `app/layout.tsx`؛ B: Estedad pinned `0dbe689787b8c2ea302373cb601d0f352f9f98e5`. هر دو فایل OFL کنار فایل اصلی دارند. فقط فونت انتخاب‌شده preload و دانلود می‌شود؛ CDN لازم نیست. خاموش‌بودن انتخاب B در صفحات واقعی تغییری نکرده است.

بازآزمایی به Playwright موجود و Chrome نیاز دارد؛ این نمونه dependency نصب نمی‌کند. اگر Playwright در محیط همراه Codex است، `PLAYWRIGHT_MODULE` را به module URL امن آن runtime بدهید؛ در محیط معمولی default `playwright` است.

```sh
node scripts/testing/visual-review-check.mjs
node scripts/testing/visual-review-boundaries.mjs
node scripts/testing/visual-before-protected.mjs
```

اجرای اول screenshotهای قبل و reference را می‌گیرد. `--prototype-only` دادهٔ مشاهدهٔ قبل را از `browser-first.json` حفظ و فقط نمونهٔ محلی را بازآزمایی می‌کند. آزمون browser به owner session متصل نیست. متن آزمایشی و `test@example.invalid` ارسال واقعی نمی‌شوند. آزمون‌های CLI، متن/viewport emulation هستند؛ شاهد دستگاه واقعی، browser zoom و screen reader نیستند.

`.impeccable/live/config.json` فقط همین HTML مستقل را هدف می‌گیرد. CSP این static surface بررسی شد و وجود ندارد؛ CSP اپ Next و source فعال تغییر نکرد. Live overlay تزریق/اجرا نشده است.
