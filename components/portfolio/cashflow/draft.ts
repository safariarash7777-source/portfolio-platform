import type { CashFlowPayload } from "@/lib/portfolio/cashFlowApiContract";
import { cashFlowAmount, type CashFlowBasis } from "@/lib/portfolio/cashFlow";
import { dateInput } from "@/lib/portfolio/financialInput";
import { toLatinDigits } from "@/lib/format";

export interface SourceDraft { label: string; observedOn: string }
export interface EntryDraft {
  entryKey: string; basis: CashFlowBasis; kind: "income" | "expense" | "transfer";
  accountKey: string; fromAccountKey: string; toAccountKey: string;
  amount: string; occurredOn: string; source: SourceDraft; category: string; note: string;
}
export interface CashFlowDraft {
  period: { startOn: string; endOn: string };
  accounts: { accountKey: string; label: string }[]; scopeAccountKeys: string[];
  opening: { enabled: boolean; amount: string; atStartOn: string; source: SourceDraft };
  coverage: Record<CashFlowBasis, { status: "unknown" | "partial" | "complete"; memberAffirmed: boolean; source: SourceDraft }>;
  entries: EntryDraft[];
}
const blankSource = (): SourceDraft => ({ label: "", observedOn: "" });
const sourceDraft = (source: { label: string; observedOn: string } | null) => source ? { ...source } : blankSource();
export function cashFlowDraft(period: CashFlowDraft["period"], payload?: CashFlowPayload): CashFlowDraft {
  return payload ? {
    period: { ...payload.period }, accounts: payload.accountDefinitions.map(account => ({ ...account })), scopeAccountKeys: [...payload.scopeAccountKeys],
    opening: { enabled: payload.opening !== null, amount: payload.opening?.amountToman?.toString() ?? "", atStartOn: payload.opening?.atStartOn ?? "", source: sourceDraft(payload.opening?.source ?? null) },
    coverage: { planned: { ...payload.coverage.planned, source: sourceDraft(payload.coverage.planned.source) }, actual: { ...payload.coverage.actual, source: sourceDraft(payload.coverage.actual.source) } },
    entries: payload.entries.map(entry => ({ entryKey: entry.entryKey, basis: entry.basis, kind: entry.kind, accountKey: "accountKey" in entry ? entry.accountKey : "", fromAccountKey: "fromAccountKey" in entry ? entry.fromAccountKey : "", toAccountKey: "toAccountKey" in entry ? entry.toAccountKey : "", amount: entry.amountToman?.toString() ?? "", occurredOn: entry.occurredOn ?? "", source: sourceDraft(entry.source), category: entry.category ?? "", note: entry.note ?? "" })),
  } : { period: { ...period }, accounts: [], scopeAccountKeys: [], opening: { enabled: false, amount: "", atStartOn: "", source: blankSource() },
    coverage: { planned: { status: "unknown", memberAffirmed: false, source: blankSource() }, actual: { status: "unknown", memberAffirmed: false, source: blankSource() } }, entries: [] };
}
/** A scope/event edit cannot reuse an assertion about the old snapshot. */
export function invalidateCoverage(draft: CashFlowDraft, bases: CashFlowBasis[] = ["planned", "actual"]): CashFlowDraft {
  const coverage = { ...draft.coverage };
  for (const basis of bases) coverage[basis] = { ...coverage[basis], memberAffirmed: false, status: coverage[basis].status === "complete" ? "partial" : coverage[basis].status };
  return { ...draft, coverage };
}
export function blankEntry(entryKey: string, basis: CashFlowBasis = "actual"): EntryDraft {
  return { entryKey, basis, kind: "income", accountKey: "", fromAccountKey: "", toAccountKey: "", amount: "", occurredOn: "", source: blankSource(), category: "", note: "" };
}
function source(value: SourceDraft) {
  if (!value.label.trim() && !value.observedOn.trim()) return null;
  if (!value.label.trim()) throw new Error("نام منبع را بنویسید یا هر دو بخش منبع را خالی بگذارید.");
  return { label: value.label.trim(), observedOn: dateInput(value.observedOn) };
}
function openingAmount(value: string): number | null {
  if (!value.trim()) return null;
  const raw = toLatinDigits(value).trim(), amount = Number(raw);
  if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(amount)) throw new Error("موجودی افتتاحیه باید تومان صحیح، با علامت منفی در صورت نیاز، یا خالی باشد.");
  return amount;
}
/** UI string conversion only; validation/ownership and exact arithmetic remain canonical. */
export function draftPayload(draft: CashFlowDraft): CashFlowPayload {
  const startOn = dateInput(draft.period.startOn), endOn = dateInput(draft.period.endOn);
  if (startOn > endOn) throw new Error("پایان دوره نباید قبل از شروع باشد.");
  if (!draft.accounts.length || draft.accounts.some(account => !account.label.trim()) || !draft.scopeAccountKeys.length) throw new Error("نام دست‌کم یک حساب و محدودهٔ حساب‌ها را مشخص کنید.");
  const coverage = (basis: CashFlowBasis) => {
    const value = draft.coverage[basis], declaredSource = source(value.source);
    if (value.status === "complete" && (!value.memberAffirmed || !declaredSource)) throw new Error("پوشش کامل به تأیید صریح شما و منبع معتبر نیاز دارد.");
    return { status: value.status, memberAffirmed: value.status === "complete" && value.memberAffirmed, source: declaredSource };
  };
  return { contractVersion: 1, period: { startOn, endOn }, accountDefinitions: draft.accounts.map(account => ({ ...account, label: account.label.trim() })), scopeAccountKeys: [...draft.scopeAccountKeys],
    opening: draft.opening.enabled ? { amountToman: openingAmount(draft.opening.amount), atStartOn: draft.opening.atStartOn.trim() ? dateInput(draft.opening.atStartOn) : null, source: source(draft.opening.source) } : null,
    coverage: { planned: coverage("planned"), actual: coverage("actual") },
    entries: draft.entries.map(entry => ({ entryKey: entry.entryKey, basis: entry.basis, amountToman: cashFlowAmount(entry.amount.trim() ? toLatinDigits(entry.amount).trim() : null, "IRT"), occurredOn: entry.occurredOn.trim() ? dateInput(entry.occurredOn) : null, source: source(entry.source), category: entry.category.trim() || null, note: entry.note.trim() || null,
      ...(entry.kind === "transfer" ? { kind: "transfer" as const, fromAccountKey: entry.fromAccountKey, toAccountKey: entry.toAccountKey } : { kind: entry.kind, accountKey: entry.accountKey }) })),
  };
}
