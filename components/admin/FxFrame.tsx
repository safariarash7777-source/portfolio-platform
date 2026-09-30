"use client";

import { useState } from "react";
import { Maximize2, Minimize2, RotateCw } from "lucide-react";

export default function FxFrame({ src }: { src: string }) {
  const [full, setFull] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  return (
    <div className={full ? "fixed inset-0 z-50 flex flex-col gap-3 p-3" : "flex flex-col gap-3"}
      style={full ? { background: "var(--bg)" } : undefined}>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { setLoading(true); setNonce((n) => n + 1); }}
          className="btn btn-ghost flex items-center gap-2 text-sm">
          <RotateCw size={16} />تازه‌سازی
        </button>
        <button type="button" onClick={() => setFull((value) => !value)}
          className="btn btn-ghost flex items-center gap-2 text-sm" aria-pressed={full}>
          {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          {full ? "خروج از تمام‌صفحه" : "تمام‌صفحه"}
        </button>
        {loading && <span className="text-xs" style={{ color: "var(--text-3)" }}>در حال بارگذاری داشبورد…</span>}
      </div>
      <div className="relative flex-1 overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--line)", background: "var(--surface)", minHeight: full ? 0 : "78vh" }}>
        <iframe key={nonce} src={src} title="داشبورد کامل نرخ ارز"
          onLoad={() => setLoading(false)} className="h-full w-full"
          style={{ border: 0, display: "block", minHeight: full ? "100%" : "78vh" }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
          referrerPolicy="no-referrer" />
      </div>
    </div>
  );
}
