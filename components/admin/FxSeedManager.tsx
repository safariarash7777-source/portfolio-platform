"use client";
// مدیریت seed های داشبورد ارز از داخل داشبورد — آپلود اکسل، وضعیت منبع، حذف override.
//
// جریان: فایل اکسل → POST /api/admin/fx/seeds (پارس در سرور با همان منطق
// scripts/fx-refresh-seeds.py) → ذخیره در Supabase → refresh صفحه → داشبورد
// بلافاصله از دادهٔ جدید استفاده می‌کند. بدون deploy، بدون PC.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FxDashboardData } from "@/lib/fx/dataLoader";
import { toPersianDigits } from "@/lib/format";

type SeedKind = "macro_annual" | "cpi_monthly" | "ytm_monthly" | "base_rates";

const KIND_INFO: Record<SeedKind, { title: string; hint: string; accept: string }> = {
  macro_annual: {
    title: "دادهٔ کلان سالانه (تورم، نقدینگی، رشد، نفت — ایران و آمریکا)",
    hint: "اکسل «فایل پیش‌بینی PPP» — شیت Data",
    accept: ".xlsx,.xls",
  },
  cpi_monthly: {
    title: "تورم ماهانه (CPI)",
    hint: "اکسل «Iran_Inflation_Complete_Series» — شیت اول",
    accept: ".xlsx,.xls",
  },
  ytm_monthly: {
    title: "بازده اخزا (YTM ماهانه)",
    hint: "اکسل «Macroeconomics-data» — سه ستون میلادی/شمسی/مقدار",
    accept: ".xlsx,.xls",
  },
  base_rates: {
    title: "نرخ‌های پایهٔ تاریخی دلار (تومان به تفکیک سال)",
    hint: "JSON دستی — {\"1381\": 799, \"1390\": 1357, …}",
    accept: "",
  },
};

interface SeedMeta {
  sourceFile: string;
  rows: number;
  range: string;
  uploadedAt: string;
  uploadedBy: string;
}

function faDate(iso: string): string {
  try {
    return toPersianDigits(
      new Date(iso).toLocaleDateString("fa-IR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return iso;
  }
}

export default function FxSeedManager({ seedSources }: { seedSources: FxDashboardData["seedSources"] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<SeedKind | null>(null);
  const [msg, setMsg] = useState<{ kind: SeedKind; ok: boolean; text: string } | null>(null);
  const [baseRatesText, setBaseRatesText] = useState("");
  const [history, setHistory] = useState<Array<{ kind: SeedKind; meta: SeedMeta }>>([]);
  const fileRefs = useRef<Partial<Record<SeedKind, HTMLInputElement | null>>>({});

  useEffect(() => {
    fetch("/api/admin/fx/seeds")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (Array.isArray(j?.history)) setHistory(j.history.slice(0, 8));
      })
      .catch(() => {});
  }, []);

  async function upload(kind: SeedKind) {
    setMsg(null);
    const form = new FormData();
    form.set("kind", kind);
    if (kind === "base_rates") {
      if (!baseRatesText.trim()) {
        setMsg({ kind, ok: false, text: "متن JSON را وارد کن." });
        return;
      }
      form.set("json", baseRatesText);
    } else {
      const input = fileRefs.current[kind];
      const file = input?.files?.[0];
      if (!file) {
        setMsg({ kind, ok: false, text: "ابتدا فایل اکسل را انتخاب کن." });
        return;
      }
      form.set("file", file);
    }
    setBusy(kind);
    try {
      const res = await fetch("/api/admin/fx/seeds", { method: "POST", body: form });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setMsg({
          kind,
          ok: true,
          text: `ذخیره شد: ${toPersianDigits(String(j.meta.rows))} ردیف، بازهٔ ${toPersianDigits(j.meta.range)} — داشبورد از همین حالا از دادهٔ جدید استفاده می‌کند.`,
        });
        router.refresh();
      } else {
        setMsg({ kind, ok: false, text: j?.message ?? `خطا (${res.status})` });
      }
    } catch {
      setMsg({ kind, ok: false, text: "خطای شبکه — دوباره تلاش کن." });
    } finally {
      setBusy(null);
    }
  }

  async function removeOverride(kind: SeedKind) {
    setBusy(kind);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/fx/seeds?kind=${kind}`, { method: "DELETE" });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setMsg({ kind, ok: true, text: "override حذف شد — بازگشت به seed داخل ریپو." });
        router.refresh();
      } else {
        setMsg({ kind, ok: false, text: j?.message ?? `خطا (${res.status})` });
      }
    } catch {
      setMsg({ kind, ok: false, text: "خطای شبکه." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {(Object.keys(KIND_INFO) as SeedKind[]).map((kind) => {
        const info = KIND_INFO[kind];
        const src = seedSources.find((s) => s.kind === kind);
        const isOverride = src?.source === "supabase";
        return (
          <div
            key={kind}
            className="rounded-xl border p-4 space-y-2"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-bold" style={{ color: "var(--navy-deep)" }}>{info.title}</div>
                <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{info.hint}</div>
              </div>
              <span
                className="text-[11px] rounded-full border px-2 py-0.5"
                style={{
                  borderColor: "var(--line)",
                  color: isOverride ? "var(--navy-deep)" : "var(--text-3)",
                  background: isOverride ? "var(--gold-soft, #f5edda)" : "transparent",
                }}
              >
                {isOverride
                  ? `منبع فعال: آپلود زنده (${src?.meta ? faDate(src.meta.uploadedAt) : ""})`
                  : "منبع فعال: seed داخل ریپو"}
              </span>
            </div>

            {isOverride && src?.meta ? (
              <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                فایل: {src.meta.sourceFile} · {toPersianDigits(String(src.meta.rows))} ردیف · بازهٔ {toPersianDigits(src.meta.range)} · توسط {src.meta.uploadedBy}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              {kind === "base_rates" ? (
                <textarea
                  dir="ltr"
                  value={baseRatesText}
                  onChange={(e) => setBaseRatesText(e.target.value)}
                  placeholder='{"1381": 799, "1390": 1357, "1404": 155000, "1405": 174000}'
                  className="w-full rounded-lg border p-2 text-xs font-mono min-h-[72px]"
                  style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-1)" }}
                />
              ) : (
                <input
                  type="file"
                  accept={info.accept}
                  ref={(el) => {
                    fileRefs.current[kind] = el;
                  }}
                  className="text-xs"
                  style={{ color: "var(--text-2)" }}
                />
              )}
              <button
                onClick={() => upload(kind)}
                disabled={busy !== null}
                className="rounded-lg px-4 py-2 text-xs font-bold disabled:opacity-50"
                style={{ background: "var(--navy-deep)", color: "#fff" }}
              >
                {busy === kind ? "در حال پردازش…" : "آپلود و اعمال"}
              </button>
              {isOverride ? (
                <button
                  onClick={() => removeOverride(kind)}
                  disabled={busy !== null}
                  className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
                  style={{ borderColor: "var(--line)", color: "var(--text-2)" }}
                >
                  حذف override (بازگشت به ریپو)
                </button>
              ) : null}
            </div>

            {msg && msg.kind === kind ? (
              <div className="text-xs" style={{ color: msg.ok ? "var(--navy-deep)" : "#b91c1c" }}>{msg.text}</div>
            ) : null}
          </div>
        );
      })}

      {history.length > 0 ? (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
          <div className="text-sm font-bold mb-2" style={{ color: "var(--navy-deep)" }}>نسخه‌های اخیر (تاریخچهٔ آپلودها)</div>
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-3)" }}>
                <th className="text-right p-1 font-normal">نوع</th>
                <th className="text-right p-1 font-normal">فایل</th>
                <th className="text-right p-1 font-normal">بازه</th>
                <th className="text-right p-1 font-normal">زمان</th>
              </tr>
            </thead>
            <tbody style={{ color: "var(--text-2)" }}>
              {history.map((h, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="p-1">{KIND_INFO[h.kind]?.title.split(" (")[0] ?? h.kind}</td>
                  <td className="p-1">{h.meta.sourceFile}</td>
                  <td className="p-1">{toPersianDigits(h.meta.range)}</td>
                  <td className="p-1">{faDate(h.meta.uploadedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[11px] mt-2" style={{ color: "var(--text-3)" }}>
            نسخه‌های قبلی نگه داشته می‌شوند (تا ۲۰ نسخه) — مبنای ارزیابی گذشته‌نگر «دیتای آن روز چه بود».
          </div>
        </div>
      ) : null}
    </div>
  );
}
