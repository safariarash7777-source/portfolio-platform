"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleSlash,
  Clock,
  Database,
  HelpCircle,
  Loader2,
  PieChart,
  RefreshCw,
  Route,
  Settings2,
  Telescope,
  UserCheck,
  Users,
} from "lucide-react";
import { toPersianDigits } from "@/lib/format";
import {
  DATA_STATE_LABEL,
  type DataState,
  type DeskSectionKey,
  type DeskSource,
  type DeskView,
} from "@/lib/desk/contracts";
import { UNKNOWN_TIME, clockTime, sourceClocks } from "@/lib/desk/clock";

/** رنگ فقط از توکن — هیچ رنگِ خام. */
const TONE: Record<DataState, { fg: string; bg: string; icon: React.ReactNode }> = {
  loading: { fg: "var(--text-2)", bg: "var(--surface-2)", icon: <Loader2 size={14} /> },
  ready: { fg: "var(--success)", bg: "rgba(21,128,61,0.10)", icon: <CheckCircle2 size={14} /> },
  // خنثی و عمداً **نه سبز**: «رکورد دارد» یک واقعیتِ ساده است، نه گواهیِ
  // تازگی. اگر هم‌رنگِ `ready` شود، همان سبزِ کسب‌نشده‌ای برمی‌گردد که این
  // حالت برای حذفش ساخته شد.
  present: { fg: "var(--text-2)", bg: "var(--surface-2)", icon: <Database size={14} /> },
  // منتظرِ انسان و پیکربندی‌نشده عمداً **آبیِ برند**اند، نه زرد: این‌ها خرابیِ
  // داده نیستند و نباید در کنارِ «کهنه» یک‌جور دیده شوند.
  awaiting_review: { fg: "var(--navy)", bg: "rgba(30,58,138,0.10)", icon: <UserCheck size={14} /> },
  unconfigured: { fg: "var(--navy)", bg: "rgba(30,58,138,0.08)", icon: <Settings2 size={14} /> },
  stale: { fg: "var(--gold)", bg: "var(--gold-tint)", icon: <Clock size={14} /> },
  empty: { fg: "var(--text-2)", bg: "var(--surface-2)", icon: <CircleSlash size={14} /> },
  unavailable: { fg: "var(--danger)", bg: "rgba(185,28,28,0.10)", icon: <HelpCircle size={14} /> },
};

const SECTION_ICON: Record<DeskSectionKey, React.ReactNode> = {
  today: <CalendarDays size={17} />,
  intelligence: <Telescope size={17} />,
  decisions: <Route size={17} />,
  reference: <PieChart size={17} />,
  clients: <Users size={17} />,
  operations: <Activity size={17} />,
};

function StateBadge({ state, small }: { state: DataState; small?: boolean }) {
  const t = TONE[state];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full font-bold ${
        small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      }`}
      style={{ color: t.fg, background: t.bg }}
    >
      {t.icon}
      {DATA_STATE_LABEL[state]}
    </span>
  );
}

/**
 * ساعتِ هر منبع، کنارِ خودش.
 *
 * تا پیش از این، تنها زمانِ روی میز یک مهرِ سراسری در پایینِ صفحه بود؛ هجده
 * فید زیرِ یک ساعت. حالا هر ردیف می‌گوید دادهٔ **خودش** از کِی است، و
 * «نامعلوم» یک مقدارِ واقعی است که با ساعتِ خواندنِ ما پر نمی‌شود.
 */
function SourceClockRow({ source }: { source: DeskSource }) {
  const clocks = sourceClocks(source);
  const unknown = clocks.observedValue === UNKNOWN_TIME;
  return (
    <dl className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
      <div className="flex items-center gap-1">
        <dt style={{ color: "var(--text-2)" }}>{clocks.observedLabel}:</dt>
        <dd
          className="font-bold"
          /* «نامعلوم» عمداً کم‌رنگ‌تر از یک زمانِ واقعی است تا از دور با
             یک مقدارِ معتبر اشتباه نشود. */
          style={{ color: unknown ? "var(--text-2)" : "var(--text)" }}
        >
          {clocks.observedValue}
        </dd>
      </div>
      <div className="flex items-center gap-1">
        <dt style={{ color: "var(--text-2)" }}>{clocks.fetchedLabel}:</dt>
        <dd style={{ color: "var(--text-2)" }}>{clocks.fetchedValue}</dd>
      </div>
    </dl>
  );
}

export interface DeskBoardSnapshot {
  data: DeskView | null;
  loading: boolean;
  error: string | null;
}

export default function DeskBoard({
  onSnapshot,
}: {
  onSnapshot?: (snapshot: DeskBoardSnapshot) => void;
}) {
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

  useEffect(() => {
    onSnapshot?.({ data, loading, error });
  }, [data, error, loading, onSnapshot]);

  if (loading && !data) {
    return (
      <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
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
        <p className="font-bold" style={{ color: "var(--danger-ink)" }}>
          میز خوانده نشد
        </p>
        <p className="mt-1">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-bold focus-visible:outline-none focus-visible:ring-2"
          style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text)" }}
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
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-bold disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2"
          style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text)" }}
        >
          <RefreshCw size={14} />
          به‌روزرسانی
        </button>
      </div>

      {/* `items-start` تا هر کارت به اندازهٔ محتوای خودش باشد؛ وگرنه بخشِ
          کم‌منبع تا قدِ همسایه‌اش کش می‌آید و فضای خالیِ بی‌معنا می‌سازد. */}
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
        {data.panels.map((panel) => (
          <section
            key={panel.key}
            className="flex flex-col rounded-xl border p-4"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          >
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  className="flex items-center gap-2 font-display text-[15px] font-extrabold"
                  /* `--text` و نه `--navy-deep`: تمِ تیره `--navy-deep` را
                     بازنویسی نمی‌کند، پس عنوان روی پس‌زمینهٔ تیره تقریباً
                     نامرئی می‌شد. */
                  style={{ color: "var(--text)" }}
                >
                  <span style={{ color: "var(--gold-ink)" }}>{SECTION_ICON[panel.key]}</span>
                  {panel.label}
                </h2>
                {/* پرسشی که این بخش جواب می‌دهد — تا میز فهرستِ شمارشِ جدول نباشد. */}
                <p className="mt-1 text-[11px] leading-5" style={{ color: "var(--text-2)" }}>
                  {panel.question}
                </p>
              </div>
              <StateBadge state={panel.state} />
            </header>

            <p className="mt-2 text-[12px] leading-6" style={{ color: "var(--text-2)" }}>
              {toPersianDigits(panel.detail)}
            </p>

            {/* هر منبع ردیفِ خودش را دارد: شمارش، حالت و دلیل کنارِ هم. یک
                منبعِ مرده دیگر پشتِ منبعِ سالمِ همسایه پنهان نمی‌شود. */}
            <ul className="mt-3 space-y-2">
              {panel.sources.map((source) => (
                <li
                  key={source.key}
                  className="rounded-lg px-3 py-2"
                  style={{ background: "var(--surface-2)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold" style={{ color: "var(--text)" }}>
                        {source.label}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px]" style={{ color: "var(--text-2)" }}>
                        {source.table}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {/* `null` یعنی «نتوانستیم بشماریم». صفر ننویس — از دور
                          شبیهِ داده به‌نظر می‌رسد و همان اشتباهی است که
                          شاخص‌های قبلی را بی‌فایده کرد. */}
                      <span
                        className="text-[14px] font-extrabold"
                        style={{ color: source.count === null ? "var(--text-2)" : "var(--text)" }}
                      >
                        {source.count === null ? "نامعلوم" : toPersianDigits(String(source.count))}
                      </span>
                      <StateBadge state={source.state} small />
                    </div>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-5" style={{ color: "var(--text-2)" }}>
                    {toPersianDigits(source.detail)}
                  </p>
                  {/* دو ساعتِ جدا، هر کدام با برچسبِ خودش. بدونِ جداکنندهٔ
                      «·» — آن نویسهٔ دوطرفه در متنِ راست‌به‌چپ کنارِ رقم
                      می‌نشیند و دو عدد را شبیهِ یک عدد نشان می‌دهد. */}
                  <SourceClockRow source={source} />
                </li>
              ))}
            </ul>

            {panel.links.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                {panel.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    /* `min-h-11` = ۴۴px. بدونِ آن این لینک‌ها ۲۵px بودند —
                       زیرِ کفِ هدفِ لمسی. شواهدِ قبلی این را نگرفت چون آن
                       اجرا هرگز میزِ بارگذاری‌شده را ندید. */
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold"
                    style={{ background: "var(--surface-2)", color: "var(--text)" }}
                  >
                    {link.label}
                    <ArrowLeft size={12} />
                  </Link>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      {/* این ساعت **فقط** زمانِ ساختنِ همین نماست و دربارهٔ تازگیِ هیچ فیدی
          چیزی نمی‌گوید؛ هر منبع ساعتِ خودش را بالا دارد. جملهٔ صریح عمدی
          است: یک مهرِ زمانیِ تنها در پایینِ صفحه، بی‌آنکه بگوید چیست، به
          برچسبِ همهٔ چیزهای بالایش تبدیل می‌شود. */}
      <p className="text-[11px] leading-6" style={{ color: "var(--text-2)" }}>
        این نما در ساعتِ {clockTime(data.generatedAt)} ساخته شد — این زمانِ
        ساختِ نماست، نه زمانِ دادهٔ منابع.
      </p>
    </div>
  );
}
