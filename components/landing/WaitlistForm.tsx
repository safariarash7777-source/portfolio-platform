"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";

type Status = "idle" | "loading" | "success" | "error";

/**
 * فرم لیست انتظار — پوستهٔ نو، منطق عیناً حفظ‌شده:
 * همان endpoint (`/api/waitlist`)، همان بدنهٔ درخواست و همان وضعیت‌ها.
 */
export default function WaitlistForm({ tone = "light" }: { tone?: "light" | "onNavy" }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data.error || "خطایی رخ داد.");
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
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row gap-2 p-2 rounded-xl"
        style={{
          background: onNavy ? "rgba(255,255,255,0.06)" : "var(--surface)",
          border: `1px solid ${onNavy ? "rgba(255,255,255,0.16)" : "var(--line)"}`,
          boxShadow: onNavy ? "none" : "var(--shadow-sm)",
        }}
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
          className="input flex-1"
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

      <div className="h-6 mt-2 px-1">
        {status === "success" && (
          <p className="text-sm" style={{ color: onNavy ? "var(--gold-soft)" : "var(--success)" }}>
            ثبت شد! برای هماهنگی مشاوره و خبرهای مهم، از همین ایمیل با شما در تماس خواهیم بود.
          </p>
        )}
        {status === "error" && (
          <p className="text-sm" style={{ color: onNavy ? "color-mix(in srgb, var(--danger) 45%, white)" : "var(--danger)" }}>
            {errorMessage}
          </p>
        )}
        {status === "idle" && (
          <p className="text-xs" style={{ color: hintColor }}>
            اطلاعات شما محرمانه است و فروخته نمی‌شود.
          </p>
        )}
      </div>
    </div>
  );
}
