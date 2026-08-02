"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays, CheckCircle2, CircleSlash, ClipboardList, FileText,
  GitBranch, HelpCircle, Inbox, PieChart, Send, Undo2, XCircle,
} from "lucide-react";
import { toPersianDigits } from "@/lib/format";
import {
  ANALYSIS_STATE_LABEL, WORKFLOW_EVENT_LABEL, HORIZON_LABEL, DIRECTION_LABEL,
  type AnalysisState, type WorkflowEvent, type IntelHorizon,
} from "@/lib/intelligence/workflow";
import type {
  InboxItem, PortfolioImpactView, RehearsalView, ScenarioCard, TodayView,
} from "@/lib/intelligence/board";

/**
 * میزِ هوشمندیِ دستی — نمای داخلی. `G3-003`.
 *
 * ⚠️ اینجا **هیچ دکمهٔ انتشارِ عمومی وجود ندارد** و این عمدی است. تأییدِ داخلی
 * پایانِ کار در این مأموریت است؛ مسیرِ انتشار جداگانه و بعداً تصمیم‌گیری
 * می‌شود. `/api/admin/intelligence` هم مستقلاً مقصدِ `published` را رد می‌کند،
 * پس نبودِ دکمه تنها لایهٔ محافظت نیست.
 *
 * رنگ فقط از توکن. متن با `--text*` رنگ می‌شود نه `--navy*` — بلوکِ `.dark`
 * فقط توکن‌های `--text*` را بازنویسی می‌کند و رنگِ navy در تمِ تیره تقریباً
 * نامرئی می‌شود (`B-040`).
 */

type Tab = "today" | "inbox" | "scenarios" | "portfolio" | "rehearsal";

const TABS: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
  { key: "today", label: "امروز", icon: <CalendarDays size={15} /> },
  { key: "inbox", label: "صندوق بازبینی", icon: <Inbox size={15} /> },
  { key: "scenarios", label: "تخته سناریو", icon: <GitBranch size={15} /> },
  { key: "portfolio", label: "اثر بر سبد مرجع", icon: <PieChart size={15} /> },
  { key: "rehearsal", label: "سنجه‌های تمرین", icon: <ClipboardList size={15} /> },
];

const STATE_TONE: Record<AnalysisState, { fg: string; bg: string }> = {
  draft: { fg: "var(--text-3)", bg: "var(--surface-2)" },
  pending_approval: { fg: "var(--gold)", bg: "var(--gold-tint)" },
  approved_internal: { fg: "var(--success)", bg: "rgba(21,128,61,0.10)" },
  rejected: { fg: "var(--danger)", bg: "rgba(185,28,28,0.10)" },
  published: { fg: "var(--success)", bg: "rgba(21,128,61,0.10)" },
  superseded: { fg: "var(--text-3)", bg: "var(--surface-2)" },
};

function StateBadge({ state }: { state: AnalysisState }) {
  const t = STATE_TONE[state];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ color: t.fg, background: t.bg }}
    >
      {ANALYSIS_STATE_LABEL[state]}
    </span>
  );
}

/**
 * «تعریف‌نشده» با «صفر» یکی نیست و این کامپوننت همان تمایز را نگه می‌دارد.
 * هرجا داده نداریم، متنِ صریح می‌آید — نه عددِ جایگزین.
 */
function Unknown({ what = "هنوز تعریف نشده" }: { what?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: "var(--text-3)" }}>
      <HelpCircle size={12} /> {what}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl p-4 shadow-institutional ${className}`}
      style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
    >
      {children}
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <Card>
      <div className="flex items-start gap-2.5">
        <CircleSlash size={16} style={{ color: "var(--text-3)", marginTop: 2 }} />
        <div>
          <p className="text-[13px] font-bold" style={{ color: "var(--text)" }}>{title}</p>
          <p className="mt-1 text-[12px] leading-6" style={{ color: "var(--text-2)" }}>{hint}</p>
        </div>
      </div>
    </Card>
  );
}

export interface IntelligenceDeskProps {
  today: TodayView;
  todayJalali: string;
  inbox: InboxItem[];
  scenarios: ScenarioCard[];
  portfolio: PortfolioImpactView;
  rehearsal: RehearsalView;
  /** وقتی migration اجرا نشده باشد، شمارش‌ها معتبر نیستند و باید گفته شود. */
  unavailableReason: string | null;
}

export default function IntelligenceDesk(props: IntelligenceDeskProps) {
  const [tab, setTab] = useState<Tab>("today");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function transition(analysisId: string, to: AnalysisState, note: string | null) {
    setBusy(analysisId);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/intelligence", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisId, to, note }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) setMessage({ kind: "err", text: body.error ?? "انجام نشد" });
      else {
        setMessage({ kind: "ok", text: "وضعیت ثبت شد. برای دیدن نتیجه صفحه را تازه کنید." });
      }
    } catch {
      setMessage({ kind: "err", text: "ارتباط برقرار نشد" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {props.unavailableReason && (
        <div
          className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-[12px] leading-6"
          style={{ background: "rgba(185,28,28,0.10)", color: "var(--text-2)" }}
        >
          <HelpCircle size={15} style={{ color: "var(--danger)", marginTop: 3 }} />
          <span>
            <strong style={{ color: "var(--danger)" }}>در دسترس نیست — </strong>
            {props.unavailableReason} تا آن زمان هیچ عددی ساخته نمی‌شود و شمارش‌های این صفحه
            معتبر نیستند.
          </span>
        </div>
      )}

      <nav className="flex flex-wrap gap-1.5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold transition-colors"
            style={
              tab === t.key
                ? { background: "var(--gold-tint)", color: "var(--gold)" }
                : { background: "var(--surface-2)", color: "var(--text-2)" }
            }
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      {message && (
        <p
          className="rounded-lg px-3 py-2 text-[12px]"
          style={{
            background: message.kind === "ok" ? "rgba(21,128,61,0.10)" : "rgba(185,28,28,0.10)",
            color: message.kind === "ok" ? "var(--success)" : "var(--danger)",
          }}
        >
          {message.text}
        </p>
      )}

      {/* ── امروز ─────────────────────────────────────────────────────── */}
      {tab === "today" && (
        <div className="space-y-3">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                  بریفِ روز · {toPersianDigits(props.todayJalali)}
                </p>
                <p className="mt-1 font-display text-[15px] font-extrabold" style={{ color: "var(--text)" }}>
                  {props.today.brief ? props.today.brief.title : "برای امروز بریفی ثبت نشده است"}
                </p>
              </div>
              {props.today.brief && <StateBadge state={props.today.brief.status} />}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>تعداد گزاره</p>
                <p className="text-[13px] font-bold" style={{ color: "var(--text)" }}>
                  {props.today.claimCount === null
                    ? <Unknown what="بریفی ثبت نشده" />
                    : toPersianDigits(props.today.claimCount)}
                </p>
              </div>
              <div>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>گزارهٔ بدون شاهد</p>
                <p className="text-[13px] font-bold" style={{ color: "var(--text)" }}>
                  {props.today.claimCount === null
                    ? <Unknown what="—" />
                    : toPersianDigits(props.today.unsupportedClaims)}
                </p>
              </div>
              <div>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>وضعیت</p>
                <p className="text-[13px] font-bold" style={{ color: "var(--text)" }}>
                  {props.today.statusLabel}
                </p>
              </div>
            </div>

            {props.today.brief?.status === "draft" && (
              <button
                disabled={busy === props.today.brief.id}
                onClick={() => transition(props.today.brief!.id, "pending_approval", null)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold disabled:opacity-50"
                style={{ background: "var(--gold-tint)", color: "var(--gold)" }}
              >
                <Send size={14} /> ارسال برای بازبینی
              </button>
            )}
          </Card>

          <p className="text-[12px] leading-6" style={{ color: "var(--text-2)" }}>
            بریفِ روزانه یک <strong>تحلیل</strong> است، نه یک شیء موازی — همان چرخهٔ تأیید و همان
            دفترِ تاریخچه را دارد. هیچ‌چیز از این صفحه به‌صورت خودکار عمومی نمی‌شود.
          </p>
        </div>
      )}

      {/* ── صندوق بازبینی ─────────────────────────────────────────────── */}
      {tab === "inbox" && (
        <div className="space-y-3">
          {props.inbox.length === 0 ? (
            <Empty
              title="چیزی در انتظار بازبینی نیست"
              hint="این یعنی هیچ تحلیلی در وضعیتِ «در انتظار بازبینی» نمانده — نه اینکه داده‌ای در دسترس نیست."
            />
          ) : (
            props.inbox.map((item) => (
              <Card key={item.brief.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-[14px] font-extrabold" style={{ color: "var(--text)" }}>
                      {item.brief.title}
                    </p>
                    <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
                      {/* جداکنندهٔ «·» در RTL کنارِ رقم **خنثی** است و به عددِ قبلی
                          می‌چسبد: «۱ گزاره · ۱ بدون شاهد» به‌صورتِ «۱ گزاره ۱۰ بدون
                          شاهد» دیده می‌شود. ویرگولِ فارسی این ابهام را ندارد. */}
                      {toPersianDigits(item.claimCount)} گزاره
                      {item.unsupportedClaims > 0 &&
                        `، ${toPersianDigits(item.unsupportedClaims)} بدون شاهد`}
                    </p>
                  </div>
                  <StateBadge state={item.brief.status} />
                </div>

                {item.blockedReason && (
                  <p
                    className="mt-2 rounded-lg px-3 py-2 text-[12px] leading-6"
                    style={{ background: "var(--gold-tint)", color: "var(--navy-deep)" }}
                  >
                    تأییدِ داخلی هنوز ممکن نیست: {item.blockedReason}. دیتابیس هم مستقلاً همین را
                    رد می‌کند.
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    disabled={busy === item.brief.id || item.blockedReason !== null}
                    onClick={() => transition(item.brief.id, "approved_internal", null)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold disabled:opacity-40"
                    style={{ background: "rgba(21,128,61,0.10)", color: "var(--success)" }}
                  >
                    <CheckCircle2 size={14} /> تأیید داخلی
                  </button>
                  <button
                    disabled={busy === item.brief.id}
                    onClick={() => transition(item.brief.id, "rejected", null)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold disabled:opacity-40"
                    style={{ background: "rgba(185,28,28,0.10)", color: "var(--danger)" }}
                  >
                    <XCircle size={14} /> رد
                  </button>
                  <button
                    disabled={busy === item.brief.id}
                    onClick={() => transition(item.brief.id, "draft", null)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold disabled:opacity-40"
                    style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
                  >
                    <Undo2 size={14} /> بازگرداندن به پیش‌نویس
                  </button>
                </div>

                {item.history.length > 0 && (
                  <ol className="mt-3 space-y-1 border-t pt-2.5" style={{ borderColor: "var(--line)" }}>
                    {item.history.map((h, i) => (
                      <li key={i} className="text-[11px]" style={{ color: "var(--text-3)" }}>
                        {WORKFLOW_EVENT_LABEL[h.event as WorkflowEvent] ?? h.event}
                        {h.note ? ` — ${h.note}` : ""}
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            ))
          )}
          <p className="text-[12px] leading-6" style={{ color: "var(--text-2)" }}>
            <strong>تأییدِ داخلی انتشار نیست.</strong> هیچ دکمهٔ انتشارِ عمومی در این صفحه وجود
            ندارد و مسیرِ API هم مقصدِ «منتشرشده» را رد می‌کند.
          </p>
        </div>
      )}

      {/* ── تخته سناریو ───────────────────────────────────────────────── */}
      {tab === "scenarios" && (
        <div className="grid gap-3 md:grid-cols-3">
          {props.scenarios.map((card) => (
            <Card key={card.label}>
              <p className="font-display text-[14px] font-extrabold" style={{ color: "var(--text)" }}>
                {card.labelFa}
              </p>
              <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                میانگین اطمینان:{" "}
                {card.averageConfidence === null
                  ? <Unknown what="سناریویی ثبت نشده" />
                  : toPersianDigits(card.averageConfidence) + "٪"}
              </p>
              {card.claims.length === 0 ? (
                <p className="mt-2 text-[12px] leading-6" style={{ color: "var(--text-2)" }}>
                  هنوز گزاره‌ای با این برچسب ثبت نشده است.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {card.claims.map((c) => (
                    <li key={c.id} className="text-[12px] leading-6" style={{ color: "var(--text-2)" }}>
                      {c.statement}
                      <span className="mr-1.5" style={{ color: "var(--text-3)" }}>
                        ({toPersianDigits(c.confidence)}٪
                        {c.evidenceCount === 0 ? "، بدون شاهد" : ""})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ── اثر بر سبد مرجع ───────────────────────────────────────────── */}
      {tab === "portfolio" && (
        <div className="space-y-3">
          <div
            className="rounded-lg px-3 py-2.5 text-[12px] leading-6"
            style={{ background: "var(--gold-tint)", color: "var(--navy-deep)" }}
          >
            {props.portfolio.note} این نما <strong>اثرِ احتمالی</strong> را نشان می‌دهد — نه توصیهٔ
            خرید و فروش، نه قیمتِ هدف، نه شخصی‌سازی برای مشتری.
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-right text-[12px]">
              <thead>
                <tr style={{ color: "var(--text-3)" }}>
                  <th className="px-2 py-2 font-normal">دارایی</th>
                  <th className="px-2 py-2 font-normal">وزن در سبد مرجع</th>
                  <th className="px-2 py-2 font-normal">جهت اثر</th>
                  <th className="px-2 py-2 font-normal">اطمینان</th>
                  <th className="px-2 py-2 font-normal">افق</th>
                </tr>
              </thead>
              <tbody>
                {props.portfolio.rows.map((row) => (
                  <tr key={row.assetClass} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="px-2 py-2.5 font-bold" style={{ color: "var(--text)" }}>{row.label}</td>
                    <td className="px-2 py-2.5" style={{ color: "var(--text-2)" }}>
                      {row.weightPct === null ? <Unknown /> : toPersianDigits(row.weightPct) + "٪"}
                    </td>
                    <td className="px-2 py-2.5" style={{ color: "var(--text-2)" }}>
                      {row.direction === null
                        ? <Unknown what="اثری ثبت نشده" />
                        : DIRECTION_LABEL[row.direction]}
                    </td>
                    <td className="px-2 py-2.5" style={{ color: "var(--text-2)" }}>
                      {row.confidence === null ? <Unknown what="—" /> : toPersianDigits(row.confidence) + "٪"}
                    </td>
                    <td className="px-2 py-2.5" style={{ color: "var(--text-2)" }}>
                      {/* کلیدِ خامِ انگلیسی هرگز به کاربر نشان داده نمی‌شود. */}
                      {row.horizon === null
                        ? <Unknown what="—" />
                        : HORIZON_LABEL[row.horizon as IntelHorizon] ?? row.horizon}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[12px] leading-6" style={{ color: "var(--text-2)" }}>
            وزن‌ها فقط از نسخهٔ نهایی‌شدهٔ سبد مرجع خوانده می‌شوند. تا وقتی آرش وزنی تعریف نکرده،
            هر خانه «هنوز تعریف نشده» می‌ماند — <strong>عددِ جایگزین ساخته نمی‌شود</strong>.
            <Link href="/admin/manage?tab=portfolio" className="mr-1.5 underline" style={{ color: "var(--gold)" }}>
              تعریف سبد مرجع
            </Link>
          </p>
        </div>
      )}

      {/* ── سنجه‌های تمرین ────────────────────────────────────────────── */}
      {tab === "rehearsal" && (
        <div className="space-y-3">
          <Card>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>روزهای ثبت‌شده</p>
                <p className="font-display text-[18px] font-extrabold" style={{ color: "var(--text)" }}>
                  {toPersianDigits(props.rehearsal.daysRecorded)}
                  <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
                    {" "}/ {toPersianDigits(10)}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>نرخ تولید بریف</p>
                <p className="font-display text-[18px] font-extrabold" style={{ color: "var(--text)" }}>
                  {props.rehearsal.briefRate === null
                    ? <Unknown what="تمرین شروع نشده" />
                    : toPersianDigits(Math.round(props.rehearsal.briefRate * 100)) + "٪"}
                </p>
              </div>
              <div>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>متوسط زمان تا تأیید</p>
                <p className="font-display text-[18px] font-extrabold" style={{ color: "var(--text)" }}>
                  {props.rehearsal.averageMinutes === null
                    ? <Unknown what="اندازه‌گیری نشده" />
                    : toPersianDigits(props.rehearsal.averageMinutes) + " دقیقه"}
                </p>
              </div>
            </div>

            <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-3" style={{ borderColor: "var(--line)" }}>
              <div>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>اصلاح انسانی</p>
                <p className="text-[13px] font-bold" style={{ color: "var(--text)" }}>
                  {toPersianDigits(props.rehearsal.totalCorrections)}
                </p>
              </div>
              <div>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>نتیجه‌گیری ردشده</p>
                <p className="text-[13px] font-bold" style={{ color: "var(--text)" }}>
                  {toPersianDigits(props.rehearsal.totalRejected)}
                </p>
              </div>
              <div>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>رخداد ازدست‌رفته</p>
                <p className="text-[13px] font-bold" style={{ color: "var(--text)" }}>
                  {toPersianDigits(props.rehearsal.totalMissedEvents)}
                </p>
              </div>
            </div>

            <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
              <p className="text-[11px]" style={{ color: "var(--text-3)" }}>منابع غایب / بیات</p>
              <p className="mt-1 text-[12px] leading-6" style={{ color: "var(--text-2)" }}>
                {props.rehearsal.absentSources.length === 0 && props.rehearsal.staleSources.length === 0
                  ? "تا اینجا هیچ منبعِ غایب یا بیاتی ثبت نشده است."
                  : [...props.rehearsal.absentSources, ...props.rehearsal.staleSources].join("، ")}
              </p>
            </div>
          </Card>

          <div
            className="rounded-lg px-3 py-2.5 text-[12px] leading-6"
            style={{ background: "var(--gold-tint)", color: "var(--navy-deep)" }}
          >
            <FileText size={14} className="ml-1.5 inline" />
            وضعیت گیت:{" "}
            <strong>
              {props.rehearsal.gateStatus === "not_started"
                ? "تمرین شروع نشده"
                : props.rehearsal.gateStatus === "in_progress"
                  ? `در جریان — ${toPersianDigits(props.rehearsal.remainingDays)} روز باقی مانده`
                  : "آمادهٔ بازبینی"}
            </strong>
            . آمادهٔ بازبینی یعنی ده روزِ <strong>واقعی</strong> ثبت شده — و همچنان{" "}
            <strong>PASS نیست</strong>؛ تصمیمِ گیت با Command Center است. هیچ روزی به‌صورت خودکار
            یا نمونه ثبت نمی‌شود.
          </div>
        </div>
      )}
    </div>
  );
}
