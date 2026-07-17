"use client";

import { useState } from "react";
import { Megaphone, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { renderMarkdown } from "@/lib/markdown";
import { formatJalali } from "@/lib/format";

export interface UserAnnouncement {
  id: string;
  title: string;
  body_md: string;
  published_at: string | null;
  seen: boolean;
}

export default function Announcements({ items }: { items: UserAnnouncement[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [seenIds, setSeenIds] = useState<Set<string>>(
    new Set(items.filter((i) => i.seen).map((i) => i.id))
  );

  if (!items || items.length === 0) return null;

  const toggle = async (id: string) => {
    const next = openId === id ? null : id;
    setOpenId(next);
    if (next && !seenIds.has(id)) {
      setSeenIds((s) => new Set(s).add(id));
      try {
        const supabase = createClient();
        await supabase.rpc("mark_announcement_seen", { p_announcement_id: id });
      } catch {
        /* بی‌صدا؛ نشانِ خوانده‌شدن حیاتی نیست */
      }
    }
  };

  const unread = items.filter((i) => !seenIds.has(i.id)).length;

  return (
    <div className="card-elevated p-6">
      <div className="flex items-center gap-2 mb-4">
        <Megaphone size={18} style={{ color: "var(--gold)" }} />
        <h3 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
          اعلامیه‌ها
        </h3>
        {unread > 0 && (
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: "var(--danger)", color: "var(--text-on-navy)" }}
          >
            {toFa(unread)} خوانده‌نشده
          </span>
        )}
      </div>

      <div className="space-y-2">
        {items.map((a) => {
          const open = openId === a.id;
          const isSeen = seenIds.has(a.id);
          return (
            <div
              key={a.id}
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--line)" }}
            >
              <button
                type="button"
                onClick={() => toggle(a.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-right"
                style={{ background: "var(--surface-2)" }}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {!isSeen && (
                    <span
                      className="flex-shrink-0 w-2 h-2 rounded-full"
                      style={{ background: "var(--danger)" }}
                      aria-label="خوانده‌نشده"
                    />
                  )}
                  <span className="font-bold text-sm truncate" style={{ color: "var(--navy-deep)" }}>
                    {a.title}
                  </span>
                </span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs" style={{ color: "var(--text-3)" }}>
                    {a.published_at ? formatJalali(a.published_at) : ""}
                  </span>
                  <ChevronDown
                    size={16}
                    style={{ color: "var(--text-3)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
                  />
                </span>
              </button>
              {open && (
                <div
                  className="markdown-body px-4 py-4"
                  style={{ background: "var(--surface)" }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(a.body_md) }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
function toFa(n: number): string {
  return String(n).replace(/\d/g, (d) => FA[Number(d)]);
}
