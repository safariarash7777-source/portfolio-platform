import type { DebtPosition } from "./balanceSheet";
import { dateInput } from "./financialInput";

function storedDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { return dateInput(value); } catch { return null; }
}

/** Calendar days, not UTC-midnight instants; the reference day is explicit. */
export function paymentReferenceDay(now: Date): string | null {
  if (!Number.isFinite(now.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  return storedDay(`${part("year")}-${part("month")}-${part("day")}`);
}

/** One recorded next installment per debt, with no recurrence or payment inference. */
export function buildRecordedPayments(input: { debts: readonly DebtPosition[]; ready: boolean; recorded: boolean; referenceDay: string | null }) {
  const empty = { items: [] as RecordedPayment[], knownAmountTotal: null as number | null, incompleteCount: 0, overflow: false, referenceKnown: false };
  if (!input.ready) return { ...empty, status: "unavailable" as const, partial: true };
  if (!input.recorded) return { ...empty, status: "unrecorded" as const, partial: true };
  const reference = storedDay(input.referenceDay);
  const items: RecordedPayment[] = input.debts.map(debt => {
    const amount = debt.next_installment_toman;
    const amountToman = typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
    const dueOn = storedDay(debt.next_due_on);
    const relation = !dueOn || !reference ? "unknown" : dueOn < reference ? "past" : dueOn === reference ? "today" : "future";
    return { debtKey: debt.debt_key, title: debt.title, amountToman, dueOn, relation };
  });
  items.sort((a, b) => a.dueOn === b.dueOn ? 0 : a.dueOn === null ? 1 : b.dueOn === null ? -1 : a.dueOn < b.dueOn ? -1 : 1);
  const knownAmounts = items.flatMap(item => item.amountToman === null ? [] : [item.amountToman]);
  const sum = knownAmounts.reduce((total, amount) => total + amount, 0);
  const overflow = knownAmounts.length > 0 && !Number.isSafeInteger(sum);
  const knownAmountTotal = knownAmounts.length > 0 && !overflow ? sum : null;
  const incompleteCount = items.filter(item => item.amountToman === null || item.dueOn === null).length;
  const partial = incompleteCount > 0 || overflow || reference === null;
  return { items, knownAmountTotal, incompleteCount, overflow, referenceKnown: reference !== null,
    partial, status: items.length === 0 ? "empty" as const : partial ? "partial" as const : "ready" as const };
}

export interface RecordedPayment {
  debtKey: string;
  title: string;
  amountToman: number | null;
  dueOn: string | null;
  relation: "past" | "today" | "future" | "unknown";
}
