"use client";

import { useState } from "react";
import {

  CheckCircle2,

  ExternalLink,
  Lock,
  Unlock,
  AlertCircle,
} from "lucide-react";

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
  return <div className="card-elevated p-6 space-y-4"><h3 className="font-display font-bold text-lg">اتصال تلگرام و اعلان‌ها</h3><p>{linked ? 'اتصال موجود را بررسی و ترجیح ارسال را تنظیم کنید.' : 'اتصال با تأیید هر دو سمت انجام می‌شود.'}</p><a href="/account/telegram" className="btn btn-outline min-h-11">مدیریت اتصال</a><a href="/notifications" className="btn btn-outline min-h-11">مرکز اعلان</a></div>;
}
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
