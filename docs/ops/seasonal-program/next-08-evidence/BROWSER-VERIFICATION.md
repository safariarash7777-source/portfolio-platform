# شاهد مرورگر NEXT08 — 2026-09-30

Chrome واقعی headless/session ایزوله next05 با agent-browser، server8768/qa/next08، fixture مصنوعی و مستقل ازDB. CUA browser قابل استفاده نداشت. مشاهدهٔ رابط به معنی ذخیره/مجوز واقعی یا ارسالTelegram نیست.

1440×1000 و390×844 مشاهده شدند؛ geometry JSON هر دو عرض scrollWidth=clientWidth دارد. نسخه2 پژوهش انتخاب شد، عنوان/خلاصه/متن مخاطب مصنوعی وارد شد، cohort منتخب+site+Telegram تعیین شد. save→پیش‌نویس نسخه1؛ reason+privacy→آماده برای انتشار (هنوز خصوصی)؛ reason+privacy تازه→publish با پذیرش nativeconfirm؛ sitepublished، متن اعلام می‌کند ارسالTelegram ازاین ابزار انجام نمی‌شود؛ reason+privacy تازه→withdraw=متوقف‌شده. empty picker و unavailable picker مشاهده شدند؛ درخطا save/ready/publish غیرفعال وretry موجود است. Tab ازmodepicker به «میزروزانه» با outline2px اجرا شد. تصاویر qa-*.png و geometryها مرجع‌اند.

اجرای تازهٔ زمان‌دار در qa-timed-scenario.json:52.323ثانیه از Date.now پیش از انتخاب پژوهش تا Date.now پس از withdrawal. زمان wallclock خودکار مرورگر با فاصلهٔ فراخوان ابزار است؛ زمان تکمیل کاربر انسانی نیست. checkpoints نتیجه مشاهده‌شده‌اند و timestamps تک‌تک مرحله جداگانه ثبت نشده‌اند. دراجرای اولیه timer وجود نداشت و تاریخ تصاویر فقط بازهٔ برداشت است.

پس از پایان آزمون dev برای build به مالک08 آزاد شد. production404 gate و آزمون‌هایDB توسط مالک08 جدا گزارش می‌شوند؛ در این شاهد تأیید نشده‌اند. Auth واقعی، مشتری واقعی، سکرت و پیام واقعی استفاده نشده‌اند.
