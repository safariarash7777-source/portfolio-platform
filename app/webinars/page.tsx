"use client";

import { Suspense, useEffect, useRef, useState } from "react";
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
import { formatToman, toPersianDigits } from "@/lib/format";
import { accountEntryHref } from "@/components/account/returnPath";

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
  access_enabled: boolean;
  access_starts_at: string | null;
  access_ends_at: string | null;
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
  return formatToman(toman);
}

function safeHttpsUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function statusLabel(status: string) {
  const map: Record<string, { color: string; label: string }> = {
    published: { color: "var(--info)", label: "منتشرشده" },
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
  const [accessing, setAccessing] = useState<string | null>(null);
  const operationPending = useRef(false);
  const unknownPaymentIds = useRef<Set<string>>(new Set());
  const [unknownWebinars, setUnknownWebinars] = useState<Set<string>>(new Set());
  const [paymentAuthority, setPaymentAuthority] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string; authority?: string } | null>(null);
  const lifetime = useRef({ active: true });
  const callbackBlocks = (webinarId: string) => searchParams.get("webinar_id") === webinarId &&
    ["unknown", "failed"].includes(searchParams.get("status") ?? "");

  useEffect(() => {
    const scope = { active: true };
    lifetime.current = scope;
    setRegistering(null);
    setAccessing(null);
    // Ignore UI effects from old responses; the server request may still commit.
    return () => { scope.active = false; };
  }, []);

  // بررسی پارامترهای callback پرداخت
  useEffect(() => {
    const status = searchParams.get("status");
    if (status === "success") {
      setMessage({ type: "success", text: "پرداخت موفق! ثبت‌نام شما تأیید شد." });
    } else if (status === "failed") {
      setPaymentAuthority(searchParams.get("authority"));
      setMessage({ type: "info", text: "درگاه، پرداخت را ناموفق گزارش کرده است. پیش از پرداخت تازه، همان پرداخت را با پشتیبانی بررسی و پیگیری کنید.", authority: searchParams.get("authority") ?? undefined });
    } else if (status === "unknown") {
      setPaymentAuthority(searchParams.get("authority"));
      setMessage({ type: "info", text: "نتیجهٔ پرداخت هنوز مشخص نیست. این وضعیت به معنی لغو پرداخت یا بازگشت وجه نیست. پیش از پرداخت جدید، همان درخواست را با پشتیبانی پیگیری کنید.", authority: searchParams.get("authority") ?? undefined });
    }
  }, [searchParams]);

  useEffect(() => {
    const scope = lifetime.current;
    fetch("/api/webinars/list")
      .then((r) => {
        if (!scope.active || lifetime.current !== scope) return null;
        if (!r.ok) throw new Error("خطا در بارگذاری وبینارها.");
        return r.json();
      })
      .then((data) => { if (scope.active && lifetime.current === scope) setWebinars(data?.webinars ?? []); })
      .catch(() => { if (scope.active && lifetime.current === scope) setMessage({ type: "error", text: "خطا در بارگذاری وبینارها." }); })
      .finally(() => { if (scope.active && lifetime.current === scope) setLoading(false); });
  }, []);

  const handleRegister = async (webinarId: string) => {
    const scope = lifetime.current;
    if (!scope.active || operationPending.current || unknownPaymentIds.current.has(webinarId) || callbackBlocks(webinarId)) return;
    operationPending.current = true;
    setRegistering(webinarId);
    setMessage(null);
    let paymentRequested = false;
    let navigating = false;

    try {
      const res = await fetch("/api/webinars/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webinar_id: webinarId }),
      });
      if (!scope.active || lifetime.current !== scope) return;

      const data = await res.json();
      if (!scope.active || lifetime.current !== scope) return;

      if (!res.ok) {
        if (res.status === 401) {
          // کاربر لاگین نیست → هدایت به صفحه ورود
          window.location.href = accountEntryHref("/login", "/webinars");
          navigating = true;
          return;
        }
        throw new Error(data.error || "خطا در ثبت‌نام");
      }

      const registration = data.registration;
      if (!registration || typeof registration.registration_id !== "string" || !registration.registration_id ||
          registration.webinar_id !== webinarId || typeof registration.needs_payment !== "boolean" ||
          typeof registration.already_registered !== "boolean") {
        throw new Error("پاسخ ثبت‌نام کامل نیست. پیش از پرداخت، وضعیت ثبت‌نام را با پشتیبانی بررسی کنید.");
      }

      // تصمیم پرداخت فقط از ثبت‌نام ذخیره‌شدهٔ سرور گرفته می‌شود.
      if (registration.needs_payment) {
        if (registration.payment_status !== "pending") {
          throw new Error("وضعیت ثبت‌نام برای پرداخت معتبر نیست. با پشتیبانی پیگیری کنید.");
        }
        paymentRequested = true;
        const payRes = await fetch("/api/webinars/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registration_id: registration.registration_id }),
        });
        if (!scope.active || lifetime.current !== scope) return;
        if (payRes.status === 401) {
          window.location.href = accountEntryHref("/login", "/webinars");
          navigating = true;
          return;
        }
        const payData = await payRes.json().catch(() => null);
        if (!scope.active || lifetime.current !== scope) return;
        if (payRes.status === 409 || payRes.status === 503 || !payData || payData.paymentOutcome === "unknown") {
          unknownPaymentIds.current.add(webinarId);
          setUnknownWebinars((previous) => new Set(previous).add(webinarId));
          const authority = typeof payData?.authority === "string" ? payData.authority : undefined;
          if (authority) setPaymentAuthority(authority);
          setMessage({ type: "info", text: "وضعیت درخواست پرداخت نیاز به بررسی دارد. پرداخت تازه‌ای شروع نکنید؛ همان ثبت‌نام و شناسهٔ پرداخت را با پشتیبانی پیگیری کنید. این پیام به معنی لغو یا بازگشت وجه نیست.", authority });
          return;
        }
        const paymentUrl = safeHttpsUrl(payData.payment_url);
        if (payRes.ok && paymentUrl) {
          window.location.href = paymentUrl;
          navigating = true;
          return;
        }
        throw new Error(payData.error || "خطا در اتصال به درگاه");
      }

      if (registration.payment_status !== "paid" && registration.payment_status !== "free") {
        throw new Error("وضعیت ثبت‌نام هنوز تأیید نشده است. با پشتیبانی پیگیری کنید.");
      }
      setMessage({ type: "success", text: registration.already_registered ? "ثبت‌نام شما قبلاً تأیید شده است. با دکمهٔ دسترسی، ورود به همین وبینار را بررسی کنید." : "ثبت‌نام شما تأیید شد. با دکمهٔ دسترسی، ورود به همین وبینار را بررسی کنید." });
    } catch (e: unknown) {
      if (!scope.active || lifetime.current !== scope) return;
      if (paymentRequested) {
        unknownPaymentIds.current.add(webinarId);
        setUnknownWebinars((previous) => new Set(previous).add(webinarId));
        setMessage({ type: "info", text: "پاسخ معتبر درخواست پرداخت دریافت نشد. پیش از پرداخت تازه، همان ثبت‌نام را با پشتیبانی پیگیری کنید؛ نتیجهٔ پرداخت هنوز مشخص نیست." });
      } else {
        setMessage({ type: "error", text: e instanceof Error ? e.message : "خطا در ثبت‌نام؛ وضعیت را با پشتیبانی پیگیری کنید." });
      }
    } finally {
      if (!navigating) {
        operationPending.current = false;
        if (scope.active && lifetime.current === scope) setRegistering(null);
      }
    }
  };

  const handleAccess = async (webinarId: string) => {
    const scope = lifetime.current;
    if (!scope.active || operationPending.current) return;
    operationPending.current = true;
    setAccessing(webinarId);
    setMessage(null);
    let navigating = false;
    try {
      const res = await fetch(`/api/webinars/access?webinar_id=${encodeURIComponent(webinarId)}`, { cache: "no-store" });
      if (!scope.active || lifetime.current !== scope) return;
      if (res.status === 401) {
        window.location.href = accountEntryHref("/login", "/webinars");
        navigating = true;
        return;
      }
      const data = await res.json();
      if (!scope.active || lifetime.current !== scope) return;
      if (!res.ok) throw new Error("بررسی دسترسی در دسترس نیست. لطفاً با پشتیبانی پیگیری کنید.");
      if (data.access?.allowed !== true) {
        const reasons: Record<string, string> = {
          not_registered: "برای این وبینار ثبت‌نام تأییدشده‌ای ندارید.",
          payment_required: "پرداخت ثبت‌نام این وبینار هنوز تأیید نشده است.",
          payment_pending: "نتیجهٔ پرداخت این وبینار هنوز در حال بررسی است.",
          access_disabled: "دسترسی این وبینار هنوز توسط مدیر فعال نشده است.",
          outside_window: "اکنون خارج از بازهٔ دسترسی این وبینار است.",
          not_started: "بازهٔ دسترسی این وبینار هنوز شروع نشده است.",
          expired: "بازهٔ دسترسی این وبینار پایان یافته است.",
        };
        setMessage({ type: "info", text: reasons[data.access?.reason] ?? "دسترسی شما به این وبینار تأیید نشد. ثبت‌نام، پرداخت و بازهٔ دسترسی را با پشتیبانی بررسی کنید." });
        return;
      }
      const sessionUrl = safeHttpsUrl(data.access.platform_url);
      if (!sessionUrl) throw new Error("لینک معتبر جلسه در دسترس نیست. لطفاً با پشتیبانی پیگیری کنید.");
      window.location.href = sessionUrl;
      navigating = true;
    } catch (e: unknown) {
      if (!scope.active || lifetime.current !== scope) return;
      setMessage({ type: "error", text: e instanceof Error ? e.message : "خطا در بررسی دسترسی." });
    } finally {
      if (!navigating) {
        operationPending.current = false;
        if (scope.active && lifetime.current === scope) setAccessing(null);
      }
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
            className="mb-6 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2"
            style={{
              background: `color-mix(in srgb, var(--${message.type === "success" ? "success" : message.type === "info" ? "info" : "danger"}) 12%, transparent)`,
              color: `var(--${message.type === "success" ? "success" : message.type === "info" ? "info" : "danger"})`,
            }}
          >
            {message.type === "success" ? <CheckCircle size={16} /> : message.type === "info" ? <Info size={16} /> : <XCircle size={16} />}
            {message.text}
            {message.type === "info" && (message.authority || paymentAuthority) && (
              <span className="text-xs break-all" dir="ltr">{message.authority || paymentAuthority}</span>
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
              const unresolvedPayment = unknownWebinars.has(w.id) || callbackBlocks(w.id);
              const canRegister = w.access_enabled === true && w.registration_open && !isFull && ["published", "live"].includes(w.status) && !unresolvedPayment;

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

                    <p className="text-xs mb-4 leading-relaxed" style={{ color: "var(--text-3)" }}>
                      {w.access_enabled && w.access_starts_at && w.access_ends_at
                        ? `بازهٔ دسترسی به همین وبینار: ${formatDate(w.access_starts_at)} تا ${formatDate(w.access_ends_at)}`
                        : "دسترسی این وبینار هنوز تنظیم یا فعال نشده است."}
                    </p>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-3">
                      {canRegister && (
                        <button
                          onClick={() => handleRegister(w.id)}
                          disabled={registering !== null || accessing !== null}
                          className="flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-colors"
                          style={{
                            background: "var(--navy)",
                            color: "var(--text-on-navy)",
                            opacity: registering !== null || accessing !== null ? 0.6 : 1,
                          }}
                        >
                          {registering === w.id && (
                            <Loader2 size={14} className="animate-spin" />
                          )}
                          {w.price_toman > 0 ? "ثبت‌نام و پرداخت" : "ثبت‌نام رایگان"}
                        </button>
                      )}

                      {isFull && ["published", "live"].includes(w.status) && (
                        <span
                          className="text-sm font-bold"
                          style={{ color: "var(--danger)" }}
                        >
                          ظرفیت تکمیل شده
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleAccess(w.id)}
                        disabled={registering !== null || accessing !== null}
                        className="flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold"
                        style={{ background: "color-mix(in srgb, var(--info) 12%, transparent)", color: "var(--info)", opacity: registering !== null || accessing !== null ? 0.6 : 1 }}
                      >
                        {accessing === w.id ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                        دسترسی به همین وبینار
                      </button>

                      {unresolvedPayment && <span className="text-sm" style={{ color: "var(--text-3)" }}>پیش از پرداخت تازه، درخواست قبلی را پیگیری کنید.</span>}

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
