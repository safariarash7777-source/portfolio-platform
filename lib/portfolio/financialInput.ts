import { toLatinDigits } from "../format";
export type Currency = "IRR" | "IRT";
export type DebtKind = "loan" | "personal" | "installment";
export const DEBT_LABELS: Record<DebtKind, string> = { loan: "وام", personal: "قرض شخصی", installment: "بدهی اقساطی" };
export function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
export function numberInput(value: unknown): number {
  if (typeof value === "number") return value;
  const raw = toLatinDigits(text(value));
  return /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
}
export function dateInput(value: unknown): string {
  const date = toLatinDigits(text(value));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("تاریخ معتبر را به شکل YYYY-MM-DD وارد کنید.");
  return date;
}
export function moneyInput(value: unknown, currency: unknown): number {
  if (currency !== "IRR" && currency !== "IRT") throw new Error("واحد پول باید ریال یا تومان باشد.");
  const n = numberInput(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("مبلغ باید عدد صحیح نامنفی و در محدودهٔ قابل محاسبه باشد.");
  const toman = currency === "IRR" ? n / 10 : n;
  if (!Number.isSafeInteger(toman)) throw new Error("مبلغ ریالی باید مضرب ۱۰ باشد؛ ذخیره به تومان صحیح انجام می‌شود.");
  return toman;
}
export function normalisePosition(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("قلم دارایی نامعتبر است.");
  const r = input as Record<string, unknown>;
  const symbol = text(r.symbol), label = text(r.manual_label);
  if (!text(r.position_key) || !text(r.asset_class) || !text(r.unit) || !!symbol === !!label) throw new Error("شناسه، دسته، واحد و دقیقاً یک نماد یا عنوان دستی لازم است.");
  const ownership = r.ownership_pct === undefined ? 100 : numberInput(r.ownership_pct);
  if (!Number.isFinite(ownership) || ownership <= 0 || ownership > 100 || Math.abs(ownership * 100 - Math.round(ownership * 100)) > 1e-8) throw new Error("سهم مالکیت باید بیشتر از صفر تا ۱۰۰ درصد با حداکثر دو رقم اعشار باشد.");
  const mode = r.valuation_mode ?? "market";
  if (!["market", "declared", "unpriced"].includes(String(mode))) throw new Error("روش ارزش‌گذاری نامعتبر است.");
  const qty = r.qty === null || r.qty === undefined || text(r.qty) === "" && typeof r.qty !== "number" ? null : numberInput(r.qty);
  if ((qty === null && mode !== "declared") || qty !== null && (!Number.isFinite(qty) || qty <= 0 || qty > Number.MAX_SAFE_INTEGER)) throw new Error("مقدار مثبت یا ارزش اظهارشده لازم است.");
  const out: Record<string, unknown> = { position_key: text(r.position_key), symbol: symbol || null, manual_label: label || null, asset_class: text(r.asset_class), qty, unit: text(r.unit), as_of: dateInput(r.as_of), title: text(r.title) || null, ownership_pct: ownership, valuation_mode: mode, declared_value: null, valuation_source: null, valuation_as_of: null, valuation_status: mode === "unpriced" ? "missing" : "valid" };
  if (mode === "declared") {
    if (!["valid", "estimated"].includes(String(r.valuation_status)) || !text(r.valuation_source) || ["unknown", "نامشخص", "-", "—"].includes(text(r.valuation_source).toLowerCase())) throw new Error("منبع و وضعیت معتبر یا تخمینی ارزش‌گذاری لازم است.");
    out.declared_value = moneyInput(r.declared_value, r.currency);
    out.valuation_source = text(r.valuation_source);
    out.valuation_as_of = dateInput(r.valuation_as_of);
    out.valuation_status = r.valuation_status;
  }
  if (r.cost_basis !== undefined && r.cost_basis !== null && r.cost_basis !== "") out.cost_basis = moneyInput(r.cost_basis, "IRT");
  return out;
}
export function normaliseDebt(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("بدهی نامعتبر است.");
  const r = input as Record<string, unknown>;
  if (!text(r.debt_key) || !text(r.title) || text(r.title).length > 300 || !Object.hasOwn(DEBT_LABELS, String(r.kind))) throw new Error("عنوان و نوع بدهی لازم است؛ ضمانت و تعهد احتمالی در این بخش ثبت نمی‌شوند.");
  const hasPayment = r.next_installment !== null && r.next_installment !== undefined && r.next_installment !== "";
  if (hasPayment !== !!text(r.next_due_on)) throw new Error("مبلغ و موعد قسط بعدی باید با هم وارد شوند.");
  if (text(r.note).length > 2000) throw new Error("توضیح بدهی حداکثر ۲۰۰۰ نویسه است.");
  return { debt_key: text(r.debt_key), title: text(r.title), kind: r.kind, balance_toman: moneyInput(r.balance, r.currency), currency: r.currency, balance_as_of: dateInput(r.balance_as_of), next_installment_toman: hasPayment ? moneyInput(r.next_installment, r.currency) : null, next_due_on: hasPayment ? dateInput(r.next_due_on) : null, note: text(r.note) || null };
}
