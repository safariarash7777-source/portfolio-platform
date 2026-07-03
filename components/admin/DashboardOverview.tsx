"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import KpiCard from "@/components/dashboard/KpiCard";
import UserGrowthChart from "./UserGrowthChart";
import RiskDistributionChart from "./RiskDistributionChart";
import { faNum, faPercent, faRatio } from "./adminFormat";

type Stats = {
  total_users: number;
  new_users_7d: number;
  assessed_users: number;
  portfolio_users: number;
  waitlist_count: number;
};
type GrowthRow = { week_start: string; signups: number };
type DistRow = { risk_category: string; users: number };

type SupaError = { code?: string; message?: string; details?: string } | null;

function isMissingFunction(e: SupaError): boolean {
  if (!e) return false;
  const msg = `${e.message ?? ""} ${e.details ?? ""}`.toLowerCase();
  return (
    e.code === "PGRST202" ||
    /could not find the function|function .* does not exist|schema cache/.test(msg)
  );
}

export default function DashboardOverview() {
  const [loading, setLoading] = useState(true);
  const [notInstalled, setNotInstalled] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [growth, setGrowth] = useState<GrowthRow[]>([]);
  const [dist, setDist] = useState<DistRow[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = createClient();
      const [s, g, d] = await Promise.all([
        supabase.rpc("admin_dashboard_stats"),
        supabase.rpc("admin_user_growth", { p_days: 90 }),
        supabase.rpc("admin_risk_distribution"),
      ]);
      if (!alive) return;

      const firstErr = (s.error || g.error || d.error) as SupaError;
      if (firstErr) {
        if (isMissingFunction(firstErr)) setNotInstalled(true);
        else setErrMsg(firstErr.message || "خطا در دریافت آمار.");
        setLoading(false);
        return;
      }

      setStats(s.data as Stats);
      setGrowth((g.data as GrowthRow[]) ?? []);
      setDist((d.data as DistRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (notInstalled) return <InstallBanner />;
  if (errMsg) return <ErrorState msg={errMsg} />;
  if (loading || !stats) return <DashboardSkeleton />;

  const total = stats.total_users;
  const completion = total > 0 ? (stats.assessed_users / total) * 100 : null;
  const coverage = total > 0 ? (stats.portfolio_users / total) * 100 : null;

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="کاربران کل" value={faNum(stats.total_users)} hint="کاربران عادی (بدون ادمین‌ها)" />
        <KpiCard label="کاربر جدید (۷ روز)" value={faNum(stats.new_users_7d)} hint="ثبت‌نام هفتهٔ اخیر" />
        <KpiCard
          label="نرخ تکمیل آزمون ریسک"
          value={faPercent(completion)}
          hint={total > 0 ? faRatio(stats.assessed_users, total) : "کاربری ثبت نشده"}
        />
        <KpiCard
          label="پوشش پرتفوی"
          value={faPercent(coverage)}
          hint={total > 0 ? faRatio(stats.portfolio_users, total) : "کاربری ثبت نشده"}
        />
        <KpiCard label="لیست انتظار" value={faNum(stats.waitlist_count)} hint="ایمیل‌های ثبت‌شده" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard
          title="رشد کاربران — ۹۰ روز اخیر"
          subtitle="تعداد ثبت‌نام در هر هفته"
        >
          {growth.length === 0 || growth.every((r) => r.signups === 0) ? (
            <EmptyChart msg="هنوز ثبت‌نامی در این بازه ثبت نشده است." />
          ) : (
            <UserGrowthChart data={growth} />
          )}
        </ChartCard>

        <ChartCard
          title="توزیع پروفایل ریسک"
          subtitle="بر اساس آخرین ارزیابیِ هر کاربر"
        >
          {dist.length === 0 ? (
            <EmptyChart msg="هنوز ارزیابی ریسکی ثبت نشده است." />
          ) : (
            <RiskDistributionChart data={dist} />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

// ─── Presentational pieces ────────────────────────────────────────────────

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card-elevated p-5">
      <div className="mb-4">
        <h3 className="font-display font-bold text-base" style={{ color: "var(--navy-deep)" }}>
          {title}
        </h3>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
          {subtitle}
        </p>
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ msg }: { msg: string }) {
  return (
    <div
      className="flex h-[280px] flex-col items-center justify-center gap-2 rounded-xl text-center"
      style={{ background: "var(--surface-2)", border: "1px dashed var(--line)" }}
    >
      <Info size={20} style={{ color: "var(--text-3)" }} />
      <p className="text-sm" style={{ color: "var(--text-3)" }}>
        {msg}
      </p>
    </div>
  );
}

function InstallBanner() {
  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: "var(--gold-tint)",
        border: "1px solid rgba(184,134,11,0.35)",
      }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={22} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }} />
        <div>
          <h3 className="font-display font-bold text-base mb-1" style={{ color: "var(--navy-deep)" }}>
            توابع آماری هنوز نصب نشده‌اند
          </h3>
          <p className="text-sm leading-7" style={{ color: "var(--text-2)" }}>
            برای فعال‌شدنِ کارت‌ها و نمودارها، فایل زیر را در Supabase اجرا کن:
          </p>
          <code
            dir="ltr"
            className="mt-2 inline-block rounded-lg px-3 py-1.5 text-xs"
            style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--navy-deep)" }}
          >
            sql/admin_dashboard_stats.sql
          </code>
          <p className="text-xs mt-2 leading-6" style={{ color: "var(--text-3)" }}>
            مسیر: Supabase → SQL Editor → محتوای فایل را جای‌گذاری کن → Run. سپس این صفحه را تازه کن.
          </p>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ msg }: { msg: string }) {
  return (
    <div
      className="rounded-2xl p-6 flex items-start gap-3"
      style={{ background: "rgba(185,28,28,0.06)", border: "1px solid rgba(185,28,28,0.25)" }}
    >
      <AlertTriangle size={20} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 2 }} />
      <div>
        <h3 className="font-display font-bold text-base mb-1" style={{ color: "var(--navy-deep)" }}>
          خطا در دریافت آمار
        </h3>
        <p className="text-sm leading-7" dir="ltr" style={{ color: "var(--text-2)" }}>
          {msg}
        </p>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="h-3 w-20 rounded animate-pulse" style={{ background: "var(--surface-2)" }} />
            <div className="h-8 w-16 rounded mt-3 animate-pulse" style={{ background: "var(--surface-2)" }} />
            <div className="h-2.5 w-24 rounded mt-3 animate-pulse" style={{ background: "var(--surface-2)" }} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card-elevated p-5">
            <div className="h-4 w-40 rounded animate-pulse" style={{ background: "var(--surface-2)" }} />
            <div className="h-[280px] rounded-xl mt-4 animate-pulse" style={{ background: "var(--surface-2)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
