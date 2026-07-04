"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Star,
  Bell,
  BellOff,
  CandlestickChart,
  TrendingUp,
  TrendingDown,
  Trash2,
  Plus,
  AlertCircle,
  Send,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toPersianDigits } from "@/lib/format";

const CandlestickModal = dynamic(() => import("./CandlestickModal"), { ssr: false });

export interface CryptoRow {
  id: string;
  faName: string;
  symbol: string;
  price: number;
  change24h: number | null;
  image: string | null;
}
interface Alert {
  id: string;
  symbol: string;
  market: string;
  condition: string;
  target_price: number;
  active: boolean;
}

interface Props {
  crypto: CryptoRow[];
  sourceOk: boolean;
  isLoggedIn: boolean;
  telegramLinked: boolean;
  initialWatchlist: string[];
  initialAlerts: Alert[];
}

function fmtUsd(n: number): string {
  const s = n >= 1 ? Math.round(n).toLocaleString("en-US") : String(n);
  return toPersianDigits(s).replace(/,/g, "٬");
}

export default function MarketClient({
  crypto,
  sourceOk,
  isLoggedIn,
  telegramLinked,
  initialWatchlist,
  initialAlerts,
}: Props) {
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set(initialWatchlist));
  const [alerts, setAlerts] = useState<Alert[]>(initialAlerts);
  const [chartId, setChartId] = useState<string | null>(null);
  const [alertFor, setAlertFor] = useState<CryptoRow | null>(null);
  const [error, setError] = useState("");

  const byId = useMemo(() => new Map(crypto.map((c) => [c.id, c])), [crypto]);
  const watched = crypto.filter((c) => watchlist.has(c.id));
  const chartRow = chartId ? byId.get(chartId) ?? null : null;

  const toggleStar = async (id: string) => {
    setError("");
    const supabase = createClient();
    const has = watchlist.has(id);
    // optimistic
    setWatchlist((s) => {
      const n = new Set(s);
      if (has) n.delete(id);
      else n.add(id);
      return n;
    });
    if (has) {
      await supabase.from("watchlist_items").delete().eq("symbol", id).eq("market", "crypto");
    } else {
      if (watchlist.size >= 20) {
        setError("سقف واچ‌لیست ۲۰ نماد است.");
        setWatchlist((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        return;
      }
      const { error: e } = await supabase.from("watchlist_items").insert({ symbol: id, market: "crypto" });
      if (e) {
        setError("افزودن به واچ‌لیست ناموفق بود.");
        setWatchlist((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      }
    }
  };

  const addAlert = (a: Alert) => setAlerts((prev) => [a, ...prev]);
  const removeAlert = async (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    await createClient().from("price_alerts").delete().eq("id", id);
  };
  const toggleAlert = async (a: Alert) => {
    setAlerts((prev) => prev.map((x) => (x.id === a.id ? { ...x, active: !x.active } : x)));
    await createClient().from("price_alerts").update({ active: !a.active }).eq("id", a.id);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 space-y-8">
      {/* Header */}
      <div>
        <span className="eyebrow">رصد بازار</span>
        <h1 className="font-display text-2xl md:text-3xl font-bold mt-1" style={{ color: "var(--navy-deep)" }}>
          بازار لحظه‌ای
        </h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-2)" }}>
          قیمت‌های زندهٔ بازار کریپتو (دلاری، منبع: CoinGecko).
          {isLoggedIn ? " نمادها را ستاره‌دار کنید و هشدار قیمتی بسازید." : " برای واچ‌لیست و هشدار وارد شوید."}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--danger)" }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* My watchlist */}
      {isLoggedIn && watched.length > 0 && (
        <section>
          <SectionTitle icon={<Star size={16} />} title="واچ‌لیست من" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {watched.map((c) => (
              <MarketCardItem
                key={c.id}
                row={c}
                starred={watchlist.has(c.id)}
                isLoggedIn={isLoggedIn}
                onStar={() => toggleStar(c.id)}
                onAlert={() => setAlertFor(c)}
                onChart={() => setChartId(c.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Crypto market */}
      <section>
        <SectionTitle icon={<CandlestickChart size={16} />} title="بازار کریپتو" />
        {!sourceOk || crypto.length === 0 ? (
          <EmptyState msg="در حال حاضر داده‌ای از منبع بازار دریافت نشد. لطفاً بعداً دوباره تلاش کنید." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {crypto.map((c) => (
              <MarketCardItem
                key={c.id}
                row={c}
                starred={watchlist.has(c.id)}
                isLoggedIn={isLoggedIn}
                onStar={() => toggleStar(c.id)}
                onAlert={() => setAlertFor(c)}
                onChart={() => setChartId(c.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Active alerts */}
      {isLoggedIn && alerts.length > 0 && (
        <section>
          <SectionTitle icon={<Bell size={16} />} title="هشدارهای من" />
          {!telegramLinked && (
            <div
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm mb-3"
              style={{ background: "var(--gold-tint)", border: "1px solid rgba(184,134,11,0.3)", color: "var(--navy-deep)" }}
            >
              <Send size={15} />
              برای دریافت هشدار در تلگرام، حساب تلگرام خود را از داشبورد متصل کنید. تا آن زمان هشدارها فقط اینجا نشان داده می‌شوند.
            </div>
          )}
          <div className="card-elevated divide-y" style={{ borderColor: "var(--line)" }}>
            {alerts.map((a) => {
              const row = byId.get(a.symbol);
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 p-4" style={{ borderColor: "var(--line)" }}>
                  <div className="min-w-0">
                    <div className="font-bold text-sm" style={{ color: "var(--navy-deep)" }}>
                      {row?.faName ?? a.symbol}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                      {a.condition === "above" ? "بالاتر از" : "پایین‌تر از"} {fmtUsd(Number(a.target_price))} دلار
                      {!a.active && " · غیرفعال (شلیک‌شده)"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleAlert(a)}
                      className="btn btn-ghost"
                      style={{ padding: "0.4rem" }}
                      aria-label={a.active ? "غیرفعال کردن" : "فعال کردن"}
                    >
                      {a.active ? <Bell size={16} style={{ color: "var(--success)" }} /> : <BellOff size={16} style={{ color: "var(--text-3)" }} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAlert(a.id)}
                      className="btn btn-ghost"
                      style={{ padding: "0.4rem", color: "var(--danger)" }}
                      aria-label="حذف"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Honest empty states for markets without a data source yet */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EmptyMarket title="بورس تهران" note="اتصال منبع داده (Brsapi) هنوز پیکربندی نشده است." />
        <EmptyMarket title="طلا و ارز" note="اتصال منبع داده (Brsapi) هنوز پیکربندی نشده است." />
      </section>

      {/* Modals */}
      {chartRow && <CandlestickModal id={chartRow.id} faName={chartRow.faName} onClose={() => setChartId(null)} />}
      {alertFor && (
        <AlertForm
          row={alertFor}
          onClose={() => setAlertFor(null)}
          onCreated={(a) => {
            addAlert(a);
            setAlertFor(null);
          }}
        />
      )}
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span style={{ color: "var(--gold)" }}>{icon}</span>
      <h2 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
        {title}
      </h2>
    </div>
  );
}

function MarketCardItem({
  row,
  starred,
  isLoggedIn,
  onStar,
  onAlert,
  onChart,
}: {
  row: CryptoRow;
  starred: boolean;
  isLoggedIn: boolean;
  onStar: () => void;
  onAlert: () => void;
  onChart: () => void;
}) {
  const up = (row.change24h ?? 0) >= 0;
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="flex items-center justify-center rounded-full font-display font-bold text-xs flex-shrink-0"
            dir="ltr"
            style={{ width: 32, height: 32, background: "var(--gold-tint)", color: "var(--navy-deep)" }}
          >
            {row.symbol.slice(0, 3)}
          </span>
          <div className="min-w-0">
            <div className="font-bold text-sm truncate" style={{ color: "var(--navy-deep)" }}>{row.faName}</div>
            <div className="text-xs" dir="ltr" style={{ color: "var(--text-3)" }}>{row.symbol}</div>
          </div>
        </div>
        {isLoggedIn && (
          <button type="button" onClick={onStar} aria-label="واچ‌لیست" className="btn btn-ghost" style={{ padding: "0.35rem" }}>
            <Star size={17} style={{ color: starred ? "var(--gold)" : "var(--text-3)", fill: starred ? "var(--gold)" : "none" }} />
          </button>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div className="font-display text-xl font-bold" dir="ltr" style={{ color: "var(--navy-deep)" }}>
          ${fmtUsd(row.price)}
        </div>
        {row.change24h != null && (
          <div className="flex items-center gap-1 text-sm font-bold" style={{ color: up ? "var(--success)" : "var(--danger)" }}>
            {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {toPersianDigits(Math.abs(row.change24h).toFixed(1)).replace(".", "٫")}٪
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={onChart} className="btn btn-outline flex-1" style={{ fontSize: "0.75rem", padding: "0.4rem" }}>
          <CandlestickChart size={14} /> نمودار
        </button>
        {isLoggedIn && (
          <button type="button" onClick={onAlert} className="btn btn-outline flex-1" style={{ fontSize: "0.75rem", padding: "0.4rem" }}>
            <Bell size={14} /> هشدار
          </button>
        )}
      </div>
    </div>
  );
}

function AlertForm({
  row,
  onClose,
  onCreated,
}: {
  row: CryptoRow;
  onClose: () => void;
  onCreated: (a: Alert) => void;
}) {
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    const target = Number(price);
    if (!Number.isFinite(target) || target <= 0) {
      setError("قیمت هدف معتبر وارد کنید.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error: e } = await supabase
        .from("price_alerts")
        .insert({ symbol: row.id, market: "crypto", condition, target_price: target, active: true })
        .select("id, symbol, market, condition, target_price, active")
        .single();
      if (e || !data) throw e ?? new Error("خطا");
      onCreated(data as Alert);
    } catch {
      setError("ساخت هشدار ناموفق بود.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5" role="dialog" aria-label="ساخت هشدار">
      <div className="absolute inset-0" style={{ background: "rgba(15,23,42,0.5)" }} onClick={onClose} aria-hidden />
      <div className="card-elevated p-6 w-full max-w-sm relative" style={{ background: "var(--surface)" }}>
        <h3 className="font-display font-bold text-lg mb-1" style={{ color: "var(--navy-deep)" }}>
          هشدار قیمت — {row.faName}
        </h3>
        <p className="text-xs mb-4" style={{ color: "var(--text-3)" }}>
          قیمت فعلی: ${fmtUsd(row.price)} دلار
        </p>

        <div className="flex gap-2 mb-3">
          {(["above", "below"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCondition(c)}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-bold"
              style={{
                background: condition === c ? "var(--navy-deep)" : "var(--surface-2)",
                color: condition === c ? "var(--text-on-navy)" : "var(--text-2)",
                border: "1px solid var(--line)",
              }}
            >
              {c === "above" ? "بالاتر از" : "پایین‌تر از"}
            </button>
          ))}
        </div>

        <input
          type="number"
          className="input mb-3"
          placeholder="قیمت هدف (دلار)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          dir="ltr"
          disabled={saving}
        />

        {error && <p className="text-sm mb-3" style={{ color: "var(--danger)" }}>{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={submit} disabled={saving} className="btn btn-gold flex-1">
            <Plus size={15} /> {saving ? "در حال ساخت..." : "ساخت هشدار"}
          </button>
          <button type="button" onClick={onClose} className="btn btn-outline">انصراف</button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="card p-8 text-center text-sm" style={{ color: "var(--text-3)" }}>
      {msg}
    </div>
  );
}

function EmptyMarket({ title, note }: { title: string; note: string }) {
  return (
    <div className="card p-6" style={{ opacity: 0.85 }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display font-bold text-base" style={{ color: "var(--navy-deep)" }}>{title}</h3>
        <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>
          به‌زودی
        </span>
      </div>
      <p className="text-xs leading-6" style={{ color: "var(--text-3)" }}>{note}</p>
    </div>
  );
}
