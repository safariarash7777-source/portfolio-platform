"use client";

// T5-2 — تب «گزارش‌های کدال» نماد:
// ۱) فهرست گزارش‌های موجود (codal_reports — از سرور به‌صورت prop می‌آید).
// ۲) دکمهٔ «همهٔ اطلاعیه‌ها» → لود زنده از /api/codal-list (رله، کش ۱۰دقیقه‌ای).
// لینک‌ها به codal.ir؛ هیچ واژهٔ تجویزی.

import { useState } from "react";

export type StoredReport = {
  kind: string;          // «ن-۳۰» | «ن-۱۰» | ...
  title: string;
  jdate: string | null;  // تاریخ انتشار (جلالی)
  url: string | null;    // لینک صفحهٔ کدال
};

type LiveItem = {
  title: string | null;
  symbol: string | null;
  date: string | null;
  time: string | null;
  url: string | null;
  excel: string | null;
  pdf: string | null;
};

function normalizeLive(j: unknown): LiveItem[] {
  const root = (j && typeof j === "object" ? (j as Record<string, unknown>) : {});
  const arr = Array.isArray(root.data) ? root.data : Array.isArray(j) ? (j as unknown[]) : [];
  return arr
    .map((a): LiveItem | null => {
      if (!a || typeof a !== "object") return null;
      const o = a as Record<string, unknown>;
      const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
      const title = s(o.title) ?? s(o.Title);
      if (!title) return null;
      return {
        title,
        symbol: s(o.symbol) ?? s(o.Symbol),
        date: s(o.date_publish) ?? s(o.PublishDateTime) ?? s(o.date),
        time: s(o.time_publish) ?? null,
        url: s(o.link) ?? s(o.Url) ?? s(o.url),
        excel: s(o.link_excel) ?? s(o.ExcelUrl),
        pdf: s(o.link_pdf) ?? s(o.PdfUrl),
      };
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
              {liveState === "loading" ? "در حال دریافت…" : "دریافت فهرست زنده"}
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
                    <span className="min-w-0 font-medium">{a.title}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {a.date ?? ""}{a.time ? ` ${a.time}` : ""}
                    </span>
                  </div>
                  <div className="mt-1 flex gap-3 text-[11px]">
                    {codalHref(a.url) && (
                      <a href={codalHref(a.url)!} target="_blank" rel="noopener noreferrer" className="text-[var(--gold)] hover:underline">
                        صفحهٔ اطلاعیه
                      </a>
                    )}
                    {codalHref(a.pdf) && (
                      <a href={codalHref(a.pdf)!} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:underline">
                        PDF
                      </a>
                    )}
                    {codalHref(a.excel) && (
                      <a href={codalHref(a.excel)!} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:underline">
                        اکسل
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">اطلاعیه‌ای از کدال دریافت نشد.</p>
          )
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">منبع: codal.ir — لینک‌ها به سایت رسمی کدال باز می‌شود.</p>
      </div>
    </div>
  );
}
