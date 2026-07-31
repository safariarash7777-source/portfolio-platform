"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  CircleSlash,
  Clock,
  HelpCircle,
  PieChart,
  RefreshCw,
  Route,
  Telescope,
} from "lucide-react";
import { toPersianDigits } from "@/lib/format";
import {
  DATA_STATE_LABEL,
  type DataState,
  type DeskSectionKey,
  type DeskView,
} from "@/lib/desk/contracts";

/** رنگ فقط از توکن — هیچ رنگِ خام. */
const TONE: Record<DataState, { fg: string; bg: string; icon: React.ReactNode }> = {
  ready: { fg: "var(--success)", bg: "rgba(21,128,61,0.10)", icon: <CheckCircle2 size={15} /> },
  stale: { fg: "var(--gold)", bg: "var(--gold-tint)", icon: <Clock size={15} /> },
  empty: { fg: "var(--text-3)", bg: "var(--surface-2)", icon: <CircleSlash size={15} /> },
  unavailable: { fg: "var(--danger)", bg: "rgba(185,28,28,0.10)", icon: <HelpCircle size={15} /> },
};

const SECTION_ICON: Record<DeskSectionKey, React.ReactNode> = {
  today: <CalendarDays size={17} />,
  intelligence: <Telescope size={17} />,
  decisions: <Route size={17} />,
  reference: <PieChart size={17} />,
  operations: <Activity size={17} />,
};

function StateBadge({ state }: { state: DataState }) {
  const t = TONE[state];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ color: t.fg, background: t.bg }}
    >
      {t.icon}
      {DATA_STATE_LABEL[state]}
    </span>
  );
}

export default function DeskBoard() {
  const [data, setData] = useState<DeskView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/desk", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `پاسخِ ${res.status} از سرور`);
      }
      setData((await res.json()) as DeskView);
    } catch (e) {
      // حالتِ شکست: نما خالی نمی‌ماند، دلیل را می‌گوید.
      setError(e instanceof Error ? e.message : "خطای نامشخص");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <p className="text-[13px]" style={{ color: "var(--text-3)" }}>
        در حالِ خواندنِ وضعیت…
      </p>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border p-4 text-[13px] leading-7"
        style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--text-2)" }}
      >
        <p className="font-bold" style={{ color: "var(--danger)" }}>
          میز خوانده نشد
        </p>
        <p className="mt-1">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-bold"
          style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text-1)" }}
        >
          <RefreshCw size={14} />
          تلاشِ دوباره
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold" style={{ color: "var(--text-2)" }}>
            وضعیتِ کلیِ میز:
          </span>
          <StateBadge state={data.overall} />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-bold disabled:opacity-60"
          style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text-1)" }}
        >
          <RefreshCw size={14} />
          به‌روزرسانی
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {data.panels.map((panel) => (
          <section
            key={panel.key}
            className="rounded-xl border p-4"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          >
            <header className="flex items-start justify-between gap-3">
              <h2
                className="flex items-center gap-2 font-display text-[15px] font-extrabold"
                style={{ color: "var(--navy-deep)" }}
              >
                <span style={{ color: "var(--gold)" }}>{SECTION_ICON[panel.key]}</span>
                {panel.label}
              </h2>
              <StateBadge state={panel.state} />
            </header>

            <p className="mt-2 text-[12px] leading-6" style={{ color: "var(--text-2)" }}>
              {toPersianDigits(panel.detail)}
            </p>

            {panel.metrics.length > 0 && (
              <dl className="mt-3 grid grid-cols-2 gap-2">
                {panel.metrics.map((metric) => (
                  <div
                    key={metric.key}
                    className="rounded-lg px-3 py-2"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <dt className="text-[11px]" style={{ color: "var(--text-3)" }}>
                      {metric.label}
                    </dt>
                    {/* مقدارِ `null` یعنی «نداریم». صفر یا خط تیره ننویس — از
                        دور شبیهِ داده به‌نظر می‌رسد و همان اشتباهی است که
                        شاخص‌های قبلی را بی‌فایده کرد. */}
                    <dd
                      className="mt-0.5 text-[14px] font-extrabold"
                      style={{ color: metric.value === null ? "var(--text-3)" : "var(--text-1)" }}
                    >
                      {metric.value === null ? "نامعلوم" : metric.value}
                    </dd>
                    {metric.hint && (
                      <p className="mt-1 text-[10px] leading-5" style={{ color: "var(--text-3)" }}>
                        {metric.hint}
                      </p>
                    )}
                  </div>
                ))}
              </dl>
            )}

            <p className="mt-3 text-[11px] leading-5" style={{ color: "var(--text-3)" }}>
              می‌خوانَد از: {panel.sources.join(" · ")}
            </p>
          </section>
        ))}
      </div>

      <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
        زمانِ تولید: {toPersianDigits(new Date(data.generatedAt).toLocaleString("fa-IR"))}
      </p>
    </div>
  );
}
