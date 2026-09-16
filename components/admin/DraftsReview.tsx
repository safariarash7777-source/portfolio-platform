"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CircleSlash, Inbox, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { formatJalali, toPersianDigits } from "@/lib/format";
import { DATA_STATE_LABEL } from "@/lib/desk/contracts";
import { MIN_NOTE_LENGTH, type DraftCard, type DraftQueue } from "@/lib/drafts/contracts";

/**
 * بازبینیِ نامزدهای موتور.
 *
 * تنها کارِ نوشتنیِ این صفحه «کنارگذاشتن» است. جعبهٔ بالای صفحه صریحاً
 * می‌گوید انتشار اینجا نیست و کجاست — چون یک صفحهٔ بازبینی که دربارهٔ
 * انتشار ساکت باشد، خواننده فرض می‌کند تأیید هم همین‌جاست.
 */
export default function DraftsReview({ queue }: { queue: DraftQueue }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dismiss = async (id: string) => {
    setError(null);
    const res = await fetch("/api/admin/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss", id, note }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? `پاسخِ ${res.status} از سرور`);
      return;
    }
    setOpenId(null);
    setNote("");
    startTransition(() => router.refresh());
  };

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[10px] font-bold" style={{ color: "var(--gold-ink)" }}>
          صفِ بازبینی
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold" style={{ color: "var(--text)" }}>
          نامزدهای موتور
        </h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-7" style={{ color: "var(--text-2)" }}>
          نامزدهایی که موتور ثبت کرده و هنوز کسی دربارهٔ آن‌ها تصمیم نگرفته است.
          این صفحه فقط موردهای بازنشده را نشان می‌دهد.
        </p>
      </header>

      {/* مرزِ صفحه، پیش از هر داده‌ای. */}
      <section
        aria-labelledby="scope-title"
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}
      >
        <h2
          id="scope-title"
          className="flex items-center gap-2 text-[13px] font-extrabold"
          style={{ color: "var(--text)" }}
        >
          <ShieldCheck size={15} style={{ color: "var(--gold-ink)" }} />
          انتشار از این صفحه انجام نمی‌شود
        </h2>
        <p className="mt-1.5 text-[12px] leading-7" style={{ color: "var(--text-2)" }}>
          اینجا فقط می‌توانید یک نامزد را ببینید یا کنار بگذارید. انتشار در
          «کارنامه» انجام می‌شود و آنجا نوشتنِ متنِ تحلیل به‌دستِ خودتان اجباری
          است. وصل‌کردنِ خروجیِ موتور به آن متن یک تصمیمِ مالک است و تا گرفته
          نشدنش، این دو مسیر عمداً به هم وصل نیستند.
        </p>
        <Link
          href="/admin/analyses"
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold"
          style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--gold-ink)" }}
        >
          رفتن به کارنامه
          <ArrowLeft size={13} />
        </Link>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] font-bold" style={{ color: "var(--text-2)" }}>
          وضعیتِ صف:
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={
            queue.state === "unavailable"
              ? { color: "var(--danger-ink)", background: "rgba(185,28,28,0.10)" }
              : queue.state === "awaiting_review"
                ? { color: "var(--navy-ink)", background: "rgba(30,58,138,0.10)" }
                : { color: "var(--text-2)", background: "var(--surface-2)" }
          }
        >
          {queue.state === "unavailable" ? <AlertTriangle size={13} /> : queue.state === "empty" ? <CircleSlash size={13} /> : <Inbox size={13} />}
          {DATA_STATE_LABEL[queue.state]}
        </span>
        {/* «نامعلوم» و نه «۰» — صفِ خوانده‌نشده نباید شبیهِ صفِ خالی باشد. */}
        <span className="text-[13px] font-extrabold" style={{ color: queue.count === null ? "var(--danger-ink)" : "var(--text)" }}>
          {queue.count === null ? "نامعلوم" : `${toPersianDigits(queue.count)} مورد`}
        </span>
      </div>

      <p className="text-[12px] leading-7" style={{ color: "var(--text-2)" }}>
        {queue.detail}
      </p>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-[12px] font-bold"
          style={{ color: "var(--danger-ink)", background: "rgba(185,28,28,0.10)" }}
        >
          {error}
        </p>
      )}

      {queue.cards.length > 0 && (
        <ul className="space-y-3">
          {queue.cards.map((card) => (
            <DraftItem
              key={card.id}
              card={card}
              open={openId === card.id}
              busy={pending}
              note={note}
              onNote={setNote}
              onOpen={() => {
                setOpenId(card.id);
                setNote("");
                setError(null);
              }}
              onCancel={() => {
                setOpenId(null);
                setNote("");
              }}
              onConfirm={() => void dismiss(card.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function DraftItem({
  card, open, busy, note, onNote, onOpen, onCancel, onConfirm,
}: {
  card: DraftCard;
  open: boolean;
  busy: boolean;
  note: string;
  onNote: (v: string) => void;
  onOpen: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const canConfirm = note.trim().length >= MIN_NOTE_LENGTH && !busy;
  return (
    <li className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[15px] font-extrabold" style={{ color: "var(--text)" }}>
            {card.symbol}
          </p>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-2)" }}>
            جهتِ دیدگاه: <strong style={{ color: "var(--text)" }}>{card.directionLabel}</strong>
            {" · "}
            منشأ: {card.source}
            {" · "}
            {toPersianDigits(formatJalali(card.createdAt, false))}
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold focus-visible:outline-none focus-visible:ring-2"
            style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text)" }}
          >
            <XCircle size={13} />
            کنار گذاشتن
          </button>
        )}
      </div>

      {card.reasons.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {card.reasons.map((reason, i) => (
            <li key={i} className="text-[12px] leading-6" style={{ color: "var(--text-2)" }}>
              — {reason}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[11px]" style={{ color: "var(--text-2)" }}>
          موتور برای این نامزد دلیلی ثبت نکرده است.
        </p>
      )}

      {open && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
          <label htmlFor={`note-${card.id}`} className="text-[11px] font-bold" style={{ color: "var(--text-2)" }}>
            دلیلِ کنارگذاشتن (اجباری)
          </label>
          <textarea
            id={`note-${card.id}`}
            value={note}
            onChange={(e) => onNote(e.target.value)}
            rows={2}
            className="mt-1.5 w-full rounded-lg px-3 py-2 text-[12px]"
            style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text)" }}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canConfirm}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2"
              style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--danger-ink)" }}
            >
              {busy ? <Loader2 size={13} /> : <XCircle size={13} />}
              ثبتِ کنارگذاشتن
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-[11px] font-bold focus-visible:outline-none focus-visible:ring-2"
              style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text-2)" }}
            >
              انصراف
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
