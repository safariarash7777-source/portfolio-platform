"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen, Send, Eye, CheckCircle2, AlertCircle, Tag } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import { formatJalali } from "@/lib/format";

const KNOWN_TAGS = ["طلا", "بورس", "ارز", "کریپتو", "صندوق"];

const TEMPLATE = `- بولت اول: مهم‌ترین اتفاقِ امروزِ بازار
- بولت دوم: عدد/رویدادِ کلیدی (واقعی و قابل‌اثبات)
- بولت سوم: نکته یا زمینه برای تصمیم

**جمع‌بندی:** یک جملهٔ کوتاه.`;

interface Note {
  id: string;
  title: string;
  body_md: string;
  tags: string[] | null;
  published_at: string | null;
}

export default function NotesManager({ notes }: { notes: Note[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const publish = async () => {
    setError("");
    setResult(null);
    if (!title.trim() || !bodyMd.trim()) {
      setError("عنوان و متنِ یادداشت الزامی است.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/admin/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body_md: bodyMd.trim(), tags }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "خطا در انتشار.");
      setResult("یادداشت منتشر شد و در فیدِ عمومی /notes قرار گرفت.");
      setTitle("");
      setBodyMd("");
      setTags([]);
      setShowPreview(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در انتشار.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <span className="eyebrow">پنل مدیریت</span>
        <h1 className="font-display text-2xl md:text-3xl font-bold mt-1" style={{ color: "var(--navy-deep)" }}>
          یادداشت روزانهٔ بازار
        </h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-2)" }}>
          تحلیلِ کوتاهِ روزانه در فیدِ عمومی <span dir="ltr">/notes</span>. قالبِ ۵دقیقه‌ای؛ بدونِ
          عددِ ساختگی و بدونِ سیگنالِ مستقیمِ خرید/فروش.
        </p>
      </header>

      {/* Composer */}
      <div className="card-elevated p-6 space-y-5">
        <div className="flex items-center gap-2">
          <NotebookPen size={18} style={{ color: "var(--gold)" }} />
          <h3 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
            یادداشتِ جدید
          </h3>
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <label className="block text-sm font-bold" style={{ color: "var(--text-2)" }}>عنوان</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثلاً: نگاهِ امروز به دلار و طلا"
          />
        </div>

        {/* Tags */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--text-2)" }}>
            <Tag size={14} /> برچسب‌ها
          </label>
          <div className="flex flex-wrap gap-2">
            {KNOWN_TAGS.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTag(t)}
                  className="rounded-full px-3 py-1.5 text-sm font-bold transition-colors"
                  style={{
                    minHeight: 40,
                    background: on ? "var(--navy-deep)" : "var(--surface-2)",
                    color: on ? "var(--text-on-navy)" : "var(--text-2)",
                    border: "1px solid var(--line)",
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-bold" style={{ color: "var(--text-2)" }}>
              متن (Markdown)
            </label>
            <button
              type="button"
              onClick={() => setBodyMd((b) => b || TEMPLATE)}
              className="text-xs font-bold"
              style={{ color: "var(--gold)" }}
            >
              درجِ قالبِ ۵دقیقه‌ای
            </button>
          </div>
          <textarea
            className="input"
            rows={8}
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            placeholder={TEMPLATE}
            style={{ resize: "vertical", lineHeight: 1.9 }}
          />
        </div>

        {/* Preview toggle */}
        {bodyMd.trim() && (
          <div>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-bold"
              style={{ color: "var(--navy)" }}
            >
              <Eye size={15} />
              {showPreview ? "بستنِ پیش‌نمایش" : "پیش‌نمایش"}
            </button>
            {showPreview && (
              <div
                className="markdown-body mt-3 rounded-xl px-4 py-4"
                style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(bodyMd) }}
              />
            )}
          </div>
        )}

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

        <button type="button" onClick={publish} disabled={sending} className="btn btn-gold">
          <Send size={16} />
          {sending ? "در حال انتشار…" : "انتشارِ یادداشت"}
        </button>
      </div>

      {/* Published list */}
      <div className="card-elevated p-6">
        <h3 className="font-display font-bold text-lg mb-4" style={{ color: "var(--navy-deep)" }}>
          یادداشت‌های منتشرشده
        </h3>
        {notes.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-3)" }}>
            هنوز یادداشتی منتشر نشده است.
          </p>
        ) : (
          <div className="space-y-2">
            {notes.map((n) => (
              <div
                key={n.id}
                className="rounded-xl px-4 py-3"
                style={{ border: "1px solid var(--line)", background: "var(--surface-2)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-sm truncate" style={{ color: "var(--navy-deep)" }}>
                    {n.title}
                  </span>
                  <span className="text-xs flex-shrink-0" style={{ color: "var(--text-3)" }}>
                    {n.published_at ? formatJalali(n.published_at) : ""}
                  </span>
                </div>
                {n.tags && n.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {n.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                        style={{ background: "var(--surface)", color: "var(--text-2)", border: "1px solid var(--line)" }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
