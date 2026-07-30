"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Clock, RefreshCw } from "lucide-react";
import { toPersianDigits } from "@/lib/format";
import { STATE_LABEL, type HealthState } from "@/lib/health/status";

type Signal = {
  key: string;
  label: string;
  state: HealthState;
  detail: string;
  lastAt?: string | null;
  ageMinutes?: number | null;
};

type Payload = {
  generatedAt: string;
  overall: HealthState;
  signals: Signal[];
  deployment: {
    environment: string;
    deploymentId: string | null;
    commitSha: string | null;
    branch: string | null;
  };
  env: {
    required: { key: string; present: boolean }[];
    optional: { key: string; present: boolean }[];
  };
};

/** رنگ فقط از توکن — هیچ رنگِ خام. */
const TONE: Record<HealthState, { fg: string; bg: string; icon: React.ReactNode }> = {
  ok: { fg: "var(--success)", bg: "rgba(21,128,61,0.10)", icon: <CheckCircle2 size={16} /> },
  stale: { fg: "var(--gold)", bg: "var(--gold-tint)", icon: <Clock size={16} /> },
  failed: { fg: "var(--danger)", bg: "rgba(185,28,28,0.10)", icon: <AlertTriangle size={16} /> },
  unknown: { fg: "var(--text-3)", bg: "var(--surface-2)", icon: <HelpCircle size={16} /> },
};

function StateBadge({ state }: { state: HealthState }) {
  const t = TONE[state];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ color: t.fg, background: t.bg }}
    >
      {t.icon}
      {STATE_LABEL[state]}
    </span>
  );
}

export default function HealthBoard() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/health", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `پاسخِ ${res.status} از سرور`);
      }
      setData((await res.json()) as Payload);
    } catch (e) {
      // حالتِ شکست: نما خالی نمی‌ماند، دلیل را می‌گوید.
      setError(e instanceof Error ? e.message : "خطای ناشناخته");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── حالتِ لودینگ ──
  if (loading && !data) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <p className="text-[13px]" style={{ color: "var(--text-3)" }}>
          در حال خواندنِ وضعیت…
        </p>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-xl"
            style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
          />
        ))}
      </div>
    );
  }

  // ── حالتِ شکست ──
  if (error) {
    return (
      <div
        className="rounded-xl px-5 py-6"
        style={{ background: "rgba(185,28,28,0.06)", border: "1px solid var(--danger)" }}
        role="alert"
      >
        <p className="text-[14px] font-bold" style={{ color: "var(--danger)" }}>
          وضعیت خوانده نشد
        </p>
        <p className="mt-2 text-[13px] leading-7" style={{ color: "var(--text-2)" }}>
          {error}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-bold"
          style={{ background: "var(--navy)", color: "white" }}
        >
          <RefreshCw size={14} />
          تلاش دوباره
        </button>
      </div>
    );
  }

  // ── حالتِ خالی ──
  if (!data || data.signals.length === 0) {
    return (
      <div
        className="rounded-xl px-5 py-8 text-center"
        style={{ background: "var(--surface)", border: "1px dashed var(--line-strong)" }}
      >
        <p className="text-[14px] font-bold" style={{ color: "var(--navy-deep)" }}>
          هیچ شاخصی برنگشت
        </p>
        <p className="mt-2 text-[12px] leading-6" style={{ color: "var(--text-2)" }}>
          این خودش یک نشانه است: نبودِ شاخص با سلامت یکی نیست.
        </p>
      </div>
    );
  }

  const generatedAgo = Math.max(
    0,
    Math.floor((Date.now() - new Date(data.generatedAt).getTime()) / 60000)
  );

  return (
    <div className="space-y-5">
      {/* سرآیندِ وضعیتِ کلی */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4"
        style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-bold" style={{ color: "var(--text-2)" }}>
            وضعیتِ کلی
          </span>
          <StateBadge state={data.overall} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
            {generatedAgo === 0
              ? "هم‌اکنون خوانده شد"
              : `${toPersianDigits(generatedAgo)} دقیقه پیش خوانده شد`}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold disabled:opacity-50"
            style={{ background: "var(--surface-2)", color: "var(--navy)" }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            تازه‌سازی
          </button>
        </div>
      </div>

      {/* شاخص‌ها */}
      <ul className="space-y-2.5">
        {data.signals.map((s) => (
          <li
            key={s.key}
            className="rounded-xl px-4 py-3.5"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderInlineStartWidth: 3,
              borderInlineStartColor: TONE[s.state].fg,
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-bold" style={{ color: "var(--navy-deep)" }}>
                {s.label}
              </span>
              <StateBadge state={s.state} />
            </div>
            <p className="mt-1.5 text-[12px] leading-6" style={{ color: "var(--text-2)" }}>
              {s.detail}
            </p>
          </li>
        ))}
      </ul>

      {/* متغیرهای محیطی — فقط نام و حضور، هرگز مقدار */}
      <div
        className="rounded-xl px-5 py-4"
        style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
      >
        <h3 className="text-[13px] font-bold" style={{ color: "var(--navy-deep)" }}>
          متغیرهای محیطی — فقط حاضر/غایب
        </h3>
        <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
          هیچ مقداری اینجا نمایش داده نمی‌شود و هیچ مقداری از سرور برنمی‌گردد.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {[...data.env.required.map((e) => ({ ...e, required: true })),
            ...data.env.optional.map((e) => ({ ...e, required: false }))].map((e) => (
            <div key={e.key} className="flex items-center justify-between gap-2">
              <code className="text-[11px]" style={{ color: "var(--text-2)" }}>
                {e.key}
                {e.required ? " *" : ""}
              </code>
              <span
                className="text-[11px] font-bold"
                style={{ color: e.present ? "var(--success)" : e.required ? "var(--danger)" : "var(--text-3)" }}
              >
                {e.present ? "تنظیم‌شده" : "تنظیم‌نشده"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* استقرار */}
      <div
        className="rounded-xl px-5 py-4"
        style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
      >
        <h3 className="text-[13px] font-bold" style={{ color: "var(--navy-deep)" }}>
          استقرارِ در حالِ اجرا
        </h3>
        <dl className="mt-2 grid grid-cols-1 gap-1.5 text-[12px] sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <dt style={{ color: "var(--text-3)" }}>محیط</dt>
            <dd style={{ color: "var(--text-1)" }}>{data.deployment.environment}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt style={{ color: "var(--text-3)" }}>شاخه</dt>
            <dd style={{ color: "var(--text-1)" }}>{data.deployment.branch ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt style={{ color: "var(--text-3)" }}>کامیت</dt>
            <dd>
              <code style={{ color: "var(--text-1)" }}>
                {data.deployment.commitSha?.slice(0, 7) ?? "—"}
              </code>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt style={{ color: "var(--text-3)" }}>شناسهٔ استقرار</dt>
            <dd>
              <code style={{ color: "var(--text-1)" }}>{data.deployment.deploymentId ?? "—"}</code>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
