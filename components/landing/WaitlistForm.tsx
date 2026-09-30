"use client";
import { useId, useState } from "react";
import Link from "next/link";
import { readWaitlistResponse } from "./waitlist-response";

export default function WaitlistForm({
  tone = "light",
}: {
  tone?: "light" | "onNavy";
}) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "loading" || status === "success") return;
    setStatus("loading");
    setErrorMessage("");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await readWaitlistResponse(response);
      if (result.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
        setErrorMessage(result.message);
      }
    } catch {
      setStatus("error");
      setErrorMessage(
        "اتصال برقرار نشد. ایمیل شما در فرم باقی مانده؛ دوباره ارسال کنید.",
      );
    }
  }
  return (
    <form
      onSubmit={submit}
      className={`public-waitlist ${tone === "onNavy" ? "public-waitlist-on-navy" : ""}`}
      aria-busy={status === "loading"}
    >
      <label htmlFor={`${id}-email`}>ایمیل برای هماهنگی مشاوره</label>
      <p id={`${id}-help`} className="public-caption">
        برای ثبت درخواست تماس استفاده می‌شود. ارسال فرم به معنی رزرو قطعی جلسه
        نیست.
      </p>
      <div className="public-form-controls">
        <input
          id={`${id}-email`}
          className="input"
          type="email"
          dir="ltr"
          autoComplete="email"
          maxLength={254}
          required
          value={email}
          disabled={status === "loading" || status === "success"}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={status === "error"}
          aria-describedby={`${id}-help${status === "error" ? ` ${id}-error` : ""}`}
          placeholder="you@example.com"
        />
        <button
          type="submit"
          className={tone === "onNavy" ? "btn btn-gold" : "btn btn-primary"}
          disabled={status === "loading" || status === "success"}
        >
          {status === "loading"
            ? "در حال ارسال…"
            : status === "success"
              ? "درخواست ثبت شد"
              : "ثبت درخواست تماس"}
        </button>
      </div>
      {status === "error" ? (
        <p id={`${id}-error`} className="public-form-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {status === "success" ? (
        <div className="public-form-success" role="status">
          <strong>ایمیل شما برای هماهنگی ثبت شد.</strong>
          <p>
            منتظر تماس برای بررسی موضوع و زمان باشید. هنوز وقت مشاوره‌ای تأیید
            نشده است.
          </p>
        </div>
      ) : null}
      <p className="public-caption">
        نحوهٔ استفاده از اطلاعات تماس در{" "}
        <Link href="/legal/privacy" className="public-text-link">
          حریم خصوصی
        </Link>{" "}
        آمده است.
      </p>
    </form>
  );
}
