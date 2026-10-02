# P01 — نام مستقل کوکی برای دموی P00

2026-10-02؛ parent208@`f0e002bc7c9f22f0425adc41b8b6b81c3a1fcc11`. commit کوچک و قابل مصرف: **`0ed89c28b54438637b4f49ca322cbbc636d75fc2`**. فقط `lib/supabase/client.ts`، `lib/supabase/server.ts` و middleware به `cookieOptions.name=process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME` متصل شده‌اند؛ unset همان default قبلی SDK است. آزمون در script موجود Auth ثبت شده؛ package/dependency/schema صفر تغییر.

نام غیرمحرمانه باید برای هر محیط روی یک hostname متفاوت باشد و در buildِ browser، server و middleware یکسان نصب شود. پورت به‌تنهایی cookie را جدا نمی‌کند. این commit هیچ env یا cookie واقعی را تنظیم/حذف نکرد؛195 و Production دست نخورده‌اند. SDK@supabase/ssr0.10.2 نام را به storageKey وصل می‌کند؛ code-verifier به همین storageKey وابسته است. [کد رسمی](https://github.com/supabase/ssr/blob/v0.10.2/src/createServerClient.ts).

**تست:**49PASS،0FAIL،0skip در `node --test scripts/testing/auth-session-handler.test.mjs`؛ شامل سه تست تازه با SDK نصب‌شده برای name پیش‌فرض/اختصاصی در هر سه factory و عدم خواندن cookie نامِ محیط دیگر. typecheck و diff-check PASS؛ server/native-account/DB writes و build سنگین اجرا نشد. این تست، پذیرش مرورگری native در دموی8444 نیست.

**گیت callback:** `/auth/callback` در208 factory چهارم مستقل دارد. طبق محدودهٔ درخواستP00، این commit آن را تغییر نمی‌دهد. اگر فقط0ed89c2 مصرف شود، ورودpassword/refresh از سهfactory نام یکسان می‌گیرند، اما PKCE callback هنوز نام پیش‌فرض دارد و نباید پذیرفته‌شده اعلام شود. ادامهٔ مستقل P01 email/recovery همان name را به callback اضافه می‌کند؛ آن patch هم باید برای پذیرش لینک ایمیل مصرف شود. دو namespace/مدل هویت ایجاد نمی‌شود، تنها نام ذخیرهٔ نشست محیط جدا است.

P00 مالک build/install8444 است. همان SHA و نام در manifest ثبت، سپس ورودA، نقش، reload/refresh، logout/relogin، redirect، `/admin/fx` و نخواندن نشست195 توسط browser/nativeSSR آزموده شوند. credential فقط در محیط امن؛ login مالکProduction جدا OPEN. rollback تنظیم نام فقط در همین sandbox و روی build matching؛ UUID، profile و سوابق حذف نشوند. هیچ startup199 ردشده تکرار نشده است.
