"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Settings2, FileText, ShieldAlert, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { faNum, faDateLabel } from "./adminFormat";
import type { AdminUserRow } from "./usersCsv";

const DAY_MS = 24 * 60 * 60 * 1000;
const VALIDITY_DAYS = 180;

type Assessment = { total_score: number | null; risk_category: string; created_at: string };
type Allocation = { asset?: string; pct?: number; note?: string };
type Portfolio = { allocations: Allocation[] | null; notes: string | null; updated_at: string | null };
type Version = { version: number; created_at: string };

const RISK_COLORS: Record<string, string> = {
  "محافظه‌کار": "var(--success)",
  "متعادل": "var(--navy)",
  "تهاجمی": "var(--warning)",
  "بسیار تهاجمی": "var(--danger)",
};

function isMissingRelation(e: { code?: string; message?: string } | null): boolean {
  if (!e) return false;
  const msg = (e.message ?? "").toLowerCase();
  return e.code === "42P01" || e.code === "PGRST205" || /could not find the table|does not exist/.test(msg);
}

export default function UserDetailDrawer({
  user,
  onClose,
}: {
  user: AdminUserRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Assessment[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [versions, setVersions] = useState<Version[] | null>(null); // null = table not installed
  const [forcedExpiredAt, setForcedExpiredAt] = useState<string | null>(null);
  const [expiring, setExpiring] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setLoading(true);
    setHistory([]);
    setPortfolio(null);
    setVersions(null);
    setForcedExpiredAt(null);

    (async () => {
      const supabase = createClient();
      const [hRes, pRes, vRes, rRes] = await Promise.all([
        supabase
          .from("risk_assessments")
          .select("total_score, risk_category, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("portfolios")
          .select("allocations, notes, updated_at")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("portfolio_versions")
          .select("version, created_at")
          .eq("user_id", user.id)
          .order("version", { ascending: false }),
        supabase
          .from("risk_revalidations")
          .select("expired_at")
          .eq("user_id", user.id)
          .order("expired_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!alive) return;

      setHistory((hRes.data as Assessment[]) ?? []);
      setPortfolio((pRes.data as Portfolio) ?? null);
      // versions table is optional; if it's not installed, keep null and show an honest note
      setVersions(isMissingRelation(vRes.error) ? null : ((vRes.data as Version[]) ?? []));
      setForcedExpiredAt(isMissingRelation(rRes.error) ? null : ((rRes.data?.expired_at as string) ?? null));
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [user]);

  const handleForceExpire = async () => {
    if (!user) return;
    setExpiring(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("force_expire_risk", { p_user: user.id, p_reason: null });
      if (!error) {
        setForcedExpiredAt(new Date().toISOString());
        router.refresh();
      }
    } finally {
      setExpiring(false);
    }
  };

  if (!user) return null;

  const alloc = Array.isArray(portfolio?.allocations) ? portfolio!.allocations! : [];

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label="جزئیات کاربر">
      <div className="absolute inset-0" style={{ background: "rgba(15,23,42,0.5)" }} onClick={onClose} aria-hidden />
      <aside
        className="absolute top-0 left-0 h-full w-full sm:w-[460px] max-w-full flex flex-col shadow-xl overflow-y-auto"
        style={{ background: "var(--surface)" }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b"
          style={{ background: "var(--surface)", borderColor: "var(--line)" }}
        >
          <div>
            <h2 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
              {user.full_name || "بدون نام"}
            </h2>
            <p className="text-xs mt-0.5" dir="ltr" style={{ color: "var(--text-3)" }}>
              {user.email || "—"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="بستن" className="btn btn-ghost" style={{ padding: "0.5rem" }}>
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Profile */}
          <Section title="اطلاعات کاربر">
            <dl className="grid grid-cols-1 gap-2.5 text-sm">
              <Field label="تلفن" value={user.phone || "—"} ltr />
              <Field label="کد ملی" value={user.national_id || "—"} ltr />
              <Field label="تاریخ عضویت" value={faDateLabel(user.joined_at)} />
              <Field
                label="وضعیت پرتفوی"
                value={user.has_portfolio ? "دارد" : "ندارد"}
              />
            </dl>
          </Section>

          {/* Assessment history */}
          <Section title="تاریخچهٔ ارزیابی ریسک">
            {loading ? (
              <SkeletonRows n={2} />
            ) : history.length === 0 ? (
              <Empty msg="این کاربر هنوز آزمون ریسکی تکمیل نکرده است." />
            ) : (
              <ul className="flex flex-col gap-2">
                {history.map((a, i) => (
                  <li
                    key={`${a.created_at}-${i}`}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
                  >
                    <span
                      className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{
                        background: `color-mix(in srgb, ${RISK_COLORS[a.risk_category] ?? "var(--text-3)"} 12%, transparent)`,
                        color: RISK_COLORS[a.risk_category] ?? "var(--text-3)",
                      }}
                    >
                      {a.risk_category}
                    </span>
                    <span className="text-sm font-bold" style={{ color: "var(--navy)" }}>
                      نمره: {a.total_score != null ? faNum(a.total_score) : "—"}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>
                      {faDateLabel(a.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Revalidation status + force-expire */}
          <Section title="اعتبارسنجی پروفایل ریسک">
            {loading ? (
              <SkeletonRows n={1} />
            ) : (
              (() => {
                const last = history[0]?.created_at ?? null;
                if (!last) return <Empty msg="بدون ارزیابی — چیزی برای انقضا نیست." />;
                const now = Date.now();
                const expiresAt = new Date(last).getTime() + VALIDITY_DAYS * DAY_MS;
                const forced =
                  forcedExpiredAt != null &&
                  new Date(forcedExpiredAt).getTime() > new Date(last).getTime() &&
                  new Date(forcedExpiredAt).getTime() <= now;
                const isExpired = forced || now > expiresAt;
                return (
                  <div className="space-y-3">
                    <div
                      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold"
                      style={{
                        background: isExpired ? "rgba(185,28,28,0.08)" : "rgba(21,128,61,0.08)",
                        color: isExpired ? "var(--danger)" : "var(--success)",
                      }}
                    >
                      {isExpired ? <ShieldAlert size={15} /> : <CheckCircle2 size={15} />}
                      {isExpired
                        ? forced
                          ? "منقضی‌شده (دستیِ مدیر)"
                          : "منقضی‌شده (بیش از ۱۸۰ روز)"
                        : `معتبر تا ${faDateLabel(new Date(expiresAt).toISOString())}`}
                    </div>
                    {!isExpired && (
                      <button
                        type="button"
                        onClick={handleForceExpire}
                        disabled={expiring}
                        className="btn btn-outline w-full"
                        style={{ fontSize: "0.8rem", color: "var(--danger)", borderColor: "rgba(185,28,28,0.4)" }}
                      >
                        <ShieldAlert size={14} />
                        {expiring ? "در حال انقضا..." : "انقضای دستی پروفایل"}
                      </button>
                    )}
                  </div>
                );
              })()
            )}
          </Section>

          {/* Current portfolio */}
          <Section title="پرتفوی فعلی">
            {loading ? (
              <SkeletonRows n={3} />
            ) : !portfolio || alloc.length === 0 ? (
              <Empty msg="برای این کاربر پرتفویی ثبت نشده است." />
            ) : (
              <div className="space-y-2">
                {alloc.map((row, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
                  >
                    <span className="text-sm font-bold" style={{ color: "var(--navy-deep)" }}>
                      {row.asset || "—"}
                    </span>
                    {row.note ? (
                      <span className="text-xs flex-1 mx-2 truncate" style={{ color: "var(--text-3)" }}>
                        {row.note}
                      </span>
                    ) : null}
                    <span className="text-sm font-bold" style={{ color: "var(--gold)" }}>
                      ٪{faNum(Number(row.pct) || 0)}
                    </span>
                  </div>
                ))}
                {portfolio.notes ? (
                  <p className="text-xs leading-6 rounded-xl px-3 py-2.5" style={{ background: "var(--gold-tint)", color: "var(--navy-deep)" }}>
                    <FileText size={12} className="inline ml-1" />
                    {portfolio.notes}
                  </p>
                ) : null}
                {portfolio.updated_at ? (
                  <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                    آخرین به‌روزرسانی: {faDateLabel(portfolio.updated_at)}
                  </p>
                ) : null}
              </div>
            )}
          </Section>

          {/* Version history (optional table) */}
          <Section title="نسخه‌های پرتفوی">
            {loading ? (
              <SkeletonRows n={2} />
            ) : versions === null ? (
              <Empty msg="جدول نسخه‌های پرتفوی (portfolio_versions) نصب نیست؛ فقط پرتفوی فعلی بالا نمایش داده می‌شود." />
            ) : versions.length === 0 ? (
              <Empty msg="نسخه‌ای ثبت نشده است." />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {versions.map((v) => (
                  <li key={v.version} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg" style={{ background: "var(--surface-2)" }}>
                    <span className="font-bold" style={{ color: "var(--navy-deep)" }}>نسخهٔ {faNum(v.version)}</span>
                    <span style={{ color: "var(--text-3)" }}>{faDateLabel(v.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Action → existing allocation flow (untouched, Phase 4 redesigns it) */}
          <Link href="/admin/manage?tab=portfolio" className="btn btn-gold w-full">
            <Settings2 size={16} />
            تخصیص / ویرایش پرتفوی
          </Link>
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-bold mb-3" style={{ color: "var(--text-3)", letterSpacing: "0.02em" }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt style={{ color: "var(--text-3)" }}>{label}</dt>
      <dd dir={ltr ? "ltr" : undefined} className="font-bold" style={{ color: "var(--text)" }}>
        {value}
      </dd>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <p className="text-sm rounded-xl px-3 py-4 text-center" style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>
      {msg}
    </p>
  );
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-10 rounded-xl animate-pulse" style={{ background: "var(--surface-2)" }} />
      ))}
    </div>
  );
}
