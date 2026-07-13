"use client";

import { useMemo, useState } from "react";
import { NotebookPen } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import { formatJalali } from "@/lib/format";

export interface Note {
  id: string;
  title: string;
  body_md: string;
  tags: string[];
  published_at: string | null;
}

export default function NotesFeed({ notes }: { notes: Note[] }) {
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // برچسب‌های موجود، به ترتیبِ ظاهر شدن.
  const allTags = useMemo(() => {
    const seen = new Set<string>();
    for (const n of notes) for (const t of n.tags) seen.add(t);
    return [...seen];
  }, [notes]);

  const shown = activeTag ? notes.filter((n) => n.tags.includes(activeTag)) : notes;

  if (notes.length === 0) {
    return (
      <div
        className="rounded-2xl px-6 py-14 text-center"
        style={{ border: "1px dashed var(--line)", background: "var(--surface)" }}
      >
        <NotebookPen size={28} style={{ color: "var(--text-3)", margin: "0 auto" }} />
        <p className="mt-3 font-bold" style={{ color: "var(--navy-deep)" }}>
          هنوز یادداشتی منتشر نشده است.
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--text-3)" }}>
          به‌زودی نگاهِ روزانهٔ بازار همین‌جا منتشر می‌شود.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <TagChip label="همه" active={activeTag === null} onClick={() => setActiveTag(null)} />
          {allTags.map((t) => (
            <TagChip key={t} label={t} active={activeTag === t} onClick={() => setActiveTag(t)} />
          ))}
        </div>
      )}

      {/* Feed */}
      <div className="space-y-4">
        {shown.map((n) => (
          <article key={n.id} className="card-elevated p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display font-bold text-lg md:text-xl" style={{ color: "var(--navy-deep)" }}>
                {n.title}
              </h2>
              {n.published_at && (
                <time
                  className="text-xs flex-shrink-0 mt-1"
                  style={{ color: "var(--text-3)" }}
                  dateTime={n.published_at}
                >
                  {formatJalali(n.published_at)}
                </time>
              )}
            </div>

            {n.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {n.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                    style={{ background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--line)" }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            <div
              className="markdown-body mt-4"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(n.body_md) }}
            />
          </article>
        ))}
      </div>
    </div>
  );
}

function TagChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors"
      style={{
        minHeight: 40,
        background: active ? "var(--navy-deep)" : "var(--surface)",
        color: active ? "var(--text-on-navy)" : "var(--text-2)",
        border: "1px solid var(--line)",
      }}
    >
      {label}
    </button>
  );
}
