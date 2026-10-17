"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LayoutGrid } from "lucide-react";
import {
  APPEARANCE_KEY,
  LAYOUT_LABELS,
  readAppearance,
  type MediaAppearance,
  type MediaLayout,
} from "@/lib/media/presentation";
import { isMediaLayout } from "@/lib/media/layout-setting";
import { toPersianDigits as fa } from "@/lib/format";
import styles from "./MediaHub.module.css";
import {
  SITE_APPEARANCE_PATHS,
  sitePreviewHref,
} from "@/lib/appearance/site-layout";

export default function MediaAppearanceSettings({
  preview = false,
  onApply,
}: {
  preview?: boolean;
  onApply?: (value: MediaAppearance) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<MediaAppearance>({
    layout: 1,
    covers: "editorial",
    featured: [],
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(!preview),
    [busy, setBusy] = useState(false),
    [readFailed, setReadFailed] = useState(false);
  const pending = useRef(false),
    mounted = useRef(true);
  const readSequence = useRef(0),
    saveSequence = useRef(0),
    readController = useRef<AbortController | null>(null);
  const cancelRequests = useCallback(() => {
    readSequence.current++;
    saveSequence.current++;
    readController.current?.abort();
    readController.current = null;
  }, []);
  const load = useCallback(
    async (clearMessage = true): Promise<MediaLayout | null> => {
      const sequence = ++readSequence.current;
      readController.current?.abort();
      const controller = new AbortController();
      readController.current = controller;
      setLoading(true);
      setReadFailed(false);
      if (clearMessage) setMessage("");
      try {
        const response = await fetch("/api/admin/content/appearance", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json();
        if (!mounted.current || sequence !== readSequence.current) return null;
        if (!response.ok || !isMediaLayout(body.media_layout))
          throw new Error("read");
        if (mounted.current)
          setDraft((current) => ({ ...current, layout: body.media_layout }));
        return body.media_layout;
      } catch {
        if (mounted.current && sequence === readSequence.current) {
          setReadFailed(true);
          setMessage("خواندن تنظیم ذخیره‌شده ممکن نشد؛ دوباره تلاش کنید.");
        }
        return null;
      } finally {
        if (mounted.current && sequence === readSequence.current) {
          setLoading(false);
          readController.current = null;
        }
      }
    },
    [],
  );
  useEffect(() => {
    mounted.current = true;
    if (preview) setDraft(readAppearance());
    else void load();
    return () => {
      mounted.current = false;
      cancelRequests();
    };
  }, [preview, load, cancelRequests]);
  async function save() {
    if (pending.current || loading || readFailed) return;
    if (preview) {
      try {
        localStorage.setItem(APPEARANCE_KEY, JSON.stringify(draft));
        onApply?.(draft);
        setMessage("طرح پیش‌فرضِ نمونه در همین مرورگر ذخیره شد.");
      } catch {
        setMessage("ذخیره ممکن نشد. تنظیمات قبلی حفظ شده‌اند.");
      }
      return;
    }
    pending.current = true;
    setBusy(true);
    setMessage("");
    cancelRequests();
    const operation = ++saveSequence.current;
    try {
      const response = await fetch("/api/admin/content/appearance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_layout: draft.layout }),
        cache: "no-store",
      });
      const body = await response.json();
      if (!mounted.current || operation !== saveSequence.current) return;
      if (!response.ok || body.media_layout !== draft.layout)
        throw new Error("save");
      const canonical = await load(false);
      if (mounted.current && operation === saveSequence.current) {
        if (canonical === null)
          setMessage(
            "سرور ذخیره را پذیرفت، اما خواندن دوبارهٔ تنظیم تأیید نشد؛ پیش از ادامه تنظیم را دوباره بخوانید.",
          );
        else {
          setMessage(
            canonical === draft.layout
              ? "طرح برای همهٔ بازدیدکنندگان ذخیره شد و با خواندن دوباره تأیید شد. خانه، بازار و رسانه را بازخوانی کنید."
              : `ذخیره انجام شد؛ در خواندن تازه، طرح ${fa(canonical)} فعال است. ممکن است مدیر دیگری تنظیم را تغییر داده باشد.`,
          );
          router.refresh();
        }
      }
    } catch {
      if (mounted.current && operation === saveSequence.current)
        setMessage(
          "ذخیره تأیید نشد. تنظیم ذخیره‌شده را دوباره بخوانید؛ ممکن است درخواست به سرور رسیده باشد.",
        );
    } finally {
      pending.current = false;
      if (mounted.current && operation === saveSequence.current) setBusy(false);
    }
  }
  return (
    <section
      className={styles.appearance}
      aria-label={preview ? "مدیریت ظاهر رسانه" : "مدیریت چیدمان سایت"}
      aria-busy={loading || busy}
    >
      <h2>
        <LayoutGrid size={21} />
        {preview ? "ظاهر رسانهٔ آرش" : "انتخاب طرح سراسری"}
      </h2>
      <p>
        {preview
          ? "این کنترل فقط نمونهٔ همین مرورگر را تغییر می‌دهد."
          : "یک طرح را برای همهٔ بازدیدکنندگان صفحهٔ اصلی، نمای کلان بازار و رسانه انتخاب و ذخیره کنید. میز مدیر و مسیر اعضا با این تنظیم تغییر نمی‌کنند."}
      </p>
      <div className={styles.layoutChoices}>
        {([1, 2, 3] as MediaLayout[]).map((layout) => (
          <button
            key={layout}
            disabled={loading || busy || readFailed}
            aria-pressed={!loading && !readFailed && draft.layout === layout}
            onClick={() => {
              setDraft({ ...draft, layout });
              setMessage("");
            }}
          >
            <strong>طرح {fa(layout)}</strong>
            <span>
              {preview ? LAYOUT_LABELS[layout] : "خانه، بازار و رسانه"}
            </span>
            {!loading && !readFailed && draft.layout === layout && (
              <Check size={17} />
            )}
          </button>
        ))}
      </div>
      {preview && (
        <label>
          تصویر کارت‌ها
          <select
            value={draft.covers}
            onChange={(e) =>
              setDraft({
                ...draft,
                covers: e.target.value === "source" ? "source" : "editorial",
              })
            }
          >
            <option value="editorial">کاور هنریِ نمایشی</option>
            <option value="source">فقط تصویر اصلی منبع</option>
          </select>
        </label>
      )}
      <div className={styles.settingsActions}>
        <button
          className={styles.primary}
          disabled={loading || busy || readFailed}
          onClick={() => void save()}
        >
          {busy
            ? "در حال ذخیره…"
            : preview
              ? "فعال‌کردن طرح در نمونه"
              : "ذخیره طرح برای همه"}
        </button>
        {!preview && (
          <button disabled={loading || busy} onClick={() => void load()}>
            خواندن دوباره تنظیم
          </button>
        )}
        {preview && <a href="/design/media">بازکردن نمونهٔ سه طرح</a>}
      </div>
      {!preview && (
        <div
          className={styles.settingsActions}
          aria-label="پیش‌نمایش طرح انتخاب‌شده"
        >
          {SITE_APPEARANCE_PATHS.map((path, i) => (
            <a
              key={path}
              href={sitePreviewHref(path, draft.layout)}
              target="_blank"
              rel="noopener noreferrer"
            >
              پیش‌نمایش {i === 0 ? "خانه" : i === 1 ? "بازار" : "رسانه"}
            </a>
          ))}
        </div>
      )}
      {loading && <p role="status">در حال خواندن تنظیم ذخیره‌شده…</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
