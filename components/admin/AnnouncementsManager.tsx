"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Megaphone,
  Send,
  Eye,
  Users,
  User,
  Layers,
  Mail,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import { formatJalali } from "@/lib/format";

const RISK_CATEGORIES = ["محافظه‌کار", "متعادل", "تهاجمی", "بسیار تهاجمی"];

interface UserOpt {
  id: string;
  name: string | null;
  email: string | null;
}
interface Announcement {
  id: string;
  title: string;
  body_md: string;
  target: string;
  published_at: string | null;
  created_at: string;
  counts: { email: number; telegram: number; in_app: number; seen: number };
}

type TargetKind = "all" | "risk" | "user";

export default function AnnouncementsManager({
  users,
  announcements,
}: {
  users: UserOpt[];
  announcements: Announcement[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [kind, setKind] = useState<TargetKind>("all");
  const [riskCat, setRiskCat] = useState(RISK_CATEGORIES[0]);
  const [userId, setUserId] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");

  const buildTarget = (): string =>
    kind === "all" ? "all" : kind === "risk" ? `risk:${riskCat}` : `user:${userId}`;

  const publish = async () => {
    setError("");
    setResult(null);
    if (!title.trim() || !bodyMd.trim()) {
      setError("عنوان و متن اعلامیه الزامی است.");
      return;
    }
    if (kind === "user" && !userId) {
      setError("یک کاربر انتخاب کنید.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body_md: bodyMd.trim(), target: buildTarget() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "خطا در انتشار.");
      setResult(
        `اعلامیه منتشر شد — ${toFa(json.recipients)} گیرنده، ${toFa(json.email_sent)} ایمیل، ${toFa(json.telegram_sent)} تلگرام.`
      );
      setTitle("");
      setBodyMd("");
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
          اعلامیه‌ها
        </h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-2)" }}>
          انتشار اعلامیه با هدف‌گذاری و ارسال از ایمیل و تلگرام.
        </p>
      </header>

      {/* Composer */}
      <div className="card-elevated p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Megaphone size={18} style={{ color: "var(--gold)" }} />
          <h3 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
            اعلامیهٔ جدید
          </h3>
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <label className="block text-sm font-bold" style={{ color: "var(--text-2)" }}>عنوان</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="عنوان اعلامیه"
            disabled={sending}
          />
        </div>

        {/* Target */}
        <div className="space-y-2">
          <label className="block text-sm font-bold" style={{ color: "var(--text-2)" }}>هدف‌گذاری</label>
          <div className="flex flex-wrap gap-2">
            {([
              { id: "all", label: "همه", icon: <Users size={14} /> },
              { id: "risk", label: "بر اساس سطح ریسک", icon: <Layers size={14} /> },
              { id: "user", label: "تک‌کاربر", icon: <User size={14} /> },
            ] as { id: TargetKind; label: string; icon: React.ReactNode }[]).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setKind(t.id)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all"
                style={{
                  background: kind === t.id ? "var(--navy-deep)" : "var(--surface-2)",
                  color: kind === t.id ? "var(--text-on-navy)" : "var(--text-2)",
                  border: "1px solid var(--line)",
                }}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {kind === "risk" && (
            <select className="input" value={riskCat} onChange={(e) => setRiskCat(e.target.value)} disabled={sending}>
              {RISK_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          {kind === "user" && (
            <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)} disabled={sending}>
              <option value="">— کاربر را انتخاب کنید —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? "بدون نام"} — {u.email ?? ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Body markdown */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold" style={{ color: "var(--text-2)" }}>
              متن (Markdown)
            </label>
            <button
              type="button"
              onClick={() => setShowPreview((p) => !p)}
              className="flex items-center gap-1.5 text-xs font-bold"
              style={{ color: "var(--navy)" }}
            >
              <Eye size={13} />
              {showPreview ? "ویرایش" : "پیش‌نمایش"}
            </button>
          </div>
          {showPreview ? (
            <div
              className="markdown-body rounded-xl p-4 min-h-[160px]"
              style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(bodyMd) }}
            />
          ) : (
            <textarea
              className="input resize-y"
              rows={7}
              value={bodyMd}
              onChange={(e) => setBodyMd(e.target.value)}
              placeholder={"از Markdown ساده استفاده کنید:\n# تیتر\n**پررنگ**  *مورب*\n- فهرست\n[لینک](https://example.com)"}
              disabled={sending}
              dir="rtl"
            />
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--danger)" }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}
        {result && (
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
            style={{ background: "rgba(21,128,61,0.08)", border: "1px solid rgba(21,128,61,0.25)", color: "var(--success)" }}
          >
            <CheckCircle2 size={15} /> {result}
          </div>
        )}

        <button type="button" onClick={publish} disabled={sending} className="btn btn-gold">
          <Send size={16} />
          {sending ? "در حال انتشار و ارسال..." : "انتشار و ارسال"}
        </button>
      </div>

      {/* Published list */}
      <div className="card-elevated p-6">
        <h3 className="font-display font-bold text-lg mb-4" style={{ color: "var(--navy-deep)" }}>
          اعلامیه‌های منتشرشده
        </h3>
        {announcements.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>
            هنوز اعلامیه‌ای منتشر نشده است.
          </p>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <div
                key={a.id}
                className="rounded-xl p-4"
                style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-bold text-sm" style={{ color: "var(--navy-deep)" }}>{a.title}</div>
                    <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
                      {targetLabel(a.target, users)} · {a.published_at ? formatJalali(a.published_at) : "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-2)" }}>
                    <span className="flex items-center gap-1"><Mail size={12} /> {toFa(a.counts.email)}</span>
                    <span className="flex items-center gap-1"><MessageCircle size={12} /> {toFa(a.counts.telegram)}</span>
                    <span className="flex items-center gap-1"><Eye size={12} /> {toFa(a.counts.seen)}/{toFa(a.counts.in_app)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function targetLabel(target: string, users: UserOpt[]): string {
  if (target === "all") return "همهٔ کاربران";
  if (target.startsWith("risk:")) return `سطح ریسک: ${target.slice(5)}`;
  if (target.startsWith("user:")) {
    const u = users.find((x) => x.id === target.slice(5));
    return `کاربر: ${u?.name ?? u?.email ?? target.slice(5)}`;
  }
  return target;
}

const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
function toFa(n: number): string {
  return String(n).replace(/\d/g, (d) => FA[Number(d)]);
}
