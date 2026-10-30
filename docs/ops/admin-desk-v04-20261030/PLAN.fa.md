# برش میز روزکاری مدیر — P12/P09/P10.1/P14.2

مبنا main@f93dbdc؛ source نیازها PR332@5a3d916، EXECUTION-BACKLOG.fa.md بندهایP12.1–.5/P14.2/.5 خوانده شد. /admin به /admin/desk می‌رود؛ ArashDeskWorkspace پیش‌فرض و ArashCommandDesk نمایclassic است. /admin/consultation،/admin/research،/admin/users و/admin/health موجودند. PR330/333 باB، مالی عضو/334 باB، prototypeشرکت باA؛ این برش رویstore/UIکاربرگ یاhelpersمشترک نمی‌نویسد. PR244 صفحهdeskراهمدارد؛ این تغییرکوچک consumers باdiffمحدود وبدونادغامآنPRاست.

## Spec
شکاف: صفحهروزانه بازار/پژوهش دارد اما ورود یکپارچه به تصمیم‌های مشاوره/خدمت/پژوهش و علتتوقف را ندارد. همانصفحه باcomponentمحلی AdminWorkdayPath تکمیل شود. ازdata.market.availability وdata.research موجود استفاده؛خطایخواندن≠خالی. شمارdraftتاریخی≠کارباز/مدلتازه/آمادهتصمیم. حقخدمت/صفمشاوره/موعد/مالک نامعلوم؛ازنقشادمین،فیلتر،چیدمانیاcount مجوزساختهنشود. نقشادمینlayoutموجودحفظ.

## Plan / tasks
ArashDeskWorkspace.tsx: افزودنsection؛ AdminWorkdayPath.tsx: مسیرهایواقعی وگامبعد/علت/موعد/مالک. اولویت/توقف فقطstateموقتایننما،صریحبرچسبدار،بدونfetch/save/send. نامکاربر/نمونهپنهانی واردنشود. محصولAPI/DDL/flag/env/refeshجدیدندارد. تستSSRخالی/خطا/نامعلوم،handlerاولویت/توقفبدونشبکه،typecheck/lint/build. Previewهمانsource در/admin/desk پشتگیتاصلی؛guestنبایدببیند. screenshot/پذیرشاحرازشده ودو اندازه جداازتستقالب وCIثبتشود؛بدونآن تحویلعلمیاتیادعانشود.

## مرز پایان این برش
P12.1و.2 راهنمایخواندنی+تعامل موقت؛P12.5 نامعلوم‌هاصریح. عضو/فیلترذخیره/تقویم/هدیه/پیامگروهی/درآمدهزینه/دفتروقایعجدید ساختهنمی‌شود. P09/P10.1 بهمیزپژوهش وگردشواقعی موجودمتصل،نهثبتوقایعساختگی. مالککد/consumerSTART-C؛sharedrefsفقطroot.
