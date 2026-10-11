"use client";

import { useId, useState } from "react";
import { ArrowLeft } from "lucide-react";

type Status = "idle" | "loading" | "success" | "error";

/**
 * فرم لیست انتظار — پوستهٔ نو، منطق عیناً حفظ‌شده:
 * همان endpoint (`/api/waitlist`)، همان بدنهٔ درخواست و همان وضعیت‌ها.
 */
export default function WaitlistForm({ tone = "light" }: { tone?: "light" | "onNavy" }) {
  const messageId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success !== true) {
        setStatus("error");
        setErrorMessage(data?.error || "ثبت درخواست انجام نشد. دوباره تلاش کنید.");
      } else {
        setStatus("success");
        setEmail("");
      }
    } catch {
      setStatus("error");
      setErrorMessage("اتصال به سرور برقرار نشد.");
    }
  };

  const onNavy = tone === "onNavy";
  const hintColor = onNavy ? "rgba(248,250,252,0.6)" : "var(--text-3)";
  const busy = status === "loading" || status === "success";

  return (
    <div className="w-full max-w-lg">
      {/*
        حلقهٔ فوکوس روی خودِ گروهِ ورودی است، نه روی input.
        دلیل: input عمداً بی‌مرز و شفاف است و استایلِ inlineِ آن
        (`boxShadow: "none"`) قاعدهٔ `.input:focus` را خنثی می‌کرد — یعنی فیلدِ
        ایمیل هیچ نشانهٔ فوکوسِ دیداری نداشت. حالا کلِ کادر با `focus-within`
        حلقه می‌گیرد. رنگ از توکن می‌آید و `boxShadow`ِ inline حذف شد تا
        `ring` بتواند اعمال شود.
      */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row gap-2 p-2 rounded-xl border transition-shadow focus-within:ring-2"
        style={
          {
            background: onNavy ? "rgba(255,255,255,0.06)" : "var(--surface)",
            borderColor: onNavy ? "rgba(255,255,255,0.16)" : "var(--line)",
            "--tw-ring-color": onNavy ? "var(--gold-light)" : "var(--navy)",
          } as React.CSSProperties
        }
      >
        <input
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ایمیل شما — مثلاً name@example.com"
          required
          disabled={busy}
          dir="ltr"
          aria-label="آدرس ایمیل"
          aria-describedby={messageId}
          aria-invalid={status === "error"}
          autoComplete="email"
          maxLength={254}
          className="input min-w-0 flex-1"
          style={{
            border: "none",
            boxShadow: "none",
            background: "transparent",
            color: onNavy ? "var(--text-on-navy)" : "var(--text)",
          }}
        />
        <button
          type="submit"
          disabled={busy}
          className={status === "success" ? "btn btn-primary" : "btn btn-gold"}
        >
          {status === "loading"
            ? "در حال ثبت..."
            : status === "success"
            ? "ثبت شدید ✓"
            : "ثبت درخواست"}
          {status === "idle" && <ArrowLeft size={16} />}
        </button>
      </form>

      <div id={messageId} className="min-h-6 mt-2 px-1" role="status" aria-live="polite" aria-atomic="true">
        {status === "success" && (
          <p className="text-sm" style={{ color: onNavy ? "var(--gold-soft)" : "var(--success)" }}>
            درخواست دریافت شد. ایمیل شما برای پیگیری ثبت شد؛ وقت جلسه هنوز رزرو نشده است.
          </p>
        )}
        {status === "error" && (
          <p className="text-sm" style={{ color: onNavy ? "color-mix(in srgb, var(--danger) 45%, white)" : "var(--danger)" }}>
            {errorMessage}
          </p>
        )}
        {status === "idle" && (
          <p className="text-xs" style={{ color: hintColor }}>
            ایمیل برای پیگیری درخواست وقت مشاوره استفاده می‌شود.
          </p>
        )}
      </div>
    </div>
  );
}
