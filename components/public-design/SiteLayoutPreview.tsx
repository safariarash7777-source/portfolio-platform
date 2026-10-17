"use client";
import { SITE_LAYOUTS, type SiteLayout } from "@/lib/appearance/site-layout";
import { toPersianDigits as fa } from "@/lib/format";
import s from "./PublicDesign.module.css";

export default function SiteLayoutPreview({
  layout,
  onChoose,
}: {
  layout: SiteLayout;
  onChoose: (layout: SiteLayout) => void;
}) {
  return (
    <div
      className={s.appearance}
      id="public-appearance"
      data-site-appearance-preview
    >
      <span>پیش‌نمایش مدیر · این انتخاب ذخیره نشده است</span>
      <div aria-label="چیدمان پیش‌نمایش">
        {SITE_LAYOUTS.map((n) => (
          <button
            key={n}
            aria-pressed={layout === n}
            onClick={() => onChoose(n)}
          >
            طرح {fa(n)}
          </button>
        ))}
      </div>
      <a href="/admin/appearance">ذخیرهٔ سراسری در پنل مدیریت</a>
    </div>
  );
}
