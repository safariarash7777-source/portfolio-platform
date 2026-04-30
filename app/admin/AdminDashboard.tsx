"use client";

import { useState } from "react";
import {
  Users,
  Wallet,
  Activity,
  TrendingUp,
  Mail,
  ShieldCheck,
  Search,
} from "lucide-react";

const KPIS = [
  { label: "کل کاربران",         value: "۱٬۲۴۸", delta: "+۱۲٪",  icon: <Users size={18} />,        tone: "navy" },
  { label: "ثبت‌نام لیست انتظار", value: "۸۹۶",   delta: "+۲۴٪",  icon: <Mail size={18} />,         tone: "navy" },
  { label: "ارزیابی‌های ریسک",     value: "۴۲۰",   delta: "+۸٪",   icon: <ShieldCheck size={18} />,  tone: "navy" },
  { label: "اشتراک‌های فعال",      value: "۱۸۲",   delta: "+۵٪",   icon: <Wallet size={18} />,       tone: "gold" },
];

const WAITLIST_DEMO = [
  { email: "ali.k@example.com",     date: "۱۴۰۴/۰۲/۰۸", status: "تأیید شده" },
  { email: "sara.m@example.com",    date: "۱۴۰۴/۰۲/۰۷", status: "تأیید شده" },
  { email: "h.rezaei@example.com",  date: "۱۴۰۴/۰۲/۰۷", status: "در انتظار" },
  { email: "n.amini@example.com",   date: "۱۴۰۴/۰۲/۰۶", status: "تأیید شده" },
  { email: "m.tahmasbi@example.com",date: "۱۴۰۴/۰۲/۰۶", status: "در انتظار" },
];

const RISK_DISTRIBUTION = [
  { label: "محافظه‌کار",     pct: 32, color: "#15803D" },
  { label: "متعادل",        pct: 41, color: "#1E3A8A" },
  { label: "تهاجمی",        pct: 19, color: "#B45309" },
  { label: "بسیار تهاجمی",  pct:  8, color: "#B91C1C" },
];

export default function AdminDashboard() {
  const [search, setSearch] = useState("");

  const filtered = WAITLIST_DEMO.filter((r) =>
    r.email.toLowerCase().includes(search.toLowerCase())
  );

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
            نظارت بر کاربران، لیست انتظار، ارزیابی‌های ریسک و اشتراک‌های فعال.
          </p>
        </div>
        <div
          className="flex items-center gap-2 text-xs px-3 py-2 rounded-full"
          style={{
            background: "var(--surface-2)",
            color: "var(--text-3)",
            border: "1px solid var(--line)",
          }}
        >
          <Activity size={14} style={{ color: "var(--success)" }} />
          همه سیستم‌ها سالم
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {KPIS.map((k) => (
          <div key={k.label} className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span
                className="flex items-center justify-center rounded-lg"
                style={{
                  width: 36,
                  height: 36,
                  background: k.tone === "gold" ? "var(--gold-tint)" : "var(--surface-2)",
                  color: k.tone === "gold" ? "var(--navy-deep)" : "var(--navy)",
                }}
              >
                {k.icon}
              </span>
              <span
                className="text-xs font-bold flex items-center gap-1"
                style={{ color: "var(--success)" }}
              >
                <TrendingUp size={12} />
                {k.delta}
              </span>
            </div>
            <div className="text-xs font-bold" style={{ color: "var(--text-3)" }}>
              {k.label}
            </div>
            <div
              className="font-display text-2xl font-bold mt-1"
              style={{ color: "var(--navy-deep)" }}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Two-column: distribution + waitlist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Risk distribution */}
        <div className="card p-6 lg:col-span-1">
          <h3
            className="font-display font-bold text-lg mb-5"
            style={{ color: "var(--navy-deep)" }}
          >
            توزیع پروفایل ریسک کاربران
          </h3>
          <div className="space-y-4">
            {RISK_DISTRIBUTION.map((r) => (
              <div key={r.label}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm" style={{ color: "var(--text)" }}>
                    {r.label}
                  </span>
                  <span className="text-sm font-bold" style={{ color: "var(--navy-deep)" }}>
                    {r.pct}٪
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: "var(--surface-2)" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${r.pct}%`, background: r.color }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs mt-5" style={{ color: "var(--text-3)" }}>
            مجموع ۴۲۰ ارزیابی تکمیل‌شده · بر مبنای داده‌های دموی نمایشی
          </p>
        </div>

        {/* Waitlist table */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
            <h3
              className="font-display font-bold text-lg"
              style={{ color: "var(--navy-deep)" }}
            >
              ثبت‌نام‌های اخیر در لیست انتظار
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
                  <th className="text-right py-3 px-2 text-xs font-bold border-b" style={{ borderColor: "var(--line)" }}>
                    ایمیل
                  </th>
                  <th className="text-right py-3 px-2 text-xs font-bold border-b" style={{ borderColor: "var(--line)" }}>
                    تاریخ ثبت
                  </th>
                  <th className="text-right py-3 px-2 text-xs font-bold border-b" style={{ borderColor: "var(--line)" }}>
                    وضعیت
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.email} className="border-b" style={{ borderColor: "var(--line)" }}>
                    <td className="py-3 px-2" dir="ltr" style={{ color: "var(--text)" }}>
                      {r.email}
                    </td>
                    <td className="py-3 px-2" style={{ color: "var(--text-2)" }}>
                      {r.date}
                    </td>
                    <td className="py-3 px-2">
                      <span
                        className="inline-block text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{
                          background:
                            r.status === "تأیید شده"
                              ? "rgba(21,128,61,0.1)"
                              : "var(--gold-tint)",
                          color:
                            r.status === "تأیید شده"
                              ? "var(--success)"
                              : "var(--navy-deep)",
                        }}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-sm" style={{ color: "var(--text-3)" }}>
                      نتیجه‌ای برای جستجوی شما یافت نشد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
