# NEXT-05 — قرارداد پوسته و اجزای مشترک

نسخه2026-09-30؛ وابسته به NEXT01 seasonal.v0.1. مالک05: globals/token/Navbar/Footer/public components؛ مالکیت موتور مالی، `lib/format`، entitlements، admin actions و member routes به بسته‌های متناظر تعلق دارد.

| جزء/توکن | قرارداد مصرف |
|---|---|
| Navbar | component بدون prop، ناوبری عمومی؛ دسترسی فقط از backend/RLS؛ session فقط برچسب ورود/پنل را تعیین می‌کند. admin navigation را به این منو اضافه نکنید. |
| Footer | component موجود و props preview/debug محفوظ؛ URLهای legacy واقعی باقی‌اند. |
| WaitlistForm | `{tone?: 'light'|'onNavy'}`، email-only، POST/api/waitlist؛ error ورودی را پاک نمی‌کند؛ receipt تنها درخواست تماس است. |
| CourseCatalog | `{compact?:boolean}`؛ GET/api/courses، no-store، DTO معتبر seasonal.v0.1؛ empty/error/loading/ready مجزا؛ enabled=false ثبت‌نام غیرفعال با دلیل. |
| WebinarsContent | محتوای client فهرست legacy؛ callback query تأیید نیست؛ URLخصوصی رندر نمی‌شود؛ عضویت cohort از event ساخته نمی‌شود. |
| `.container/.section/.card/.btn/.input` | قرارداد legacy محفوظ؛ نیازی به بازنام‌گذاری06/07/08 نیست. |
| `public-*` | layout جدید عمومی؛ هر صفحه main مستقل و h1 واحد؛ maxwidth1160، موبایل padding20، touch48. |
| `--text/--text-2/--text-3` | متن اصلی/فرعی/شرح؛ `--text-3` حدکنتراست متن ریز را دارد. |
| `--navy-deep/--heading/--gold-ink/--gold-light` | طلایی ink روی سطح روشن، light روی سرمه‌ای؛ طلایی تزئینی خام برای متن ریز روشن استفاده نشود. |
| `--font-body/--font-display` | Vazirmatn محلی با OFL موجود؛ بدون CDN، Pelak بدون مجوز قابل اثبات در layout تازه load نمی‌شود. |
| `public/brand-tokens.css` | aliasها به canonical نزدیک/همسو؛ standalone mini-app مصرف‌کننده مستقل است، import اجباری جدید به app افزوده نشده. |
| فوکوس/کاهش حرکت | focus-visible3px، reduced-motion موجود رعایت شود؛ منوی موبایل Escape و restorefocus دارد؛ skiplink main واقعی را focus می‌کند. |

لینک‌های داخلی پیشنهادی مالک08/04: `/admin/courses` «دوره‌ها و ثبت‌نام»، `/admin/publications` «محتوای دوره و دفتر انتشار»، `/admin/leads` «درخواست مشاوره و پیگیری». افزودن آنها مشروط به کنترل دسترسی پوستهٔ داخلی موجود است؛ Navbar عمومی این عملیات را عرضه نمی‌کند.

مسیرهای SEO محفوظ: `/`، `/webinars`، `/login`، `/register`، تمام Footer؛ مسیر جدید `/consultation` canonical+sitemap دارد. anchorهای `#market/#features/#waitlist` حذف یا redirect نشده‌اند. member entry helper موجود را مصرف کنید و مقصد محلی next را حفظ کنید.

برای دادهٔ بازار، اجزای07 source/date/unit را مالک‌اند؛ زمان دریافت بسته «زنده» و اثبات امروز نیست. صفحهٔ خانه از کارت مسیرهای واقعی بازار استفاده می‌کند، عدد نمونه تولید نمی‌کند. ترتیب ادغام پیشنهادی:04 API →05 پوسته →06/07/08 صفحات؛ سپس smoke دو عرض، member/auth و Navbar/Footer روی صفحات ترکیبی.
