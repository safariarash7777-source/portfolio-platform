"use client";
import { useEffect, useState } from "react";
import { Check, LayoutGrid } from "lucide-react";
import { APPEARANCE_KEY, LAYOUT_LABELS, readAppearance, type MediaAppearance, type MediaLayout } from "@/lib/media/presentation";
import { toPersianDigits as fa } from "@/lib/format";
import styles from "./MediaHub.module.css";

export default function MediaAppearanceSettings({ onApply }: { onApply?: (value: MediaAppearance) => void }) {
  const [draft, setDraft] = useState<MediaAppearance>({ layout: 1, covers: "editorial", featured: [] });
  const [message, setMessage] = useState("");
  useEffect(() => { setDraft(readAppearance()); }, []);
  function save() {
    try { window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(draft)); onApply?.(draft); setMessage("طرح پیش‌فرضِ نمونه در همین مرورگر ذخیره شد."); }
    catch { setMessage("ذخیره ممکن نشد. تنظیمات قبلی حفظ شده‌اند."); }
  }
  return <section className={styles.appearance} aria-label="مدیریت ظاهر رسانه">
    <h2><LayoutGrid size={21} /> ظاهر رسانهٔ آرش</h2>
    <p>هر سه طرح همیشه در دسترس‌اند. این کنترل فعلاً تنظیم پیش‌نمایش در همین مرورگر است؛ انتخاب سراسری سایت هنوز به مخزن تنظیمات مدیر متصل نیست.</p>
    <div className={styles.layoutChoices}>{([1, 2, 3] as MediaLayout[]).map(layout => <button key={layout} aria-pressed={draft.layout === layout} onClick={() => { setDraft({ ...draft, layout }); setMessage(""); }}><strong>طرح {fa(layout)}</strong><span>{LAYOUT_LABELS[layout]}</span>{draft.layout === layout && <Check size={17}/>}</button>)}</div>
    <label>تصویر کارت‌ها<select value={draft.covers} onChange={e => setDraft({ ...draft, covers: e.target.value === "source" ? "source" : "editorial" })}><option value="editorial">کاور هنریِ نمایشی</option><option value="source">فقط تصویر اصلی منبع</option></select></label>
    <div className={styles.settingsActions}><button className={styles.primary} onClick={save}>فعال‌کردن طرح در نمونه</button><a href="/design/media">بازکردن پیش‌نمایش رسانه</a></div>
    {message && <p role="status">{message}</p>}
  </section>;
}
