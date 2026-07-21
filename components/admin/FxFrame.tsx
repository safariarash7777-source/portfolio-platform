"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Maximize2, Minimize2, RotateCw } from "lucide-react";

/**
 * قابِ داشبوردِ Streamlit.
 *
 * `src` یک توکنِ کوتاه‌عمر دارد که سمتِ سرور امضا شده. توکن فقط برای **ورود**
 * لازم است؛ داشبورد بعد از یک‌بار تأیید، نشست را در session_state نگه می‌دارد.
 * دکمهٔ «تازه‌سازی» صفحه را دوباره از سرور می‌گیرد تا توکنِ نو ساخته شود —
 * برای وقتی که قابْ بیات شده یا داشبورد ری‌استارت شده است.
 */
export default function FxFrame({ src }: { src: string }) {
  const router = useRouter();
  const [full, setFull] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const refresh = () => {
    setLoading(true);
    setNonce((n) => n + 1);
    router.refresh();
  };

  return (
    <div
      className={full ? "fixed inset-0 z-50 flex flex-col p-3" : "flex flex-col gap-3"}
      style={full ? { background: "var(--bg)" } : undefined}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={refresh}
          className="btn btn-ghost flex items-center gap-2 text-sm"
          style={{ padding: "0.4rem 0.75rem" }}
        >
          <RotateCw size={16} />
          تازه‌سازی
        </button>
        <button
          type="button"
          onClick={() => setFull((v) => !v)}
          className="btn btn-ghost flex items-center gap-2 text-sm"
          style={{ padding: "0.4rem 0.75rem" }}
        >
          {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          {full ? "خروج از تمام‌صفحه" : "تمام‌صفحه"}
        </button>
        {loading && (
          <span className="text-xs" style={{ color: "var(--text-3)" }}>
            در حال بارگذاری داشبورد…
          </span>
        )}
      </div>

      <div
        className="relative flex-1 overflow-hidden rounded-2xl border"
        style={{
          borderColor: "var(--line)",
          background: "var(--surface)",
          minHeight: full ? undefined : "78vh",
        }}
      >
        <iframe
          key={nonce}
          src={src}
          title="داشبورد نرخ ارز"
          onLoad={() => setLoading(false)}
          className="h-full w-full"
          style={{ border: 0, display: "block", minHeight: full ? "100%" : "78vh" }}
          // داشبورد روی دامنهٔ دیگری است؛ sandbox را حذف نکنید، اما
          // allow-scripts + allow-same-origin برای کارکردِ WebSocket لازم است.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}
