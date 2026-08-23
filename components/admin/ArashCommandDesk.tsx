"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleSlash,
  Clock3,
  FileQuestion,
  GitBranch,
  Landmark,
  Loader2,
  PieChart,
  Settings2,
  ShieldCheck,
  Telescope,
  UserCheck,
} from "lucide-react";
import DeskBoard, { type DeskBoardSnapshot } from "@/components/admin/DeskBoard";
import IntelligenceDesk from "@/components/admin/IntelligenceDesk";
import { toPersianDigits } from "@/lib/format";
import {
  buildCommandQuestions,
  type CommandQuestion,
  type CommandQuestionKey,
  type CommandQuestionState,
} from "@/lib/intelligence/command-desk";
import type { IntelligenceDeskViewModel } from "@/lib/intelligence/board";

const QUESTION_ICON: Record<CommandQuestionKey, ReactNode> = {
  happened: <CalendarDays size={18} />,
  meaning: <Telescope size={18} />,
  markets: <Landmark size={18} />,
  scenarios: <GitBranch size={18} />,
  portfolio: <PieChart size={18} />,
  decisions: <FileQuestion size={18} />,
};

const STATE_TONE: Record<
  CommandQuestionState,
  { label: string; color: string; background: string; icon: ReactNode }
> = {
  ready: {
    label: "آماده",
    color: "var(--success)",
    background: "var(--surface-2)",
    icon: <CheckCircle2 size={13} />,
  },
  // «نیازمند توجه» سه چیزِ متفاوت را یک‌کاسه می‌کرد. حالا هر کدام برچسب و
  // رنگِ خودش را دارد: انتظارِ انسان و پیکربندی‌نشده آبیِ برند (تصمیم)، کهنه
  // طلایی (دادهٔ سالمِ قدیمی).
  awaiting_review: {
    label: "منتظرِ بازبینی",
    color: "var(--navy)",
    background: "rgba(30,58,138,0.10)",
    icon: <UserCheck size={13} />,
  },
  unconfigured: {
    label: "پیکربندی نشده",
    color: "var(--navy)",
    background: "rgba(30,58,138,0.08)",
    icon: <Settings2 size={13} />,
  },
  stale: {
    label: "کهنه",
    color: "var(--gold)",
    background: "var(--gold-tint)",
    icon: <Clock3 size={13} />,
  },
  empty: {
    label: "هنوز ثبت نشده",
    color: "var(--text-3)",
    background: "var(--surface-2)",
    icon: <CircleSlash size={13} />,
  },
  loading: {
    label: "در حال دریافت",
    color: "var(--text-2)",
    background: "var(--surface-2)",
    icon: <Loader2 className="motion-safe:animate-spin" size={13} />,
  },
  unavailable: {
    label: "در دسترس نیست",
    color: "var(--danger)",
    background: "var(--surface-2)",
    icon: <Activity size={13} />,
  },
};

function QuestionCard({ item }: { item: CommandQuestion }) {
  const tone = STATE_TONE[item.state];
  const titleId = `command-question-${item.key}`;

  return (
    <article
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col rounded-xl border p-4 shadow-institutional"
      style={{
        borderColor: "var(--line)",
        borderRightColor: tone.color,
        borderRightWidth: 3,
        background: "var(--surface)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--surface-2)", color: "var(--gold)" }}
            aria-hidden
          >
            {QUESTION_ICON[item.key]}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold" style={{ color: "var(--text-3)" }}>
              پرسش {toPersianDigits(item.order)}
            </p>
            <h2 id={titleId} className="mt-0.5 text-[13px] font-extrabold leading-6" style={{ color: "var(--text)" }}>
              {item.question}
            </h2>
          </div>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold"
          style={{ color: tone.color, background: tone.background }}
        >
          {tone.icon}
          {tone.label}
        </span>
      </div>

      <p className="mt-3 text-[14px] font-extrabold leading-7" style={{ color: "var(--text)" }}>
        {item.answer}
      </p>
      <p className="mt-1 text-[11px] leading-6" style={{ color: "var(--text-2)" }}>
        {item.detail}
      </p>

      {item.facts.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: "var(--line)" }}>
          {item.facts.map((fact) => (
            <li key={fact} className="flex items-start gap-2 text-[11px] leading-5" style={{ color: "var(--text-2)" }}>
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--gold)" }} aria-hidden />
              <span>{fact}</span>
            </li>
          ))}
        </ul>
      )}

      <a
        href={item.href}
        className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start pt-3 text-[11px] font-bold focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2"
        style={{ color: "var(--gold)" }}
      >
        {item.linkLabel}
        <ArrowLeft size={13} aria-hidden />
      </a>
    </article>
  );
}

const SPECIALIST_ENGINES = [
  { href: "/admin/radar", label: "رادار بازار", detail: "پهنا، جریان پول و نقاط غیرعادی" },
  { href: "/admin/fx", label: "موتور ارز", detail: "سناریوها و مدل‌های تخصصی ارز" },
  { href: "/codal", label: "کدال", detail: "اطلاعیه و گزارش‌های شرکت‌ها" },
  { href: "/admin/manage?tab=portfolio", label: "پرتفوی", detail: "نسخه‌ها، موقعیت‌ها و پیگیری" },
] as const;

/**
 * نقطهٔ شروعِ روزانهٔ آرش: شش پاسخ، سپس دو لایهٔ جزئیات.
 * هیچ محاسبه یا دادهٔ جدیدی اینجا ساخته نمی‌شود؛ فقط viewهای تست‌شدهٔ موجود
 * کنار هم قرار می‌گیرند.
 */
export default function ArashCommandDesk({ view }: { view: IntelligenceDeskViewModel }) {
  const [sourceStatus, setSourceStatus] = useState<DeskBoardSnapshot>({
    data: null,
    loading: true,
    error: null,
  });
  const handleSnapshot = useCallback((snapshot: DeskBoardSnapshot) => {
    setSourceStatus(snapshot);
  }, []);
  const questions = useMemo(
    () => buildCommandQuestions(view, sourceStatus),
    [sourceStatus, view]
  );

  return (
    <div className="space-y-7">
      <header
        className="overflow-hidden rounded-2xl border p-5 shadow-institutional sm:p-6"
        style={{ borderColor: "var(--line)", background: "var(--surface)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold"
                style={{ background: "var(--gold-tint)", color: "var(--gold)" }}
              >
                <ShieldCheck size={13} />
                داخلی و تحت تأیید انسان
              </span>
              <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                بریف {view.todayJalali}
              </span>
            </div>
            <h1 className="mt-3 font-display text-2xl font-extrabold sm:text-3xl" style={{ color: "var(--text)" }}>
              میز فرماندهی هوشمندی آرش
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-7" style={{ color: "var(--text-2)" }}>
              یک شروع روزانه برای فهمیدن رخداد، اهمیت، وضعیت بازار، سناریو، اثر سبد و تصمیم‌های باز.
              هر پاسخ به منبع یا گردش تخصصی خودش متصل است؛ دادهٔ غایب با عدد یا روایت جایگزین نمی‌شود.
            </p>
          </div>

          <nav aria-label="بخش‌های میز" className="flex flex-wrap gap-2">
            <a href="#six-questions" className="inline-flex min-h-11 items-center rounded-lg px-3 text-[11px] font-bold" style={{ background: "var(--surface-2)", color: "var(--text)" }}>
              شش پرسش امروز
            </a>
            <a href="#intelligence-workflow" className="inline-flex min-h-11 items-center rounded-lg px-3 text-[11px] font-bold" style={{ background: "var(--surface-2)", color: "var(--text)" }}>
              کارِ تصمیم
            </a>
            <a href="#source-health" className="inline-flex min-h-11 items-center rounded-lg px-3 text-[11px] font-bold" style={{ background: "var(--surface-2)", color: "var(--text)" }}>
              سلامت منابع
            </a>
          </nav>
        </div>
      </header>

      <section id="six-questions" aria-labelledby="six-questions-title" className="scroll-mt-20">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold" style={{ color: "var(--gold)" }}>خلاصهٔ تصمیم‌محور</p>
            <h2 id="six-questions-title" className="mt-1 font-display text-lg font-extrabold" style={{ color: "var(--text)" }}>
              شش پرسش امروز
            </h2>
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
            «ثبت نشده» با «اتفاقی نیفتاده» یکسان نیست.
          </p>
        </div>
        <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-2">
          {questions.map((item) => <QuestionCard key={item.key} item={item} />)}
        </div>
      </section>

      <section id="intelligence-workflow" aria-labelledby="workflow-title" className="scroll-mt-20 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold" style={{ color: "var(--gold)" }}>لایهٔ بررسی و اقدام انسانی</p>
            <h2 id="workflow-title" className="mt-1 font-display text-lg font-extrabold" style={{ color: "var(--text)" }}>
              کارِ تصمیم امروز
            </h2>
          </div>
          <Link href="/admin/intelligence" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold" style={{ background: "var(--surface-2)", color: "var(--gold)" }}>
            نمای تخصصی و تاریخچه
            <ArrowLeft size={13} />
          </Link>
        </div>
        <IntelligenceDesk {...view} />
      </section>

      <section aria-labelledby="engines-title" className="space-y-3">
        <div>
          <p className="text-[10px] font-bold" style={{ color: "var(--gold)" }}>جزئیات، نه صفحهٔ شروع</p>
          <h2 id="engines-title" className="mt-1 font-display text-lg font-extrabold" style={{ color: "var(--text)" }}>
            موتورهای تخصصی
          </h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {SPECIALIST_ENGINES.map((engine) => (
            <Link
              key={engine.href}
              href={engine.href}
              className="group min-h-24 rounded-xl border p-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2"
              style={{ borderColor: "var(--line)", background: "var(--surface)" }}
            >
              <span className="flex items-center justify-between gap-2 text-[12px] font-extrabold" style={{ color: "var(--text)" }}>
                {engine.label}
                <ArrowLeft size={14} style={{ color: "var(--gold)" }} />
              </span>
              <span className="mt-1.5 block text-[10px] leading-5" style={{ color: "var(--text-3)" }}>
                {engine.detail}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section id="source-health" aria-labelledby="source-health-title" className="scroll-mt-20 space-y-3">
        <div>
          <p className="text-[10px] font-bold" style={{ color: "var(--gold)" }}>پشت صحنهٔ اعتماد</p>
          <h2 id="source-health-title" className="mt-1 font-display text-lg font-extrabold" style={{ color: "var(--text)" }}>
            سلامت منابع و عملیات
          </h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-6" style={{ color: "var(--text-2)" }}>
            این بخش علت قابل‌اعتماد یا غیرقابل‌استفاده‌بودن پاسخ‌های بالا را نشان می‌دهد؛ شمارش جدول، خودِ تحلیل نیست.
          </p>
        </div>
        <DeskBoard onSnapshot={handleSnapshot} />
      </section>
    </div>
  );
}
