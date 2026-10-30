"use client";
import s from "./PublicDesign.module.css";

export default function SiteAppearanceWarning() {
  return (
    <div
      className={s.appearanceWarning}
      role="alert"
      data-site-appearance-unavailable
    >
      <p>
        خواندن چیدمان ذخیره‌شده ممکن نشد؛ فعلاً نمای پایه نمایش داده می‌شود.
        تنظیم ذخیره‌شده تغییر نکرده است.
      </p>
      <button onClick={() => window.location.reload()}>
        خواندن دوبارهٔ چیدمان
      </button>
    </div>
  );
}
