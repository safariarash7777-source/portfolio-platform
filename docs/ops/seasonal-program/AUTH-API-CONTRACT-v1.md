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
| `GET/POST /api/auth/identity` | پروفایل خصوصی خودفرد، شرح پایین؛ GET با قابلیت مستقل خواندن، POST با گیت موبایل موجود؛ featureغیرفعال503 |
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
  profileWriteEnabled?:boolean; // Always emitted by the 2026-10-03 producer; absent in older builds.
  phoneNationalIdMatch:'pending'; identityMatch:'pending';
};
type IdentityWrite = PrivateProfile & {baseVersion:number;consent:'identity-v1'};
type IdentitySaved = {ok:true;version:number;phoneNationalIdMatch:'pending';identityMatch:'pending'};
```

تکمیل ایزولهٔ2026-10-03: GET پس از احراز هویت، فقط با `AUTH_PROFILE_READ_ENABLED=true` سمت سرور فعال می‌شود؛ unset/false غیرفعال است و به AUTH_MOBILE_ENABLED وابسته نیست. کاربر ناشناس401، اختلالAuth503؛ کاربر احرازشده با قابلیت خاموش503 `{code:'profile_disabled',error:…}` می‌گیرد. حالتdisabled را ازunavailable وprofile=null جدا نمایش دهید. کلیدهای معتبر server-only پیش ازRPC بررسی می‌شوند؛ کلید غایب/نامعتبر، خطایRPC وdecrypt/schema،503 عمومی‌اند و profile=null/recorded نمی‌شوند. DTO موفق، فیلد افزایشی `profileWriteEnabled:boolean` دارد؛ true فقط گیت مسیر نوشتن موجود را نشان می‌دهد و جای اثبات phone/مجوزPOST نیست. مصرف‌کنندهٔ فاقداینفیلد، مسیر ویرایش را فعال فرض نکند. POST همچنان AUTH_MOBILE_ENABLED، same-origin، getUser و phoneconfirmed قبلی را لازم دارد؛ خواندن مستقل، SMS/OTP/ثبتنام/نوشتن را فعال نمی‌کند. RPCخواندن بی‌پارامتر و محدود بهauth.uid() موجود است؛ UUID و scope حساب از ورودی درخواست گرفته نمی‌شوند. این تکمیل مستقر یا پذیرفتهNative نیست.

GET پروفایل خالی:profile=null و version ممکن است نباشد؛ baseVersionUI=0. هیچ UUID/شماره در DTO نیست. nationalId رشته است و صفر نخست حفظ می‌شود؛ checksum فقط format است. POSTنام80/نام‌خانوادگی100نویسه، کدملی معتبر ازنظر قالب، baseVersionصحیح و رضایت صریح لازم دارد؛ نویسنده userId را ازgetUser می‌گیرد و فیلد اضافه را رد می‌کند. phoneconfirmed لازم است. موفقیت نسخه جدید append می‌کند؛ نسخه قدیمی حذف/بازنویسی نمی‌شود.409یعنی نسخه تازه‌تر ثبت شده؛ دوبارهGET و حل اختلاف توسطکاربر، بدون پاک‌کردن ورودی.403تعارض هویت/اثبات نیازمند بررسی؛503migration/writer/key/شبکه آماده نیست. نمایش«اطلاعات ناقص/مسیر غیرفعال/خطا/درانتظار» جدا باشد؛ نیازسنجی دوره، رضایت مشاور و membership از این DTO استنتاج نشوند.

هویت رسمی در همه fixtureهاpending است. شاهکار/ثبت‌احوال قرارداد و وضعیت مستقل دارند؛ مصرف‌کنندهverified کلی نسازد. وقتی SMSغیرفعال است، خانه عضو قدیمی با ایمیل/رمز باید قابل استفاده بماند؛ ورودهای قبلی به onboarding اجباریِ سرویس آماده‌نشده هدایت نشوند. صرف پایان عضویت دادهٔ این پروفایل/دارایی/مشاوره را حذف نمی‌کند.

## auth.email.v1

```ts
type EmailRequest =
 | {action:'signup';fullName:string;email:string;password:string;next?:string}
 | {action:'recover';email:string;next?:string}
 | {action:'verify';type:'signup'|'recovery';tokenHash:string;next?:string}
 | {action:'set-password';password:string};
```

افزودنی P01: signup فقط با `AUTH_EMAIL_ALLOW_SIGNUP=true` و `AUTH_EMAIL_ENABLED=true`، سپس settings واقعیِ GoTrue شامل external.email=true، disable_signup=false و mailer_autoconfirm=false انجام می‌شود. فقط full_name وارد metadata می‌شود؛ phone/national_id/role/data اضافه400 هستند. پاسخ200 `{ok:true,status:'confirmation_requested',message:string}` رسید شرطی است؛ نه عضویت، ارسال قطعی، session یا UUID. کدِ duplicate شناخته‌شده همان رسید را می‌دهد و credential/grant قبلی تغییر نمی‌کند. سایر ورودی نامعتبر400، محدودیت429 و اختلال503 هستند. سقف واقعی stream4096byte پیش از Auth اعمال می‌شود؛ Origin همان قرارداد قبلی است. این BFF جای محدودیت/disable_signupِ endpoint بومی GoTrue نیست.

recover:200پیام یکسان درخواست برای ایمیل موجود/ناموجود وSMTPموقتاًقطع؛ هیچ وعدهٔ ارسال قطعی. verifyجدید با AUTH_EMAIL_ENABLED،TokenHash استاندارد یاpkce_، یک‌بارمصرفGoTrue؛ پاسخ `{ok:true,next:string}`، نه session. recovery همیشه به/reset-password یا/reset-password?next=مقصدِمحلیِمجاز می‌رود؛ confirmation فقط ریشه‌های مجاز موجود یا/dashboard. لینکfragment در/auth/email-link فوراً ازaddress حذف می‌شود وTokenHashدرbodyPOSTمصرف می‌شود. رمزجدید باconfirmedemail وAMR معتبرOTP/recovery در5دقیقه اخیر و غیرآینده؛ password-only اثبات بازیابی نیست. PKCEcallback قدیمی حفظ شده، queryآن درAPM/ingress باید حذف شود. loginemail/password بهSMS یا readinessflag وابسته نیست.

`GET /api/auth/status?scope=email-recovery`: پس از getUser معتبر و getClaims، `{authenticated:true,recovery:'ready'|'proof_required'}` بدون role/UUID/AMR خام؛ خطای claims/session ردشده401 و اختلال503. حالت ناشناسِ status همچنان200 authenticated=false است. UI checking/ready/proof_required/unavailable را جدا نشان می‌دهد؛ retry سرویس ورودی رمز را پاک نمی‌کند. GET بدون scope همان قرارداد قبلی role/profileRead را دارد.

`NEXT_PUBLIC_SUPABASE_COOKIE_NAME` اختیاری باید در build browser، server، middleware و callback یکی باشد؛ unset default قبلی. دو محیط روی یکIP با port جدا به نام مستقل نیاز دارند. هر چهار factory در ادامه P01 هماهنگ شده‌اند؛ تغییر این تنظیم با پذیرش همان build در sandbox، نه Production انجام شود.

## fixture و مصرف

fixture نمایشی بدون داده هویتی واقعی: `profile:null, phoneVerified:false, phoneNationalIdMatch:'pending', identityMatch:'pending'`؛ فرم نام/نام‌خانوادگی خالی و کدملی خالی. برای حالت saved از داده مصنوعی برچسب‌دار و version1/2 استفاده شود؛ nationalId واقعی یا رقم اختراعی معرفی‌شده به‌عنوان مشتری واردprototype نشود. مثال‌های دادهٔ آزمایشی تولیدشده فقط در sandbox خصوصی هستند؛ نمونه‌های screenshot خالی و پاک‌سازی‌شده‌اند.

NEXT06 می‌تواند روی این endpoint/DTO فرم و حالات بسازد؛ درbase آن endpoint حاضر فرض نشود و503/عدم نصب به‌صورت صریح مدیریت شود. عضویت و module-grant از قراردادNEXT04 می‌آیند؛ Auth فقط user/phoneproof/session می‌دهد. NEXT05 مالکپوسته و مصرف‌کننده فرم است. NEXT09 اتصالTelegram باchallenge مستقل پس ازAuth انجام دهد؛ این APIنهTelegramlink می‌سازد و نهپیام می‌فرستد.

راهنمای تنظیم/نصب/بازگشت: [SMS](../../../services/auth-sms/README.md) و [email](../../../services/auth-email/README.md). نتیجه/گیت‌ها در [FOLLOWUP07RESULT](./FOLLOWUP-07-RESULT.md) است.
