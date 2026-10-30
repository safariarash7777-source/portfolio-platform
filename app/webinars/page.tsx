"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Calendar,
  Users,
  Video,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  Info,
} from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import { formatJalali, formatToman, toPersianDigits } from "@/lib/format";
import { accountEntryHref } from "@/components/account/returnPath";
import type { WebinarRegistrationState } from "@/lib/payments/webinar-binding";

interface Webinar {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  registration_open: boolean;
  max_capacity: number | null;
  price_toman: number;
  platform: string;
  platform_url: string | null;
  status: string;
  /** `null` یعنی شمارش در دسترس نبود — نه اینکه صفر نفر ثبت‌نام کرده‌اند. */
  registered_count: number | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  link: "لینک آنلاین",
  skyroom: "اسکای‌روم",
  zoom: "زوم",
  google_meet: "گوگل میت",
};

const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
function stateResponse(value: unknown, webinarId: string): { state: WebinarRegistrationState; url: string | null } | null {
  if (!value || typeof value !== "object" || !("state" in value)) return null;
  const s = value.state as WebinarRegistrationState | null;
  if (!s || s.contractVersion !== "webinar-registration.v1" || s.webinarId !== webinarId || !["absent", "registered", "unresolved"].includes(s.state)
    || !["legacy", "bound"].includes(s.mode) || !["none", "unproven", "register-webinar.v1"].includes(s.provenance) || typeof s.paymentEnabled !== "boolean"
    || (s.state === "absent" ? s.registrationId !== null || s.payment !== null : !uuid(s.registrationId))) return null;
  if (s.state === "registered" && !["pending", "paid", "free", "refunded"].includes(s.paymentStatus ?? "")) return null;
  if (s.payment !== null) {
    const p = s.payment;
    if (!uuid(p.intentKey) || !["prepared", "claimed", "attached"].includes(p.stage) || !["pending", "paid", "failed"].includes(p.status)
      || p.unit !== "toman" || !Number.isSafeInteger(p.amountToman) || p.amountToman <= 0 || !Number.isFinite(Date.parse(p.createdAt))) return null;
  }
  let url: string | null = null;
  if ("payment_url" in value && typeof value.payment_url === "string" && s.paymentEnabled && s.payment?.status === "pending" && s.payment.stage === "attached") {
    try {
      const u = new URL(value.payment_url);
      if (u.protocol === "https:" && ["payment.zarinpal.com", "sandbox.zarinpal.com"].includes(u.host)
        && u.pathname === `/pg/StartPay/${s.payment.authority}` && !u.search && !u.hash && !u.username && !u.password) url = u.href;
    } catch { /* An invalid destination is never followed. */ }
  }
  return { state: s, url };
}

async function readState(webinarId: string) {
  const response = await fetch(`/api/webinars/register?${new URLSearchParams({ webinar_id: webinarId })}`, { cache: "no-store", credentials: "same-origin" });
  if (response.status === 401) { window.location.href = accountEntryHref("/login", "/webinars"); return null; }
  const value: unknown = await response.json();
  return response.ok ? stateResponse(value, webinarId) : null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPrice(toman: number) {
  if (toman === 0) return "رایگان";
  return toman.toLocaleString("fa-IR") + " تومان";
}

function statusLabel(status: string) {
  const map: Record<string, { color: string; label: string }> = {
    published: { color: "var(--info)", label: "ثبت‌نام باز" },
    live: { color: "var(--success)", label: "در حال برگزاری" },
    ended: { color: "var(--text-3)", label: "پایان‌یافته" },
  };
  const s = map[status] ?? { color: "var(--text-3)", label: status };
  return (
    <span className="text-xs font-bold" style={{ color: s.color }}>
      {s.label}
    </span>
  );
}

function WebinarsContent() {
  const searchParams = useSearchParams();
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [snapshot, setSnapshot] = useState<WebinarRegistrationState | null>(null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [recoveryWebinar, setRecoveryWebinar] = useState<string | null>(null);
  const inFlight = useRef(false);

  const present = useCallback((value: NonNullable<ReturnType<typeof stateResponse>>) => {
    setSnapshot(value.state); setResumeUrl(value.url); setRecoveryWebinar(value.state.webinarId);
    const s = value.state;
    if (s.state === "registered" && s.paymentStatus === "free") setMessage({ type: "success", text: "ثبت‌نام رایگان شما در حساب ثبت شده است." });
    else if (s.paymentStatus === "paid" && s.payment?.status === "paid" && s.provenance === "register-webinar.v1") setMessage({ type: "success", text: "پرداخت و ثبت‌نام همین وبینار در حساب شما تأیید شده است." });
    else setMessage({ type: "info", text: "وضعیت همین درخواست از حساب شما خوانده شد. نتیجهٔ نامشخص به معنی لغو یا بازگشت وجه نیست؛ پرداخت تازه‌ای آغاز نکنید." });
  }, []);
  const recover = useCallback(async (webinarId: string) => {
    setResumeUrl(null);
    try { const state = await readState(webinarId); if (state) present(state); else setMessage({ type: "info", text: "وضعیت همین درخواست هنوز قابل خواندن نیست؛ پرداخت تازه‌ای آغاز نکنید." }); }
    catch { setMessage({ type: "info", text: "وضعیت همین درخواست هنوز قابل خواندن نیست؛ پرداخت تازه‌ای آغاز نکنید." }); }
  }, [present]);

  // بررسی پارامترهای callback پرداخت
  useEffect(() => {
    const status = searchParams.get("status");
    if (["success", "failed", "unknown"].includes(status ?? "")) {
      setSnapshot(null); setResumeUrl(null); setRecoveryWebinar(null);
      setMessage({ type: "info", text: "نتیجهٔ پرداخت هنوز مشخص نیست. این وضعیت به معنی لغو پرداخت یا بازگشت وجه نیست. پیش از پرداخت جدید، همان درخواست را با پشتیبانی پیگیری کنید." });
      const webinarId = searchParams.get("webinar_id");
      if (uuid(webinarId)) void recover(webinarId);
    }
    // URL flags only initiate an owner-scoped GET; they never establish payment or service success.
  }, [searchParams, recover]);

  useEffect(() => {
    fetch("/api/webinars/list")
      .then((r) => r.json())
      .then((data) => setWebinars(data.webinars ?? []))
      .catch(() => setMessage({ type: "error", text: "خطا در بارگذاری وبینارها." }))
      .finally(() => setLoading(false));
  }, []);

  const handleRegister = async (webinarId: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRegistering(webinarId);
    setMessage(null);
    setSnapshot(null); setResumeUrl(null);

    try {
      setRecoveryWebinar(webinarId);
      let current = await readState(webinarId);
      if (!current) throw Error("unknown");
      const registrationAttempt = `webinar-registration.pending.v1:${webinarId}`;
      if (current.state.state === "absent") {
        if (window.sessionStorage.getItem(registrationAttempt)) { present(current); return; }
        window.sessionStorage.setItem(registrationAttempt, "started");
        const registered = await fetch("/api/webinars/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ webinar_id: webinarId }) });
        const ack = stateResponse(await registered.json(), webinarId);
        if (!registered.ok || !ack || ack.state.state !== "registered") throw Error("unknown");
        current = await readState(webinarId);
        if (!current || current.state.registrationId !== ack.state.registrationId) throw Error("unknown");
      }
      if (current.state.state === "registered") window.sessionStorage.removeItem(registrationAttempt);
      present(current);
      const state = current.state;
      if (state.state !== "registered" || state.paymentStatus !== "pending" || !state.paymentEnabled || !state.registrationId) return;
      if (current.url) { window.location.href = current.url; return; }
      if (state.payment && (state.payment.status !== "pending" || state.payment.stage !== "prepared")) return;
      const key = `webinar-payment.intent.v1:${state.registrationId}`;
      const intentKey = state.payment?.intentKey ?? window.sessionStorage.getItem(key) ?? crypto.randomUUID();
      if (!uuid(intentKey)) throw Error("unknown");
      // Only opaque intent metadata is persisted, never a member/financial payload.
      window.sessionStorage.setItem(key, intentKey);
      const payRes = await fetch("/api/webinars/payment", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": intentKey }, body: JSON.stringify({ registration_id: state.registrationId }) });
      const payData: unknown = await payRes.json();
      const confirmed = await readState(webinarId);
      if (confirmed) present(confirmed);
      if (payRes.ok && payData && typeof payData === "object" && "payment_url" in payData
        && confirmed?.state.payment?.intentKey === intentKey && confirmed.url && confirmed.url === payData.payment_url) window.location.href = confirmed.url;
    } catch {
      setMessage({ type: "info", text: "نتیجهٔ همین درخواست هنوز قابل تأیید نیست. وضعیت آن را بررسی کنید؛ ثبت‌نام یا پرداخت تازه‌ای آغاز نکنید." });
    } finally {
      setRegistering(null);
      inFlight.current = false;
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* ناوبری سراسری یکسان (WP-A) */}
      <Navbar />
      {/* Header */}
      <header
        className="border-b"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      >
        <div className="max-w-4xl mx-auto px-5 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black" style={{ color: "var(--text-1)" }}>
              وبینارها
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-3)" }}>
              رویدادهای آنلاین آرش صفری
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-bold rounded-xl px-4 py-2"
            style={{ color: "var(--navy)" }}
          >
            بازگشت به سایت
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-8">
        {/* Messages */}
        {message && (
          <div
            role="status"
            className="mb-6 rounded-xl px-4 py-3 text-sm font-medium flex flex-wrap items-center gap-2"
            style={{
              background: `color-mix(in srgb, var(--${message.type === "success" ? "success" : message.type === "info" ? "info" : "danger"}) 12%, transparent)`,
              color: `var(--${message.type === "success" ? "success" : message.type === "info" ? "info" : "danger"})`,
            }}
          >
            {message.type === "success" ? <CheckCircle size={16} /> : message.type === "info" ? <Info size={16} /> : <XCircle size={16} />}
            {message.text}
            {snapshot?.payment && (
              <span className="text-xs">مبلغ ثبت‌شده: {formatToman(snapshot.payment.amountToman)} · <time dateTime={snapshot.payment.createdAt}>{formatJalali(snapshot.payment.createdAt)}</time></span>
            )}
            {message.type === "info" && recoveryWebinar && (
              <button type="button" onClick={() => void recover(recoveryWebinar)} className="underline">بررسی وضعیت همین درخواست</button>
            )}
            {message.type === "info" && resumeUrl && (
              <a href={resumeUrl} className="underline">ادامهٔ همان پرداخت</a>
            )}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-3)" }} />
          </div>
        ) : webinars.length === 0 ? (
          <div
            className="text-center py-20 rounded-2xl border"
            style={{ background: "var(--surface)", borderColor: "var(--line)" }}
          >
            <Video size={48} className="mx-auto mb-4" style={{ color: "var(--text-3)" }} />
            <p className="text-base font-bold" style={{ color: "var(--text-2)" }}>
              در حال حاضر وبیناری برنامه‌ریزی نشده.
            </p>
            <p className="text-sm mt-2" style={{ color: "var(--text-3)" }}>
              به‌زودی وبینار بعدی اعلام می‌شود.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {webinars.map((w) => {
              // شمارشِ نامعلوم «پر» نیست و «خالی» هم نیست. ادعای پربودن فقط
              // وقتی مجاز است که واقعاً شمرده باشیم؛ ظرفیت را در هر حال سرور
              // هنگامِ ثبت‌نام اعمال می‌کند، پس اینجا فقط UX است.
              const isFull =
                w.max_capacity !== null && w.registered_count !== null
                  ? w.registered_count >= w.max_capacity
                  : false;
              const canRegister = w.registration_open && !isFull && w.status === "published";

              return (
                <article
                  key={w.id}
                  className="rounded-2xl border overflow-hidden"
                  style={{ background: "var(--surface)", borderColor: "var(--line)" }}
                >
                  {/* Top accent */}
                  <div
                    className="h-1"
                    style={{
                      background:
                        w.status === "live"
                          ? "var(--success)"
                          : w.status === "published"
                          ? "var(--navy)"
                          : "var(--line)",
                    }}
                  />

                  <div className="p-6">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h2
                          className="text-lg font-black mb-1"
                          style={{ color: "var(--text-1)" }}
                        >
                          {w.title}
                        </h2>
                        {statusLabel(w.status)}
                      </div>
                      <div
                        className="text-lg font-black shrink-0"
                        style={{ color: "var(--navy)" }}
                      >
                        {formatPrice(w.price_toman)}
                      </div>
                    </div>

                    {w.description && (
                      <p
                        className="text-sm leading-relaxed mb-4"
                        style={{ color: "var(--text-2)" }}
                      >
                        {w.description}
                      </p>
                    )}

                    <div
                      className="flex flex-wrap gap-4 text-xs mb-5"
                      style={{ color: "var(--text-3)" }}
                    >
                      <span className="flex items-center gap-1">
                        <Calendar size={13} />
                        {formatDate(w.starts_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={13} />
                        {w.registered_count === null
                          ? "شمارِ ثبت‌نام در دسترس نیست"
                          : `${toPersianDigits(w.registered_count)} نفر ثبت‌نام کرده`}
                        {w.max_capacity !== null &&
                          ` (ظرفیت: ${toPersianDigits(w.max_capacity)})`}
                      </span>
                      <span className="flex items-center gap-1">
                        <Video size={13} />
                        {PLATFORM_LABELS[w.platform] || w.platform}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                      {canRegister && (
                        <button
                          onClick={() => handleRegister(w.id)}
                          disabled={registering === w.id}
                          className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-colors"
                          style={{
                            background: "var(--navy)",
                            color: "var(--text-on-navy)",
                            opacity: registering === w.id ? 0.6 : 1,
                          }}
                        >
                          {registering === w.id && (
                            <Loader2 size={14} className="animate-spin" />
                          )}
                          {snapshot?.webinarId === w.id && snapshot.state === "registered" ? "ادامهٔ همان ثبت‌نام" : w.price_toman > 0 ? "ثبت‌نام و پرداخت" : "ثبت‌نام رایگان"}
                        </button>
                      )}

                      {isFull && w.status === "published" && (
                        <span
                          className="text-sm font-bold"
                          style={{ color: "var(--danger)" }}
                        >
                          ظرفیت تکمیل شده
                        </span>
                      )}

                      {w.status === "live" && w.platform_url && (
                        <a
                          href={w.platform_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold"
                          style={{ background: "color-mix(in srgb, var(--success) 12%, transparent)", color: "var(--success)" }}
                        >
                          <ExternalLink size={14} />
                          ورود به جلسه
                        </a>
                      )}

                      {w.status === "ended" && (
                        <span className="text-sm" style={{ color: "var(--text-3)" }}>
                          این وبینار پایان یافته است.
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default function WebinarsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-3)" }} />
        </div>
      }
    >
      <WebinarsContent />
    </Suspense>
  );
}
