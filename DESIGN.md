# Design — سیستم موجود و مقایسه ایزوله

تاریخ2026-10-01؛ فقط زمینه و نمونهٔ مستقل، بدون ویرایش globals/Navbar یا صفحات عملیاتی.

## Visual Theme & Atmosphere

جهت پیشنهادی: مسیر روشن خدمت روی برند موجود، همراه نمونهٔ خروجی عضو؛ معرفی خدمت در خانه و تراکم کنترل‌شده در عضو/میز. سه حالت داده/مجوز از جلوه بصری مهم‌ترند. طرح نهایی و فونت به انتخاب مالک وابسته‌اند.

## Color Palette & Roles

Primitiveها از app/globals.css و aliasهایpublic/brand-tokens.css درPR177: navy#1E3A8A، navy-deep#0D1F4A، gold#B8860B، gold-light#F5D07A، gold-ink#7A5A08، bg#F8F7F4، surface#FFFFFF، text#0F172A، text-2#334155، text-3#556274. accent برای اقدام/وضعیت؛ متن ریز طلایی ازgold-ink، رویnavy ازgold-light. هیچ پالت تازه مصوب نمی‌شود.

## Typography Rules

A: Vazirmatn variable موجود100–900 وSIL OFL؛ B: Estedad variable100–900، منبع رسمیcommit0dbe689 وSIL OFL. فقط درprototype قابل انتخاب‌اند. متن یکسان و اندازه/فاصله یکسان، یک خانواده در هر حالت؛ هم‌زمانpair نمی‌شوند. بدنه1rem، خط1.85، عنوانbrand fluidحداکثر3.25rem؛ عضو/میز/بازار ثابت2rem؛ جدول1rem، tabular-nums وLTRبرایمبلغ. fallbackTahoma/sans-serif،font-display:swap وpreloadفقطخانوادهانتخاب‌شده. Pelak فایل دارد اماشاهدlicenseموجودنیست؛ استفاده تازه ندارد.

## Component Styling

Primitive → semantic (text/action/surface/state) → component (button/list/form/table). اجزای نمونه: اقدام اصلی، وضعیت دوره، خلاصهٔ دوره و اطلاعات ناقص، جدول، فرم نیازسنجی، نوار انتخاب فونت و حالت. hover/focus/disabled/error/empty مستقل. هشدار بهborderرنگی کنار تکیه نمی‌کند؛ متن وstatusهمراه دارد. جدول پیمایش داخلی وcaptionواحد دارد.

## Layout Principles

محتواmax1256، متن65ch؛ خانه معرفی وقدم‌هایواقعی، دورهشرایط وCTAغیرفعالدرنبوداطلاعات، عضوکارهایخودش/دورهباscopeصریح. 390یکستون؛1440دوستونبرایخلاصه/شرایط. font یاviewportعنوانرا ازقابخارجنکند. دارایی، بدهی واطلاعاتناموجود راجمعکلثروت معرفی نکنید.

## Interaction & Motion

نمونه hashهایhome/course/member/needs/market/desk دارد؛ URLهایفعال عوضنشده‌اند. انتخاب فونت وstate نمونه بدونارسالواقعی؛ فرمفقطمحلی. focusپس ازnavigationبهmain، skiplink، selectاستاندارد، reduced-motionبدونtransition. انتخابآرش گیتگسترشرویصفحاتاصلیاست.
