"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, Send, Instagram, Twitter, Link2, CheckCircle2, AlertCircle, EyeOff, ExternalLink, RefreshCw,
} from "lucide-react";
import { formatJalali } from "@/lib/format";
import {
  type Platform, type ContentKind,
  PLATFORMS, KINDS, PLATFORM_META, KIND_LABEL, detectPlatform, guessKind,
} from "@/lib/content-hub";

interface Row {
  id: string;
  platform: Platform;
  kind: ContentKind;
  content_url: string;
  title: string | null;
  description: string | null;
  published_at: string | null;
  deleted_at: string | null;
}

function PlatformIcon({ platform, size = 18 }: { platform: Platform; size?: number }) {
  if (platform === "telegram") return <Send size={size} />;
  if (platform === "instagram") return <Instagram size={size} />;
  return <Twitter size={size} />;
}

export default function ContentHubManager({ items }: { items: Row[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [kind, setKind] = useState<ContentKind>("post");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [hiding, setHiding] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncErr, setSyncErr] = useState("");

  // همگام‌سازیِ دستی: همهٔ پست‌های کانالِ عمومیِ تلگرام را یک‌جا می‌آورد.
  const sync = async () => {
    setSyncErr("");
    setSyncMsg(null);
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/content", { method: "PUT" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "همگام‌سازی ناموفق بود.");
      setSyncMsg(
        json.inserted > 0
          ? `${json.inserted} پستِ جدید از تلگرام اضافه شد (از ${json.found} پستِ کانال).`
          : json.found > 0
            ? `همه‌چیز به‌روز است — ${json.found} پستِ کانال از قبل موجود بود.`
            : "پستی در فیدِ عمومیِ کانال پیدا نشد."
      );
      router.refresh();
    } catch (e) {
      setSyncErr(e instanceof Error ? e.message : "همگام‌سازی ناموفق بود.");
    } finally {
      setSyncing(false);
    }
  };

  // با پیست‌شدنِ لینک، شبکه و نوع را خودکار حدس بزن (کاربر می‌تواند تغییر دهد).
  const onUrlChange = (v: string) => {
    setUrl(v);
    const p = detectPlatform(v);
    if (p) setPlatform(p);
    if (v.trim()) setKind(guessKind(v));
  };

  const add = async () => {
    setError("");
    setResult(null);
    if (!url.trim()) {
      setError("لینکِ محتوا الزامی است.");
      return;
    }
    const p = platform ?? detectPlatform(url);
    if (!p) {
      setError("شبکه مشخص نیست — لینکِ تلگرام/اینستاگرام/توییتر بده یا شبکه را انتخاب کن.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: p, kind, content_url: url.trim(), title: title.trim(), description: description.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "خطا در افزودن.");
      setResult("محتوا اضافه شد و در صفحهٔ /insights قرار گرفت.");
      setUrl("");
      setPlatform(null);
      setKind("post");
      setTitle("");
      setDescription("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در افزودن.");
    } finally {
      setSending(false);
    }
  };

  const hide = async (id: string) => {
    if (!confirm("این محتوا از صفحهٔ عمومی پنهان شود؟")) return;
    setHiding(id);
    try {
      const res = await fetch("/api/admin/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "خطا در پنهان‌سازی.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در پنهان‌سازی.");
    } finally {
      setHiding(null);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <span className="eyebrow">پنل مدیریت</span>
        <h1 className="font-display text-2xl md:text-3xl font-bold mt-1" style={{ color: "var(--navy-deep)" }}>
          هابِ محتوا
        </h1>
        <p className="text-sm mt-2 leading-7" style={{ color: "var(--text-2)" }}>
          پست‌های کانالِ عمومیِ تلگرام خودکار این‌جا می‌آیند (هر ۶ ساعت). برای آوردنِ فوریِ همهٔ
          پست‌ها، دکمهٔ «همگام‌سازی با تلگرام» را بزنید. لینکِ اینستاگرام/توییتر را هم می‌توانید دستی
          اضافه کنید یا در تلگرام برای بات بفرستید.
        </p>
      </header>

      {/* همگام‌سازیِ تلگرام */}
      <div className="card-elevated p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Send size={18} style={{ color: "var(--brand-telegram)" }} />
          <h3 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
            همگام‌سازی با کانالِ تلگرام
          </h3>
        </div>
        <p className="text-sm leading-7" style={{ color: "var(--text-2)" }}>
          همهٔ پست‌های کانالِ عمومی (قدیمی و جدید) را از فیدِ عمومیِ تلگرام می‌خواند و به صفحهٔ
          «آخرین تحلیل‌ها» اضافه می‌کند — که برای هر بازدیدکننده‌ای نمایش داده می‌شود.
        </p>
        {syncErr && (
          <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--danger)" }}>
            <AlertCircle size={15} /> {syncErr}
          </p>
        )}
        {syncMsg && (
          <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--success)" }}>
            <CheckCircle2 size={15} /> {syncMsg}
          </p>
        )}
        <button type="button" onClick={sync} disabled={syncing} className="btn btn-primary">
          <RefreshCw size={16} className={syncing ? "animate-spin" : undefined} />
          {syncing ? "در حال همگام‌سازی…" : "همگام‌سازی با تلگرام"}
        </button>
      </div>

      {/* فرمِ افزودن */}
      <div className="card-elevated p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Sparkles size={18} style={{ color: "var(--gold)" }} />
          <h3 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
            افزودنِ محتوا
          </h3>
        </div>

        {/* لینک */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--text-2)" }}>
            <Link2 size={14} /> لینکِ محتوا
          </label>
          <input
            className="input"
            dir="ltr"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://t.me/... یا https://instagram.com/... یا https://x.com/..."
          />
        </div>

        {/* شبکه */}
        <div className="space-y-1.5">
          <label className="block text-sm font-bold" style={{ color: "var(--text-2)" }}>شبکه</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const on = platform === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className="flex items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition-colors"
                  style={{
                    minHeight: 40,
                    background: on ? "var(--navy-deep)" : "var(--surface-2)",
                    color: on ? "var(--text-on-navy)" : "var(--text-2)",
                    border: `1px solid ${on ? PLATFORM_META[p].colorVar : "var(--line)"}`,
                  }}
                >
                  <PlatformIcon platform={p} size={15} />
                  {PLATFORM_META[p].label}
                </button>
              );
            })}
          </div>
        </div>

        {/* نوع */}
        <div className="space-y-1.5">
          <label className="block text-sm font-bold" style={{ color: "var(--text-2)" }}>نوع</label>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => {
              const on = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className="rounded-full px-3.5 text-sm font-bold transition-colors"
                  style={{
                    minHeight: 40,
                    background: on ? "var(--navy-deep)" : "var(--surface-2)",
                    color: on ? "var(--text-on-navy)" : "var(--text-2)",
                    border: "1px solid var(--line)",
                  }}
                >
                  {KIND_LABEL[k]}
                </button>
              );
            })}
          </div>
        </div>

        {/* عنوان */}
        <div className="space-y-1.5">
          <label className="block text-sm font-bold" style={{ color: "var(--text-2)" }}>عنوان (اختیاری)</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثلاً: تحلیلِ هفتگیِ دلار و طلا"
          />
        </div>

        {/* توضیح */}
        <div className="space-y-1.5">
          <label className="block text-sm font-bold" style={{ color: "var(--text-2)" }}>توضیح کوتاه (اختیاری)</label>
          <textarea
            className="input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="یک یا دو جملهٔ کوتاه دربارهٔ این مطلب."
            style={{ resize: "vertical", lineHeight: 1.9 }}
          />
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--danger)" }}>
            <AlertCircle size={15} /> {error}
          </p>
        )}
        {result && (
          <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--success)" }}>
            <CheckCircle2 size={15} /> {result}
          </p>
        )}

        <button type="button" onClick={add} disabled={sending} className="btn btn-gold">
          <Sparkles size={16} />
          {sending ? "در حال افزودن…" : "افزودنِ محتوا"}
        </button>
      </div>

      {/* فهرستِ محتواها */}
      <div className="card-elevated p-6">
        <h3 className="font-display font-bold text-lg mb-4" style={{ color: "var(--navy-deep)" }}>
          محتواهای اضافه‌شده
        </h3>
        {items.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-3)" }}>هنوز محتوایی اضافه نشده است.</p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => {
              const meta = PLATFORM_META[it.platform];
              const hidden = it.deleted_at != null;
              return (
                <div
                  key={it.id}
                  className="flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{
                    border: "1px solid var(--line)",
                    background: "var(--surface-2)",
                    opacity: hidden ? 0.55 : 1,
                  }}
                >
                  <span
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ background: meta.tintVar, color: meta.colorVar }}
                  >
                    <PlatformIcon platform={it.platform} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm truncate" style={{ color: "var(--navy-deep)" }}>
                        {it.title || meta.label}
                      </span>
                      <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text-3)" }}>
                        {KIND_LABEL[it.kind]}
                      </span>
                      {hidden && (
                        <span className="text-[11px] flex-shrink-0 font-bold" style={{ color: "var(--danger)" }}>
                          پنهان
                        </span>
                      )}
                    </div>
                    <a
                      href={it.content_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      dir="ltr"
                      className="flex items-center gap-1 text-[11px] truncate"
                      style={{ color: "var(--text-3)" }}
                    >
                      <ExternalLink size={11} /> {it.content_url}
                    </a>
                  </div>
                  <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text-3)" }}>
                    {it.published_at ? formatJalali(it.published_at) : ""}
                  </span>
                  {!hidden && (
                    <button
                      type="button"
                      onClick={() => hide(it.id)}
                      disabled={hiding === it.id}
                      className="btn btn-ghost flex-shrink-0"
                      style={{ padding: "0.4rem", color: "var(--danger)" }}
                      aria-label="پنهان‌کردن"
                      title="پنهان‌کردن از صفحهٔ عمومی"
                    >
                      <EyeOff size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
