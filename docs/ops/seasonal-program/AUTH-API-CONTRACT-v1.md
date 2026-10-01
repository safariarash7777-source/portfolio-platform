# قرارداد مصرف Auth برای NEXT05/06/09 — v1

تاریخ:2026-10-01. implementation ایزوله branch `codex/followup-auth-20261001`، کد `05d5ae63f424c556656de2fd267e7ab0d32a4407`؛ در Production فعال نشده است. مدل account همان `auth.users.id` و role همان `profiles.role` است؛ این قرارداد entitlement یا user جدید نمی‌سازد. مصرف‌کننده صفحه عملیاتی مشترک را هم‌زمان با مالک Auth بازنویسی نکند.

## مسیرها و حالات

| مسیر | قرارداد |
|---|---|
| `/login?next=…` | ورودemail/password موجود؛ next محلی پالایش‌شده؛ `error=auth_unavailable` یعنی بررسی نشست سمت سرور پاسخ نداده |
| `/login/mobile?next=…` | وضعیت غیرفعال صریح با لینک ورود قبلی وقتی AUTH_MOBILE_ENABLED غیرفعال؛ فرمOTP/password وقتی فعال؛ sandbox برچسب مستقل دارد |
| `/account/mobile?next=…` | نشست معتبر لازم؛ حساب قدیمی بدونphoneconfirmed ابتدا اتصال شماره به همان حساب؛ پس ازتأیید پروفایل خصوصی؛ ادامه بهnext محلی |
| `GET /api/auth/status` | `{authenticated:false,role:null}` یا `{authenticated:true,role:'user'\|'admin'\|null\|…,profileRead:'ok'\|'unavailable'}`؛ خطای شبکه503 باstatus؛ مقدار role برایUI است و جای مجوز سرور نیست |
| `POST /api/auth/session` | `{action:'refresh'\|'signout'}`؛200 `{ok:true}` یا401/503؛ same-origin؛ token/UUID/contact در پاسخ نیست |
| `POST /api/auth/mobile` | قرارداد زیر؛ same-origin؛ نام‌های action ثابت؛ feature غیرفعال503 |
| `GET/POST /api/auth/identity` | پروفایل خصوصی خودفرد، شرح پایین؛ featureغیرفعال503 |
| `POST /api/auth/email` | recover/verify/set-password؛ کانال مستقل ازSMS؛ شرح پایین |
| `GET /api/admin/auth-health` | roleadmin ازDB لازم؛401/403 براینامرتبط؛ بو‌لیَن آمادگی کانال‌ها و خطای اخیر همینinstance، هیچ secret/contact؛ در `/admin/health` مصرف می‌شود |

همه پاسخ‌های حساس no-store، session فقط با کوکی canonical Supabase؛ کاربر یاUI session/JWT نمی‌سازد. درخواست writeOrigin باید دقیقاً یکی از مبدأهای تنظیم‌شده باشد. هیچ شماره/emailCSV یا nationalId تایپ‌شده، مالکیت حساب دیگر را ثابت نمی‌کند.

## auth.mobile.v1

```ts
type MobileRequest =
 | {action:'send'|'link';phone:string}
 | {action:'verify'|'verify-link';phone:string;code:string}
 | {action:'password'|'set-password';phone:string;password:string};
type MobileSuccess = {ok:true;status:'code_requested'|'completed';identity:'pending'};
type Failure = {error:string};
```

شماره‌های ایران بهE.164 و ارقام فارسی/عربی/لاتین یکسان می‌شوند. OTPشش‌رقمی، تصادفیGoTrue؛ password12–128نویسه. `link` فقط نشست حساب قدیمی، `verify-link` challenge همان user.phone/new_phone و نوعGoTruephone_change؛ تعویض شماره تأییدشده409 و بررسی جدا. رمز اختیاری فقط نشستOTP معتبر در5دقیقه اخیر؛ ورودpassword-only403. `code_requested` یعنی درخواست ثبت شده، نه تحویل پیامک. 400invalid،401نیاز ورود،403اثبات/مبدأ نامعتبر،409تعارض،429محدودیت،503غیرفعال/سرویس قطع؛ ورودیUI حفظ شود.

## auth.identity.v1 — قرارداد مشخص خانه عضو NEXT06

```ts
type PrivateProfile = {firstName:string;lastName:string;nationalId:string};
type IdentityRead = {
  profile:PrivateProfile|null; version?:number;
  phoneVerified:boolean; nationalIdFormatValid?:true;
  phoneNationalIdMatch:'pending'; identityMatch:'pending';
};
type IdentityWrite = PrivateProfile & {baseVersion:number;consent:'identity-v1'};
type IdentitySaved = {ok:true;version:number;phoneNationalIdMatch:'pending';identityMatch:'pending'};
```

GET پروفایل خالی:profile=null و version ممکن است نباشد؛ baseVersionUI=0. هیچ UUID/شماره در DTO نیست. nationalId رشته است و صفر نخست حفظ می‌شود؛ checksum فقط format است. POSTنام80/نام‌خانوادگی100نویسه، کدملی معتبر ازنظر قالب، baseVersionصحیح و رضایت صریح لازم دارد؛ نویسنده userId را ازgetUser می‌گیرد و فیلد اضافه را رد می‌کند. phoneconfirmed لازم است. موفقیت نسخه جدید append می‌کند؛ نسخه قدیمی حذف/بازنویسی نمی‌شود.409یعنی نسخه تازه‌تر ثبت شده؛ دوبارهGET و حل اختلاف توسطکاربر، بدون پاک‌کردن ورودی.403تعارض هویت/اثبات نیازمند بررسی؛503migration/writer/key/شبکه آماده نیست. نمایش«اطلاعات ناقص/مسیر غیرفعال/خطا/درانتظار» جدا باشد؛ نیازسنجی دوره، رضایت مشاور و membership از این DTO استنتاج نشوند.

هویت رسمی در همه fixtureهاpending است. شاهکار/ثبت‌احوال قرارداد و وضعیت مستقل دارند؛ مصرف‌کنندهverified کلی نسازد. وقتی SMSغیرفعال است، خانه عضو قدیمی با ایمیل/رمز باید قابل استفاده بماند؛ ورودهای قبلی به onboarding اجباریِ سرویس آماده‌نشده هدایت نشوند. صرف پایان عضویت دادهٔ این پروفایل/دارایی/مشاوره را حذف نمی‌کند.

## auth.email.v1

```ts
type EmailRequest =
 | {action:'recover';email:string}
 | {action:'verify';type:'signup'|'recovery';tokenHash:string;next?:string}
 | {action:'set-password';password:string};
```

recover:200پیام یکسان درخواست برای ایمیل موجود/ناموجود وSMTPموقتاًقطع؛ هیچ وعدهٔ ارسال قطعی. verifyجدید با AUTH_EMAIL_ENABLED،TokenHash استاندارد یاpkce_، یک‌بارمصرفGoTrue؛ پاسخ `{ok:true,next:string}`، نه session. recovery همیشه/reset-password؛ confirmation فقط ریشه‌های مجاز موجود یا/dashboard. لینکfragment در/auth/email-link فوراً ازaddress حذف می‌شود وTokenHashدرbodyPOSTمصرف می‌شود. رمزجدید باconfirmedemail وAMR معتبرOTP/recovery در5دقیقه اخیر؛ password-only اثبات بازیابی نیست. PKCEcallback قدیمی حفظ شده، queryآن درAPM/ingress باید حذف شود. loginemail/password بهSMS یا readinessflag وابسته نیست.

## fixture و مصرف

fixture نمایشی بدون داده هویتی واقعی: `profile:null, phoneVerified:false, phoneNationalIdMatch:'pending', identityMatch:'pending'`؛ فرم نام/نام‌خانوادگی خالی و کدملی خالی. برای حالت saved از داده مصنوعی برچسب‌دار و version1/2 استفاده شود؛ nationalId واقعی یا رقم اختراعی معرفی‌شده به‌عنوان مشتری واردprototype نشود. مثال‌های دادهٔ آزمایشی تولیدشده فقط در sandbox خصوصی هستند؛ نمونه‌های screenshot خالی و پاک‌سازی‌شده‌اند.

NEXT06 می‌تواند روی این endpoint/DTO فرم و حالات بسازد؛ درbase آن endpoint حاضر فرض نشود و503/عدم نصب به‌صورت صریح مدیریت شود. عضویت و module-grant از قراردادNEXT04 می‌آیند؛ Auth فقط user/phoneproof/session می‌دهد. NEXT05 مالکپوسته و مصرف‌کننده فرم است. NEXT09 اتصالTelegram باchallenge مستقل پس ازAuth انجام دهد؛ این APIنهTelegramlink می‌سازد و نهپیام می‌فرستد.

راهنمای تنظیم/نصب/بازگشت: [SMS](../../../services/auth-sms/README.md) و [email](../../../services/auth-email/README.md). نتیجه/گیت‌ها در [FOLLOWUP07RESULT](./FOLLOWUP-07-RESULT.md) است.
