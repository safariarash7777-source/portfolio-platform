"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Calendar,
  Users,
  Video,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

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
  registered_count: number;
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
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // بررسی پارامترهای callback پرداخت
  useEffect(() => {
    const status = searchParams.get("status");
    if (status === "success") {
      setMessage({ type: "success", text: "پرداخت موفق! ثبت‌نام شما تأیید شد." });
    } else if (status === "failed") {
      setMessage({ type: "error", text: "پرداخت ناموفق بود. لطفاً دوباره تلاش کنید." });
    }
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/webinars/list")
      .then((r) => r.json())
      .then((data) => setWebinars(data.webinars ?? []))
      .catch(() => setMessage({ type: "error", text: "خطا در بارگذاری وبینارها." }))
      .finally(() => setLoading(false));
  }, []);

  const handleRegister = async (webinarId: string, priceToman: number) => {
    setRegistering(webinarId);
    setMessage(null);

    try {
      const res = await fetch("/api/webinars/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webinar_id: webinarId }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          // کاربر لاگین نیست → هدایت به صفحه ورود
          window.location.href = `/login?redirect=/webinars`;
          return;
        }
        throw new Error(data.error || "خطا در ثبت‌نام");
      }

      // اگر وبینار پولی باشد → هدایت به درگاه پرداخت
      if (priceToman > 0 && data.registration?.id) {
        const payRes = await fetch("/api/webinars/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registration_id: data.registration.id }),
        });
        const payData = await payRes.json();
        if (payData.payment_url) {
          window.location.href = payData.payment_url;
          return;
        }
        throw new Error(payData.error || "خطا در اتصال به درگاه");
      }

      // وبینار رایگان → ثبت‌نام موفق
      setMessage({ type: "success", text: "ثبت‌نام شما با موفقیت انجام شد!" });
    } catch (e: any) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setRegistering(null);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
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
            className="mb-6 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2"
            style={{
              background: message.type === "success" ? "color-mix(in srgb, var(--success) 12%, transparent)" : "color-mix(in srgb, var(--danger) 12%, transparent)",
              color: message.type === "success" ? "var(--success)" : "var(--danger)",
            }}
          >
            {message.type === "success" ? <CheckCircle size={16} /> : <XCircle size={16} />}
            {message.text}
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
              const isFull = w.max_capacity ? w.registered_count >= w.max_capacity : false;
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
                        {w.registered_count} نفر ثبت‌نام کرده
                        {w.max_capacity && ` (ظرفیت: ${w.max_capacity})`}
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
                          onClick={() => handleRegister(w.id, w.price_toman)}
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
                          {w.price_toman > 0 ? "ثبت‌نام و پرداخت" : "ثبت‌نام رایگان"}
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
