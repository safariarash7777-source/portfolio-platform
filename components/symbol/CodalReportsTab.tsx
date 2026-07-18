"use client";

// T5-2 — تب «گزارش‌های کدال» نماد:
// ۱) فهرست گزارش‌های پردازش‌شده (codal_reports — از سرور به‌صورت prop می‌آید).
// ۲) دکمهٔ «دریافت فهرست» → /api/codal-list که از Supabase (جدول codal_reports) می‌خواند؛
//    Vercel→Liara مسدود است، پس فراخوانی زندهٔ رله حذف شد (فیکس معماری T5).
// ۳) لینک جست‌وجوی رسمی codal.ir همیشه نمایش داده می‌شود — صادقانه و بدون دادهٔ ساختگی.
// لینک‌ها به codal.ir؛ هیچ واژهٔ تجویزی.

import { useState } from "react";

export type StoredReport = {
  kind: string;          // «ن-۳۰» | «ن-۱۰» | ...
  title: string;
  jdate: string | null;  // تاریخ انتشار (جلالی)
  url: string | null;    // لینک صفحهٔ کدال
};

type LiveItem = {
  title: string;
  kind: string | null;
  date: string | null;
  url: string | null;
};

function normalizeLive(j: unknown): LiveItem[] {
  const root = (j && typeof j === "object" ? (j as Record<string, unknown>) : {});
  const arr = Array.isArray(root.data) ? root.data : [];
  return arr
    .map((a): LiveItem | null => {
      if (!a || typeof a !== "object") return null;
      const o = a as Record<string, unknown>;
      const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
      const title = s(o.title);
      if (!title) return null;
      return { title, kind: s(o.kind), date: s(o.date), url: s(o.url) };
    })
    .filter((x): x is LiveItem => x !== null);
}

const codalHref = (u: string | null): string | null => {
  if (!u) return null;
  if (u.startsWith("http")) return u;
  return `https://codal.ir${u.startsWith("/") ? "" : "/"}${u}`;
};

export default function CodalReportsTab({
  symbol,
  stored,
}: {
  symbol: string;
  stored: StoredReport[];
}) {
  const [live, setLive] = useState<LiveItem[] | null>(null);
  const [liveState, setLiveState] = useState<"idle" | "loading" | "error">("idle");

  const codalSearchUrl = `https://codal.ir/ReportList.aspx?search&Symbol=${encodeURIComponent(symbol)}`;

  const loadAll = () => {
    setLiveState("loading");
    fetch(`/api/codal-list?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        setLive(normalizeLive(j));
        setLiveState("idle");
      })
      .catch(() => setLiveState("error"));
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="text-sm font-bold">گزارش‌های پردازش‌شده</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          گزارش‌هایی که موتور دادهٔ ما از کدال دریافت و پردازش کرده است (منبع نمودارهای بنیادی).
        </p>
        {stored.length > 0 ? (
          <ul className="mt-3 divide-y divide-border">
            {stored.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-2 text-xs">
                <div className="min-w-0">
                  <span className="ml-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px]">{r.kind}</span>
                  {r.url ? (
                    <a
                      href={codalHref(r.url) ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:underline"
                    >
                      {r.title}
                    </a>
                  ) : (
                    <span className="font-medium">{r.title}</span>
                  )}
                </div>
                <span className="shrink-0 text-muted-foreground">{r.jdate ?? ""}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            هنوز گزارشی برای این نماد پردازش نشده است. صف بک‌فیل آرشیو کدال به‌تدریج پوشش را گسترش می‌دهد.
          </p>
        )}
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">همهٔ اطلاعیه‌های کدال</h3>
          {live === null && (
            <button
              type="button"
              onClick={loadAll}
              disabled={liveState === "loading"}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
            >
              {liveState === "loading" ? "در حال دریافت…" : "دریافت فهرست"}
            </button>
          )}
        </div>
        {liveState === "error" && (
          <p className="mt-3 text-xs text-muted-foreground">
            دریافت فهرست زنده ممکن نشد. کمی بعد دوباره تلاش کنید.
          </p>
        )}
        {live !== null && (
          live.length > 0 ? (
            <ul className="mt-3 divide-y divide-border">
              {live.map((a, i) => (
                <li key={i} className="py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      {a.kind && (
                        <span className="ml-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px]">{a.kind}</span>
                      )}
                      {codalHref(a.url) ? (
                        <a href={codalHref(a.url)!} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                          {a.title}
                        </a>
                      ) : (
                        <span className="font-medium">{a.title}</span>
                      )}
                    </div>
                    <span className="shrink-0 text-muted-foreground">{a.date ?? ""}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              هنوز اطلاعیهٔ ذخیره‌شده‌ای برای این نماد نداریم؛ فهرست کامل را در خود کدال ببینید.
            </p>
          )
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          منبع: codal.ir —{" "}
          <a href={codalSearchUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--gold)] hover:underline">
            مشاهدهٔ همهٔ اطلاعیه‌های «{symbol}» در سایت کدال
          </a>
        </p>
      </div>
    </div>
  );
}
