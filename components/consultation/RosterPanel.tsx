"use client";
import React, { useEffect, useState } from "react";
import { formatJalali, formatToman, toPersianDigits } from "@/lib/format";
import { RISK_CATEGORIES, RISK_STATES, ROSTER_MISSING_CODES, validateRosterRead, type RosterRead, type RosterMissingCode, type RosterRiskState } from "@/lib/consultation/rosterContracts";
import { withDeadline } from "@/lib/deadline";
import Field from "./Field";

/** UI-only types: the roster API adapter supplies authorized rows and filter options. */
export type RosterRowView = {
  relationshipId: string; label: string;
  risk: { label: string | null; status: string; assessedAt: string | null; expiresAt: string | null; forcedExpiredAt?: string | null };
  assets: { valueToman: number | null; asOf: string | null; definition: string; partial: boolean };
  missingInformation: string[] | null;
};
export type RosterFilterView = { key: string; label: string; value: string; options: { value: string; label: string }[] };
export type RosterState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; rows: RosterRowView[] };

const riskLabels: Record<RosterRiskState, string> = { current: "معتبر", expired: "منقضی", missing: "ثبت نشده", ambiguous: "نیازمند بررسی", invalid: "اطلاعات نامعتبر" };
const missingLabels: Record<RosterMissingCode, string> = {
  risk_missing: "ارزیابی ریسک ثبت نشده", risk_expired: "ارزیابی ریسک منقضی", risk_ambiguous: "ارزیابی ریسک نیازمند بررسی", risk_invalid: "ارزیابی ریسک نامعتبر",
  holdings_not_recorded: "دارایی ثبت نشده", holdings_empty: "فهرست دارایی خالی", cashflow_period_not_recorded: "جریان نقد دوره ثبت نشده", goals_not_recorded: "هدف ثبت نشده", goals_empty: "فهرست هدف‌ها خالی",
};
export function rosterRows(read: RosterRead): RosterRowView[] {
  return read.rows.map(row => ({ relationshipId: row.relationshipId, label: row.clientLabel,
    risk: { label: row.risk.category, status: riskLabels[row.risk.state], assessedAt: row.risk.assessedAt, expiresAt: row.risk.expiresAt, forcedExpiredAt: row.risk.forcedExpiredAt },
    assets: { valueToman: row.assetValue.totalToman, asOf: null, partial: false, definition: "ارزش کل دارایی (در این فهرست محاسبه نمی‌شود)" },
    missingInformation: row.missingCodes.map(code => missingLabels[code]),
  }));
}

export function AdvisorRoster({ actorId, locked, selectedId, period, onSelect }: {
  actorId: string; locked: boolean; selectedId?: string; period?: { startOn: string; endOn: string }; onSelect: (id: string) => void;
}) {
  const [filters, setFilters] = useState({ search: "", category: "", state: "", missing: "", page: 1 });
  const [retry, setRetry] = useState(0), [read, setRead] = useState<RosterRead | null>(null);
  const [state, setState] = useState<RosterState>({ status: "loading" });
  const startOn = period?.startOn, endOn = period?.endOn;
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setState({ status: "loading" }); setRead(null);
    const query = new URLSearchParams({ page: String(filters.page), pageSize: "25" });
    if (filters.search.trim()) query.set("search", filters.search.trim());
    if (filters.category) query.set("riskCategories", filters.category);
    if (filters.state) query.set("riskStates", filters.state);
    if (filters.missing) query.set("missing", filters.missing);
    if (startOn && endOn) { query.set("startOn", startOn); query.set("endOn", endOn); }
    void withDeadline(async signal => {
      const response = await fetch(`/api/consultation/roster?${query}`, { credentials: "same-origin", cache: "no-store", signal });
      if (!response.ok) throw Error("خواندن فهرست انجام نشد؛ دسترسی و اطلاعات دوباره بررسی شوند.");
      const result = validateRosterRead(await response.json(), actorId);
      if (startOn && endOn && (result.period.startOn !== startOn || result.period.endOn !== endOn)) throw Error("دورهٔ فهرست با پرونده یکسان نیست.");
      if (active) { setRead(result); setState({ status: "ready", rows: rosterRows(result) }); }
    }, 10_000, controller.signal).catch(() => { if (active) { setRead(null); setState({ status: "error", message: "خواندن فهرست انجام نشد؛ این وضعیت به معنی نبود عضو نیست." }); } });
    return () => { active = false; controller.abort(); };
  }, [actorId, filters, startOn, endOn, retry]);
  const options = (values: readonly string[], labels?: Record<string, string>) => [{ value: "", label: "همه" }, ...values.map(value => ({ value, label: labels?.[value] ?? value }))];
  return <div className="min-w-0 space-y-3">
    <button type="button" className="btn btn-outline !whitespace-normal max-w-full min-w-0 break-words" disabled={locked} onClick={() => setFilters({ search: "", category: "", state: "", missing: "", page: 1 })}>پاک‌کردن فیلترها</button>
    <fieldset disabled={locked} className="min-w-0"><legend className="sr-only">جست‌وجوی اعضا</legend><Field label="جست‌وجوی نام عضو" maxLength={160} value={filters.search} onChange={search => setFilters({ ...filters, search, page: 1 })} /></fieldset>
    <RosterPanel advisorMode state={state} filters={[{ key: "category", label: "گروه ریسک", value: filters.category, options: options(RISK_CATEGORIES) }, { key: "state", label: "اعتبار ارزیابی ریسک", value: filters.state, options: options(RISK_STATES, riskLabels) }, { key: "missing", label: "اطلاعات نیازمند بررسی", value: filters.missing, options: options(ROSTER_MISSING_CODES, missingLabels) }]} locked={locked} selectedId={selectedId} onFilter={(key, value) => { if (!locked && ["category", "state", "missing"].includes(key)) setFilters({ ...filters, [key]: value, page: 1 }); }} onSelect={onSelect} onRetry={() => setRetry(value => value + 1)} />
    {read && <div className="space-y-2 text-sm"><p>جریان نقد دورهٔ {formatJalali(read.period.startOn)} تا {formatJalali(read.period.endOn)} · {toPersianDigits(read.totalMatched)} پرونده مطابق فیلتر</p><p>فیلتر مبلغ دارایی در این مرحله فراهم نیست. ثبت اطلاعات، کامل بودن جزئیات را تأیید نمی‌کند.</p><div className="flex flex-wrap gap-3"><button type="button" className="btn btn-outline !whitespace-normal max-w-full min-w-0 break-words" disabled={locked || filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>صفحهٔ قبل</button><button type="button" className="btn btn-outline !whitespace-normal max-w-full min-w-0 break-words" disabled={locked || read.page * read.pageSize >= read.totalMatched} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>صفحهٔ بعد</button></div></div>}
  </div>;
}

export default function RosterPanel({ advisorMode, state, filters, locked, selectedId, onFilter, onSelect, onRetry }: {
  advisorMode: boolean; state: RosterState; filters: RosterFilterView[]; locked: boolean; selectedId?: string;
  onFilter: (key: string, value: string) => void; onSelect: (id: string) => void; onRetry: () => void;
}) {
  if (!advisorMode) return null;
  return <section className="card min-w-0 space-y-4 p-4 sm:p-5" aria-label="فیلتر پرونده‌های اعضا">
    <h2 className="text-xl font-bold">پرونده‌های اعضا</h2>
    <p className="text-sm leading-7">فقط اعضایی نمایش داده می‌شوند که به شما دسترسی داده‌اند. اطلاعات نامعلوم به معنی صفر نیست.</p>
    <fieldset disabled={locked || state.status === "loading"} className="grid min-w-0 gap-3 sm:grid-cols-2"><legend className="sr-only">فیلتر پرونده‌های مجاز</legend>{filters.map(filter => <label key={filter.key} className="block min-w-0 space-y-1 text-sm"><span>{filter.label}</span><select className="input min-h-11 w-full min-w-0" value={filter.value} onChange={event => onFilter(filter.key, event.target.value)}>{filter.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}</fieldset>
    {state.status === "loading" && <p role="status">در حال خواندن پرونده‌های مجاز…</p>}
    {state.status === "error" && <div className="space-y-2"><p role="alert" className="break-words text-sm">{state.message}</p><button type="button" className="btn btn-outline !whitespace-normal max-w-full min-w-0 break-words" disabled={locked} onClick={onRetry}>دوباره خواندن فهرست</button></div>}
    {state.status === "ready" && (state.rows.length === 0 ? <p className="text-sm">پرونده‌ای مطابق این فیلترها پیدا نشد.</p> : <ul className="grid min-w-0 gap-3 sm:grid-cols-2">{state.rows.map(row => <li key={row.relationshipId} className="min-w-0 space-y-2 rounded-lg border border-line p-3 text-sm leading-7"><h3 className="break-words font-bold">{row.label}</h3><p>ریسک: {row.risk.label ?? "نامعلوم"} · {row.risk.status}</p><p>تاریخ ارزیابی: {row.risk.assessedAt ? formatJalali(row.risk.assessedAt) : "نامعلوم"} · اعتبار تا: {row.risk.expiresAt ? formatJalali(row.risk.expiresAt) : "نامعلوم"}</p>{row.risk.forcedExpiredAt && <p>لغو اعتبار ارزیابی: {formatJalali(row.risk.forcedExpiredAt)}</p>}<p className="break-words">{row.assets.definition}: {row.assets.valueToman === null ? "نامعلوم" : formatToman(row.assets.valueToman)}{row.assets.partial && " · اطلاعات بخشی از دارایی‌ها"}</p><p>تاریخ اطلاعات دارایی: {row.assets.asOf ? formatJalali(row.assets.asOf) : "نامعلوم"}</p><p className="break-words">اطلاعات نیازمند تکمیل: {row.missingInformation === null ? "نامعلوم" : row.missingInformation.length ? row.missingInformation.join("، ") : "ثبت‌های پایه موجودند؛ کامل بودن جزئیات بررسی نشده"}</p><button type="button" className="btn btn-outline !whitespace-normal max-w-full min-w-0 break-words" disabled={locked || selectedId === row.relationshipId} onClick={() => onSelect(row.relationshipId)}>{selectedId === row.relationshipId ? "پروندهٔ انتخاب‌شده" : "بازکردن پرونده"}</button></li>)}</ul>)}
  </section>;
}
