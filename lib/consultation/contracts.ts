import { toLatinDigits } from "@/lib/format";
import { isDate } from "./time";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface Relationship { id: string; client_id: string; advisor_id: string; client_label: string; created_at: string }
export interface Session { id: string; relationship_id: string; session_key: string; version: number; occurs_at: string; topic: string; goal: string; client_summary: string; holding_version_id: string | null; research_version_id: string | null; actor_id: string; created_at: string }
export interface Action { id: string; relationship_id: string; session_id: string; action_key: string; version: number; title: string; responsible_id: string; due_on: string; status: "open" | "doing" | "done"; actor_id: string; created_at: string }
export interface ApprovedResearch { id: string; title: string; version: number }
export interface ConsultationData {
  userId: string; advisors: { user_id: string; display_name: string }[]; relationships: Relationship[];
  selected: Relationship | null; revoked: boolean; sessions: Session[]; notes: { session_id: string; note: string }[];
  publications: { session_id: string; published_at: string }[]; actions: Action[];
  holdings: { id: string; version: number; created_at: string }[];
  research: ApprovedResearch[];
  researchUnavailable: boolean;
}
export function latestActions(actions: readonly Action[]) {
  const latest = new Map<string, Action>();
  for (const a of actions) if ((latest.get(a.action_key)?.version ?? 0) < a.version) latest.set(a.action_key,a);
  return [...latest.values()].sort((a,b) => a.due_on.localeCompare(b.due_on));
}
function text(v: unknown, max: number, optional = false): string {
  if (optional && (v === undefined || v === null)) return "";
  if (typeof v !== "string" || (!optional && !v.trim()) || v.length > max) throw new Error("متن لازم را با طول مجاز وارد کنید.");
  return v.trim();
}
function id(v: unknown): string { if (typeof v !== "string" || !UUID.test(v)) throw new Error("شناسه نامعتبر است."); return v; }
function base(v: unknown): number { const n = typeof v === "string" ? Number(toLatinDigits(v)) : v; if (typeof n !== "number" || !Number.isInteger(n) || n < 0) throw new Error("نسخهٔ پایه نامعتبر است."); return n; }
export function consultationCommand(input: unknown): { rpc: string; args: Record<string, unknown> } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("درخواست نامعتبر است.");
  const p = input as Record<string, unknown>;
  if (p.action === "grant") return { rpc: "grant_consultation", args: { p_advisor: id(p.advisorId), p_label: text(p.clientLabel,120) } };
  if (p.action === "revoke") return { rpc: "revoke_consultation", args: { p_relation: id(p.relationshipId) } };
  if (p.action === "publish") return { rpc: "publish_consultation_session", args: { p_session: id(p.sessionId) } };
  if (p.action === "session") {
    const occursAt = toLatinDigits(text(p.occursAt,100));
    if (!isDate(occursAt.slice(0,10)) || !Number.isFinite(Date.parse(occursAt)) || !/(Z|[+-]\d{2}:\d{2})$/.test(occursAt)) throw new Error("زمان جلسه با منطقهٔ زمانی لازم است.");
    return { rpc: "save_consultation_session", args: { p_relation: id(p.relationshipId), p_session_key: id(p.sessionKey), p_base: base(p.baseVersion), p_body: {
      occurs_at: occursAt, topic: text(p.topic,300), goal: text(p.goal,4000), client_summary: text(p.summary,10000), private_note: text(p.privateNote,10000,true),
      holding_version_id: p.holdingVersionId ? id(p.holdingVersionId) : null, research_version_id: p.researchVersionId ? id(p.researchVersionId) : null,
    } } };
  }
  if (p.action === "task") {
    if (!["open","doing","done"].includes(String(p.status))) throw new Error("وضعیت اقدام نامعتبر است.");
    const body: Record<string,unknown> = { status: p.status };
    // Clients change only status; DB preserves all other fields from the previous version.
    if (p.title !== undefined) {
      const dueOn = toLatinDigits(text(p.dueOn,10));
      if (!isDate(dueOn)) throw new Error("موعد اقدام نامعتبر است.");
      Object.assign(body,{ title: text(p.title,2000), session_id: id(p.sessionId), responsible_id: id(p.responsibleId), due_on: dueOn });
    }
    return { rpc: "save_consultation_action", args: { p_relation: id(p.relationshipId), p_action_key: id(p.actionKey), p_base: base(p.baseVersion), p_body: body } };
  }
  throw new Error("کنش نامعتبر است.");
}
export function consultationFailure(error: { code?: string } | null) {
  if (error?.code === "42501") return { status: 403, error: "دسترسی به این پرونده مجاز نیست." };
  if (["PT409","40001","23505"].includes(error?.code ?? "")) return { status: 409, error: "نسخهٔ تازه‌تری ثبت شده است؛ تغییرهای شما حفظ شده‌اند. آخرین نسخه را جدا باز کنید و سپس اصلاح کنید." };
  if (["22023","23514","22P02","22007","22008"].includes(error?.code ?? "")) return { status: 422, error: "ورودی یا نسخهٔ پیوندخورده معتبر نیست؛ پژوهش باید تأیید داخلی شده باشد." };
  return { status: 503, error: "دریافت یا ذخیرهٔ پرونده انجام نشد؛ پس از بازیابی سرویس دوباره تلاش کنید." };
}
