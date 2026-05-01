"use client";

import { useState } from "react";
import {
  Users,
  PieChart,
  Mail,
  Search,
  PlusCircle,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface UserRow {
  id: string;
  full_name: string;
  national_id: string;
  phone: string;
  email: string;
  role: string;
  risk_category: string | null;
  risk_score: number | null;
  risk_date: string | null;
  has_portfolio: boolean;
}

interface WaitlistRow {
  id: string;
  email: string;
  created_at: string;
}

interface Allocation {
  asset: string;
  pct: number;
  note: string;
}

const RISK_LABELS: Record<string, string> = {
  "محافظه‌کار": "محافظه‌کار",
  "متعادل": "متعادل",
  "تهاجمی": "تهاجمی",
  "بسیار تهاجمی": "بسیار تهاجمی",
};

const RISK_COLORS: Record<string, string> = {
  "محافظه‌کار": "#15803D",
  "متعادل": "#1E3A8A",
  "تهاجمی": "#B45309",
  "بسیار تهاجمی": "#B91C1C",
};

type Tab = "users" | "portfolio" | "waitlist";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "users", label: "کاربران", icon: <Users size={16} /> },
  { id: "portfolio", label: "تخصیص پرتفوی", icon: <PieChart size={16} /> },
  { id: "waitlist", label: "لیست انتظار", icon: <Mail size={16} /> },
];

const EMPTY_ALLOC: Allocation = { asset: "", pct: 0, note: "" };

export default function AdminClient({
  users,
  waitlist,
}: {
  users: UserRow[];
  waitlist: WaitlistRow[];
}) {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <span className="eyebrow">پنل مدیریت</span>
          <h1
            className="font-display text-2xl md:text-3xl font-bold mt-1"
            style={{ color: "var(--navy-deep)" }}
          >
            داشبورد مدیریت پلتفرم
          </h1>
          <p className="text-sm mt-2" style={{ color: "var(--text-2)" }}>
            مدیریت کاربران، تخصیص پرتفوی و پیگیری لیست انتظار.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 md:flex md:gap-3">
          {[
            { l: "کل کاربران", v: users.length },
            { l: "ارزیابی‌شده", v: users.filter((u) => u.risk_category).length },
            { l: "پرتفوی دارند", v: users.filter((u) => u.has_portfolio).length },
          ].map((s) => (
            <div
              key={s.l}
              className="card px-4 py-3 text-center"
              style={{ minWidth: 90 }}
            >
              <div
                className="font-display text-xl font-bold"
                style={{ color: "var(--navy-deep)" }}
              >
                {s.v}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex items-center gap-1 p-1 rounded-xl w-fit"
        style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
            style={{
              background: tab === t.id ? "var(--surface)" : "transparent",
              color: tab === t.id ? "var(--navy-deep)" : "var(--text-2)",
              boxShadow: tab === t.id ? "var(--shadow-sm)" : "none",
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "users" && <UsersTab users={users} />}
      {tab === "portfolio" && <PortfolioTab users={users} />}
      {tab === "waitlist" && <WaitlistTab waitlist={waitlist} />}
    </div>
  );
}

// ─── Tab 1: Users ─────────────────────────────────────────────────────────
function UsersTab({ users }: { users: UserRow[] }) {
  const [search, setSearch] = useState("");
  const filtered = users.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.national_id?.includes(search)
  );

  return (
    <div className="card-elevated p-6">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h3
          className="font-display font-bold text-lg"
          style={{ color: "var(--navy-deep)" }}
        >
          لیست کاربران
        </h3>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
        >
          <Search size={14} style={{ color: "var(--text-3)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجوی نام، ایمیل یا کد ملی..."
            className="bg-transparent outline-none text-sm w-52"
            style={{ color: "var(--text)" }}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--text-3)" }}>
              {["نام و نام خانوادگی", "کد ملی", "موبایل", "ایمیل", "پروفایل ریسک", "امتیاز", "تاریخ آزمون", "پرتفوی"].map(
                (h) => (
                  <th
                    key={h}
                    className="text-right py-3 px-3 text-xs font-bold border-b"
                    style={{ borderColor: "var(--line)" }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="py-10 text-center text-sm"
                  style={{ color: "var(--text-3)" }}
                >
                  کاربری یافت نشد.
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr
                  key={u.id}
                  className="border-b hover:bg-[var(--surface-2)] transition-colors"
                  style={{ borderColor: "var(--line)" }}
                >
                  <td className="py-3 px-3 font-bold" style={{ color: "var(--text)" }}>
                    {u.full_name ?? "—"}
                  </td>
                  <td className="py-3 px-3" dir="ltr" style={{ color: "var(--text-2)" }}>
                    {u.national_id ?? "—"}
                  </td>
                  <td className="py-3 px-3" dir="ltr" style={{ color: "var(--text-2)" }}>
                    {u.phone ?? "—"}
                  </td>
                  <td className="py-3 px-3" dir="ltr" style={{ color: "var(--text-2)" }}>
                    {u.email ?? "—"}
                  </td>
                  <td className="py-3 px-3">
                    {u.risk_category ? (
                      <span
                        className="inline-block text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{
                          background: `${RISK_COLORS[u.risk_category] ?? "#64748B"}18`,
                          color: RISK_COLORS[u.risk_category] ?? "var(--text-3)",
                        }}
                      >
                        {RISK_LABELS[u.risk_category] ?? u.risk_category}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--text-3)" }}>
                        ارزیابی نشده
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center" dir="ltr" style={{ color: "var(--text-2)" }}>
                    {u.risk_score != null ? (
                      <span className="font-bold" style={{ color: "var(--navy)" }}>
                        {u.risk_score}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-3)" }}>—</span>
                    )}
                  </td>
                  <td className="py-3 px-3" style={{ color: "var(--text-2)" }}>
                    {u.risk_date ? (
                      new Date(u.risk_date).toLocaleDateString("fa-IR")
                    ) : (
                      <span style={{ color: "var(--text-3)" }}>—</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {u.has_portfolio ? (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{ background: "rgba(21,128,61,0.1)", color: "var(--success)" }}
                      >
                        <CheckCircle2 size={11} />
                        دارد
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--text-3)" }}>ندارد</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab 2: Portfolio allocation ──────────────────────────────────────────
function PortfolioTab({ users }: { users: UserRow[] }) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [allocations, setAllocations] = useState<Allocation[]>([
    { ...EMPTY_ALLOC },
  ]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const totalPct = allocations.reduce((s, a) => s + (Number(a.pct) || 0), 0);

  const addRow = () => {
    if (allocations.length < 8) setAllocations((a) => [...a, { ...EMPTY_ALLOC }]);
  };

  const removeRow = (i: number) =>
    setAllocations((a) => a.filter((_, idx) => idx !== i));

  const updateRow = (i: number, field: keyof Allocation, value: string | number) =>
    setAllocations((a) => a.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));

  const handleSave = async () => {
    setError("");
    setSuccess(false);

    if (!selectedUserId) { setError("لطفاً یک کاربر انتخاب کنید"); return; }
    if (allocations.some((a) => !a.asset.trim())) { setError("نام دارایی برای همه ردیف‌ها الزامی است"); return; }
    if (totalPct !== 100) { setError(`مجموع درصدها باید ۱۰۰ باشد (اکنون: ${totalPct})`); return; }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error: dbErr } = await supabase.from("portfolios").upsert({
        user_id: selectedUserId,
        allocations,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      if (dbErr) throw dbErr;
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "خطا در ذخیره";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const selectedUser = users.find((u) => u.id === selectedUserId);

  return (
    <div className="card-elevated p-6 space-y-6">
      <h3 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
        تخصیص پرتفوی به کاربر
      </h3>

      {/* User select */}
      <div className="space-y-1.5">
        <label className="block text-sm font-bold" style={{ color: "var(--text-2)" }}>
          انتخاب کاربر
          <span className="mr-1" style={{ color: "var(--danger)" }}>*</span>
        </label>
        <div className="relative">
          <select
            className="input appearance-none"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            disabled={saving}
            style={{ paddingLeft: "2.5rem" }}
          >
            <option value="">— کاربر را انتخاب کنید —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name ?? "بدون نام"} — {u.email ?? ""}
                {u.risk_category ? ` (${RISK_LABELS[u.risk_category] ?? u.risk_category})` : " (ارزیابی نشده)"}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-3)" }}
          />
        </div>
        {selectedUser?.has_portfolio && (
          <p className="text-xs" style={{ color: "var(--warning)" }}>
            این کاربر از قبل پرتفوی دارد. ذخیره، اطلاعات قبلی را بازنویسی می‌کند.
          </p>
        )}
      </div>

      {/* Allocation rows */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold" style={{ color: "var(--text-2)" }}>
            تخصیص دارایی‌ها
          </label>
          <span
            className="text-xs px-2 py-1 rounded-full font-bold"
            style={{
              background: totalPct === 100 ? "rgba(21,128,61,0.1)" : "var(--gold-tint)",
              color: totalPct === 100 ? "var(--success)" : "var(--navy-deep)",
            }}
          >
            مجموع: {totalPct}٪
          </span>
        </div>

        <div
          className="grid text-xs font-bold py-2 px-3 rounded-lg"
          style={{
            color: "var(--text-3)",
            background: "var(--surface-2)",
            gridTemplateColumns: "1fr 90px 1fr 40px",
            gap: "0.75rem",
          }}
        >
          <span>نام دارایی</span>
          <span>درصد (%)</span>
          <span>یادداشت (اختیاری)</span>
          <span />
        </div>

        {allocations.map((row, i) => (
          <div
            key={i}
            className="grid items-center gap-3"
            style={{ gridTemplateColumns: "1fr 90px 1fr 40px" }}
          >
            <input
              type="text"
              className="input"
              placeholder="مثال: صندوق درآمد ثابت"
              value={row.asset}
              onChange={(e) => updateRow(i, "asset", e.target.value)}
              disabled={saving}
            />
            <input
              type="number"
              className="input text-center"
              placeholder="۰"
              min={0}
              max={100}
              value={row.pct || ""}
              onChange={(e) => updateRow(i, "pct", Number(e.target.value))}
              disabled={saving}
              dir="ltr"
            />
            <input
              type="text"
              className="input"
              placeholder="یادداشت..."
              value={row.note}
              onChange={(e) => updateRow(i, "note", e.target.value)}
              disabled={saving}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              disabled={allocations.length <= 1 || saving}
              className="flex items-center justify-center rounded-lg transition-colors"
              style={{
                width: 36,
                height: 36,
                background: "rgba(185,28,28,0.07)",
                color: "var(--danger)",
                border: "1px solid rgba(185,28,28,0.2)",
                opacity: allocations.length <= 1 ? 0.4 : 1,
                cursor: allocations.length <= 1 ? "not-allowed" : "pointer",
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {allocations.length < 8 && (
          <button
            type="button"
            onClick={addRow}
            disabled={saving}
            className="btn btn-outline w-full"
            style={{ fontSize: "0.8rem", padding: "0.5rem" }}
          >
            <PlusCircle size={14} />
            افزودن دارایی
          </button>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="block text-sm font-bold" style={{ color: "var(--text-2)" }}>
          یادداشت مشاور (اختیاری)
        </label>
        <textarea
          className="input resize-none"
          rows={3}
          placeholder="توضیحات تکمیلی برای کاربر..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={saving}
        />
      </div>

      {/* Feedback */}
      {error && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
          style={{
            background: "rgba(185,28,28,0.08)",
            border: "1px solid rgba(185,28,28,0.25)",
            color: "var(--danger)",
          }}
        >
          <AlertCircle size={15} />
          {error}
        </div>
      )}
      {success && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
          style={{
            background: "rgba(21,128,61,0.08)",
            border: "1px solid rgba(21,128,61,0.25)",
            color: "var(--success)",
          }}
        >
          <CheckCircle2 size={15} />
          پرتفوی با موفقیت ذخیره شد.
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        className="btn btn-gold"
        disabled={saving}
      >
        <Save size={16} />
        {saving ? "در حال ذخیره..." : "ذخیره پرتفوی"}
      </button>
    </div>
  );
}

// ─── Tab 3: Waitlist ──────────────────────────────────────────────────────
function WaitlistTab({ waitlist }: { waitlist: WaitlistRow[] }) {
  const [search, setSearch] = useState("");
  const filtered = waitlist.filter((r) =>
    r.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="card-elevated p-6">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h3 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
          لیست انتظار
        </h3>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
        >
          <Search size={14} style={{ color: "var(--text-3)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجوی ایمیل..."
            className="bg-transparent outline-none text-sm w-44"
            style={{ color: "var(--text)" }}
            dir="ltr"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--text-3)" }}>
              {["ایمیل", "تاریخ ثبت"].map((h) => (
                <th
                  key={h}
                  className="text-right py-3 px-3 text-xs font-bold border-b"
                  style={{ borderColor: "var(--line)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  className="py-10 text-center text-sm"
                  style={{ color: "var(--text-3)" }}
                >
                  {waitlist.length === 0
                    ? "هنوز کسی ثبت‌نام نکرده است."
                    : "نتیجه‌ای یافت نشد."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b hover:bg-[var(--surface-2)] transition-colors"
                  style={{ borderColor: "var(--line)" }}
                >
                  <td className="py-3 px-3" dir="ltr" style={{ color: "var(--text)" }}>
                    {r.email}
                  </td>
                  <td className="py-3 px-3" style={{ color: "var(--text-2)" }}>
                    {new Date(r.created_at).toLocaleDateString("fa-IR")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs mt-4" style={{ color: "var(--text-3)" }}>
        مجموع {waitlist.length} ثبت‌نام در لیست انتظار
      </p>
    </div>
  );
}
