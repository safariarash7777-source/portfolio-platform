"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { faNum, faDateLabel } from "./adminFormat";
import {
  buildUsersCsv,
  downloadCsv,
  csvFilename,
  type AdminUserRow,
} from "./usersCsv";
import UserDetailDrawer from "./UserDetailDrawer";

const PAGE_SIZE = 25;
const RISK_OPTIONS = ["محافظه‌کار", "متعادل", "تهاجمی", "بسیار تهاجمی"];
const RISK_COLORS: Record<string, string> = {
  "محافظه‌کار": "var(--success)",
  "متعادل": "var(--navy)",
  "تهاجمی": "var(--warning)",
  "بسیار تهاجمی": "var(--danger)",
};

function isMissingFunction(e: { code?: string; message?: string } | null): boolean {
  if (!e) return false;
  const msg = (e.message ?? "").toLowerCase();
  return e.code === "PGRST202" || /could not find the function|does not exist|schema cache/.test(msg);
}

export default function UsersModule({
  initialRisk,
  initialQuiz,
  initialPage,
}: {
  initialRisk: string;
  initialQuiz: string;
  initialPage: number;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // NOTE: search is intentionally kept OUT of the URL — it can contain a
  // national_id, which must never appear in a URL/history/logs.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [risk, setRisk] = useState(initialRisk);
  const [quiz, setQuiz] = useState(initialQuiz);
  const [page, setPage] = useState(initialPage);

  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notInstalled, setNotInstalled] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);

  // debounce search (400ms); reset to page 1 on real changes (not on mount)
  const firstDebounce = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      if (!firstDebounce.current) setPage(1);
      firstDebounce.current = false;
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // keep filter/page state in the URL (search excluded on purpose)
  useEffect(() => {
    const params = new URLSearchParams();
    if (risk) params.set("risk", risk);
    if (quiz) params.set("quiz", quiz);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [risk, quiz, page, pathname, router]);

  // fetch
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("admin_users_list", {
        p_search: debouncedSearch || null,
        p_risk: risk || null,
        p_quiz: quiz || null,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      });
      if (!alive) return;
      if (error) {
        if (isMissingFunction(error)) setNotInstalled(true);
        else setErrMsg(error.message || "خطا در دریافت کاربران.");
        setRows([]);
        setTotal(0);
        setLoading(false);
        return;
      }
      const list = (data as AdminUserRow[]) ?? [];
      setRows(list);
      setTotal(list.length ? Number(list[0].total_count) : 0);
      setNotInstalled(false);
      setErrMsg(null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [debouncedSearch, risk, quiz, page]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("admin_users_list", {
        p_search: debouncedSearch || null,
        p_risk: risk || null,
        p_quiz: quiz || null,
        p_limit: 10000,
        p_offset: 0,
      });
      if (error) throw error;
      downloadCsv(csvFilename(), buildUsersCsv((data as AdminUserRow[]) ?? []));
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "خطا در ساخت خروجی CSV.");
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setRisk("");
    setQuiz("");
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const hasFilters = !!(search || risk || quiz);

  if (notInstalled) return <InstallBanner />;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1"
          style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
        >
          <Search size={16} style={{ color: "var(--text-3)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجوی نام، ایمیل، تلفن یا کد ملی…"
            className="bg-transparent outline-none text-sm w-full"
            style={{ color: "var(--text)" }}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="پاک کردن جستجو">
              <X size={14} style={{ color: "var(--text-3)" }} />
            </button>
          )}
        </div>

        <select
          value={risk}
          onChange={(e) => {
            setRisk(e.target.value);
            setPage(1);
          }}
          className="input"
          style={{ width: "auto", minWidth: 150 }}
          aria-label="فیلتر دستهٔ ریسک"
        >
          <option value="">همهٔ پروفایل‌ها</option>
          {RISK_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select
          value={quiz}
          onChange={(e) => {
            setQuiz(e.target.value);
            setPage(1);
          }}
          className="input"
          style={{ width: "auto", minWidth: 150 }}
          aria-label="فیلتر وضعیت آزمون"
        >
          <option value="">آزمون: همه</option>
          <option value="done">آزمون داده</option>
          <option value="pending">آزمون نداده</option>
        </select>

        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || loading || total === 0}
          className="btn btn-outline"
        >
          <Download size={16} />
          {exporting ? "در حال ساخت…" : "خروجی CSV"}
        </button>
      </div>

      {/* Count + clear */}
      <div className="flex items-center justify-between text-sm">
        <span style={{ color: "var(--text-3)" }}>
          {loading ? "در حال بارگذاری…" : `${faNum(total)} کاربر`}
        </span>
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="text-xs font-bold" style={{ color: "var(--navy)" }}>
            پاک کردن فیلترها
          </button>
        )}
      </div>

      {errMsg && (
        <div
          className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
          style={{ background: "rgba(185,28,28,0.06)", border: "1px solid rgba(185,28,28,0.25)", color: "var(--danger)" }}
          dir="ltr"
        >
          <AlertTriangle size={15} />
          {errMsg}
        </div>
      )}

      {/* Table (desktop) */}
      <div className="card-elevated overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--text-3)" }}>
                {["نام", "ایمیل", "تلفن", "کد ملی", "تاریخ عضویت", "پروفایل ریسک", "نمره", "پرتفوی"].map((h) => (
                  <th key={h} className="text-right py-3 px-3 text-xs font-bold border-b" style={{ borderColor: "var(--line)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm" style={{ color: "var(--text-3)" }}>
                    کاربری با این فیلتر یافت نشد.
                  </td>
                </tr>
              ) : (
                rows.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => setSelected(u)}
                    className="border-b cursor-pointer transition-colors hover:bg-[var(--surface-2)]"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <td className="py-3 px-3 font-bold" style={{ color: "var(--text)" }}>{u.full_name || "—"}</td>
                    <td className="py-3 px-3" dir="ltr" style={{ color: "var(--text-2)" }}>{u.email || "—"}</td>
                    <td className="py-3 px-3" dir="ltr" style={{ color: "var(--text-2)" }}>{u.phone || "—"}</td>
                    <td className="py-3 px-3" dir="ltr" style={{ color: "var(--text-2)" }}>{u.national_id || "—"}</td>
                    <td className="py-3 px-3" style={{ color: "var(--text-2)" }}>{faDateLabel(u.joined_at)}</td>
                    <td className="py-3 px-3"><RiskBadge cat={u.last_risk_category} /></td>
                    <td className="py-3 px-3 text-center" dir="ltr" style={{ color: "var(--navy)", fontWeight: 700 }}>
                      {u.last_score != null ? faNum(u.last_score) : "—"}
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-xs font-bold" style={{ color: u.has_portfolio ? "var(--success)" : "var(--text-3)" }}>
                        {u.has_portfolio ? "دارد" : "ندارد"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cards (mobile) */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <SkeletonCards />
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: "var(--text-3)" }}>
            کاربری با این فیلتر یافت نشد.
          </p>
        ) : (
          rows.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setSelected(u)}
              className="card p-4 w-full text-right"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-bold" style={{ color: "var(--text)" }}>{u.full_name || "—"}</span>
                <RiskBadge cat={u.last_risk_category} />
              </div>
              <p className="text-xs mb-2" dir="ltr" style={{ color: "var(--text-2)" }}>{u.email || "—"}</p>
              <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-3)" }}>
                <span>{faDateLabel(u.joined_at)}</span>
                <span style={{ color: u.has_portfolio ? "var(--success)" : "var(--text-3)" }}>
                  {u.has_portfolio ? "پرتفوی: دارد" : "پرتفوی: ندارد"}
                </span>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>
            نمایش {faNum(from)} تا {faNum(to)} از {faNum(total)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn btn-outline"
              style={{ padding: "0.5rem 0.75rem", opacity: page <= 1 ? 0.5 : 1 }}
              aria-label="صفحهٔ قبل"
            >
              <ChevronRight size={16} />
            </button>
            <span className="text-xs font-bold" style={{ color: "var(--text-2)" }}>
              {faNum(page)} / {faNum(totalPages)}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="btn btn-outline"
              style={{ padding: "0.5rem 0.75rem", opacity: page >= totalPages ? 0.5 : 1 }}
              aria-label="صفحهٔ بعد"
            >
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>
      )}

      <UserDetailDrawer user={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function RiskBadge({ cat }: { cat: string | null }) {
  if (!cat) return <span className="text-xs" style={{ color: "var(--text-3)" }}>ارزیابی‌نشده</span>;
  const c = RISK_COLORS[cat] ?? "var(--text-3)";
  return (
    <span
      className="inline-block text-xs font-bold px-2.5 py-1 rounded-full"
      style={{ background: `color-mix(in srgb, ${c} 12%, transparent)`, color: c }}
    >
      {cat}
    </span>
  );
}

function SkeletonTableRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b" style={{ borderColor: "var(--line)" }}>
          {Array.from({ length: 8 }).map((__, j) => (
            <td key={j} className="py-3 px-3">
              <div className="h-4 rounded animate-pulse" style={{ background: "var(--surface-2)" }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function SkeletonCards() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="card p-4">
          <div className="h-4 w-32 rounded animate-pulse" style={{ background: "var(--surface-2)" }} />
          <div className="h-3 w-40 rounded mt-2 animate-pulse" style={{ background: "var(--surface-2)" }} />
        </div>
      ))}
    </>
  );
}

function InstallBanner() {
  return (
    <div className="rounded-2xl p-6" style={{ background: "var(--gold-tint)", border: "1px solid rgba(184,134,11,0.35)" }}>
      <div className="flex items-start gap-3">
        <AlertTriangle size={22} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }} />
        <div>
          <h3 className="font-display font-bold text-base mb-1" style={{ color: "var(--navy-deep)" }}>
            تابعِ فهرست کاربران هنوز نصب نشده است
          </h3>
          <p className="text-sm leading-7" style={{ color: "var(--text-2)" }}>
            برای فعال‌شدنِ این ماژول، فایل زیر را در Supabase اجرا کن:
          </p>
          <code
            dir="ltr"
            className="mt-2 inline-block rounded-lg px-3 py-1.5 text-xs"
            style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--navy-deep)" }}
          >
            sql/admin_users_module.sql
          </code>
          <p className="text-xs mt-2 leading-6" style={{ color: "var(--text-3)" }}>
            مسیر: Supabase → SQL Editor → محتوای فایل را جای‌گذاری کن → Run. سپس این صفحه را تازه کن.
          </p>
        </div>
      </div>
    </div>
  );
}
