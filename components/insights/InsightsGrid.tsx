"use client";

import { useMemo, useState } from "react";
import { Send, Instagram, Twitter, ExternalLink, Play, Radio, Sparkles } from "lucide-react";
import { formatJalali } from "@/lib/format";
import {
  type ContentItem,
  type Platform,
  PLATFORM_META,
  KIND_LABEL,
} from "@/lib/content-hub";

/** آیکونِ برندِ هر پلتفرم (lucide). */
function PlatformIcon({ platform, size = 22 }: { platform: Platform; size?: number }) {
  if (platform === "telegram") return <Send size={size} />;
  if (platform === "instagram") return <Instagram size={size} />;
  return <Twitter size={size} />;
}

/** آیکونِ کوچکِ نوعِ محتوا. */
function KindIcon({ kind, size = 13 }: { kind: ContentItem["kind"]; size?: number }) {
  if (kind === "video" || kind === "reel") return <Play size={size} />;
  if (kind === "story") return <Radio size={size} />;
  return <Sparkles size={size} />;
}

export default function InsightsGrid({ items }: { items: ContentItem[] }) {
  const [platform, setPlatform] = useState<Platform | "all">("all");

  // فقط پلتفرم‌هایی که واقعاً محتوا دارند، در فیلتر ظاهر می‌شوند.
  const present = useMemo(() => {
    const seen = new Set<Platform>();
    for (const it of items) seen.add(it.platform);
    return [...seen];
  }, [items]);

  const shown = platform === "all" ? items : items.filter((i) => i.platform === platform);

  if (items.length === 0) {
    return (
      <div
        className="rounded-2xl px-6 py-16 text-center"
        style={{ border: "1px dashed var(--line)", background: "var(--surface)" }}
      >
        <Sparkles size={28} style={{ color: "var(--text-3)", margin: "0 auto" }} />
        <p className="mt-3 font-bold" style={{ color: "var(--navy-deep)" }}>
          هنوز محتوایی منتشر نشده است.
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--text-3)" }}>
          به‌زودی جدیدترین تحلیل‌ها و ویدیوها همین‌جا گردآوری می‌شود.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* فیلترِ پلتفرم */}
      {present.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="فیلتر شبکه">
          <FilterChip label="همه" active={platform === "all"} onClick={() => setPlatform("all")} />
          {present.map((p) => (
            <FilterChip
              key={p}
              label={PLATFORM_META[p].label}
              active={platform === p}
              onClick={() => setPlatform(p)}
              accent={PLATFORM_META[p].colorVar}
            />
          ))}
        </div>
      )}

      {/* گرید */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {shown.map((item) => (
          <Card key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function Card({ item }: { item: ContentItem }) {
  const meta = PLATFORM_META[item.platform];
  return (
    <a
      href={item.content_url}
      target="_blank"
      rel="noopener noreferrer"
      className="card u-lift group relative flex flex-col overflow-hidden focus-visible:outline-none focus-visible:ring-2"
      style={{ minHeight: 190 }}
      aria-label={`${meta.label} — ${item.title ?? "مشاهدهٔ محتوا"}`}
    >
      {/* هالهٔ رنگیِ پلتفرم — نوارِ بالای کارت */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: meta.colorVar, opacity: 0.85 }}
      />

      <div className="flex items-start justify-between gap-3 p-5 pb-3">
        {/* آیکونِ بزرگِ شبکه در گوشه */}
        <span
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: meta.tintVar, color: meta.colorVar }}
        >
          <PlatformIcon platform={item.platform} />
        </span>

        {/* برچسبِ نوعِ محتوا */}
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--line)" }}
        >
          <KindIcon kind={item.kind} />
          {KIND_LABEL[item.kind]}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5">
        {item.title && (
          <h3
            className="font-display font-bold text-base leading-7"
            style={{ color: "var(--navy-deep)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {item.title}
          </h3>
        )}
        {item.description && (
          <p
            className="mt-1.5 text-sm leading-7"
            style={{ color: "var(--text-2)", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {item.description}
          </p>
        )}

        {/* فوتر: تاریخ + دکمهٔ مشاهده */}
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
            {item.published_at ? formatJalali(item.published_at) : ""}
          </span>
          <span
            className="inline-flex items-center gap-1 text-xs font-bold transition-colors"
            style={{ color: meta.colorVar }}
          >
            مشاهده در {meta.label}
            <ExternalLink size={13} />
          </span>
        </div>
      </div>
    </a>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  accent,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  accent?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors"
      style={{
        minHeight: 40,
        background: active ? "var(--navy-deep)" : "var(--surface)",
        color: active ? "var(--text-on-navy)" : "var(--text-2)",
        border: `1px solid ${active && accent ? accent : "var(--line)"}`,
      }}
    >
      {label}
    </button>
  );
}
