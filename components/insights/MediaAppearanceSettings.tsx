"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, LayoutGrid } from "lucide-react";
import { APPEARANCE_KEY, LAYOUT_LABELS, readAppearance, type MediaAppearance, type MediaLayout } from "@/lib/media/presentation";
import { isMediaLayout } from "@/lib/media/layout-setting";
import { toPersianDigits as fa } from "@/lib/format";
import styles from "./MediaHub.module.css";

export default function MediaAppearanceSettings({ preview = false, onApply }: { preview?: boolean; onApply?: (value: MediaAppearance) => void }) {
  const [draft, setDraft] = useState<MediaAppearance>({ layout: 1, covers: "editorial", featured: [] });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(!preview), [busy, setBusy] = useState(false), [readFailed, setReadFailed] = useState(false);
  const pending = useRef(false), mounted = useRef(true);
  const load = useCallback(async () => {
    setLoading(true); setReadFailed(false); setMessage("");
    try {
      const response = await fetch("/api/admin/content/appearance", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !isMediaLayout(body.media_layout)) throw new Error("read");
      if (mounted.current) setDraft(current => ({ ...current, layout: body.media_layout }));
    } catch { if (mounted.current) { setReadFailed(true); setMessage("خواندن تنظیم ذخیره‌شده ممکن نشد؛ دوباره تلاش کنید."); } }
    finally { if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (preview) setDraft(readAppearance()); else void load();
    return () => { mounted.current = false; };
  }, [preview, load]);
  async function save() {
    if (pending.current || loading || readFailed) return;
    if (preview) {
      try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(draft)); onApply?.(draft); setMessage("طرح پیش‌فرضِ نمونه در همین مرورگر ذخیره شد."); }
      catch { setMessage("ذخیره ممکن نشد. تنظیمات قبلی حفظ شده‌اند."); }
      return;
    }
    pending.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/content/appearance", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_layout: draft.layout }), cache: "no-store" });
      const body = await response.json();
      if (!response.ok || body.media_layout !== draft.layout) throw new Error("save");
      if (mounted.current) setMessage("طرح برای همهٔ بازدیدکنندگان ذخیره شد؛ در بازدید بعدی رسانه نمایش داده می‌شود.");
    } catch { if (mounted.current) setMessage("ذخیره تأیید نشد. تنظیم ذخیره‌شده را دوباره بخوانید؛ ممکن است درخواست به سرور رسیده باشد."); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  return <section className={styles.appearance} aria-label="مدیریت ظاهر رسانه" aria-busy={loading || busy}>
    <h2><LayoutGrid size={21} /> ظاهر رسانهٔ آرش</h2>
    <p>{preview ? "این کنترل فقط نمونهٔ همین مرورگر را تغییر می‌دهد." : "یک طرح را برای همهٔ بازدیدکنندگان رسانه انتخاب و ذخیره کنید."}</p>
    <div className={styles.layoutChoices}>{([1, 2, 3] as MediaLayout[]).map(layout => <button key={layout} disabled={loading || busy || readFailed} aria-pressed={draft.layout === layout} onClick={() => { setDraft({ ...draft, layout }); setMessage(""); }}><strong>طرح {fa(layout)}</strong><span>{LAYOUT_LABELS[layout]}</span>{draft.layout === layout && <Check size={17}/>}</button>)}</div>
    {preview && <label>تصویر کارت‌ها<select value={draft.covers} onChange={e => setDraft({ ...draft, covers: e.target.value === "source" ? "source" : "editorial" })}><option value="editorial">کاور هنریِ نمایشی</option><option value="source">فقط تصویر اصلی منبع</option></select></label>}
    <div className={styles.settingsActions}><button className={styles.primary} disabled={loading || busy || readFailed} onClick={() => void save()}>{busy ? "در حال ذخیره…" : preview ? "فعال‌کردن طرح در نمونه" : "ذخیره طرح برای همه"}</button>
      {!preview && <button disabled={loading || busy} onClick={() => void load()}>خواندن دوباره تنظیم</button>}
      <a href="/design/media">بازکردن نمونهٔ سه طرح</a></div>
    {loading && <p role="status">در حال خواندن تنظیم ذخیره‌شده…</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
