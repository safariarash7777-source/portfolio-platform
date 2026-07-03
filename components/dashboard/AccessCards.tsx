"use client";

import { useState } from "react";
import {
  Send,
  CheckCircle2,
  KeyRound,
  ExternalLink,
  Lock,
  Unlock,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatToman, toPersianDigits } from "@/lib/format";

export interface PaidPayment {
  status: string;
  invite_link: string | null;
  ref_id: string | null;
}

interface Props {
  telegramLinked: boolean;
  payment: PaidPayment | null;
}

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "";
const PRICE = Number(process.env.NEXT_PUBLIC_COURSE_PRICE_TOMAN ?? "") || 0;

export default function AccessCards({ telegramLinked, payment }: Props) {
  const paid = payment?.status === "paid";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <TelegramCard linked={telegramLinked} />
      <ChannelCard paid={paid} inviteLink={payment?.invite_link ?? null} linked={telegramLinked} />
    </div>
  );
}

// ─── اتصال تلگرام ─────────────────────────────────────────────────────────
function TelegramCard({ linked }: { linked: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const getCode = async () => {
    setError("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.rpc("generate_telegram_link_code");
      if (err) throw err;
      setCode(String(data));
    } catch {
      setError("خطا در دریافت کد. دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  };

  const botUrl = BOT_USERNAME ? `https://t.me/${BOT_USERNAME}` : null;

  return (
    <div className="card-elevated p-6">
      <div className="flex items-center gap-3 mb-4">
        <span
          className="flex items-center justify-center rounded-xl"
          style={{ width: 44, height: 44, background: "var(--gold-tint)", color: "var(--navy-deep)" }}
        >
          <Send size={20} />
        </span>
        <div>
          <h3 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
            اتصال تلگرام
          </h3>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            برای دریافت دعوت کانال و دستور /portfolio
          </p>
        </div>
      </div>

      {linked ? (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold"
          style={{ background: "rgba(21,128,61,0.08)", border: "1px solid rgba(21,128,61,0.25)", color: "var(--success)" }}
        >
          <CheckCircle2 size={16} />
          حساب تلگرام شما متصل است.
        </div>
      ) : (
        <div className="space-y-4">
          {code ? (
            <div className="space-y-3">
              <div
                className="rounded-xl px-4 py-4 text-center"
                style={{ background: "var(--surface-2)", border: "1px dashed var(--line-strong)" }}
              >
                <div className="text-xs mb-1" style={{ color: "var(--text-3)" }}>
                  کد یک‌بارمصرف (اعتبار ۱۰ دقیقه)
                </div>
                <div
                  className="font-display text-3xl font-bold tracking-widest"
                  dir="ltr"
                  style={{ color: "var(--navy-deep)" }}
                >
                  {toPersianDigits(code)}
                </div>
              </div>
              <p className="text-xs leading-6" style={{ color: "var(--text-2)" }}>
                این کد را در گفت‌وگوی خصوصی با بات ارسال کنید.
              </p>
              {botUrl && (
                <a href={botUrl} target="_blank" rel="noopener noreferrer" className="btn btn-gold w-full">
                  <ExternalLink size={16} />
                  باز کردن بات تلگرام
                </a>
              )}
            </div>
          ) : (
            <button type="button" onClick={getCode} disabled={loading} className="btn btn-outline w-full">
              <KeyRound size={16} />
              {loading ? "در حال ساخت کد..." : "دریافت کد اتصال"}
            </button>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--danger)" }}>
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── دسترسی کانال ─────────────────────────────────────────────────────────
function ChannelCard({
  paid,
  inviteLink,
  linked,
}: {
  paid: boolean;
  inviteLink: string | null;
  linked: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const startPayment = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/payment/request", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "خطا");
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در اتصال به درگاه پرداخت.");
      setLoading(false);
    }
  };

  return (
    <div className="card-elevated p-6">
      <div className="flex items-center gap-3 mb-4">
        <span
          className="flex items-center justify-center rounded-xl"
          style={{
            width: 44,
            height: 44,
            background: paid ? "rgba(21,128,61,0.1)" : "var(--gold-tint)",
            color: paid ? "var(--success)" : "var(--navy-deep)",
          }}
        >
          {paid ? <Unlock size={20} /> : <Lock size={20} />}
        </span>
        <div>
          <h3 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
            دسترسی کانال اختصاصی
          </h3>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            خرید یک‌بارهٔ دسترسی به دورهٔ وبینار
          </p>
        </div>
      </div>

      {paid ? (
        <div className="space-y-3">
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold"
            style={{ background: "rgba(21,128,61,0.08)", border: "1px solid rgba(21,128,61,0.25)", color: "var(--success)" }}
          >
            <CheckCircle2 size={16} />
            دسترسی شما فعال است.
          </div>
          {inviteLink ? (
            <a href={inviteLink} target="_blank" rel="noopener noreferrer" className="btn btn-gold w-full">
              <ExternalLink size={16} />
              ورود به کانال خصوصی
            </a>
          ) : (
            <p className="text-xs leading-6" style={{ color: "var(--text-2)" }}>
              {linked
                ? "لینک دعوت اختصاصی شما در پیام خصوصی تلگرام ارسال شده است."
                : "برای دریافت لینک دعوت، حساب تلگرام خود را از کارت کناری متصل کنید."}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {PRICE > 0 && (
            <div
              className="rounded-xl px-4 py-3 flex items-baseline justify-between"
              style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
            >
              <span className="text-sm" style={{ color: "var(--text-2)" }}>
                هزینهٔ دسترسی
              </span>
              <span className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
                {formatToman(PRICE)}
              </span>
            </div>
          )}
          <button type="button" onClick={startPayment} disabled={loading} className="btn btn-gold w-full">
            <Lock size={16} />
            {loading ? "در حال انتقال به درگاه..." : "پرداخت و دریافت دسترسی"}
          </button>
          <p className="text-xs leading-6" style={{ color: "var(--text-3)" }}>
            پرداخت از طریق درگاه امن زرین‌پال انجام می‌شود. پس از پرداخت موفق، لینک دعوت
            کانال برای شما صادر می‌شود.
          </p>
          {error && (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--danger)" }}>
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
